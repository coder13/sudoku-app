import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOBILE_PANEL_IDS, mobilePanelOrder, moveMobilePanel } from '../src/sudoku/mobile-panels.ts'

test('missing or invalid mobile layouts use the normal card order', () => {
  for (const saved of [null, undefined, {}, 'input', 5]) {
    assert.deepEqual(mobilePanelOrder(saved), MOBILE_PANEL_IDS)
  }
})

test('saved layouts retain known cards once and include newly available cards', () => {
  assert.deepEqual(mobilePanelOrder(['input', 'unknown', null, 'input', 'puzzle']),
    ['input', 'puzzle', 'hint', 'completion'])
})

test('moving visible cards preserves the saved positions of hidden cards', () => {
  const order = [...MOBILE_PANEL_IDS]
  const next = moveMobilePanel(order, 'input', { id: 'puzzle', edge: 'before' })
  assert.deepEqual(next, ['input', 'puzzle', 'hint', 'completion'])
  assert.deepEqual(order, MOBILE_PANEL_IDS)
  assert.deepEqual(mobilePanelOrder(JSON.parse(JSON.stringify(next))), next)
})

test('cards can move in either direction without losing the completion card', () => {
  const next = moveMobilePanel(MOBILE_PANEL_IDS, 'puzzle', { id: 'input', edge: 'after' })
  assert.deepEqual(next, ['hint', 'input', 'puzzle', 'completion'])
  assert.deepEqual(moveMobilePanel(next, 'puzzle', { id: 'hint', edge: 'before' }), MOBILE_PANEL_IDS)
  assert.deepEqual(moveMobilePanel(next, 'puzzle', { id: 'puzzle', edge: 'after' }), next)
})
