import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuPadEnvelope } from '../src/sudoku/sized-sudoku-pad.ts'
import { verifySizedRulePuzzle } from '../src/sudoku/sized-rule-game.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

const { ambiguity } = JSON.parse(readFileSync(new URL('./fixtures/zipper-sudokupad.json', import.meta.url), 'utf8'))
useWasmWorker()

test('#470 imports and solves the authored one-to-one Zipper line assignments', async () => {
  const data = decodeSudokuPadEnvelope(ambiguity.code) as { metadata: { solution?: string }; [key: string]: unknown }
  delete data.metadata.solution
  const code = 'scl' + lzString.compressToBase64(JSON.stringify(data))
  const { grid, givens, sizedRules: rules } = await detectPuzzle(code)
  assert.ok(grid && rules)
  assert.equal(rules.filter(rule => rule.type === 'zipper').length, 3)
  assert.deepEqual(rules.at(-1), {
    type: 'line-assignments',
    paths: [[31, 26, 19, 20, 14, 9, 4, 11], [22, 27, 34, 29], [3, 2, 7, 6]],
    types: [
      { type: 'entropic', groups: [[1, 2], [3, 4], [5, 6]] },
      { type: 'region-sum' },
      { type: 'renban' },
    ],
  })
  const { solution } = await verifySizedRulePuzzle({ grid, givens, rules })
  assert.equal(solution, '164235532461645312321546213654456123')
})
