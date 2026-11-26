import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeHighlightDigit, defaultDigitHighlight, functionKeyDigit, givenDigitAt, nextIncompleteDigit, onlyGivensSelected,
  previewPinnedDigit, readDigitHighlight, togglePinnedDigit } from '../src/sudoku/highlighting.ts'
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

test('pinned digits stay highlighted while each tap replaces the preview digit', () => {
  const pinTwo = togglePinnedDigit(defaultDigitHighlight, 2)
  const previewFive = previewPinnedDigit(pinTwo, 5)
  assert.deepEqual(previewFive, { mask: 18, pinnedMask: 2, previewDigit: 5, match: 'all' })
  assert.equal(previewPinnedDigit(previewFive, 5), previewFive)
  const previewSeven = previewPinnedDigit(previewFive, 7)
  assert.deepEqual(previewSeven, { mask: 66, pinnedMask: 2, previewDigit: 7, match: 'all' })
  const pinSeven = togglePinnedDigit(previewSeven, 7)
  assert.deepEqual(pinSeven, { mask: 66, pinnedMask: 66, match: 'all' })
  assert.deepEqual(previewPinnedDigit(previewPinnedDigit(pinSeven, 4), 2), pinSeven)
  assert.deepEqual(togglePinnedDigit(pinSeven, 7), pinTwo)
  assert.deepEqual(togglePinnedDigit(pinTwo, 2), defaultDigitHighlight)
})

test('saving pins retains the preview and keeps older digit highlights readable', () => {
  const pinThree = togglePinnedDigit(defaultDigitHighlight, 3, 1, 'any')
  assert.deepEqual(pinThree, { mask: 5, pinnedMask: 4, previewDigit: 1, match: 'any' })
  assert.deepEqual(readDigitHighlight({ ...pinThree, mask: 0 }), pinThree)
  assert.deepEqual(togglePinnedDigit(pinThree, 3), { mask: 1, match: 'any' })
  assert.deepEqual(readDigitHighlight({ mask: 80, match: 'all' }), { mask: 80, match: 'all' })
})
