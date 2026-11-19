import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  chainColor, initialChainSketch, MAX_CHAIN_HISTORY, newChainSketch, removeUnavailableChains,
  type ChainColor, type ChainSketch, type ChainSketchState,
} from '../sudoku/chain-sketch'
import {
  analyzeChainPaths, analyzeMedusa, candidateId, chainCandidate, chainColors, completeChainLoop, completeMedusa, sameEdge,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type LinkStrength,
} from '../sudoku/chains'
import type { Game } from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { roomStore } from '../sudoku/storage'
import { techniqueActionKey } from '../sudoku/technique-progress'
import type { BoardAnnotations, BoardLink, CandidateAnnotation } from './BoardAnnotations'

type ChainPath = { nodes: readonly number[]; strengths: readonly LinkStrength[] }

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

export function useChainSketch(game: Game, graph: ChainGraph | null, { canDraw, graphCurrent, canAnalyze, startHighlightDigit, drawingIntent, setDrawingIntent }: {
  canDraw: boolean; graphCurrent: boolean; canAnalyze: boolean; startHighlightDigit: number | null
  drawingIntent: boolean | null; setDrawingIntent: (intent: boolean) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const { sketches, activeId, pending } = game.chainSketch ?? initialChainSketch
  const active = sketches.find(({ id }) => id === activeId) ?? sketches[0]
  const edges = active.history.at(-1)!
  const enabled = canDraw && canAnalyze && Boolean(graph)
  const drawing = enabled && (drawingIntent ?? pending !== null)

  const analyzed = useMemo(() => graph ? sketches.map((sketch) => {
    const edges = sketch.history.at(-1)!
    const colors = chainColors(graph, edges)
    const medusas = analyzeMedusa(graph, edges, colors).map(proof => ({
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
      ...sketch, edges, chains, colors, types: [...types], paths: sketchPaths(graph, edges), medusas,
      hasColorBreak: edges.some(edge => graph.strength(...edge) && colors.get(edge[0]) === colors.get(edge[1])),
    }
  }) : [], [graph, sketches])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
  const allActions = useMemo(() => {
    if (!canAnalyze) return []
    const actions = analyzed.flatMap(({ chains, medusas }) => [...chains, ...medusas].flatMap(({ actions }) => actions))
    return [...new Map(actions.map(action => [techniqueActionKey(action), action])).values()]
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
      if (result.status === 'found') completions.set(chain, result.edges)
    }
    return completions
  }, [graph, canAnalyze, activeAnalysis, edges])
  const linkTargets = useMemo(() => {
    const targets = new Map<number, LinkStrength>()
    if (!graph || !drawing || active.hidden || pending === null) return targets
    for (const candidate of graph.candidates) {
      const edge: ChainEdge = [pending, candidate]
      if (edges.some((existing) => sameEdge(edge, existing))) continue
      const strength = graph.strength(...edge)
      if (strength) targets.set(candidate, strength)
    }
    return targets
  }, [graph, drawing, pending, edges, active.hidden])
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
      current.position.eliminations === game.position.eliminations ? { ...current, chainSketch: next } : current)
  }, [game.id, game.chainSketch, game.givens, game.position, graph, graphCurrent])

  const committed = useMemo<BoardAnnotations>(() => {
    const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
    const links: BoardLink[] = []

    function mark(id: number, annotation: CandidateAnnotation) {
      const { cell, digit } = chainCandidate(id)
      const row = candidateMarks.get(cell) ?? new Map()
      row.set(digit, annotation)
      candidateMarks.set(cell, row)
    }

    // Draw the active sketch last so its marks take priority at shared candidates.
    const ordered = [...analyzed.filter(({ id }) => id !== active.id), ...analyzed.filter(({ id }) => id === active.id)]
    for (const sketch of ordered) {
      if (sketch.hidden) continue
      const color = chainColor(sketch.color)
      for (const { nodes, strengths } of sketch.paths) {
        strengths.forEach((strength, i) => {
          links.push({ from: chainCandidate(nodes[i]), to: chainCandidate(nodes[i + 1]), dashed: strength === 'weak', color,
            colorBreak: sketch.colors.get(nodes[i]) === sketch.colors.get(nodes[i + 1]) })
        })
      }

      for (const [node, side] of sketch.colors) {
        mark(node, { color: chainColor(side === 0 ? sketch.color : sketch.secondColor), label: `Chain color ${side === 0 ? 'A' : 'B'}` })
      }
    }

    const activeProofs = canAnalyze && activeAnalysis && !active.hidden ? [...activeAnalysis.chains, ...activeAnalysis.medusas] : []
    for (const { actions } of activeProofs) {
      for (const action of actions) {
        if ('place' in action) {
          const { cell, digit } = action.place
          const colored = candidateMarks.get(cell)?.get(digit)
          mark(candidateId(action.place), { color: colored?.color ?? 'var(--chain-placement)',
            mark: 'ring', label: [colored?.label, 'forced placement'].filter(Boolean).join(', ') })
        } else {
          const { cell, digit } = action.eliminate
          const colored = candidateMarks.get(cell)?.get(digit)
          mark(candidateId(action.eliminate), { color: colored?.color ?? 'var(--chain-removal)',
            mark: 'strike', label: [colored?.label, 'can be removed'].filter(Boolean).join(', ') })
        }
      }
    }
    if (!active.hidden && pending !== null) {
      const { cell, digit } = chainCandidate(pending)
      if (!candidateMarks.get(cell)?.has(digit)) {
        mark(pending, { color: chainColor(active.color), label: 'Chain color A, selected for linking' })
      }
    }
    return { candidates: candidateMarks, links }
  }, [analyzed, active.id, active.hidden, active.color, activeAnalysis, canAnalyze, pending])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (pending === null || hovered === null) return
    const strength = linkTargets.get(hovered)
    if (!strength) return
    return {
      from: chainCandidate(pending), to: chainCandidate(hovered), color: 'var(--chain-preview)', dashed: strength === 'weak',
    }
  }, [pending, hovered, linkTargets])

  function save(change: (state: ChainSketchState) => ChainSketchState) {
    roomStore.update(game.id, (current) => {
      const saved = current.chainSketch ?? initialChainSketch
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

  function changeEdges(next: ChainEdge[], endpoint: number | null = null, highlightedDigit?: number) {
    updateActive((sketch) => ({ ...sketch, highlightedDigit: highlightedDigit ?? sketch.highlightedDigit,
      history: [...sketch.history.slice(1 - MAX_CHAIN_HISTORY), next] }), endpoint, true)
    setHovered(null)
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph || active.hidden) return
    const id = candidateId(candidate)
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
    annotations: preview ? { ...committed, links: [preview, ...(committed.links ?? [])] } : committed,
    sketches: analyzed, active, status, pending, select, finishLoop, stop, endPath, setHighlightedDigit,
    suspend: () => setDrawingIntent(false),
    chains: canAnalyze ? activeAnalysis?.chains ?? [] : [],
    medusas: canAnalyze ? activeAnalysis?.medusas ?? [] : [],
    allActions,
    hasLinks: edges.length > 0,
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
        const sketch = newChainSketch(Math.max(...state.sketches.map(({ id }) => id)) + 1)
        return { ...state, sketches: [...state.sketches, sketch], activeId: sketch.id, pending: null }
      })
      setHovered(null)
      setStatus('')
    },
    toggleVisibility(id: number) {
      save((state) => ({ ...state, pending: id === state.activeId ? null : state.pending,
        sketches: state.sketches.map((sketch) => sketch.id === id ? { ...sketch, hidden: !sketch.hidden } : sketch) }))
      setHovered(null)
      setStatus('')
    },
    deleteSketch(id: number) {
      save((state) => {
        const index = state.sketches.findIndex((sketch) => sketch.id === id)
        if (index === -1) return state
        const sketches = state.sketches.filter((sketch) => sketch.id !== id)
        if (!sketches.length) return initialChainSketch
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
      updateActive((sketch) => sketch.history.length > 1 ? { ...sketch, history: sketch.history.slice(0, -1) } : sketch, null)
      setHovered(null)
      setStatus('')
    },
    clear() {
      changeEdges([])
      setStatus('Links cleared.')
    },
  }
}
