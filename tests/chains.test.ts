import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeChainPaths, analyzeChains, analyzeMedusa, candidateId, chainCandidate, chainColors, chainExtensionStrength, completeChainLoop, completeMedusa, makeChainGraph, type ChainEdge } from '../src/sudoku/chains.ts'
import { newChainSketch, pruneChainsAfterMove, type ChainSketchState } from '../src/sudoku/chain-sketch.ts'
import { EMPTY, enter, makeGame, paintCandidate, STARTER_GAME } from '../src/sudoku/game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'

const id = (cell: number, digit = 1) => candidateId({ cell, digit })
const pathEdges = (...nodes: number[]): ChainEdge[] => nodes.slice(1).map((node, i) => [nodes[i], node])
function graph(cells: Record<number, number[]>) {
  return makeChainGraph(Array.from({ length: 81 }, (_, cell) =>
    (cells[cell] ?? []).reduce((mask, digit) => mask | (1 << (digit - 1)), 0)))
}

test('saved sketches preserve unfinished endpoints and color, and only affected chains disappear on a move', () => {
  const first = { ...newChainSketch(1), history: [[], pathEdges(id(0, 1), id(0, 2))], highlightedDigit: 2 }
  const second = { ...newChainSketch(2), history: [[], pathEdges(id(1, 3), id(1, 4))], highlightedDigit: 4 }
  const chainSketch: ChainSketchState = { sketches: [first, second], activeId: 2, pending: id(1, 4) }
  const game = { ...makeGame('sketch-save', 'Sketch save', EMPTY, 'imported'), chainSketch }
  game.position.center[0] = 1
  game.position.corner[0] = 3
  game.position.corner[1] = 12
  const colored = paintCandidate(game, { cell: 1, digit: 4 }, 8)
  const saved = readGame(game.id, JSON.stringify(colored))!
  assert.deepEqual(saved.chainSketch, chainSketch)
  assert.deepEqual(saved.position.candidateColors, { 1: { 4: 8 } })
  assert.equal(pruneChainsAfterMove(colored, enter(colored, [2], 'corner', 5)).chainSketch, chainSketch)
  const oneCopy = pruneChainsAfterMove(colored, enter(colored, [0], 'corner', 1))
  assert.equal(oneCopy.chainSketch, chainSketch)
  const removed = pruneChainsAfterMove(oneCopy, enter(oneCopy, [0], 'center', 1))
  assert.deepEqual(removed.chainSketch, { sketches: [second], activeId: 2, pending: id(1, 4) })
  assert.deepEqual(removed.position.candidateColors, saved.position.candidateColors)
})

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
  assert.equal(chainExtensionStrength(links, [edges[0]], edges[1]), 'weak')
  assert.equal(chainExtensionStrength(links, edges.slice(0, 2), edges[2]), 'strong')
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
  assert.equal(chainExtensionStrength(weakSeam, pathEdges(...path), [id(1), id(0)]), 'strong')
  const completed = completeChainLoop(weakSeam, path)
  assert.deepEqual(completed, { status: 'found', edges: [[id(1), id(0)]] })
  assert.ok(completed.status === 'found')
  const [removal] = analyzeChains(weakSeam, [...pathEdges(...path), ...completed.edges])
  assert.equal(removal.loop, 'discontinuous')
  assert.deepEqual(removal.actions, [{ eliminate: { cell: 8, digit: 1 } }])
})

