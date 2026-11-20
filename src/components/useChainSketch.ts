import { useEffect, useMemo, useState } from 'react'
import type { Candidate, DeductionAction } from '../sudoku/engine'
import {
  chainColor, cycleChainPairs, initialChainSketch, newChainSketch, nextChainId, removeUnavailableChains, savePrunedChains, undoChainEdit, updateChainEdges,
  type ChainColor, type ChainColorPair, type ChainSketch, type ChainSketchState,
} from '../sudoku/chain-sketch'
import {
  analyzeChainPaths, analyzeMedusa, candidateId, chainCandidate, chainComponents, completeChainLoop, completeMedusa, sameEdge, weakLinkRun,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type LinkStrength,
} from '../sudoku/chains'
import type { Game } from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { roomStore } from '../sudoku/storage'
import { techniqueActionKey } from '../sudoku/technique-progress'
import type { BoardAnnotations, BoardLink, CandidateAnnotation, CellAnnotation } from './BoardAnnotations'
import { usePlayPreference } from './usePlayPreference'

type ChainPath = { nodes: readonly number[]; strengths: readonly LinkStrength[] }
export type ChainProof = {
  title: string; nodes: readonly number[]; strengths?: readonly LinkStrength[]
  actions: readonly DeductionAction[]; explanation?: string
}

function sketchPaths(graph: ChainGraph, edges: readonly ChainEdge[]): ChainPath[] {
  const paths: { nodes: number[]; strengths: LinkStrength[] }[] = []
  for (const [from, to] of edges) {
    const strength = graph.strength(from, to)
    if (!strength) continue
    const previous = paths.at(-1)
    if (previous?.nodes.at(-1) === from) {
      previous.nodes.push(to)
      previous.strengths.push(strength)
    } else paths.push({ nodes: [from, to], strengths: [strength] })
  }
  return paths
}

function recognizedPath(chain: ChainAnalysis) {
  if (chain.loop) return 'Nice Loop'
  const { strengths } = chain
  return strengths.length >= 3 && strengths[0] === 'strong' && strengths.at(-1) === 'strong' &&
    strengths.every((strength, index) => strength !== strengths[index - 1]) ? 'AIC' : undefined
}

function drawnEdges(sketches: readonly ChainSketch[], activeId: number) {
  return sketches.filter(sketch => !sketch.hidden || sketch.id === activeId).flatMap(sketch => sketch.history.at(-1)!)
}

const weakLinkStatus = 'A path can have at most two weak links in a row.'

