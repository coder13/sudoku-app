import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeHighlightDigit, functionKeyDigit, givenDigitAt, nextIncompleteDigit, onlyGivensSelected } from '../src/sudoku/highlighting.ts'
import { HIGHLIGHT_KEY, readPreferences } from '../src/sudoku/preferences.ts'

test('a selected placed digit drives matching candidate highlights', () => {
  assert.equal(activeHighlightDigit(`000005${'0'.repeat(75)}`, [5], 5, null), 5)
})

test('a selected digit button drives highlights when no placed digit is active', () => {
  assert.equal(activeHighlightDigit('0'.repeat(81), [], 0, 7), 7)
})

test('an explicitly selected digit replaces a cell-driven highlight', () => {
  assert.equal(activeHighlightDigit(`4${'0'.repeat(80)}`, [0], 0, 7), 7)
})

test('F1–F9 map to highlighted digits without accepting other function keys', () => {
  assert.equal(functionKeyDigit('F1'), 1)
  assert.equal(functionKeyDigit('f9'), 9)
  assert.equal(functionKeyDigit('F10'), null)
  assert.equal(functionKeyDigit('5'), null)
})

test('cycling the highlighted digit skips completed digits and wraps', () => {
  const values = '1'.repeat(9) + '3'.repeat(9) + '9'.repeat(9) + '0'.repeat(54)
  assert.equal(nextIncompleteDigit(values, null), 2)
  assert.equal(nextIncompleteDigit(values, 2), 4)
  assert.equal(nextIncompleteDigit(values, 8), 2)
  assert.equal(nextIncompleteDigit('123456789'.repeat(9), 8), null)
  assert.equal(nextIncompleteDigit('123456'.repeat(5) + '123450', 6, 6), 6)
})

test('highlighting is inactive without a placed or selected digit', () => {
  assert.equal(activeHighlightDigit('0'.repeat(81), [0], 0, null), null)
})

test('a selected given supplies the digit selector digit', () => {
  assert.equal(givenDigitAt(`4${'0'.repeat(80)}`, 0), 4)
  assert.equal(givenDigitAt(`4${'0'.repeat(80)}`, 1), null)
})

test('digit input can distinguish a given-only selection from an editable selection', () => {
  const givens = `42${'0'.repeat(79)}`
  assert.equal(onlyGivensSelected(givens, [0]), true)
  assert.equal(onlyGivensSelected(givens, [0, 1]), true)
  assert.equal(onlyGivensSelected(givens, [0, 2]), false)
  assert.equal(onlyGivensSelected(givens, []), false)
})

test('older highlight preferences keep the automatic toggles and discard the candidate style', () => {
  const read = (saved: Record<string, unknown>) => readPreferences({
    getItem: key => key === HIGHLIGHT_KEY ? JSON.stringify(saved) : null,
  }).highlighting
  assert.deepEqual(read({ defaultsVersion: 2, candidateStyle: 'text', matchingCandidates: false }), {
    relatedCells: true, matchingDigits: true, matchingCandidates: false,
  })
})
