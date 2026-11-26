import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLASSIC_GRID } from '../src/sudoku/grid.ts'
import { makeGame, restartGame } from '../src/sudoku/game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { analyzeSubsetProof, analyzeVisibleSubsets, restrictedSubsetDigits, subsetEndpointChoices } from '../src/sudoku/subset-proofs.ts'
import { candidateId, makeChainGraph } from '../src/sudoku/chains.ts'
import { currentSubsetProof, initialChainSketch, undoChainEdit, updateChainEdges, updateSubsetChain, validChainSketchState } from '../src/sudoku/chain-sketch.ts'
import {
  deleteSubset, describeSubsets, eligibleSubsetCells, EMPTY_SUBSET_WORKSPACE,
  readSubsetWorkspace, saveSubset, subsetMembershipProblem, type SubsetContext,
} from '../src/sudoku/subsets.ts'

function context(entries: Record<number, number[]>, puzzle?: SubsetContext['puzzle']): SubsetContext {
  const values = '0'.repeat(81)
  const masks = Array.from({ length: 81 }, (_, cell) =>
    (entries[cell] ?? []).reduce((mask, digit) => mask | 1 << (digit - 1), 0))
  return { values, masks, grid: CLASSIC_GRID, puzzle }
}

function sets(members: readonly (readonly number[])[], board: SubsetContext) {
  return describeSubsets(members.map((cells, index) => ({ cells, id: index + 1 })), board)
}

test('subset mode offers only cells that see every member', () => {
  const board = { ...context({}), visibleCells: new Set([0, 1, 2, 3, 9, 10, 11, 23]) }
  assert.deepEqual([...eligibleSubsetCells([0, 10], board)], [1, 2, 9, 11])
  assert.deepEqual(subsetMembershipProblem([0, 3, 10], board), { type: 'not-peers', cells: [3, 10] })
  assert.deepEqual(subsetMembershipProblem([0, 12], board), { type: 'unavailable', cell: 12 })
  assert.equal(saveSubset(EMPTY_SUBSET_WORKSPACE, [0, 3, 10], board), EMPTY_SUBSET_WORKSPACE)
})

test('classification follows candidates and distinguishes a generalized peer set', () => {
  const board = context({ 0: [1, 2], 1: [1, 2], 2: [1, 2, 3], 3: [2, 3], 10: [1, 4], 11: [3, 4] }, {
    version: 1, givens: '0'.repeat(81), rules: [{ type: 'anti-knight' }],
  })
  const result = sets([[0, 1], [0, 2], [0, 11], [0, 3, 10], [0, 1, 9]], board)
  assert.deepEqual(result.map(set => [set.kind, set.extra]), [
    ['locked', 0], ['als', 1], ['surplus', 2], ['peer', 1], ['invalid', -1],
  ])
  assert.deepEqual(result[0].houses.map(house => house.label), ['row 1', 'box 1'])
  assert.deepEqual(result[3].houses, [])
  assert.equal(sets([[0, 1]], { ...board, masks: null })[0].kind, 'unclassified')
})

test('ALS-XZ eliminates only a candidate that sees every relevant occurrence', () => {
  const board = context({ 3: [2, 9], 22: [4, 7, 9], 24: [2, 4, 7], 25: [2, 7], 8: [2, 6], 17: [2, 3] })
  const saved = sets([[3], [22, 24, 25]], board)
  assert.deepEqual(restrictedSubsetDigits(saved[0], saved[1], board), [9])
  const proof = { kind: 'path', sets: [1, 2], links: [9] } as const
  const analysis = analyzeSubsetProof(proof, saved, board)
  assert.equal(analysis.technique, 'als-xz')
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 8, digit: 2 } }])
  const changed = context({ 3: [2, 9], 22: [4, 7, 9], 24: [2, 4, 7, 9], 25: [2, 7], 8: [2, 6] })
  assert.equal(analyzeSubsetProof(proof, sets([[3], [22, 24, 25]], changed), changed).technique, undefined)
})

test('a shared candidate occurrence cannot form an RCC', () => {
  const board = context({ 0: [1, 2], 1: [1, 3], 2: [2, 3], 3: [2, 8] })
  const saved = sets([[0, 1], [1, 2]], board)
  assert.deepEqual(restrictedSubsetDigits(saved[0], saved[1], board), [2])
  assert.equal(analyzeSubsetProof({ kind: 'path', sets: [1, 2], links: [1] }, saved, board).problem, 'invalid-link')
})

test('the visible subset deduction uses a locked set without requiring a chain', () => {
  const board = context({ 0: [1, 2], 1: [1, 2], 2: [1, 2, 3], 30: [1, 2, 5] })
  const result = analyzeVisibleSubsets(sets([[0, 1]], board), board)
  assert.deepEqual(result.actions, [
    { eliminate: { cell: 2, digit: 1 } },
    { eliminate: { cell: 2, digit: 2 } },
  ])
  assert.equal(result.proofs.length, 0)
})

