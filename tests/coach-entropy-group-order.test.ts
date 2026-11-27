import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readReviewedCoachEntropyGroupOrder } from '../src/sudoku/coach-entropy-group-order.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const examples = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples as {
  url: string; code: string; solution: string
}[]
const source = examples.find(example => example.url.endsWith('/7nms'))!

test('7nms parses all seven directed outside group clues against its printed solution', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const parsed = await readReviewedCoachEntropyGroupOrder(source.code, data)

  assert.ok(parsed)
  assert.equal(parsed.source.orders.length, 7)
  assert.equal(parsed.source.otherRules.length, 2)
  assert.deepEqual(parsed.source.orders.map(({ side, index, group }) => `${side}:${index}:${group}`), [
    'top:5:high', 'bottom:4:high', 'left:4:middle', 'right:5:middle',
    'bottom:7:high', 'bottom:1:low', 'top:3:low',
  ])

  for (const clue of parsed.source.orders) {
    const placed = clue.cells.map(cell => Number(source.solution[cell])).filter(digit => clue.digits.includes(digit))
    assert.deepEqual(placed, [...clue.digits])
  }
})

test('7nms parsing rejects changed puzzle data and keeps progress-bearing outside clues', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  assert.equal((await readReviewedCoachEntropyGroupOrder(`${source.code}0`, data))?.source.orders.length, 7)

  const changedSettings = structuredClone(data)
  const textLayer = (changedSettings.givenConstraints as Record<string, unknown>[]).find(layer => layer.type === 'cosmeticText')!
  ;(textLayer.settings as Record<string, unknown>).textSize = 61
  assert.equal(await readReviewedCoachEntropyGroupOrder(source.code, changedSettings), undefined)

  const changedClue = structuredClone(data)
  const clueLayer = (changedClue.givenConstraints as Record<string, unknown>[]).find(layer => layer.type === 'cosmeticText')!
  const first = (clueLayer.segments as Record<string, unknown>[])[0]
  ;(first.parameters as Record<string, unknown>).text = 'X'
  assert.equal(await readReviewedCoachEntropyGroupOrder(source.code, changedClue), undefined)

  const imported = await detectPuzzle(coachCode({ ...data, userDigits: `1${'0'.repeat(80)}` }))
  assert.equal(imported.progress?.entries[0], '1')
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'digit-order').length, 7)
})

test('7nms keeps authored outside orders with an appended supported Ratio rule', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const ratio = { type: 'ratio', segments: [{ cells: [0, 1], parameters: {} }] }
  const imported = await detectPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  const rules = imported.variant?.puzzle.rules ?? []
  assert.equal(rules.filter(rule => rule.type === 'digit-order').length, 7)
  assert.ok(rules.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.some(([a, b]) => a === 0 && b === 1)))
})
