import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeChainPaths, analyzeChains, analyzeMedusa, candidateId, chainCandidate, chainGroup, chainNodeCandidates, chainPoint, validChainNode, chainExtensionStrength, colorStrongLinks, completeChainLoop, completeMedusa, highlightedStrongLinks, makeChainGraph, weakLinkRun, type ChainEdge, type ChainNode } from '../src/sudoku/chains.ts'
import { applyChainDeduction, CHAIN_COLOR_PAIRS, cycleChainPairs, newChainSketch, nextChainId, pruneChainsAfterMove, undoChainEdit, updateChainEdges, validChainSketchState, type ChainSketchState } from '../src/sudoku/chain-sketch.ts'
import { applyDeduction, EMPTY, enter, makeGame, paintCandidate, paintCandidateStroke, redo, replaceCandidates, STARTER_GAME, undo, type Game } from '../src/sudoku/game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'

const id = (cell: number, digit = 1) => candidateId({ cell, digit })
const pathEdges = (...nodes: ChainNode[]): ChainEdge[] => nodes.slice(1).map((node, i) => [nodes[i], node])
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

test('a strong inference inside an ALS only supports a weak inference when its digits conflict', () => {
  const masks = Array(81).fill(0)
  masks[0] = 0b0110
  masks[1] = 0b1100
  const graph = makeChainGraph(masks, undefined, [{ id: 1, cells: [0, 1] }])
  const [two, three, four] = [...graph.alsNodes.get(1)!.values()]
  assert.equal(graph.strength(two, four), 'strong')
  assert.equal(graph.conflicts(two, four), false)
  assert.equal(validChainNode(three), true)
  const [loop] = analyzeChains(graph, pathEdges(two, three, four, two))
  assert.equal(loop.title, 'Non-alternating loop')
  assert.deepEqual(loop.actions, [])
})

test('joining chains keeps the earlier number and Undo can restore both sketches after reload', () => {
  const first = { ...newChainSketch(1), history: [[], pathEdges(id(0), id(9))] }
  const second = { ...newChainSketch(2), history: [[], pathEdges(id(2, 3), id(2, 4))] }
  const third = { ...newChainSketch(3), history: [[], pathEdges(id(18), id(19))] }
  const state = { sketches: [first, second, third], activeId: 3, pending: id(18) }
  const joined = updateChainEdges(state, [...third.history[1], [id(18), id(9)]], id(9), 1)
  assert.equal(joined.activeId, 1)
  assert.deepEqual(joined.sketches.map(sketch => sketch.id), [1, 2])
  assert.equal(joined.sketches[0].color, first.color)
  assert.equal(joined.sketches[0].history.at(-1)?.length, 3)
  assert.equal(nextChainId(joined.sketches), 4)

  const game = { ...makeGame('chain-merge', 'Chain merge', EMPTY, 'imported'), chainSketch: joined }
  const restored = readGame(game.id, JSON.stringify(game))!.chainSketch!
  assert.deepEqual(restored, joined)
  const undone = undoChainEdit(restored)
  assert.deepEqual(undone.sketches[0].history, first.history)
  assert.deepEqual(undone.sketches.slice(1), [second, third])
  const resumed = undoChainEdit(restored, true)
  assert.equal(resumed.activeId, third.id)
  assert.equal(resumed.pending, id(18))
})

test('a disconnected link starts a separate sketch and Undo preserves the first chain', () => {
  const firstLink = pathEdges(id(0), id(1))[0]
  const independentLink = pathEdges(id(18, 3), id(18, 4))[0]
  const first = { ...newChainSketch(1), history: [[], [firstLink]] }
  const state = { sketches: [first], activeId: first.id, pending: independentLink[0] }
  const second = updateChainEdges(state, [firstLink, independentLink], independentLink[1], 4)
  assert.equal(second.activeId, 2)
  assert.equal(second.sketches[0], first)
  assert.deepEqual(second.sketches[1].history, [[], [independentLink]])
  assert.deepEqual([second.sketches[1].color, second.sketches[1].secondColor], CHAIN_COLOR_PAIRS[1])

  const undone = undoChainEdit(second, true)
  assert.equal(undone.sketches[0], first)
  assert.deepEqual(undone.sketches[1].history, [[]])
  assert.equal(undone.pending, independentLink[0])

  const extension = pathEdges(firstLink[1], id(10))[0]
  const extended = updateChainEdges({ ...second, pending: firstLink[1] }, [independentLink, extension], extension[1], 1)
  assert.equal(extended.activeId, first.id)
  assert.deepEqual(extended.sketches[0].history.at(-1), [firstLink, extension])
  assert.equal(extended.sketches[1], second.sketches[1])
})

