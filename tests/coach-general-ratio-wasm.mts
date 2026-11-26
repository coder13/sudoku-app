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

test('synthetic Coach Ratio 3 keeps its marked relation and negative constraint in Play and engine analysis', async () => {
  const { game } = await prepareImportedPuzzle(coachCode({
    givenConstraints: [
      { type: 'ratio', segments: [
        { cells: [0, 1], parameters: { ratio: 3 } },
        { cells: [1, 2], parameters: { ratio: 2 } },
      ], settings: { negativeConstraint: true } },
      { type: 'diagonalPositive', segments: [] },
    ],
  }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: [
      { cells: [0, 1], value: 3 }, { cells: [1, 2], value: 2 },
    ], negative: true },
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
  assert.equal(candidates[9] & (1 << 1), 0, 'unmarked orthogonal neighbors cannot form a 1:2 ratio')

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
