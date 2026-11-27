import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-9x9-separators.json', import.meta.url), 'utf8')) as {
  code: string; issue: number
}

test('#414 source fixture retains its boxless layout, empty cages, and corner separators', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  assert.equal(data.gridSize, 9)
  assert.deepEqual(data.regions, [])
  assert.equal(data.givenDigits, undefined)
  const layers = data.givenConstraints as { type: string; segments: { cells: unknown[]; parameters: Record<string, unknown> }[] }[]
  const cages = layers.filter(layer => layer.type === 'cage')
  assert.equal(cages.length, 2)
  assert.deepEqual(cages[0].segments.map(segment => segment.cells.length), [9, 9, 9])
  assert.ok(cages[0].segments.every(segment => Object.keys(segment.parameters).length === 0))
  const separators = layers.find(layer => layer.type === 'cosmeticLine')
  assert.equal(separators?.segments.length, 3)
  assert.deepEqual(separators?.segments.map(segment => segment.cells.length), [10, 10, 4])
})

test('#414 imports its Latin Square rules, distinct 3×3 groups, and authored dividers', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(imported.givens, '0'.repeat(81))
  assert.deepEqual(imported.variant.puzzle.regions, { type: 'partial', regions: [] })
  const rules = imported.variant.puzzle.rules ?? []
  assert.equal(rules.filter(rule => rule.type === 'anti-knight').length, 1)
  assert.equal(rules.filter(rule => rule.type === 'killer-cages').length, 1)
  const cages = rules.flatMap(rule => rule.type === 'killer-cages' ? rule.cages : [])
  assert.equal(cages.length, 4)
  assert.equal(rules.filter(rule => rule.type === 'extra-house' && rule.cells.length === 9).length, 3)
  assert.equal(rules.filter(rule => rule.type === 'kropki').length, 1)
  assert.equal(rules.filter(rule => rule.type === 'entropic').length, 2)
  assert.equal(rules.filter(rule => rule.type === 'whispers').length, 6)
  assert.equal(rules.filter(rule => rule.type === 'quadruple').length, 5)
  assert.deepEqual(imported.authoredArtwork, [
    { type: 'divider', points: Array.from({ length: 10 }, (_, i) => [i, 3]), thickness: .03 },
    { type: 'divider', points: Array.from({ length: 10 }, (_, i) => [3, i]), thickness: .03 },
    { type: 'divider', points: [[3, 6], [2, 6], [1, 6], [0, 6]], thickness: .03 },
  ])
})

test('#414 retains supported rules appended to its reviewed boxless combination', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const thermometer = { type: 'thermometer', segments: [{ cells: [0, 1, 2], parameters: {} }] }
  const imported = await detectPuzzle(coachCode({
    ...data, givenConstraints: [...data.givenConstraints, thermometer],
  }))
  const rules = imported.variant?.puzzle.rules ?? []
  assert.ok(rules.some(rule => rule.type === 'anti-knight'))
  assert.ok(rules.some(rule => rule.type === 'kropki'))
  assert.ok(rules.some(rule => rule.type === 'thermometer' &&
    rule.cells.length === 3 && rule.cells[0] === 0 && rule.cells[1] === 1 && rule.cells[2] === 2))
  assert.equal(imported.authoredArtwork?.length, 3)
})

test('#414 keeps its complete rule set and dividers after saving and reloading', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const restored = readGame(game.id, JSON.stringify(game))
  assert.ok(restored?.variant)
  assert.deepEqual(restored.variant.puzzle, game.variant?.puzzle)
  assert.deepEqual(restored.authoredArtwork, game.authoredArtwork)
})

test('#414 preserves player progress alongside the reviewed boxless rules', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const code = coachCode({ ...data, userDigits: `1${'0'.repeat(80)}` })
  const imported = await detectPuzzle(code)
  assert.equal(imported.progress?.entries[0], '1')
  assert.equal(imported.variant?.puzzle.rules?.some(rule => rule.type === 'anti-knight'), true)
  assert.equal(imported.authoredArtwork?.length, 3)
  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.position.entries[0], '1')
  assert.equal(game.variant?.puzzle.rules?.some(rule => rule.type === 'anti-knight'), true)
})