test('Undo restores the selected branch endpoint for the next link', () => {
  const head = id(1, 2), tip = id(2, 3)
  const links = pathEdges(id(0), head, id(1, 4))
  const sketch = { ...newChainSketch(1), history: [[], links] }
  const edit = updateChainEdges({ sketches: [sketch], activeId: 1, pending: head }, [...links, [head, tip]], tip, 3)
  const undone = undoChainEdit(edit, true)
  assert.equal(undone.pending, head)
  assert.equal(undone.sketches[0].highlightedDigit, 2)
  assert.deepEqual(undone.sketches[0].history.at(-1), links)

  const { undoSelections: _, ...olderSketch } = edit.sketches[0]
  assert.equal(undoChainEdit({ ...edit, sketches: [olderSketch] }, true).pending, head)
  assert.equal(undoChainEdit(edit).pending, null)
})

test('applying chain deductions removes their sketches and records one puzzle undo step', () => {
  const first = { ...newChainSketch(1), history: [[], pathEdges(id(0, 1), id(0, 2))] }
  const second = { ...newChainSketch(2), history: [[], pathEdges(id(1, 3), id(1, 4))] }
  const chainSketch = { sketches: [first, second], activeId: 1, pending: id(0, 2) }
  const game = { ...makeGame('chain-apply', 'Chain apply', EMPTY, 'imported'), chainSketch }
  const candidates = Array<number>(81).fill(511)
  const applied = applyChainDeduction(game, [1], [{ eliminate: { cell: 0, digit: 2 } }, { place: { cell: 8, digit: 5 } }],
    candidates, true)
  assert.equal(applied.past.length, 1)
  assert.equal(applied.position.eliminations?.[0], 2)
  assert.equal(applied.position.entries[8], '5')
  assert.deepEqual(applied.chainSketch, { sketches: [second], activeId: 2, pending: null })
  const saved = readGame(game.id, JSON.stringify(applied))!
  const restored = pruneChainsAfterMove(saved, undo(saved))
  assert.deepEqual(restored.position, game.position)
  assert.deepEqual(restored.chainSketch, chainSketch)
  const redone = redo(readGame(game.id, JSON.stringify(restored))!)
  assert.deepEqual(redone.position, applied.position)
  assert.deepEqual(redone.chainSketch, applied.chainSketch)

  const empty = applyChainDeduction(game, [1, 2], [{ eliminate: { cell: 0, digit: 2 } }], candidates, true)
  assert.equal(empty.chainSketch, undefined)
  assert.deepEqual(pruneChainsAfterMove(empty, undo(empty)).chainSketch, chainSketch)
  assert.equal(redo(undo(empty)).chainSketch, undefined)
  assert.equal(applyChainDeduction(game, [1], [{ eliminate: { cell: 0, digit: 2 } }, { place: { cell: 0, digit: 2 } }],
    candidates, true), game)
})

test('placing a digit saves affected chains for puzzle Undo and Redo', () => {
  const first = { ...newChainSketch(1), history: [[], pathEdges(id(0), id(1))] }
  const second = { ...newChainSketch(2), history: [[], pathEdges(id(30, 3), id(31, 3))] }
  const chainSketch = { sketches: [first, second], activeId: first.id, pending: null }
  const game = { ...makeGame('chain-placement', 'Chain placement', EMPTY, 'imported'), chainSketch }
  const placed = pruneChainsAfterMove(game, enter(game, [0], 'value', 1))
  assert.deepEqual(placed.chainSketch, { sketches: [second], activeId: second.id, pending: null })

  const saved = readGame(game.id, JSON.stringify(placed))!
  const restored = pruneChainsAfterMove(saved, undo(saved))
  assert.equal(restored.position.entries[0], '0')
  assert.deepEqual(restored.chainSketch, chainSketch)
  const redone = pruneChainsAfterMove(restored, redo(restored))
  assert.equal(redone.position.entries[0], '1')
  assert.deepEqual(redone.chainSketch, placed.chainSketch)
})

