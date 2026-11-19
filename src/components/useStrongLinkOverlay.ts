import { useMemo } from 'react'
import { candidateId, chainCandidate, highlightedStrongLinks, type ChainGraph } from '../sudoku/chains'
import type { Candidate } from '../sudoku/engine'
import type { BoardAnnotations, CandidateAnnotation } from './BoardAnnotations'

export function useStrongLinkOverlay(graph: ChainGraph | null, digitMask: number, sketch: BoardAnnotations) {
  const edges = useMemo(() => graph ? highlightedStrongLinks(graph, digitMask) : [], [graph, digitMask])
  return useMemo(() => {
    const endpoints = new Set(edges.flat())
    const candidates = new Map(sketch.candidates)
    for (const id of endpoints) {
      const { cell, digit } = chainCandidate(id)
      const marks = candidates.get(cell)
      if (marks?.has(digit)) continue
      const next = new Map<number, CandidateAnnotation>(marks)
      next.set(digit, { color: 'var(--strong-link-overlay)', label: 'strong link endpoint' })
      candidates.set(cell, next)
    }
    const drawn = sketch.links ?? []
    const drawnPairs = new Set(drawn.flatMap(({ from, to }) => {
      if (!('cell' in from) || from.digit === undefined || !('cell' in to) || to.digit === undefined) return []
      const pair = [candidateId({ cell: from.cell, digit: from.digit }), candidateId({ cell: to.cell, digit: to.digit })]
      return [pair.join(':'), pair.reverse().join(':')]
    }))
    const links = edges.filter(([from, to]) => !drawnPairs.has(`${from}:${to}`)).map(([from, to]) => ({
      from: chainCandidate(from), to: chainCandidate(to), color: 'var(--strong-link-overlay)', muted: true,
    }))
    return {
      count: edges.length, annotations: { ...sketch, candidates, links: [...links, ...drawn] },
      canStart: (candidate: Candidate) => endpoints.has(candidateId(candidate)),
    }
  }, [edges, sketch])
}
