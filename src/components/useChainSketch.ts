import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  analyzeChains, candidateId, chainCandidate, chainExtensionStrength, completeChainLoop, sameEdge,
  type ChainAnalysis, type ChainEdge, type ChainGraph, type LinkStrength,
} from '../sudoku/chains'
import { cellName } from '../sudoku/lesson-diagram'
import type { BoardAnnotations, BoardLink, CandidateAnnotation } from './BoardAnnotations'

const linkedColor = 'var(--chain-link)'
const selectedColor = 'var(--chain-selected)'
const placementColor = 'var(--chain-placement)'
const removalColor = 'var(--chain-removal)'

export function useChainSketch(graph: ChainGraph | null, positionKey: string, enabled: boolean) {
  const [drawing, setDrawing] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [history, setHistory] = useState<ChainEdge[][]>([])
  const [status, setStatus] = useState('')
  const edges = history.at(-1)
  const chains = useMemo(() => graph && edges ? analyzeChains(graph, edges) : [], [graph, edges])
  const loopCompletions = useMemo(() => {
    const completions = new Map<ChainAnalysis, ChainEdge[]>()
    if (!graph || !edges) return completions
    const drawnNodes = edges.flat()
    for (const chain of chains) {
      if (!chain.canComplete) continue
      const otherNodes = new Set(drawnNodes)
      for (const node of chain.nodes) otherNodes.delete(node)
      const result = completeChainLoop(graph, chain.nodes, otherNodes)
      if (result.status === 'found') completions.set(chain, result.edges)
    }
    return completions
  }, [graph, edges, chains])
  const linkTargets = useMemo(() => {
    const targets = new Map<number, LinkStrength>()
    if (!graph || pending === null) return targets
    for (const candidate of graph.candidates) {
      const strength = chainExtensionStrength(graph, edges ?? [], [pending, candidate])
      if (strength) targets.set(candidate, strength)
    }
    return targets
  }, [graph, pending, edges])

  useEffect(() => {
    setPending(null)
    setHovered(null)
    setHistory([])
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
    if (!graph) return {}
    const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
    const links: BoardLink[] = []

    function mark(id: number, annotation: CandidateAnnotation) {
      const { cell, digit } = chainCandidate(id)
      const row = candidateMarks.get(cell) ?? new Map()
      row.set(digit, annotation)
      candidateMarks.set(cell, row)
    }

    function draw(from: number, to: number, weak: boolean) {
      links.push({ from: chainCandidate(from), to: chainCandidate(to), dashed: weak, color: linkedColor })
    }

    for (const chain of chains) {
      for (const node of chain.nodes) mark(node, { color: linkedColor, label: 'linked candidate' })
      chain.strengths.forEach((strength, i) => draw(chain.nodes[i], chain.nodes[i + 1], strength === 'weak'))
      if (!chain.strengths.length) {
        const members = new Set(chain.nodes)
        for (const [a, b] of edges ?? []) {
          const strength = graph.strength(a, b)
          if (strength && members.has(a) && members.has(b)) draw(a, b, strength === 'weak')
        }
      }
    }
    if (pending !== null) mark(pending, { color: selectedColor, label: 'selected for linking' })
    for (const chain of chains) {
      for (const action of chain.actions) {
        if ('place' in action) mark(candidateId(action.place), { color: placementColor, label: 'forced placement' })
        else mark(candidateId(action.eliminate), { color: removalColor, mark: 'strike', label: 'can be removed' })
      }
    }
    return { candidates: candidateMarks, links }
  }, [graph, chains, edges, pending])

  const preview = useMemo<BoardLink | undefined>(() => {
    if (pending === null || hovered === null) return
    const strength = linkTargets.get(hovered)
    if (!strength) return
    return {
      from: chainCandidate(pending), to: chainCandidate(hovered), color: 'var(--chain-preview)', dashed: strength === 'weak',
    }
  }, [pending, hovered, linkTargets])

  function changeEdges(next: ChainEdge[], endpoint: number | null = null) {
    setHistory((previous) => [...previous, next])
    setPending(endpoint)
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
      setPending(null)
      setStatus('')
      return
    }
    const link: ChainEdge = [pending, id]
    if (!graph.strength(...link)) {
      setStatus(`No link to ${name}. Choose a different candidate.`)
      return
    }
    const current = edges ?? []
    const existing = current.findIndex((edge) => sameEdge(edge, link))
    if (existing === -1 && !linkTargets.has(id)) {
      setStatus('That link would break alternation a second time. Choose a different candidate.')
      return
    }
    changeEdges(existing === -1 ? [...current, link] : current.filter((_, i) => i !== existing), id)
    setStatus(existing === -1
      ? 'Choose another candidate to extend the chain, or select the last candidate again to end it.'
      : 'Link removed. Choose a linked candidate to continue.')
  }

  function finishLoop(chain: ChainAnalysis) {
    const extension = loopCompletions.get(chain)
    if (!edges || !extension) return
    setDrawing(true)
    changeEdges([...edges, ...extension])
    setStatus(`Loop completed with ${extension.length} ${extension.length === 1 ? 'link' : 'links'}.`)
  }

  function stop() {
    setDrawing(false)
    setPending(null)
    setHovered(null)
    setStatus('')
  }

  function cancel() {
    if (pending === null) stop()
    else {
      setPending(null)
      setStatus('')
    }
  }

  return {
    drawing: enabled && drawing,
    annotations: preview ? { ...committed, links: [preview, ...(committed.links ?? [])] } : committed,
    chains, status, pending, select, finishLoop, cancel, stop,
    hasLinks: Boolean(edges?.length),
    canUndo: history.length > 0,
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
    undo() {
      setHistory((previous) => previous.slice(0, -1))
      setPending(null)
      setStatus('Link edit undone.')
    },
    clear() {
      changeEdges([])
      setStatus('Links cleared.')
    },
  }
}