test('a chain stays until its last elimination and is restored with puzzle Undo', () => {
  const chain = { ...newChainSketch(1), history: [[], pathEdges(id(0), id(36), id(40), id(4))] }
  const other = { ...newChainSketch(2), history: [[], pathEdges(id(60, 2), id(60, 4))] }
  const masks = Array<number>(81).fill(0)
  for (const cell of [0, 4, 7, 8, 36, 40]) masks[cell] = 1
  masks[60] = 10
  const chainSketch = { sketches: [chain, other], activeId: 1, pending: null }
  const game = { ...replaceCandidates(makeGame('last-removal', 'X-chain', EMPTY, 'imported'), masks, { recordHistory: false }), chainSketch }
  const candidateMasks = (current: Game) => current.position.corner
  const partial = pruneChainsAfterMove(game, enter(game, [7], 'candidate', 1), candidateMasks)
  assert.equal(partial.chainSketch, chainSketch)
  const done = pruneChainsAfterMove(partial, enter(partial, [8], 'candidate', 1), candidateMasks)
  assert.deepEqual(done.chainSketch, { sketches: [other], activeId: 2, pending: null })
  const restored = pruneChainsAfterMove(done, undo(done), candidateMasks)
  assert.deepEqual(restored.position, partial.position)
  assert.equal(restored.chainSketch, chainSketch)
  assert.deepEqual(pruneChainsAfterMove(restored, redo(restored), candidateMasks).chainSketch, done.chainSketch)

  const batch = applyDeduction(game, [7, 8].map(cell => ({ eliminate: { cell, digit: 1 } })), masks)
  assert.deepEqual(pruneChainsAfterMove(game, batch, candidateMasks).chainSketch, done.chainSketch)

  const paint = (current: Game, cells: number[]) => pruneChainsAfterMove(current,
    paintCandidateStroke(current, game, cells, 'candidate', 1, 'remove'), candidateMasks)
  const first = paint(game, [7])
  const finished = paint(first, [7, 8])
  const extended = paint(finished, [7, 8, 40])
  assert.deepEqual(finished.chainSketch, done.chainSketch)
  assert.equal(extended.past.length, 1)
  assert.equal(undo(extended).chainSketch, chainSketch)
  assert.deepEqual(undo(extended).position, game.position)
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

test('a third weak link is rejected at an endpoint or between two paths', () => {
  const links = graph({ 0: [1, 2, 3, 4], 9: [4] })
  const [a, b, c, d, end] = links.candidates
  assert.equal(weakLinkRun(links, [[a, b]])([b, c]), false)
  assert.equal(weakLinkRun(links, [[a, b], [b, c]])([c, d]), true)
  assert.equal(weakLinkRun(links, [[a, b], [b, c]])([c, a]), true)
  assert.equal(weakLinkRun(links, [[a, b], [c, d]])([b, c]), true)
  assert.equal(weakLinkRun(links, [[a, b], [b, d]])([d, end]), false)
})

test('disconnected groups cycle through five pairs and account for pairs already in use', () => {
  const [first, second, third, fourth, fifth] = CHAIN_COLOR_PAIRS
  const nextPair = cycleChainPairs(CHAIN_COLOR_PAIRS, [first])
  assert.deepEqual(Array.from({ length: 6 }, () => nextPair()), [second, third, fourth, fifth, first, second])
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => newChainSketch(index + 1).color),
    [first, second, third, fourth, fifth, first].map(pair => pair[0]))
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
  const coloring = colorStrongLinks(links, sketch)
  assert.equal(coloring.length, 2)
  assert.ok(coloring.some(({ nodes }) => nodes.includes(id(23, 4)) && !nodes.includes(id(50, 4))))
  const aic = analyzeChainPaths(links, sketch).find(proof => proof.title === 'Alternating inference chain (Type 2)')
  assert.deepEqual(aic?.strengths, ['strong', 'weak', 'strong'])
  assert.deepEqual(aic?.actions, [{ eliminate: { cell: 23, digit: 4 } }])
  const medusa = analyzeMedusa(links, sketch).find(proof => proof.nodes.length === 4)
  assert.deepEqual(medusa?.actions, [
    { eliminate: { cell: 5, digit: 4 } }, { eliminate: { cell: 23, digit: 4 } }, { eliminate: { cell: 32, digit: 7 } },
  ])
  assert.ok(!medusa?.nodes.includes(id(23, 4)), 'The weak link does not join the Medusa component')
})

test('an AIC deduction still applies after extending the path with a weak link', () => {
  const { givens } = STARTER_GAME
  const links = makeChainGraph(variantHouseMasks({ version: 1, givens }, givens))
  const sketch = pathEdges(id(10, 7), id(11, 7), id(17, 7), id(26, 7), id(24, 7))
  assert.ok(analyzeChainPaths(links, sketch).some(proof =>
    proof.actions.some(action => 'eliminate' in action && action.eliminate.cell === 15 && action.eliminate.digit === 7)))
})

