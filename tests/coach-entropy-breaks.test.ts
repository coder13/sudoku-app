import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readReviewedCoachEntropyBreaks } from '../src/sudoku/coach-entropy-breaks.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples.find(
  (example: { url: string }) => example.url.endsWith('/LEjN'),
) as { code: string }

test('#168 parses only the sixteen orthogonally adjacent gaps from the reviewed spiral order', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const parsed = await readReviewedCoachEntropyBreaks(source.code, data)
  assert.ok(parsed)
  assert.deepEqual(parsed.rules.map(rule => rule.cells.join('-')), [
    '31-32-33-42', '56-47-38-29', '20-21-22-23', '70-69-68-67',
    '66-65-64-55', '64-55-46-37', '46-37-28-19', '11-12-13-14',
    '62-71-80-79', '76-75-74-73', '74-73-72-63', '54-45-36-27',
    '36-27-18-9', '18-9-0-1', '1-2-3-4', '4-5-6-7',
  ])
  const imported = await detectPuzzle(source.code)
  assert.equal(imported.title, 'Entropic Spiral')
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'forbidden-entropic-connection').length, 16)
})

test('the Entropic Spiral review rejects changed geometry and supports progress-bearing exports', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const changed = structuredClone(data)
  const layer = (changed.givenConstraints as Record<string, unknown>[]).find(rule => rule.type === 'entropicLine')!
  const first = (layer.segments as Record<string, unknown>[])[0]
  ;(first.cells as number[]).reverse()
  assert.equal(await readReviewedCoachEntropyBreaks(source.code, changed), undefined)
  assert.equal((await readReviewedCoachEntropyBreaks(`${source.code}0`, data))?.rules.length, 16,
    'the source fingerprint remains stable when the encoded payload is re-written')
  const imported = await detectPuzzle(coachCode({ ...data, userDigits: `1${'0'.repeat(80)}` }))
  assert.equal(imported.progress?.entries[0], '1')
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'forbidden-entropic-connection').length, 16)
})
