import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { coachCode } from './helpers/coach-code.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-distant-neighbors.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#434 imports the nine box identities and keeps the published completion', async () => {
  const imported = await detectPuzzle(source.code)
  const rules = imported.variant?.puzzle.rules
  assert.equal(imported.format, 'Sudoku Coach')
  assert.deepEqual(rules?.find(rule => rule.type === 'distant-neighbors'), {
    type: 'distant-neighbors', markedCells: [0, 4, 8, 36, 40, 44, 72, 76, 80],
  })
  assert.equal(rules?.filter(rule => rule.type === 'extra-house').length, 1)
  assert.equal(source.solution.length, 81)
})

test('#434 keeps its authored identity rule beside an appended Ratio companion', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const pair = Array.from({ length: 81 }, (_, cell) => cell).flatMap(cell => {
    const row = Math.floor(cell / 9), column = cell % 9
    return [row < 8 ? cell + 9 : -1, column < 8 ? cell + 1 : -1]
      .filter(other => other >= 0 && (Number(source.solution[cell]) === 2 * Number(source.solution[other]) ||
        Number(source.solution[other]) === 2 * Number(source.solution[cell])))
      .map(other => [cell, other] as [number, number])
  })[0]
  assert.ok(pair)
  const ratio = { type: 'ratio', segments: [{ cells: pair, parameters: {} }] }
  const imported = await detectPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  const rules = imported.variant?.puzzle.rules ?? []
  assert.ok(rules.some(rule => rule.type === 'distant-neighbors'))
  assert.ok(rules.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
})
