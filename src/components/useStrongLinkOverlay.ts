import { useMemo } from 'react'
import { candidateId, chainCandidate, colorStrongLinks, highlightedStrongLinks, type ChainEdge, type ChainGraph } from '../sudoku/chains'
import { chainColor, cycleChainPairs, type ChainColorPair } from '../sudoku/chain-sketch'
import type { Candidate } from '../sudoku/engine'
import type { BoardAnnotations, CandidateAnnotation } from './BoardAnnotations'

export function useStrongLinkOverlay(graph: ChainGraph | null, digitMask: number, sketch: BoardAnnotations,
  colorPairs: readonly ChainColorPair[], usedPairs: readonly ChainColorPair[],
  drawnColors: ReadonlyMap<number, { pair: ChainColorPair; side: 0 | 1 }>) {
  const { edges, components, componentEdges } = useMemo(() => {
    const edges = graph ? highlightedStrongLinks(graph, digitMask) : []
    const components = graph ? colorStrongLinks(graph, edges) : []
    const componentEdges = new Map<number, ChainEdge[]>()
    for (const { nodes } of components) {
      const links: ChainEdge[] = []
      for (const node of nodes) componentEdges.set(node, links)
    }
    for (const edge of edges) componentEdges.get(edge[0])?.push(edge)
    return { edges, components, componentEdges }
  }, [graph, digitMask])
  return useMemo(() => {
    const candidates = new Map(sketch.candidates)
    const nextPair = cycleChainPairs(colorPairs, usedPairs)
    const lineColors = new Map<number, string>()
    for (const { nodes, sides } of components) {
      const anchor = nodes.find(node => drawnColors.has(node))
      const drawn = anchor === undefined ? undefined : drawnColors.get(anchor)
      const pair = sides.size ? drawn?.pair ?? nextPair() : undefined
      const flipped = drawn !== undefined && drawn.side !== sides.get(anchor!)
      const lineColor = pair ? chainColor(pair[0]) : 'var(--chain-neutral)'
      for (const id of nodes) {
        lineColors.set(id, lineColor)
        const { cell, digit } = chainCandidate(id)
        const marks = candidates.get(cell)
        if (marks?.has(digit)) continue
        const side = Number((sides.get(id) === 1) !== flipped)
        const next = new Map<number, CandidateAnnotation>(marks)
        next.set(digit, pair
          ? { color: chainColor(pair[side]), mark: 'emphasized', label: `strong link color ${side === 0 ? 'A' : 'B'}` }
          : { color: lineColor, mark: 'emphasized', label: 'Strongly linked candidate' })
        candidates.set(cell, next)
      }
    }
    const drawn = sketch.links ?? []
    const drawnPairs = new Set(drawn.flatMap(({ from, to }) => {
      if (!('cell' in from) || from.digit === undefined || !('cell' in to) || to.digit === undefined) return []
      const pair = [candidateId({ cell: from.cell, digit: from.digit }), candidateId({ cell: to.cell, digit: to.digit })]
      return [pair.join(':'), pair.reverse().join(':')]
    }))
    const links = edges.filter(([from, to]) => !drawnPairs.has(`${from}:${to}`)).map(([from, to]) => ({
      from: chainCandidate(from), to: chainCandidate(to), color: lineColors.get(from)!, muted: true, selectFrom: chainCandidate(from),
    }))
    return {
      count: edges.length, annotations: { ...sketch, candidates, links: [...links, ...drawn] },
      component: (candidate: Candidate) => componentEdges.get(candidateId(candidate)),
    }
  }, [edges, components, componentEdges, sketch, colorPairs, usedPairs, drawnColors])
}