export function useChainSketch(game: Game, graph: ChainGraph | null, { canDraw, graphCurrent, canAnalyze, startHighlightDigit, drawingIntent, setDrawingIntent }: {
  canDraw: boolean; graphCurrent: boolean; canAnalyze: boolean; startHighlightDigit: number | null
  drawingIntent: boolean | null; setDrawingIntent: (intent: boolean) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [previewedProof, setPreviewedProof] = useState<ChainProof | null>(null)
  const [colorPairs] = usePlayPreference('chainColorPairs')
  const emptySketch = useMemo(() => ({ ...initialChainSketch, sketches: [newChainSketch(1, colorPairs)] }), [colorPairs])
  const { sketches, activeId, pending } = game.chainSketch ?? emptySketch
  const active = sketches.find(({ id }) => id === activeId) ?? sketches[0]
  const edges = active.history.at(-1)!
  const enabled = canDraw && canAnalyze && Boolean(graph)
  const drawing = enabled && (drawingIntent ?? pending !== null)
  const allDrawnEdges = useMemo(() => drawnEdges(sketches, active.id), [sketches, active.id])
  const exceedsWeakLinkLimit = useMemo(() => graph && weakLinkRun(graph, allDrawnEdges), [graph, allDrawnEdges])

  const analyzed = useMemo(() => graph ? sketches.map((sketch) => {
    const edges = sketch.history.at(-1)!
    const medusas = analyzeMedusa(graph, edges).map(proof => ({
      ...proof,
      title: proof.nodes.length >= 3 && proof.nodes.some(node => chainCandidate(node).digit !== chainCandidate(proof.nodes[0]).digit)
        ? '3D Medusa' : 'Strong-link coloring',
    }))
    const chains = analyzeChainPaths(graph, edges).filter(proof => {
      if (!recognizedPath(proof) || proof.loop || proof.nodes.some((node, i) => i > 0 && graph.strength(proof.nodes[i - 1], node) === 'weak')) return true
      // The strong-link proof already covers these candidates and deductions.
      return !medusas.some(medusa => medusa.title === '3D Medusa' && medusa.sides.size &&
        proof.nodes.every(node => medusa.sides.has(node)) &&
        proof.actions.every(action => medusa.actions.some(edit => techniqueActionKey(edit) === techniqueActionKey(action))))
    })
    const types = new Set([...medusas.filter(proof => proof.sides.size && (proof.nodes.length >= 3 || proof.actions.length))
      .map(({ title }) => title), ...chains.flatMap(chain => recognizedPath(chain) ?? [])])
    return {
      ...sketch, edges, chains, types: [...types], paths: sketchPaths(graph, edges), medusas,
      components: chainComponents(edges.filter(edge => graph.strength(...edge))).components,
    }
  }) : [], [graph, sketches])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
  const applicable = useMemo(() => {
    const actions = new Map<string, DeductionAction>()
    const chainIds: number[] = []
    if (canAnalyze) for (const { id, chains, medusas } of analyzed) {
      const edits = [...chains, ...medusas].flatMap(({ actions }) => actions)
      if (edits.length) chainIds.push(id)
      for (const action of edits) actions.set(techniqueActionKey(action), action)
    }
    return { actions: [...actions.values()], chainIds }
  }, [analyzed, canAnalyze])
  const loopCompletions = useMemo(() => {
    const completions = new Map<ChainAnalysis, ChainEdge[]>()
    if (!graph || !canAnalyze || !activeAnalysis || activeAnalysis.hidden) return completions
    const drawnNodes = edges.flat()
    for (const chain of activeAnalysis.chains) {
      if (!chain.canComplete) continue
      const otherNodes = new Set(drawnNodes)
      for (const node of chain.nodes) otherNodes.delete(node)
      const result = completeChainLoop(graph, chain.nodes, otherNodes)
      if (result.status === 'found' && !result.edges.some(weakLinkRun(graph, [...allDrawnEdges, ...result.edges]))) {
        completions.set(chain, result.edges)
      }
    }
    return completions
  }, [graph, canAnalyze, activeAnalysis, edges, allDrawnEdges])
  const linkTargets = useMemo(() => {
    const targets = new Map<number, LinkStrength>()
    if (!graph || !drawing || active.hidden || pending === null) return targets
    for (const candidate of graph.candidates) {
      const edge: ChainEdge = [pending, candidate]
      if (edges.some((existing) => sameEdge(edge, existing))) continue
      const strength = graph.strength(...edge)
      if (strength && !exceedsWeakLinkLimit?.(edge)) targets.set(candidate, strength)
    }
    return targets
  }, [graph, drawing, pending, edges, active.hidden, exceedsWeakLinkLimit])
  const strongExtension = useMemo(() => graph && drawing && !active.hidden && pending !== null
    ? completeMedusa(graph, edges, pending) : [], [graph, drawing, active.hidden, pending, edges])

  useEffect(() => {
    setHovered(null)
    setStatus('')
  }, [game.id])

  useEffect(() => {
    if (!drawing) setHovered(null)
  }, [drawing])

  useEffect(() => {
    const saved = game.chainSketch
    if (!graph || !graphCurrent || !saved) return
    const candidates = new Set(graph.candidates)
    const next = removeUnavailableChains(saved, (node) => !candidates.has(node))
    if (next === saved) return
    roomStore.update(game.id, (current) => current.chainSketch === saved &&
      current.givens === game.givens && current.position.entries === game.position.entries &&
      current.position.center === game.position.center && current.position.corner === game.position.corner &&
      current.position.eliminations === game.position.eliminations
      ? savePrunedChains(current, next, current.future.length === 0) : current)
  }, [game.id, game.chainSketch, game.givens, game.position, graph, graphCurrent])

  const committed = useMemo(() => {
    const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
    const assigned = new Map<number, { pair: ChainColorPair; side: 0 | 1 }>()
    const links: BoardLink[] = []
    const activeProofs = canAnalyze && activeAnalysis && !active.hidden ? [...activeAnalysis.chains, ...activeAnalysis.medusas] : []
    const proof = previewedProof && activeProofs.some(proof => proof === previewedProof) ? previewedProof : null
    const proofNodes = new Set(proof?.nodes)
    const proofEdges: ChainEdge[] = proof?.strengths ? proof.nodes.slice(1).map((to, i) => [proof.nodes[i], to]) : []
    for (const action of proof?.actions ?? []) proofNodes.add(candidateId('place' in action ? action.place : action.eliminate))

    function mark(id: number, annotation: CandidateAnnotation, preview = false) {
      const { cell, digit } = chainCandidate(id)
      const row = candidateMarks.get(cell) ?? new Map()
      row.set(digit, preview && proof && !proofNodes.has(id) ? { ...annotation, opacity: 0.5 } : annotation)
      candidateMarks.set(cell, row)
    }

    const visible = analyzed.filter(sketch => !sketch.hidden)
    const usedPairs = visible.filter(sketch => sketch.medusas.some(({ sides }) => sides.size))
      .map(({ color, secondColor }): ChainColorPair => [color, secondColor])
    const nextPair = cycleChainPairs(colorPairs, usedPairs)
    const neutral = 'var(--chain-neutral)'

    const colorings = new Map(visible.map(sketch => {
      const sides = new Map(sketch.medusas.flatMap(proof => [...proof.sides]))
      const coloring = new Map<number, { pair: ChainColorPair; side: 0 | 1 }>()
      let useSketchPair = true
      for (const nodes of sketch.components) {
        const coloredNodes = nodes.filter(node => sides.has(node))
        if (!coloredNodes.length) continue

        const pair: ChainColorPair = useSketchPair ? [sketch.color, sketch.secondColor] : nextPair()
        if (!useSketchPair) usedPairs.push(pair)
        useSketchPair = false
        for (const node of coloredNodes) coloring.set(node, { pair, side: sides.get(node)! })
      }
      return [sketch.id, coloring] as const
    }))

    // Draw the active sketch last so its marks take priority at shared candidates.
    const ordered = [...visible.filter(({ id }) => id !== active.id), ...visible.filter(({ id }) => id === active.id)]
    for (const sketch of ordered) {
      const coloring = colorings.get(sketch.id)!
      for (const { nodes, strengths } of sketch.paths) {
        strengths.forEach((strength, i) => {
          const color = coloring.get(nodes[i])
          const from = nodes[i]
          const to = nodes[i + 1]
          const inProof = proof?.strengths ? proofEdges.some(edge => sameEdge(edge, [from, to]))
            : strength === 'strong' && proofNodes.has(from) && proofNodes.has(to)
          const opacity = proof && sketch.id === active.id && !inProof ? 0.5 : undefined
          links.push({ from: chainCandidate(from), to: chainCandidate(to), dashed: strength === 'weak', opacity,
            color: strength === 'strong' && color ? chainColor(color.pair[0]) : neutral })
        })
      }

      for (const node of sketch.components.flat()) {
        const color = coloring.get(node)
        if (color) {
          assigned.set(node, color)
          mark(node, { color: chainColor(color.pair[color.side]),
            mark: 'emphasized', label: `Chain color ${color.side === 0 ? 'A' : 'B'}` }, sketch.id === active.id)
        } else {
          assigned.delete(node)
          mark(node, { color: neutral, mark: 'emphasized', label: 'Linked candidate' }, sketch.id === active.id)
        }
      }
    }

    const visibleActive = canAnalyze && !active.hidden ? activeAnalysis : undefined
    const contradictionCells = new Map<number, CellAnnotation>()
    for (const { contradictionCell } of visibleActive?.medusas ?? []) {
      if (contradictionCell === undefined) continue
      contradictionCells.set(contradictionCell, {
        fill: 'color-mix(in srgb, var(--chain-removal) 22%, var(--candidate-match-surface, var(--board-bg)))',
        label: 'Would have no candidates if the crossed-out color were true',
      })
    }
    const removals = new Set(activeProofs.flatMap(({ actions }) =>
      actions.flatMap(action => 'eliminate' in action ? [candidateId(action.eliminate)] : [])))
    for (const id of removals) {
      const { cell, digit } = chainCandidate(id)
      const colored = candidateMarks.get(cell)?.get(digit)
      mark(id, colored?.mark === 'emphasized'
        ? { ...colored, strike: true, label: [colored.label, 'can be removed'].filter(Boolean).join(', ') }
        : { color: 'var(--chain-removal)', mark: 'strike', label: 'can be removed' }, true)
    }
    for (const { actions } of activeProofs) {
      for (const action of actions) {
        if (!('place' in action) || removals.has(candidateId(action.place))) continue
        const { cell, digit } = action.place
        const colored = candidateMarks.get(cell)?.get(digit)
        mark(candidateId(action.place), { color: colored?.color ?? 'var(--chain-placement)',
          mark: colored?.mark ?? 'ring', label: [colored?.label, 'forced placement'].filter(Boolean).join(', ') }, true)
      }
    }
    if (!active.hidden && pending !== null) {
      const { cell, digit } = chainCandidate(pending)
      if (!candidateMarks.get(cell)?.has(digit)) {
        mark(pending, { color: neutral, mark: 'emphasized', label: 'Selected for linking' })
      }
    }
    const annotations: BoardAnnotations = { cells: contradictionCells, candidates: candidateMarks, links }
    return { annotations, assigned, usedPairs }
  }, [analyzed, active.id, active.hidden, activeAnalysis, canAnalyze, pending, colorPairs, previewedProof])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (pending === null || hovered === null) return
    const strength = linkTargets.get(hovered)
    if (!strength) return
    return {
      from: chainCandidate(pending), to: chainCandidate(hovered), color: 'var(--chain-neutral)', dashed: strength === 'weak',
    }
  }, [pending, hovered, linkTargets])

  function save(change: (state: ChainSketchState) => ChainSketchState) {
    roomStore.update(game.id, (current) => {
      const saved = current.chainSketch ?? emptySketch
      const chainSketch = change(saved)
      return chainSketch === saved ? current : { ...current, chainSketch }
    })
  }

  function updateActive(update: (sketch: ChainSketch) => ChainSketch, endpoint?: number | null,
    requireCurrentPath = false) {
    save((state) => {
      if (state.activeId !== active.id) return state
      const current = state.sketches.find(({ id }) => id === active.id)!
      if (requireCurrentPath && (current.history.at(-1) !== edges || state.pending !== pending)) return state
      const next = update(current)
      const nextPending = endpoint === undefined ? state.pending : endpoint
      if (next === current && nextPending === state.pending) return state
      return { ...state, pending: nextPending,
        sketches: next === current ? state.sketches : state.sketches.map(sketch => sketch === current ? next : sketch) }
    })
  }

  function setHighlightedDigit(digit: number | null) {
    save((state) => {
      const current = state.sketches.find(({ id }) => id === state.activeId)!
      if (current.highlightedDigit === digit) return state
      return { ...state, sketches: state.sketches.map(sketch => sketch === current ? { ...sketch, highlightedDigit: digit } : sketch) }
    })
  }

  function endPath() {
    save((state) => state.pending === null ? state : { ...state, pending: null })
    setHovered(null)
    setStatus('')
  }

  function switchSketch(id: number) {
    save((state) => id === state.activeId || !state.sketches.some(sketch => sketch.id === id)
      ? state : { ...state, activeId: id, pending: null })
    setHovered(null)
    setStatus('')
  }

  function changeEdges(next: ChainEdge[], endpoint: number | null = null, highlightedDigit?: number, reveal = false) {
    const weakAdditions = graph ? next.filter(edge => graph.strength(...edge) === 'weak' &&
      !edges.some(existing => sameEdge(edge, existing))) : []
    save((state) => {
      if (state.activeId !== active.id || state.pending !== pending ||
        state.sketches.find(sketch => sketch.id === state.activeId)?.history.at(-1) !== edges) return state
      if (graph && weakAdditions.length && weakAdditions.some(weakLinkRun(graph, [...drawnEdges(state.sketches, active.id), ...weakAdditions]))) {
        return state
      }
      return updateChainEdges(state, next, endpoint, highlightedDigit, reveal)
    })
    setHovered(null)
  }

  function beginAt(candidate: Candidate, component: readonly ChainEdge[] = []) {
    if (!enabled) return
    const node = candidateId(candidate)
    const additions = component.filter(edge => !edges.some(existing => sameEdge(edge, existing)))
    setDrawingIntent(true)
    setHovered(null)
    setStatus('')
    if (additions.length) changeEdges([...edges, ...additions], node, candidate.digit, true)
    else updateActive(sketch => ({ ...sketch, hidden: false, highlightedDigit: candidate.digit }), node, true)
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph || active.hidden) return
    const id = candidateId(candidate)
    if (pending === id) {
      const remaining = edges.filter(edge => !edge.includes(id))
      if (remaining.length === edges.length - 1) {
        changeEdges(remaining)
        setStatus('Branch tip removed.')
        return
      }
    }
    const mark = (sketch: ChainSketch) => sketch.highlightedDigit === candidate.digit ? sketch : { ...sketch, highlightedDigit: candidate.digit }
    const name = `${candidate.digit} in ${cellName(candidate.cell)}`
    const alreadyLinked = edges.some(edge => edge.includes(id))
    if (pending === null || pending === id || (alreadyLinked && !linkTargets.has(id))) {
      updateActive(mark, pending === id ? null : id)
      setHovered(null)
      setStatus('')
      return
    }
    const link: ChainEdge = [pending, id]
    if (linkTargets.has(id)) {
      changeEdges([...edges, link], id, candidate.digit)
      setStatus('')
    } else if (exceedsWeakLinkLimit?.(link)) {
      setStatus(weakLinkStatus)
    } else {
      setHighlightedDigit(candidate.digit)
      setStatus(`No link to ${name}. Choose a candidate that conflicts with the selected one.`)
    }
  }

  function finishLoop(chain: ChainAnalysis) {
    const extension = loopCompletions.get(chain)
    if (!extension) return
    setDrawingIntent(true)
    changeEdges([...edges, ...extension], null, drawing ? undefined : startHighlightDigit ?? undefined)
    setStatus(`Loop completed with ${extension.length} ${extension.length === 1 ? 'link' : 'links'}.`)
  }

  function stop() {
    setDrawingIntent(false)
    endPath()
  }

  return {
    drawing,
    annotations: preview ? { ...committed.annotations, links: [preview, ...(committed.annotations.links ?? [])] } : committed.annotations,
    colorPairs, assignedColors: committed.assigned, usedColorPairs: committed.usedPairs,
    sketches: analyzed, active, status, pending, beginAt, select, finishLoop, stop, endPath, setHighlightedDigit,
    suspend: () => setDrawingIntent(false),
    setPreviewedProof,
    chains: canAnalyze ? activeAnalysis?.chains ?? [] : [],
    medusas: canAnalyze ? activeAnalysis?.medusas ?? [] : [],
    allActions: applicable.actions, appliedChainIds: applicable.chainIds,
    hasLinks: edges.length > 0,
    contains: (candidate: Candidate) => edges.some(edge => edge.includes(candidateId(candidate))),
    canUndo: active.history.length > 1,
    canFinishLoop: (chain: ChainAnalysis) => loopCompletions.has(chain),
    canExtendStrongLinks: strongExtension.length > 0,
    extendStrongLinks() {
      if (!strongExtension.length) return
      changeEdges([...edges, ...strongExtension], pending)
      setStatus('')
    },
    isLinkTarget: (candidate: Candidate) => linkTargets.has(candidateId(candidate)),
    hover(candidate: Candidate | null) {
      setHovered(candidate && candidateId(candidate))
    },
    toggle() {
      if (drawing) stop()
      else if (enabled) {
        if (startHighlightDigit !== null) setHighlightedDigit(startHighlightDigit)
        setDrawingIntent(true)
        setStatus('')
      }
    },
    switchSketch,
    addSketch() {
      save((state) => {
        const current = state.sketches.find(({ id }) => id === state.activeId)!
        if (!current.history.at(-1)?.length) return state
        const empty = state.sketches.find(({ history }) => !history.at(-1)?.length)
        if (empty) return { ...state, activeId: empty.id, pending: null }
        const sketch = newChainSketch(nextChainId(state.sketches), colorPairs)
        return { ...state, sketches: [...state.sketches, sketch], activeId: sketch.id, pending: null }
      })
      setHovered(null)
      setStatus('')
    },
    toggleVisibility(id: number) {
      save((state) => {
        const target = state.sketches.find(sketch => sketch.id === id)
        if (!target || (!target.hidden && !target.history.at(-1)?.length)) return state
        return { ...state, pending: id === state.activeId ? null : state.pending,
          sketches: state.sketches.map(sketch => sketch === target ? { ...sketch, hidden: !sketch.hidden } : sketch) }
      })
      setHovered(null)
      setStatus('')
    },
    deleteSketch(id: number) {
      save((state) => {
        const index = state.sketches.findIndex((sketch) => sketch.id === id)
        if (index === -1) return state
        const sketches = state.sketches.filter((sketch) => sketch.id !== id)
        if (!sketches.length) return emptySketch
        return id === state.activeId ? { ...state, sketches, activeId: sketches[Math.min(index, sketches.length - 1)].id, pending: null }
          : { ...state, sketches }
      })
      setHovered(null)
      setStatus('')
    },
    setColors(color: ChainColor, secondColor: ChainColor) {
      updateActive((sketch) => ({ ...sketch, color, secondColor }))
    },
    undo() {
      save(state => state.activeId === active.id ? undoChainEdit(state, drawing) : state)
      setHovered(null)
      setStatus('')
    },
    clear() {
      changeEdges([])
      setStatus('Links cleared.')
    },
  }
}