test('a chain can have one break in alternation and rejects a second break', () => {
  const links = graph({ 0: [1, 2, 3, 4] })
  const [a, b, c, d] = links.candidates
  assert.equal(chainExtensionStrength(links, pathEdges(a, b), [b, c]), 'weak')
  assert.equal(chainExtensionStrength(links, pathEdges(a, b, c), [c, d]), undefined)
  assert.equal(chainExtensionStrength(links, pathEdges(a, b, c), [c, a]), undefined)

  const separateBreaks = graph({ 0: [1, 2, 3], 4: [3, 4, 5] })
  const [first, second, third, fourth, fifth, sixth] = separateBreaks.candidates
  assert.equal(chainExtensionStrength(separateBreaks, pathEdges(first, second, third, fourth), [fourth, fifth]), 'weak')
  assert.equal(chainExtensionStrength(separateBreaks, pathEdges(first, second, third, fourth, fifth), [fifth, sixth]), undefined)
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

test('one branched drawing can prove both a Medusa deduction and an AIC through a weak link', () => {
  const { givens } = STARTER_GAME
  const links = makeChainGraph(variantHouseMasks({ version: 1, givens }, givens))
  const main = pathEdges(id(23, 2), id(23, 4), id(50, 4), id(32, 4))
  const branches = pathEdges(id(50, 4), id(50), id(32))
  const sketch = [...main, ...branches]
  const colors = chainColors(links, sketch)
  assert.ok(sketch.every(([from, to]) => colors.get(from) !== colors.get(to)))
  const aic = analyzeChainPaths(links, sketch).find(proof => proof.title === 'Alternating inference chain (Type 2)')
  assert.deepEqual(aic?.strengths, ['strong', 'weak', 'strong'])
  assert.deepEqual(aic?.actions, [{ eliminate: { cell: 23, digit: 4 } }])
  const medusa = analyzeMedusa(links, sketch, colors).find(proof => proof.nodes.length === 4)
  assert.deepEqual(medusa?.actions, [
    { eliminate: { cell: 5, digit: 4 } }, { eliminate: { cell: 23, digit: 4 } }, { eliminate: { cell: 32, digit: 7 } },
  ])
  assert.ok([...medusa!.sides].every(([node, side]) => colors.get(node) === side))
  assert.ok(!medusa?.nodes.includes(id(23, 4)), 'The weak link does not join the Medusa component')
})

test('an AIC deduction still applies after extending the path with a weak link', () => {
  const { givens } = STARTER_GAME
  const links = makeChainGraph(variantHouseMasks({ version: 1, givens }, givens))
  const sketch = pathEdges(id(10, 7), id(11, 7), id(17, 7), id(26, 7), id(24, 7))
  assert.ok(analyzeChainPaths(links, sketch).some(proof =>
    proof.actions.some(action => 'eliminate' in action && action.eliminate.cell === 15 && action.eliminate.digit === 7)))
})

test('an odd loop marks a single color break and retains its loop deduction', () => {
  const links = graph({ 0: [1], 1: [1], 8: [1] })
  const edges = pathEdges(id(0), id(8), id(1), id(0))
  const colors = chainColors(links, edges)
  assert.equal(edges.filter(([a, b]) => colors.get(a) === colors.get(b)).length, 1)
  const [loop] = analyzeChainPaths(links, edges)
  assert.equal(loop.loop, 'discontinuous')
  assert.deepEqual(loop.actions, [{ eliminate: { cell: 8, digit: 1 } }])
})

test('Medusa colors a branch and removes the color that contains a conflict', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3], 9: [1, 4] })
  const root = id(0)
  const branch = [id(0, 2), id(1), id(9)]
  const edges: ChainEdge[] = branch.map((node) => [root, node])
  // The candidates in cells 1 and 9 see each other but have no strong link.
  const [medusa] = analyzeMedusa(links, [...edges, [id(1), id(9)]])
  assert.deepEqual(medusa.sides, new Map([[root, 0], ...branch.map((node) => [node, 1] as const)]))
  assert.deepEqual(medusa.actions, branch.map((node) => ({ eliminate: chainCandidate(node) })))
})

test('Medusa removes an uncolored candidate that sees both colors', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3], 2: [3, 6], 9: [1, 5], 28: [3, 7], 36: [1, 8] })
  const [medusa] = analyzeMedusa(links, pathEdges(id(0, 2), id(0), id(1), id(1, 3)))
  assert.deepEqual(medusa.actions, [{ eliminate: { cell: 9, digit: 1 } }])
})

test('Medusa rejects a color that removes every candidate from a cell', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3], 2: [3, 6], 9: [1, 3], 28: [3, 7], 36: [1, 8] })
  const [medusa] = analyzeMedusa(links, pathEdges(id(0, 2), id(0), id(1), id(1, 3)))
  assert.deepEqual(medusa.actions, [{ eliminate: { cell: 0, digit: 1 } }, { eliminate: { cell: 1, digit: 3 } }])
})

test('completing a drawn Medusa adds all five branches and finds the empty R5C9', () => {
  const rows = [
    '67 . . 39 39 . . . 67',
    '3679 59 56 . . . 3679 3679 .',
    '39 . . . . . 139 139 .',
    '69 . 56 . . 379 357 37 .',
    '. . . 346 346 . . 3469 369',
    '. 59 . . 469 79 4567 467 .',
    '. . . 34 . . 1347 1347 37',
    '. . . 69 . . 69 . .',
    '. . . . 469 39 346 . 369',
  ]
  const links = makeChainGraph(rows.join(' ').split(' ').map(cell =>
    [...cell].reduce((mask, digit) => digit === '.' ? mask : mask | (1 << (Number(digit) - 1)), 0)))
  const initialPath = pathEdges(id(43, 9), id(44, 9), id(80, 9), id(69, 9), id(66, 9),
    id(3, 9), id(3, 3), id(4, 3), id(4, 9))
  const added = completeMedusa(links, initialPath, id(4, 9))
  assert.deepEqual(added, [
    [id(4, 3), id(40, 3)], [id(66, 9), id(66, 6)], [id(69, 9), id(69, 6)],
    [id(66, 6), id(39, 6)], [id(66, 6), id(76, 6)],
  ])
  const complete = [...initialPath, ...added]
  const [medusa] = analyzeMedusa(links, complete)
  assert.equal(medusa.sides.size, 14)
  assert.match(medusa.explanation ?? '', /leaves r5c9 with no digit/)
  const removals = [id(43, 9), id(80, 9), id(66, 9), id(69, 6), id(3, 3), id(39, 6),
    id(76, 6), id(4, 9), id(40, 3)]
  assert.deepEqual(new Set(medusa.actions.map(({ eliminate }) => id(eliminate.cell, eliminate.digit))), new Set(removals))
  assert.deepEqual(completeMedusa(links, complete, id(4, 9)), [])
})

test('Medusa offers no edits when both colors lead to a conflict', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3], 9: [1, 3] })
  const [medusa] = analyzeMedusa(links, pathEdges(id(0, 2), id(0), id(1), id(1, 3)))
  assert.deepEqual(medusa.actions, [])
  assert.match(medusa.explanation ?? '', /Both colors lead to a conflict/)
})
