import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPuzzle, parsePuzzle, STARTER, type ShareFormat } from '../src/sudoku/formats.ts'
import {
  conflictsOf, enter, fillEntries, marksOf, redo, replaceCandidates, singleFromCandidates, STARTER_GAME, undo, valuesOf,
} from '../src/sudoku/game.ts'

test('all share formats round-trip to the original givens', () => {
  const formats: ShareFormat[] = ['link', 'givens', 'grid', 'hodoku', 'exchange', 'coach']
  for (const format of formats) {
    assert.equal(parsePuzzle(exportPuzzle(STARTER, format, 'https://example.org')), STARTER, format)
  }
})

test('HoDoKu player entries are excluded when importing givens', () => {
  const dots = exportPuzzle(STARTER, 'givens')
  const savedGrid = dots.slice(0, 2) + '+4' + dots.slice(3)
  assert.equal(parsePuzzle(`:0000:x:${savedGrid}:123::`), STARTER)
  assert.equal(parsePuzzle(`:x:8:${savedGrid}::::`), STARTER)
  assert.equal(parsePuzzle(`:0603-1:8:${savedGrid}::829::`), STARTER)
  assert.throws(() => parsePuzzle(`:0000:x:${savedGrid}`))
})

test('pasted text grids may have separators and comments', () => {
  const rows = exportPuzzle(STARTER, 'grid').split('\n')
  const separator = '+---+---+---+'
  const bordered = [separator, ...rows.flatMap((row, i) => [
    '|' + row.match(/.{3}/g)!.join('|') + '|',
    ...((i + 1) % 3 ? [] : [separator]),
  ])].join('\n')
  assert.equal(parsePuzzle(bordered + '\n# example'), STARTER)
  assert.throws(() => parsePuzzle('https://example.org/' + STARTER))
  assert.throws(() => parsePuzzle(STARTER + '1'))
})

test('moves preserve givens and undo multiple notes as a single action', () => {
  assert.equal(enter(STARTER_GAME, [0], 'value', 8), STARTER_GAME)
  const marked = enter(STARTER_GAME, [2, 3], 'candidate', 4)
  assert.equal(marked.position.corner[2], 8)
  assert.equal(marked.position.corner[3], 8)
  assert.equal(undo(marked).position, STARTER_GAME.position)
  assert.equal(redo(undo(marked)).position, marked.position)
  const conflict = enter(marked, [2], 'value', 3)
  assert.deepEqual([...conflictsOf(valuesOf(conflict))], [1, 2])
})

test('entering a digit removes peer candidates and undo restores them', () => {
  const bit = 1 << (4 - 1)
  const marked = enter(STARTER_GAME, [2, 3, 18, 40], 'candidate', 4)
  const filled = enter(marked, [2], 'value', 4)

  assert.equal(filled.position.corner[2] & bit, 0, 'filled cell')
  assert.equal(filled.position.corner[3] & bit, 0, 'row peer')
  assert.equal(filled.position.corner[18] & bit, 0, 'box peer')
  assert.equal(filled.position.corner[40] & bit, bit, 'non-peer')
  assert.deepEqual(undo(filled).position, marked.position)
})

test('candidate input consolidates legacy center notes into the 3x3 note grid', () => {
  const center = [...STARTER_GAME.position.center]
  center[2] = 1 << (4 - 1)
  const legacy = { ...STARTER_GAME, position: { ...STARTER_GAME.position, center } }
  const updated = enter(legacy, [2], 'candidate', 7)

  assert.equal(updated.position.center[2], 0)
  assert.deepEqual(marksOf(updated.position.corner[2]), [4, 7])
})

test('advanced candidate input keeps center and corner notes separate', () => {
  const centered = enter(STARTER_GAME, [2], 'center', 4)
  const marked = enter(centered, [2], 'corner', 7)

  assert.deepEqual(marksOf(marked.position.center[2]), [4])
  assert.deepEqual(marksOf(marked.position.corner[2]), [7])
  assert.deepEqual(undo(marked).position, centered.position)
})

test('generated candidates replace notes as one undoable grid-candidate action', () => {
  const masks = Array(81).fill(0)
  masks[2] = (1 << (4 - 1)) | (1 << (7 - 1))
  masks[0] = 0x1ff
  const centered = enter(STARTER_GAME, [2], 'center', 8)
  const generated = replaceCandidates(centered, masks)

  assert.deepEqual(marksOf(generated.position.corner[2]), [4, 7])
  assert.equal(generated.position.corner[0], 0, 'givens do not receive candidates')
  assert.equal(generated.position.center[2], 0, 'generated candidates use the 3x3 grid')
  assert.deepEqual(undo(generated).position, centered.position)
})

test('solving singles fills entries and restores candidates with one undo', () => {
  const marked = enter(STARTER_GAME, [2, 3, 18, 40], 'candidate', 4)
  const nextValues = [...valuesOf(marked)]
  nextValues[2] = '4'
  const solved = fillEntries(marked, nextValues.join(''))

  assert.equal(solved.position.entries[2], '4')
  assert.equal(solved.position.corner[3] & (1 << (4 - 1)), 0)
  assert.equal(solved.position.corner[40] & (1 << (4 - 1)), 1 << (4 - 1))
  assert.deepEqual(undo(solved).position, marked.position)
})

test('single detection prefers naked singles and finds hidden singles', () => {
  const masks = Array(81).fill(0)
  masks[0] = 1 << (4 - 1)
  masks[1] = (1 << (4 - 1)) | (1 << (7 - 1))
  assert.deepEqual(singleFromCandidates('0'.repeat(81), masks), [0, 4])

  masks[0] |= 1 << (7 - 1)
  masks[1] = (1 << (4 - 1)) | (1 << (8 - 1))
  assert.deepEqual(singleFromCandidates('0'.repeat(81), masks), [0, 7])
})
