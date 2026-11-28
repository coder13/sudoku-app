import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readReviewedCoachTerrain } from '../src/sudoku/puzzle-import/coach-terrain.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-terrain.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
  payload: Record<string, unknown> & { gridSize: number; colours: string[]; givenColours: string; givenConstraints: unknown[] }
}

test('reviewed Coach Terrain parser preserves its transforms and maximum Sandwich totals', async () => {
  const terrain = await readReviewedCoachTerrain(source.payload)
  assert.ok(terrain)
  assert.deepEqual(terrain.valueChanges, [
    { color: 'yellow', operation: 'multiply', amount: 2 },
    { color: 'green', operation: 'add', amount: 3 },
    { color: 'purple', operation: 'add', amount: -3 },
  ])
  assert.equal(terrain.cellColors.length, 81)
  assert.equal(terrain.clues.length, 15)
  assert.deepEqual(terrain.clues.map(({ direction, index, maximum }) => [direction, index, maximum]), [
    ['east', 3, 35], ['east', 6, 49], ['east', 5, 1], ['east', 7, -1], ['east', 8, 9],
    ['south', 2, 26], ['east', 0, 0], ['south', 1, 10], ['south', 8, 0], ['east', 4, 6],
    ['south', 0, 23], ['east', 2, 19], ['south', 3, 35], ['south', 7, 24], ['south', 4, 23],
  ])

  const digitValues = [...source.source.solution].map(Number).map((digit, cell) => {
    switch (terrain.cellColors[cell]) {
      case 'yellow': return digit * 2
      case 'green': return digit + 3
      case 'purple': return digit - 3
      default: return digit
    }
  })
  for (const clue of terrain.clues) {
    const cells = Array.from({ length: 9 }, (_, offset) => clue.direction === 'south'
      ? offset * 9 + clue.index : clue.index * 9 + offset)
    const values = cells.map(cell => digitValues[cell])
    const possible = values.flatMap((first, start) => values.flatMap((last, end) =>
      first === 1 && last === 9 && start !== end
        ? [values.slice(Math.min(start, end) + 1, Math.max(start, end)).reduce((sum, value) => sum + value, 0)]
        : []))
    assert.ok(possible.length > 0, `${clue.direction}:${clue.index}`)
    assert.equal(Math.max(...possible), clue.maximum, `${clue.direction}:${clue.index}`)
  }

  const imported = await detectPuzzle(source.source.sudoku)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.variant?.id, 'mixed')
  const rules = imported.variant?.puzzle.rules ?? []
  assert.equal(rules.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.deepEqual(imported.givenCellColors, Object.fromEntries(terrain.cellColors.flatMap((color, cell) => color ? [[cell, [color]]] : [])))
})

test('Coach Terrain semantics are pinned to its reviewed value map and clues, independent of givens', async () => {
  assert.deepEqual(await readReviewedCoachTerrain({ ...source.payload, givenDigits: '1' + '0'.repeat(80) }),
    await readReviewedCoachTerrain(source.payload))
  assert.equal(await readReviewedCoachTerrain({ ...source.payload, colours: ['green', 'purple'] }), undefined)
  assert.equal(await readReviewedCoachTerrain({ ...source.payload, customRules: 'different semantics' }), undefined)
})

test('Coach Terrain imports preserve authored rules when the puzzle givens are edited', async () => {
  const givens = source.source.solution[0] + '0'.repeat(80)
  const code = coachCode({ ...source.payload, givenDigits: givens })
  const imported = await detectPuzzle(code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, givens)
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.deepEqual(imported.givenCellColors, await detectPuzzle(source.source.sudoku).then(result => result.givenCellColors))
})

test('Coach Terrain imports retain player progress added to the reviewed puzzle', async () => {
  const userDigits = [...source.source.solution].map((digit, cell) => cell === 0 ? digit : '0').join('')
  const code = coachCode({ ...source.payload, userDigits })
  const imported = await detectPuzzle(code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.progress?.entries[0], source.source.solution[0])
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.position.entries[0], source.source.solution[0])
  assert.equal(game.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
})

test('Coach Terrain keeps its reviewed rules when player Quick Draw annotations are present', async () => {
  const code = coachCode({ ...source.payload,
    quickDrawLineSegments: { '0/0=>1/1': { colour: 'blue' } },
    quickDrawSymbols: { '1/0.5': { shape: 'cross', colour: 'red' } },
    cells: { 0: { quickSymbol: { shape: 'circle', colour: 'green' } } },
  })
  const imported = await detectPuzzle(code)
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.deepEqual(imported.progress?.importedDrawings, [
    { shape: 'line', from: [0, 0], to: [1, 1], color: 'blue' },
    { shape: 'cross', at: [1, .5], color: 'red' },
    { shape: 'circle', at: [.5, .5], color: 'green' },
  ])
  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.deepEqual(game.position.importedDrawings, imported.progress?.importedDrawings)
})

test('reviewed Coach Terrain composes with additional supported rules without dropping either family', async () => {
  const ratio = { type: 'ratio', segments: [{ cells: [6, 15], parameters: {} }] }
  const code = coachCode({ ...source.payload, givenConstraints: [...source.payload.givenConstraints, ratio] })
  const imported = await detectPuzzle(code)
  const rules = imported.variant?.puzzle.rules ?? []
  assert.equal(rules.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.ok(rules.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.some(([a, b]) => a === 6 && b === 15)))
  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.variant?.solution, source.source.solution)
  assert.equal(game.variant?.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.ok(game.variant?.puzzle.rules?.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.some(([a, b]) => a === 6 && b === 15)))

  const unsupported = coachCode({ ...source.payload, givenConstraints: [...source.payload.givenConstraints,
    { type: 'futureRule', segments: [] }] })
  await assert.rejects(detectPuzzle(unsupported), /unsupported rule type/)
})
