import { useEffect, useMemo, useRef, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  analyzeChains, analyzeMedusa, candidateId, chainCandidate, chainExtensionStrength, completeChainLoop, sameEdge,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type LinkStrength,
} from '../sudoku/chains'
import { cellName } from '../sudoku/lesson-diagram'
import type { BoardAnnotations, BoardLink, CandidateAnnotation } from './BoardAnnotations'

export const CHAIN_COLORS = ['Blue', 'Orange', 'Purple', 'Teal', 'Pink', 'Green'] as const
type ChainColor = typeof CHAIN_COLORS[number]
type ChainType = 'alternating' | 'medusa'

export const chainColor = (color: ChainColor) => `var(--chain-${color.toLowerCase()})`

type Sketch = {
  id: number
  type: ChainType
  color: ChainColor
  secondColor: ChainColor
  history: ChainEdge[][]
}

function newSketch(id: number): Sketch {
  const colorIndex = (id - 1) % CHAIN_COLORS.length
  return {
    id, type: 'alternating', color: CHAIN_COLORS[colorIndex],
    secondColor: CHAIN_COLORS[(colorIndex + 1) % CHAIN_COLORS.length], history: [[]],
  }
}

export function useChainSketch(graph: ChainGraph | null, positionKey: string) {
  const [drawing, setDrawing] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [sketches, setSketches] = useState(() => [newSketch(1)])
  const [activeId, setActiveId] = useState(1)
  const nextId = useRef(2)
  const [status, setStatus] = useState('')
  const active = sketches.find(({ id }) => id === activeId) ?? sketches[0]
  const edges = active.history.at(-1)!
  const enabled = Boolean(graph)

  const analyzed = useMemo(() => graph ? sketches.map((sketch) => {
    const edges = sketch.history.at(-1)!
    return {
      ...sketch, edges,
      chains: sketch.type === 'alternating' ? analyzeChains(graph, edges) : [],
      medusas: sketch.type === 'medusa' ? analyzeMedusa(graph, edges) : [],
    }
  }) : [], [graph, sketches])
  const activeAnalysis = analyzed.find(({ id }) => id === active.id)
  const loopCompletions = useMemo(() => {
    const completions = new Map<ChainAnalysis, ChainEdge[]>()
    if (!graph || !activeAnalysis) return completions
    const drawnNodes = edges.flat()
    for (const chain of activeAnalysis.chains) {
      if (!chain.canComplete) continue
      const otherNodes = new Set(drawnNodes)
      for (const node of chain.nodes) otherNodes.delete(node)
      const result = completeChainLoop(graph, chain.nodes, otherNodes)
      if (result.status === 'found') completions.set(chain, result.edges)
    }
    return completions
  }, [graph, activeAnalysis, edges])
  const linkTargets = useMemo(() => {
    const targets = new Map<number, LinkStrength>()
    if (!graph || pending === null) return targets
    for (const candidate of graph.candidates) {
      const edge: ChainEdge = [pending, candidate]
      if (edges.some((existing) => sameEdge(edge, existing))) continue
      const strength = active.type === 'medusa'
        ? graph.strength(...edge) === 'strong' ? 'strong' : undefined
        : chainExtensionStrength(graph, edges, edge)
      if (strength) targets.set(candidate, strength)
    }
    return targets
  }, [graph, pending, edges, active.type])

  useEffect(() => {
    setPending(null)
    setHovered(null)
    setSketches([newSketch(1)])
    setActiveId(1)
    nextId.current = 2
    setStatus('')
  }, [positionKey])

  useEffect(() => {
    if (!enabled) {
      setDrawing(false)
      setPending(null)
      setHovered(null)
      setStatus('')
    }
  }, [enabled])

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
      const color = chainColor(sketch.color)
      function draw(from: number, to: number, weak = false) {
        links.push({ from: chainCandidate(from), to: chainCandidate(to), dashed: weak, color })
      }

      for (const chain of sketch.chains) {
        for (const node of chain.nodes) mark(node, { color, label: `linked candidate, ${sketch.color} chain` })
        chain.strengths.forEach((strength, i) => draw(chain.nodes[i], chain.nodes[i + 1], strength === 'weak'))
        if (!chain.strengths.length) {
          const members = new Set(chain.nodes)
          for (const [a, b] of sketch.edges) {
            if (members.has(a) && members.has(b)) draw(a, b, graph?.strength(a, b) === 'weak')
          }
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
      if (sketch.type === 'medusa') for (const [a, b] of sketch.edges) draw(a, b)
    }

    for (const { actions } of [...(activeAnalysis?.chains ?? []), ...(activeAnalysis?.medusas ?? [])]) {
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
    if (pending !== null) {
      const { cell, digit } = chainCandidate(pending)
      if (!candidateMarks.get(cell)?.has(digit)) mark(pending, { color: 'var(--chain-selected)', label: 'selected for linking' })
    }
    return { candidates: candidateMarks, links }
  }, [graph, analyzed, active.id, active.type, activeAnalysis, pending])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (pending === null || hovered === null) return
    const strength = linkTargets.get(hovered)
    if (!strength) return
    return {
      from: chainCandidate(pending), to: chainCandidate(hovered), color: 'var(--chain-preview)', dashed: strength === 'weak',
    }
  }, [pending, hovered, linkTargets])

  function updateActive(update: (sketch: Sketch) => Sketch) {
    setSketches((previous) => previous.map((sketch) => sketch.id === active.id ? update(sketch) : sketch))
  }

  function endPath() {
    setPending(null)
    setHovered(null)
    setStatus('')
  }

  function changeEdges(next: ChainEdge[], endpoint: number | null = null) {
    updateActive((sketch) => ({ ...sketch, history: [...sketch.history, next] }))
    setPending(endpoint)
    setHovered(null)
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph) return
    const id = candidateId(candidate)
    const name = `${candidate.digit} in ${cellName(candidate.cell)}`
    if (pending === null) {
      setPending(id)
      setStatus(`${name} selected. Choose a linked candidate.`)
      return
    }
    if (pending === id) {
      endPath()
      return
    }
    const link: ChainEdge = [pending, id]
    const existing = edges.findIndex((edge) => sameEdge(edge, link))
    if (existing !== -1) {
      changeEdges(edges.filter((_, index) => index !== existing), id)
      setStatus('Link removed.')
    } else if (linkTargets.has(id)) {
      changeEdges([...edges, link], id)
      setStatus('Choose another candidate, or end this path.')
    } else if (active.type === 'medusa') {
      setStatus('Choose a candidate with a strong link to the selected candidate.')
    } else if (!graph.strength(...link)) {
      setStatus(`No link to ${name}. Choose a different candidate.`)
    } else {
      setStatus('Choose a link that keeps the chain alternating.')
    }
  }

  function finishLoop(chain: ChainAnalysis) {
    const extension = loopCompletions.get(chain)
    if (!extension) return
    setDrawing(true)
    changeEdges([...edges, ...extension])
    setStatus(`Loop completed with ${extension.length} ${extension.length === 1 ? 'link' : 'links'}.`)
  }

  function stop() {
    setDrawing(false)
    endPath()
  }

  return {
    drawing: enabled && drawing,
    annotations: preview ? { ...committed, links: [preview, ...(committed.links ?? [])] } : committed,
    sketches, active, status, pending, select, finishLoop, stop, endPath,
    chains: activeAnalysis?.chains ?? [],
    medusas: activeAnalysis?.medusas ?? [],
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
        setDrawing(true)
        setStatus('')
      }
    },
    switchSketch(id: number) {
      endPath()
      setActiveId(id)
    },
    addSketch() {
      const sketch = newSketch(nextId.current++)
      setSketches((previous) => [...previous, sketch])
      setActiveId(sketch.id)
      endPath()
    },
    deleteSketch() {
      const index = sketches.findIndex(({ id }) => id === active.id)
      const remaining = sketches.filter(({ id }) => id !== active.id)
      const next = remaining.length ? remaining : [newSketch(1)]
      if (!remaining.length) nextId.current = 2
      setSketches(next)
      setActiveId(next[Math.min(index, next.length - 1)].id)
      endPath()
    },
    setType(type: ChainType) {
      if (edges.length) return
      updateActive((sketch) => ({ ...sketch, type, history: [[]] }))
      endPath()
    },
    setColor(color: ChainColor, second = false) {
      updateActive((sketch) => {
        const other = second ? sketch.color : sketch.secondColor
        if (second) return { ...sketch, secondColor: color, color: other === color ? sketch.secondColor : other }
        return { ...sketch, color, secondColor: other === color ? sketch.color : other }
      })
    },
    undo() {
      updateActive((sketch) => ({ ...sketch, history: sketch.history.length > 1 ? sketch.history.slice(0, -1) : sketch.history }))
      endPath()
      setStatus('Link edit undone.')
    },
    clear() {
      changeEdges([])
      setStatus('Links cleared.')
    },
  }
}
