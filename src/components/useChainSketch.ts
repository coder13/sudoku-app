import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  CHAIN_COLORS, initialChainSketch, MAX_CHAIN_HISTORY, newChainSketch, removeUnavailableChains,
  type ChainColor, type ChainSketch, type ChainSketchState, type ChainType,
} from '../sudoku/chain-sketch'
import {
  analyzeChains, analyzeMedusa, candidateId, chainCandidate, chainExtensionStrength, completeChainLoop, sameEdge,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type LinkStrength,
} from '../sudoku/chains'
import type { Game } from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { roomStore } from '../sudoku/storage'
import type { BoardAnnotations, BoardLink, CandidateAnnotation } from './BoardAnnotations'

export { CHAIN_COLORS }
export const chainColor = (color: ChainColor) => `var(--chain-${color.toLowerCase()})`

type ChainPath = { nodes: readonly number[]; strengths: readonly LinkStrength[] }

function sketchPaths(graph: ChainGraph, edges: readonly ChainEdge[], chains: readonly ChainAnalysis[], type: ChainType): ChainPath[] {
  function pathsFromLinks(links: readonly ChainEdge[]): ChainPath[] {
    const paths: { nodes: number[]; strengths: LinkStrength[] }[] = []
    for (const [from, to] of links) {
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

  if (type === 'medusa') return pathsFromLinks(edges)
  return chains.flatMap((chain) => {
    if (chain.strengths.length) return [chain]
    const nodes = new Set(chain.nodes)
    return pathsFromLinks(edges.filter(([from, to]) => nodes.has(from) && nodes.has(to)))
  })
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
    const chains = sketch.type === 'alternating' ? analyzeChains(graph, edges) : []
    return {
      ...sketch, edges, chains, paths: sketchPaths(graph, edges, chains, sketch.type),
      medusas: sketch.type === 'medusa' ? analyzeMedusa(graph, edges) : [],
    }
  }) : [], [graph, sketches])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
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
      const strength = active.type === 'medusa'
        ? graph.strength(...edge) === 'strong' ? 'strong' : undefined
        : chainExtensionStrength(graph, edges, edge)
      if (strength) targets.set(candidate, strength)
    }
    return targets
  }, [graph, drawing, pending, edges, active.type, active.hidden])

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
          links.push({ from: chainCandidate(nodes[i]), to: chainCandidate(nodes[i + 1]), dashed: strength === 'weak', color })
        })
      }

      for (const { nodes } of sketch.chains) {
        for (const node of nodes) mark(node, { color, label: `linked candidate, ${sketch.color} chain` })
      }
      if (sketch.type === 'medusa') {
        for (const { nodes } of sketch.paths) {
          for (const node of nodes) mark(node, { color, label: 'linked Medusa candidate' })
        }
      }
      for (const medusa of sketch.medusas) {
        for (const node of medusa.nodes) {
          const side = medusa.sides.get(node)
          const tone = side === 1 ? sketch.secondColor : sketch.color
          const label = side === undefined ? 'uncolored Medusa candidate' : `Medusa color ${side === 0 ? 'A' : 'B'}, ${tone}`
          mark(node, { color: chainColor(tone), label })
        }
      }
    }

    const activeProofs = canAnalyze && activeAnalysis && !active.hidden ? [...activeAnalysis.chains, ...activeAnalysis.medusas] : []
    for (const { actions } of activeProofs) {
      for (const action of actions) {
        if ('place' in action) {
          mark(candidateId(action.place), { color: 'var(--chain-placement)', label: 'forced placement' })
        } else {
          const { cell, digit } = action.eliminate
          const colored = active.type === 'medusa' ? candidateMarks.get(cell)?.get(digit) : undefined
          mark(candidateId(action.eliminate), { color: colored?.color ?? 'var(--chain-removal)',
            mark: 'strike', label: [colored?.label, 'can be removed'].filter(Boolean).join(', ') })
        }
      }
    }
    if (!active.hidden && pending !== null) {
      const { cell, digit } = chainCandidate(pending)
      if (!candidateMarks.get(cell)?.has(digit)) mark(pending, { color: 'var(--chain-selected)', label: 'selected for linking' })
    }
    return { candidates: candidateMarks, links }
  }, [analyzed, active.id, active.type, active.hidden, activeAnalysis, canAnalyze, pending])

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

  function updateActive(update: (sketch: ChainSketch) => ChainSketch, endpoint?: number | null, requireCurrentPath = false) {
    save((state) => {
      if (state.activeId !== active.id) return state
      const current = state.sketches.find(({ id }) => id === active.id)!
      if (requireCurrentPath && (current.history.at(-1) !== edges || state.pending !== pending)) return state
      const next = update(current)
      const nextPending = endpoint === undefined ? state.pending : endpoint
      if (next === current && nextPending === state.pending) return state
      return { ...state, pending: nextPending, sketches: state.sketches.map(sketch => sketch === current ? next : sketch) }
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

  function beginAt(candidate: Candidate) {
    if (!enabled || active.hidden) return
    const node = candidateId(candidate)
    setDrawingIntent(true)
    setHovered(null)
    setStatus('')
    updateActive((sketch) => ({ ...sketch, highlightedDigit: candidate.digit }), node, true)
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph || active.hidden) return
    const id = candidateId(candidate)
    const mark = (sketch: ChainSketch) => sketch.highlightedDigit === candidate.digit ? sketch : { ...sketch, highlightedDigit: candidate.digit }
    const name = `${candidate.digit} in ${cellName(candidate.cell)}`
    if (pending === null) {
      updateActive(mark, id)
      setStatus('')
      return
    }
    if (pending === id) {
      updateActive(mark, null)
      setHovered(null)
      setStatus('')
      return
    }
    const link: ChainEdge = [pending, id]
    const existing = edges.findIndex((edge) => sameEdge(edge, link))
    if (existing !== -1) {
      changeEdges(edges.filter((_, index) => index !== existing), id, candidate.digit)
      setStatus('Link removed.')
    } else if (linkTargets.has(id)) {
      changeEdges([...edges, link], id, candidate.digit)
      setStatus('')
    } else {
      setHighlightedDigit(candidate.digit)
      setStatus(active.type === 'medusa' ? 'Choose a candidate with a strong link to the selected candidate.'
        : !graph.strength(...link) ? `No link to ${name}. Choose a different candidate.`
          : 'Choose a link that keeps the chain alternating.')
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
    sketches: analyzed, active, status, pending, beginAt, select, finishLoop, stop, endPath, setHighlightedDigit,
    suspend: () => setDrawingIntent(false),
    chains: canAnalyze ? activeAnalysis?.chains ?? [] : [],
    medusas: canAnalyze ? activeAnalysis?.medusas ?? [] : [],
    hasLinks: edges.length > 0,
    canUndo: active.history.length > 1,
    canFinishLoop: (chain: ChainAnalysis) => loopCompletions.has(chain),
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
        return { sketches: [...state.sketches, sketch], activeId: sketch.id, pending: null }
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
        return id === state.activeId ? { sketches, activeId: sketches[Math.min(index, sketches.length - 1)].id, pending: null }
          : { ...state, sketches }
      })
      setHovered(null)
      setStatus('')
    },
    setType(type: ChainType) {
      if (edges.length) return
      updateActive((sketch) => ({ ...sketch, type, history: [[]] }), null)
      setHovered(null)
      setStatus('')
    },
    setColor(color: ChainColor, second = false) {
      updateActive((sketch) => {
        const other = second ? sketch.color : sketch.secondColor
        if (second) return { ...sketch, secondColor: color, color: other === color ? sketch.secondColor : other }
        return { ...sketch, color, secondColor: other === color ? sketch.color : other }
      })
    },
    undo() {
      updateActive((sketch) => sketch.history.length > 1 ? { ...sketch, history: sketch.history.slice(0, -1) } : sketch, null)
      setHovered(null)
      setStatus('Link edit undone.')
    },
    clear() {
      changeEdges([])
      setStatus('Links cleared.')
    },
  }
}
