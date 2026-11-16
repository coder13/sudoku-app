import { useEffect, useMemo, useState } from 'react'
import type { Candidate } from '../sudoku/engine'
import {
  analyzeChains, candidateId, chainCandidate, completeChainLoop, sameEdge,
  type ChainAnalysis, type ChainEdge, type ChainGraph,
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
  const [history, setHistory] = useState<ChainEdge[][]>([])
  const [status, setStatus] = useState('')
  const edges = history.at(-1)
  const chains = useMemo(() => graph && edges ? analyzeChains(graph, edges) : [], [graph, edges])

  useEffect(() => {
    setPending(null)
    setHistory([])
    setStatus('')
  }, [positionKey])

  useEffect(() => {
    if (!enabled) {
      setDrawing(false)
      setPending(null)
      setStatus('')
    }
  }, [enabled])

  const annotations = useMemo<BoardAnnotations>(() => {
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
    for (const chain of chains) {
      for (const action of chain.actions) {
        if ('place' in action) mark(candidateId(action.place), { color: placementColor, label: 'forced placement' })
        else mark(candidateId(action.eliminate), { color: removalColor, mark: 'strike', label: 'can be removed' })
      }
    }
    if (pending !== null) mark(pending, { color: selectedColor, label: 'selected for linking' })
    return { candidates: candidateMarks, links }
  }, [graph, chains, edges, pending])

  function changeEdges(next: ChainEdge[]) {
    setHistory((previous) => [...previous, next])
    setPending(null)
  }

  function select(candidate: Candidate) {
    if (!enabled || !drawing || !graph) return
    const id = candidateId(candidate)
    if (pending === null) {
      setPending(id)
      setStatus(`${candidate.digit} in ${cellName(candidate.cell)} selected. Choose a second candidate.`)
      return
    }
    if (pending === id) {
      setPending(null)
      setStatus('')
      return
    }
    const link: ChainEdge = [pending, id]
    if (!graph.strength(...link)) {
      setStatus('These candidates share no link. Choose a different second candidate.')
      return
    }
    const current = edges ?? []
    const existing = current.findIndex((edge) => sameEdge(edge, link))
    changeEdges(existing === -1 ? [...current, link] : current.filter((_, i) => i !== existing))
    setStatus(existing === -1 ? 'Link added. Choose the next pair.' : 'Link removed.')
  }

  function finishLoop(chain: ChainAnalysis) {
    if (!graph || !edges) return
    const otherNodes = new Set(edges.flat())
    for (const node of chain.nodes) otherNodes.delete(node)
    const result = completeChainLoop(graph, chain.nodes, otherNodes)
    if (result.status === 'found') {
      setDrawing(true)
      changeEdges([...edges, ...result.edges])
      setStatus(`Loop completed with ${result.edges.length} ${result.edges.length === 1 ? 'link' : 'links'}.`)
    } else {
      setStatus(result.status === 'limited' ? 'The search limit was reached before a loop was found.' : 'No loop extension found.')
    }
  }

  function stop() {
    setDrawing(false)
    setPending(null)
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
    annotations, chains, status, pending, select, finishLoop, cancel, stop,
    hasLinks: Boolean(edges?.length),
    canUndo: history.length > 0,
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
