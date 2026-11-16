import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeChains, candidateId, completeChainLoop, makeChainGraph, type ChainEdge } from '../src/sudoku/chains.ts'

const id = (cell: number, digit = 1) => candidateId({ cell, digit })
const pathEdges = (...nodes: number[]): ChainEdge[] => nodes.slice(1).map((node, i) => [nodes[i], node])
function graph(cells: Record<number, number[]>) {
  return makeChainGraph(Array.from({ length: 81 }, (_, cell) =>
    (cells[cell] ?? []).reduce((mask, digit) => mask | (1 << (digit - 1)), 0)))
}

test('a link requires live candidates that conflict in a cell or house', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3, 4], 2: [1, 2], 3: [2], 30: [1] })
  assert.equal(links.strength(id(0), id(0, 2)), 'strong')
  assert.equal(links.strength(id(1, 3), id(1, 4)), 'weak')
  assert.equal(links.strength(id(0), id(1)), 'weak')
  assert.equal(links.strength(id(0), id(2, 2)), undefined)
  assert.equal(links.strength(id(0), id(30)), undefined)
  assert.equal(links.strength(id(0), id(0)), undefined)
  assert.equal(links.strength(id(0, 3), id(1, 3)), undefined)
})

test('an X-chain can use a conjugate pair as weak and remove a candidate that sees both ends', () => {
  const links = graph({ 0: [1], 4: [1], 8: [1], 36: [1], 40: [1] })
  const edges = pathEdges(id(0), id(36), id(40), id(4))
  const [analysis] = analyzeChains(links, edges)
  assert.equal(links.strength(id(36), id(40)), 'strong')
  assert.equal(analysis.title, 'X-chain')
  assert.deepEqual(analysis.strengths, ['strong', 'weak', 'strong'])
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 8, digit: 1 } }])
})

test('an XY-chain uses bivalue cells and rules out the shared end digit', () => {
  const links = graph({ 0: [1, 3], 3: [1, 2], 30: [2, 3], 27: [3] })
  const edges = pathEdges(id(0, 3), id(0), id(3), id(3, 2), id(30, 2), id(30, 3))
  const [analysis] = analyzeChains(links, edges)
  assert.equal(analysis.title, 'XY-chain')
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 27, digit: 3 } }])
})

test('completing a loop can add multiple links and respects candidates already used in other sketches', () => {
  const links = graph({ 0: [1], 4: [1], 8: [1], 36: [1], 40: [1] })
  const path = [id(0), id(36), id(40)]
  const completed = completeChainLoop(links, path)
  assert.deepEqual(completed, { status: 'found', edges: [[id(40), id(4)], [id(4), id(0)]] })
  assert.ok(completed.status === 'found')
  const [analysis] = analyzeChains(links, [...pathEdges(...path), ...completed.edges])
  assert.equal(analysis.loop, 'continuous')
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 8, digit: 1 } }])
  assert.deepEqual(completeChainLoop(links, path, new Set([id(4)])), { status: 'exhausted' })
})

test('a single discontinuity can force a placement or an elimination', () => {
  const strongSeam = graph({ 0: [1], 2: [1], 9: [1] })
  const [placement] = analyzeChains(strongSeam, pathEdges(id(2), id(0), id(9), id(2)))
  assert.equal(placement.loop, 'discontinuous')
  assert.deepEqual(placement.actions, [{ place: { cell: 0, digit: 1 } }])

  const weakSeam = graph({ 0: [1], 1: [1], 8: [1] })
  const path = [id(0), id(8), id(1)]
  const [partial] = analyzeChains(weakSeam, pathEdges(...path))
  assert.equal(partial.title, 'Non-alternating chain')
  assert.equal(partial.canComplete, true)
  const completed = completeChainLoop(weakSeam, path)
  assert.deepEqual(completed, { status: 'found', edges: [[id(1), id(0)]] })
  assert.ok(completed.status === 'found')
  const [removal] = analyzeChains(weakSeam, [...pathEdges(...path), ...completed.edges])
  assert.equal(removal.loop, 'discontinuous')
  assert.deepEqual(removal.actions, [{ eliminate: { cell: 8, digit: 1 } }])
})

test('disjoint drawings are analyzed separately and a branch is not treated as a path', () => {
  const links = graph({ 0: [1], 1: [1], 2: [1], 3: [1], 30: [3, 4] })
  const edges = [[id(0), id(1)], [id(0), id(2)], [id(0), id(3)], [id(30, 3), id(30, 4)]] as const
  const chains = analyzeChains(links, edges)
  assert.deepEqual(chains.map(({ title, actions }) => ({ title, actions })), [
    { title: 'Branched links', actions: [] },
    { title: 'Strong link', actions: [] },
  ])
})