test('two weak links between strong branches leave their shared candidate uncolored', () => {
  const links = graph({ 0: [1, 2], 1: [1, 3, 4], 2: [1], 10: [1, 5], 19: [1] })
  const path = pathEdges(id(0, 2), id(0), id(1), id(10), id(10, 5))
  assert.deepEqual(path.map(edge => links.strength(...edge)), ['strong', 'weak', 'weak', 'strong'])
  const coloring = colorStrongLinks(links, path)
  assert.deepEqual(coloring.map(({ sides }) => [...sides]), [
    [[id(0, 2), 0], [id(0), 1]],
    [[id(10), 0], [id(10, 5), 1]],
  ])
})

test('an odd loop keeps its deduction when two weak links leave a candidate uncolored', () => {
  const links = graph({ 0: [1], 1: [1], 8: [1] })
  const edges = pathEdges(id(0), id(8), id(1), id(0))
  assert.deepEqual(colorStrongLinks(links, edges).map(({ nodes }) => new Set(nodes)), [new Set([id(0), id(1)])])
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
  assert.equal(medusa.contradictionCell, 9)
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

test('strong link overlay includes every visible strong link once', () => {
  const example = graph({ 0: [2, 7], 1: [2, 4, 8], 4: [7, 8, 9], 13: [7, 8, 9] })
  assert.deepEqual(highlightedStrongLinks(example, 0), [])
  assert.deepEqual(highlightedStrongLinks(example, 1 << 1), [[id(0, 2), id(1, 2)]])
  assert.deepEqual(highlightedStrongLinks(example, (1 << 1) | (1 << 6)), [
    [id(0, 2), id(1, 2)], [id(0, 7), id(4, 7)], [id(4, 7), id(13, 7)], [id(0, 2), id(0, 7)],
  ])
})


test('group IDs preserve exact members and reject malformed saved groups', () => {
  const group = chainGroup(4, [8, 0, 3])!
  assert.equal(group, 'g:4:0,3,8')
  assert.deepEqual(chainPoint(group), { digit: 4, cells: [0, 3, 8] })
  assert.deepEqual(chainNodeCandidates(group), [{ cell: 0, digit: 4 }, { cell: 3, digit: 4 }, { cell: 8, digit: 4 }])
  assert.equal(chainGroup(4, [0, 0]), null)
  assert.equal(chainGroup(10, [0, 1]), null)
  assert.equal(chainGroup(4, [0, 81]), null)
  assert.equal(chainGroup(4, [0]), null)
  for (const malformed of ['g:4:0', 'g:4:3,0', 'g:4:0,0', 'g:4:0,81', 'g:0:0,1', 'g:4:00,1', 'g:4:0,1:2']) {
    assert.equal(validChainNode(malformed), false, malformed)
  }
  assert.equal(validChainNode(group), true)
})

test('group links require all members to conflict and a strong link covers the complete house', () => {
  const links = graph({ 0: [1], 1: [1], 2: [1], 3: [1], 9: [1], 36: [1] })
  const left = chainGroup(1, [0, 1])!
  const right = chainGroup(1, [2, 3])!
  assert.equal(links.strength(left, right), 'strong')
  assert.equal(links.strength(left, id(2)), 'weak')
  assert.equal(links.strength(left, id(36)), undefined, 'R5C1 sees only one group member')
  assert.equal(links.strength(left, chainGroup(1, [1, 2])!), undefined, 'overlapping groups cannot conflict')
  assert.equal(links.strength(left, chainGroup(1, [2, 8])!), undefined, 'missing candidates cannot form a group')
  assert.equal(links.available(chainGroup(1, [0, 36])!), true)
  assert.equal(links.available(chainGroup(1, [1, 36])!), false, 'a group must share one house')
  const incomplete = graph({ 0: [1], 1: [1], 2: [1], 3: [1], 4: [1] })
  assert.equal(incomplete.strength(left, right), 'weak', 'an omitted candidate prevents a strong link')
})

test('group availability uses the actual jigsaw and extra houses', () => {
  const masks = Array.from({ length: 81 }, () => 1)
  const regions = Array.from({ length: 9 }, (_, region) => Array.from({ length: 9 }, (_, offset) => region + 9 * offset))
  const jigsaw = makeChainGraph(masks, { version: 1, givens: EMPTY, regions: { type: 'jigsaw', regions } })
  assert.equal(jigsaw.available(chainGroup(1, [0, 10])!), false, 'a standard box does not exist in this jigsaw')
  const extra = makeChainGraph(masks, { version: 1, givens: EMPTY, rules: [{ type: 'extra-house', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80] }] })
  assert.equal(extra.available(chainGroup(1, [0, 40])!), true)
  assert.equal(extra.strength(chainGroup(1, [0, 40])!, id(80)), 'weak')
})

test('a grouped AIC removes only candidates that see every member of both ends', () => {
  const links = graph({ 0: [1], 1: [1], 4: [1], 9: [1], 36: [1], 40: [1] })
  const group = chainGroup(1, [0, 1])!
  const [proof] = analyzeChains(links, pathEdges(group, id(4), id(40), id(36)))
  assert.equal(proof.title, 'Grouped alternating inference chain')
  assert.deepEqual(proof.strengths, ['strong', 'weak', 'strong'])
  assert.deepEqual(proof.actions, [{ eliminate: { cell: 9, digit: 1 } }])
  assert.match(proof.explanation!, /every candidate/)

  // Enumerate the three required house facts directly, independently of graph links.
  let assignments = 0
  for (let bits = 0; bits < 64; bits++) {
    const [a, b, c, target, d, e] = Array.from({ length: 6 }, (_, i) => (bits >> i) & 1)
    if (a + b + c !== 1 || d + e !== 1 || c + e > 1 || target + a > 1 || target + b > 1 || target + d > 1) continue
    assignments++
    assert.equal(target, 0)
  }
  assert.ok(assignments > 0)
})

test('a grouped loop never places one arbitrary group member', () => {
  const links = graph({ 0: [1], 1: [1], 4: [1], 9: [1], 36: [1], 40: [1] })
  const group = chainGroup(1, [0, 1])!
  const [proof] = analyzeChains(links, pathEdges(group, id(4), id(40), id(36), id(9), group))
  assert.equal(proof.loop, 'discontinuous')
  assert.ok(proof.actions.every(action => !('place' in action)), 'a true group does not identify one true member')
  assert.deepEqual(proof.actions, [{ eliminate: { cell: 4, digit: 1 } }, { eliminate: { cell: 9, digit: 1 } }])
})

test('grouped sketches survive save, Undo and puzzle Undo without changing their members', () => {
  const group = chainGroup(1, [0, 1])!
  const first = { ...newChainSketch(1), history: [[], pathEdges(group, id(4))] }
  const second = { ...newChainSketch(2), history: [[], pathEdges(id(30, 2), id(31, 2))] }
  const state: ChainSketchState = { sketches: [first, second], activeId: 1, pending: group }
  const extended = updateChainEdges(state, [...first.history[1], [group, id(9)]], id(9), 1)
  const game = { ...replaceCandidates(makeGame('grouped-save', 'Grouped chain', EMPTY, 'imported'),
    Array.from({ length: 81 }, () => 511)), chainSketch: extended }
  const restored = readGame(game.id, JSON.stringify(game))!
  assert.deepEqual(restored.chainSketch, extended)
  assert.equal(undoChainEdit(restored.chainSketch!, true).pending, group)
  const removed = pruneChainsAfterMove(game, enter(game, [1], 'candidate', 1))
  assert.deepEqual(removed.chainSketch?.sketches.map(sketch => sketch.id), [2])
  assert.deepEqual(undo(removed).chainSketch, extended)
  const corrupt = structuredClone(state)
  corrupt.pending = 'g:1:1,0'
  assert.equal(validChainSketchState(corrupt), false)
})


test('automatic extensions can use known groups without generating arbitrary groups', () => {
  const group = chainGroup(1, [0, 1])!
  const simple = graph({ 0: [1], 1: [1], 4: [1] })
  assert.deepEqual(completeMedusa(simple, [], id(4)), [])
  assert.deepEqual(completeMedusa(simple, [], id(4), [group]), [[id(4), group]])

  const links = graph({ 0: [1], 1: [1], 4: [1], 9: [1], 36: [1], 40: [1] })
  const path = [id(4), id(40), id(36), id(9)]
  const excluded = new Set<ChainNode>([id(0), id(1)])
  assert.deepEqual(completeChainLoop(links, path, excluded), { status: 'exhausted' })
  assert.deepEqual(completeChainLoop(links, path, excluded, [group]), {
    status: 'found', edges: [[id(9), group], [group, id(4)]],
  })
  assert.deepEqual(completeChainLoop(links, path, new Set([...excluded, group]), [group]), { status: 'exhausted' })
})
