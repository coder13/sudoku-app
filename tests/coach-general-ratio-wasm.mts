import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enter, redo, undo } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('negative Coach Ratio 3 checks its own marker values on classic Sudoku', async () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const digits = [...solution].map(Number)
  const ratioThreePairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0 && Math.max(digits[cell], digits[next]) === 3 * Math.min(digits[cell], digits[next])) {
        ratioThreePairs.push([cell, next])
      }
    }
  }
  assert.ok(ratioThreePairs.length > 0)
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: false }, segments: [
      { cells: [0, 1], parameters: { ratio: 2 } },
    ] },
    { type: 'ratio', settings: { negativeConstraint: true }, segments: ratioThreePairs.map(cells => ({
      cells, parameters: { ratio: 3 },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 2 }] },
    { type: 'labeled-dots', relation: 'ratio', marks: ratioThreePairs.map(cells => ({ cells, value: 3 })), negative: true },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('negative Coach Ratio markers join same-value clues split across classic layers', async () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const digits = [...solution].map(Number)
  const ratioThreePairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0 && Math.max(digits[cell], digits[next]) === 3 * Math.min(digits[cell], digits[next])) {
        ratioThreePairs.push([cell, next])
      }
    }
  }
  assert.ok(ratioThreePairs.length > 1)
  const [negativeLayerMarks, positiveLayerMarks] = [ratioThreePairs.slice(0, -1), ratioThreePairs.slice(-1)]
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: negativeLayerMarks.map(cells => ({
      cells, parameters: { ratio: 3 },
    })) },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: positiveLayerMarks.map(cells => ({
      cells, parameters: { ratio: 3 },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: negativeLayerMarks.map(cells => ({ cells, value: 3 })), negative: true },
    { type: 'labeled-dots', relation: 'ratio', marks: positiveLayerMarks.map(cells => ({ cells, value: 3 })) },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('negative Coach Difference 2 checks its own marker values on classic Sudoku', async () => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const digits = [...solution].map(Number)
  const orthogonalPairs: [number, number][] = []
  const differenceTwoPairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0) {
        orthogonalPairs.push([cell, next])
        if (Math.abs(digits[cell] - digits[next]) === 2) differenceTwoPairs.push([cell, next])
      }
    }
  }
  const differenceOnePair = orthogonalPairs.find(([a, b]) => Math.abs(digits[a] - digits[b]) === 1)
  assert.ok(differenceOnePair)
  assert.ok(differenceTwoPairs.length > 0)
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: differenceOnePair, parameters: { difference: 1 } },
    ] },
    { type: 'difference', settings: { negativeConstraint: true }, segments: differenceTwoPairs.map(cells => ({
      cells, parameters: { difference: 2 },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: differenceOnePair, value: 1 }] },
    { type: 'labeled-dots', relation: 'difference', marks: differenceTwoPairs.map(cells => ({ cells, value: 2 })), negative: true },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('synthetic Coach Ratio 3 keeps its marked relation in Play and engine analysis', async () => {
  const { game } = await prepareImportedPuzzle(coachCode({
    givenConstraints: [
      { type: 'ratio', segments: [
        { cells: [0, 1], parameters: { ratio: 3 } },
        { cells: [1, 2], parameters: { ratio: 2 } },
      ], settings: { negativeConstraint: false } },
      { type: 'diagonalPositive', segments: [] },
    ],
  }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: [
      { cells: [0, 1], value: 3 }, { cells: [1, 2], value: 2 },
    ] },
    { type: 'diagonal', diagonal: 'anti' },
  ])

  const opening = await playCandidates(game)
  assert.ok(opening)
  assert.ok(opening[0] & 1 << 0)
  assert.ok(opening[1] & 1 << 2)

  const afterOne = enter(game, [0], 'value', 1)
  const candidates = await playCandidates(afterOne)
  assert.ok(candidates)
  assert.deepEqual([...Array(9).keys()].filter(digit => candidates[1] & 1 << digit), [2])
  assert.deepEqual([...Array(9).keys()].filter(digit => candidates[2] & 1 << digit), [5],
    'a default 1:2 dot stays marked beside the custom 1:3 dot')
  assert.notEqual(candidates[9] & (1 << 1), 0, 'without negative markers, unmarked 1:2 edges remain allowed')

  const impossible = await runEngine({
    type: 'variant', operation: 'analyze',
    position: { ...variantPosition(game.variant!, afterOne.position), entries: '12' + '0'.repeat(79) },
  })
  assert.equal(impossible, 'conflict')
})

test('synthetic sized Coach Ratio 3 composes with a diagonal and constrains imported Play candidates', async () => {
  const { game } = await prepareImportedPuzzle(coachCode({
    gridSize: 6,
    givenDigits: '000000000000000000000000000030000400',
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)),
    givenConstraints: [
      { type: 'diagonalPositive', segments: [] },
      { type: 'thermometer', segments: [{ cells: [1, 7, 13, 14] }, { cells: [32, 26, 20] }] },
      { type: 'odd', segments: [{ cells: [24] }, { cells: [17] }] },
      { type: 'ratio', segments: [{ cells: [1, 2], parameters: { ratio: 3 } }] },
    ],
  }))

  assert.ok(game.sized)
  assert.equal(game.sized.solution, '413652625314234561156243542136361425')
  assert.deepEqual(game.sized.rules, [
    { type: 'diagonal', diagonal: 'anti' },
    { type: 'thermometer', cells: [1, 7, 13, 14] },
    { type: 'thermometer', cells: [32, 26, 20] },
    { type: 'parity', parity: 'odd', cells: [24, 17] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [1, 2], value: 3 }], negative: false },
  ])
  const afterOne = enter(game, [1], 'value', 1)
  const candidates = await playCandidates(afterOne)
  assert.ok(candidates)
  assert.deepEqual([...Array(6).keys()].filter(digit => candidates[2] & 1 << digit), [2])
  const restored = readGame(afterOne.id, JSON.stringify(afterOne))
  assert.ok(restored)
  assert.deepEqual(restored.sized, game.sized)
  assert.deepEqual(undo(restored).position, game.position)
  assert.deepEqual(redo(undo(restored)).position, afterOne.position)
})
