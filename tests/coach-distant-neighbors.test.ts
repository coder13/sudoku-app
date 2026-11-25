import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

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