test('XYZ-Wing needs the pivot to see both wings and the removal to see all three', () => {
  const entries = { 0: [1, 2, 3], 1: [3, 4], 3: [1, 3], 9: [2, 3], 12: [3, 4] }
  const board = context(entries)
  const selected = [[0, 3], [9]]
  const proof = { kind: 'pattern', sets: [1, 2] } as const
  const analysis = analyzeSubsetProof(proof, sets(selected, board), board)
  assert.equal(analysis.technique, 'xyz-wing')
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 1, digit: 3 } }])
  const changed = context({ ...entries, 0: [1, 2, 3, 4] })
  assert.equal(analyzeSubsetProof(proof, sets(selected, changed), changed).technique, undefined)
})

test('WXYZ-Wing supports one unrestricted digit or four restricted digits', () => {
  const entries = { 0: [1, 2, 3, 4], 1: [4, 5], 2: [4, 5], 4: [2, 4], 6: [3, 4], 10: [1, 4] }
  const board = context(entries)
  const selected = [[0, 4, 6], [10]]
  const proof = { kind: 'pattern', sets: [1, 2] } as const
  const analysis = analyzeSubsetProof(proof, sets(selected, board), board)
  assert.equal(analysis.technique, 'wxyz-wing')
  assert.deepEqual(analysis.actions, [
    { eliminate: { cell: 1, digit: 4 } },
    { eliminate: { cell: 2, digit: 4 } },
  ])
  const secondUnrestricted = context({ ...entries, 4: [1, 2, 4] })
  assert.equal(analyzeSubsetProof(proof, sets(selected, secondUnrestricted), secondUnrestricted).technique, undefined)

  const allRestricted = context({ 0: [1, 2], 1: [1, 5], 3: [1, 3], 27: [2, 4], 29: [4, 5], 30: [3, 4] })
  const restricted = analyzeSubsetProof(proof, sets([[0, 3], [27, 30]], allRestricted), allRestricted)
  assert.equal(restricted.technique, 'wxyz-wing')
  assert.deepEqual(restricted.actions, [{ eliminate: { cell: 1, digit: 1 } }, { eliminate: { cell: 29, digit: 4 } }])
})

test('Sue de Coq exhausts the intersection surplus with disjoint demands', () => {
  const entries = {
    0: [1, 2, 3, 4], 1: [1, 2, 3, 4], 3: [1, 5], 4: [2, 5], 9: [3, 5], 10: [4, 5],
    6: [1, 5, 6], 18: [3, 5, 6],
  }
  const board = context(entries)
  const selected = [[0, 1], [3, 4], [9, 10]]
  const proof = { kind: 'pattern', sets: [1, 2, 3] } as const
  const saved = sets(selected, board)
  assert.equal(saved[0].kind, 'surplus')
  const analysis = analyzeSubsetProof(proof, saved, board)
  assert.equal(analysis.technique, 'sue-de-coq')
  assert.deepEqual(analysis.actions, [
    { eliminate: { cell: 6, digit: 1 } }, { eliminate: { cell: 6, digit: 5 } },
    { eliminate: { cell: 18, digit: 3 } }, { eliminate: { cell: 18, digit: 5 } },
  ])
  const changed = context({ ...entries, 9: [1, 3, 5] })
  assert.equal(analyzeSubsetProof(proof, sets(selected, changed), changed).technique, undefined)
  assert.ok(analyzeVisibleSubsets(saved, board).proofs.some(({ analysis }) => analysis.technique === 'sue-de-coq'))
})

test('a set chain needs different RCCs through each internal ALS', () => {
  const board = context({ 0: [1, 4], 1: [1, 2], 2: [2, 3], 3: [3, 4], 4: [4, 8] })
  const saved = sets([[0], [1], [2], [3]], board)
  const proof = { kind: 'path', sets: [1, 2, 3, 4], links: [1, 2, 3] } as const
  assert.deepEqual(analyzeSubsetProof(proof, saved, board).actions, [{ eliminate: { cell: 4, digit: 4 } }])
  assert.equal(analyzeSubsetProof(proof, saved, board).technique, 'als-chain')
  const noTarget = context({ 0: [1, 4], 1: [1, 2], 2: [2, 3], 3: [3, 4] })
  const withoutEliminations = analyzeSubsetProof(proof, saved, noTarget)
  assert.equal(withoutEliminations.technique, 'als-chain')
  assert.deepEqual(withoutEliminations.actions, [])
  const repeated = context({ 0: [1, 4], 1: [1, 2], 2: [1, 4], 3: [4, 8] })
  assert.equal(analyzeSubsetProof({ kind: 'path', sets: [1, 2, 3], links: [1, 1] },
    sets([[0], [1], [2]], repeated), repeated).problem, 'repeated-rcc')
  assert.equal(analyzeSubsetProof({ kind: 'path', sets: [1, 3], links: [1] },
    sets([[0], [1], [2]], repeated), repeated).technique, undefined)
})

