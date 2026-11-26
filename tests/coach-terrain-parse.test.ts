import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readReviewedCoachTerrain } from '../src/sudoku/puzzle-import/coach-terrain.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sandwich-terrain-unsupported.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
  payload: { gridSize: number; colours: string[]; givenColours: string; givenConstraints: unknown[] }
}

test('reviewed Coach Terrain parser preserves its transforms and maximum Sandwich totals', async () => {
  const terrain = await readReviewedCoachTerrain(source.source.sudoku, source.payload)
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

  // Parsing the reviewed source must not silently import its typed empty layer
  // as an ordinary Sandwich puzzle before the engine supports Terrain values.
  await assert.rejects(detectPuzzle(source.source.sudoku), /transformed values.*engine does not support/i)
})

test('Coach Terrain semantics are restricted to the exact reviewed export', async () => {
  assert.equal(await readReviewedCoachTerrain(source.source.sudoku.replace(/0/, '1'), source.payload), undefined)
  assert.equal(await readReviewedCoachTerrain(source.source.sudoku, { ...source.payload, colours: ['green', 'purple'] }), undefined)
})