test('Death Blossom requires every stem branch and permits overlapping petals', () => {
  const board = context({ 0: [1, 2], 3: [1, 3], 4: [3, 4], 5: [2, 3], 7: [3, 4, 8], 39: [3, 4, 9] })
  const saved = sets([[3, 4], [4, 5]], board)
  const proof = { kind: 'blossom', stem: 0, petals: { 1: 1, 2: 2 } } as const
  const analysis = analyzeSubsetProof(proof, saved, board)
  assert.equal(analysis.technique, 'death-blossom')
  assert.deepEqual(analysis.actions, [{ eliminate: { cell: 7, digit: 3 } }, { eliminate: { cell: 7, digit: 4 } }])
  const missing = analyzeSubsetProof({ ...proof, petals: { 1: 1 } }, saved, board)
  assert.equal(missing.problem, 'missing-petal')
  assert.deepEqual(missing.actions, [])
})

test('stored proof nodes reference stable subset membership', () => {
  const board = context({})
  const first = saveSubset(EMPTY_SUBSET_WORKSPACE, [1, 0], board)
  const second = saveSubset(first, [3], board)
  const proof = { kind: 'path', sets: [1, 2], links: [1] } as const
  const edited = saveSubset({ ...second, proof }, [0, 2], board, 1)
  assert.deepEqual(edited.sets[0], { id: 1, cells: [0, 2] })
  assert.deepEqual(readSubsetWorkspace(JSON.parse(JSON.stringify(edited)), CLASSIC_GRID), edited)
  const game = { ...makeGame('subset-save', 'Subset save', board.values, 'imported'), subsetWorkspace: edited }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.subsetWorkspace, edited)
  assert.deepEqual(restartGame(game).subsetWorkspace, edited)
  assert.equal(deleteSubset(edited, 1).proof, undefined)
})

test('visible set numbering restarts while internal references stay unique', () => {
  const board = context({})
  const first = saveSubset(EMPTY_SUBSET_WORKSPACE, [0], board)
  const second = saveSubset(first, [1], board)
  const empty = deleteSubset(deleteSubset(second, 1), 2)
  const restored = readSubsetWorkspace(JSON.parse(JSON.stringify(empty)), CLASSIC_GRID)
  assert.deepEqual(restored, empty)
  const next = saveSubset(empty, [2], board)
  assert.deepEqual(describeSubsets(next.sets, board).map(set => [set.id, set.number]), [[3, 1]])
})

test('an ALS can replace the candidate end of a drawn chain and shares its undo history', () => {
  const entries = { 0: [3, 6, 8, 9], 3: [4, 6], 4: [1, 3, 4], 6: [3, 6, 7, 8, 9], 7: [3, 6, 9], 8: [3, 6, 7, 9], 22: [3, 4] }
  const board = context(entries)
  const saved = sets([[0, 3, 6, 7, 8]], board)
  const [first, middle, last] = [
    { cell: 22, digit: 3 }, { cell: 22, digit: 4 }, { cell: 3, digit: 4 },
  ].map(candidateId)
  const choices = subsetEndpointChoices([first, middle, last], saved, board, makeChainGraph(board.masks!))
  assert.equal(choices.length, 1)
  const { proof } = choices[0]
  assert.deepEqual(proof, { kind: 'endpoint', path: [first, middle], set: 1 })
  const result = analyzeSubsetProof(proof, saved, board)
  assert.equal(result.technique, 'als-xz')
  assert.deepEqual(result.actions, [{ eliminate: { cell: 4, digit: 3 } }])
  const changed = context({ ...entries, 0: [...entries[0], 4] })
  assert.deepEqual(analyzeSubsetProof(proof, sets([[0, 3, 6, 7, 8]], changed), changed).actions, [])

  const drawn = updateChainEdges(initialChainSketch, [[first, middle], [middle, last]], last, 4)
  const linked = updateSubsetChain(drawn, proof)
  assert.equal(validChainSketchState(JSON.parse(JSON.stringify(linked))), true)
  assert.deepEqual(currentSubsetProof(linked.sketches[0]), proof)
  const game = {
    ...makeGame('linked-subset', 'Linked subset', board.values, 'imported'),
    subsetWorkspace: { nextId: 2, sets: [{ id: 1, cells: [0, 3, 6, 7, 8] }] },
    chainSketch: linked,
  }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.chainSketch, linked)
  assert.deepEqual(undoChainEdit(linked, true), drawn)
})
