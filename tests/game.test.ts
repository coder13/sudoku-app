import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPuzzle, parsePuzzle, STARTER, type ShareFormat } from '../src/sudoku/formats.ts'
import {
  applyDeduction, candidateCount, completeCandidateMasks, conflictsOf, enter, fillEntries, hasCandidate, isPuzzleSaved, makeGame, marksOf, redo,
  replaceCandidates, restartGame, singleFromCandidates, STARTER_GAME, undo, valuesOf,
} from '../src/sudoku/game.ts'

test('saved puzzle state is independent from its source and survives a reset', () => {
  assert.equal(isPuzzleSaved(STARTER_GAME), false)
  assert.equal(isPuzzleSaved({ ...STARTER_GAME, source: 'custom' }), true)
  assert.equal(isPuzzleSaved({ ...STARTER_GAME, source: 'custom', saved: false }), false)

  const reset = restartGame({ ...STARTER_GAME, saved: true, archived: true })
  assert.equal(reset.saved, true)
  assert.equal(reset.archived, true)
})

test('candidate matching treats masks as sets', () => {
  const pair = (1 << (2 - 1)) | (1 << (7 - 1))
  assert.equal(candidateCount(pair), 2)
  assert.equal(candidateCount(pair | (1 << (7 - 1))), 2)
  assert.equal(hasCandidate(pair, 2), true)
  assert.equal(hasCandidate(pair, 7), true)
  assert.equal(hasCandidate(pair, 4), false)
})

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

test('highlight entry works with one or many selected cells while ordinary value entry remains single-cell', () => {
  assert.equal(enter(STARTER_GAME, [2, 3], 'value', 4), STARTER_GAME)

  const single = enter(STARTER_GAME, [2], 'value', 4, { allowMultipleValues: true })
  assert.equal(single.position.entries[2], '4')

  const filled = enter(STARTER_GAME, [2, 3], 'value', 4, { allowMultipleValues: true })
  assert.equal(filled.position.entries[2], '4')
  assert.equal(filled.position.entries[3], '4')
  assert.deepEqual(undo(filled).position, STARTER_GAME.position)
})

test('highlight candidate input toggles a digit across the selected cells', () => {
  const selection = [2, 3, 18]
  const marked = enter(STARTER_GAME, selection, 'candidate', 7)
  for (const cell of selection) assert.deepEqual(marksOf(marked.position.corner[cell]), [7])

  const cleared = enter(marked, selection, 'candidate', 7)
  for (const cell of selection) assert.equal(cleared.position.corner[cell], 0)
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

test('automatic candidates do not create an undo step', () => {
  const masks = Array(81).fill(0)
  masks[2] = (1 << (4 - 1)) | (1 << (7 - 1))
  const centered = enter(STARTER_GAME, [2], 'center', 8)
  const generated = replaceCandidates(centered, masks, { recordHistory: false })

  assert.deepEqual(marksOf(generated.position.corner[2]), [4, 7])
  assert.deepEqual(generated.past, centered.past)
  assert.deepEqual(generated.future, [])
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

test('applying a hint places its digit and clears it from peer candidates in one move', () => {
  const marked = enter(STARTER_GAME, [37, 40], 'candidate', 5)
  const masks = Array(81).fill(0)
  masks[40] = 1 << 4
  const placed = applyDeduction(marked, [{ place: { cell: 40, digit: 5 } }], masks)

  assert.equal(placed.position.entries[40], '5')
  assert.equal(placed.position.corner[37], 0)
  assert.equal(undo(placed).position, marked.position)
})

test('applying a hint records every removal and keeps it out of regenerated candidates', () => {
  const masks = Array(81).fill(0)
  masks[2] = (1 << 0) | (1 << 1) | (1 << 3)
  masks[3] = (1 << 1) | (1 << 5)
  const marked = enter(enter(STARTER_GAME, [2], 'center', 2), [2], 'corner', 4)
  const applied = applyDeduction(marked, [
    { eliminate: { cell: 2, digit: 2 } },
    { eliminate: { cell: 3, digit: 2 } },
  ], masks)

  assert.equal(applied.position.entries, marked.position.entries)
  assert.equal(applied.position.center[2], 0)
  assert.deepEqual(marksOf(applied.position.corner[2]), [4])
  assert.deepEqual(marksOf(applied.position.corner[3]), [6])
  assert.deepEqual(marksOf(replaceCandidates(applied, masks).position.corner[2]), [1, 4])
  assert.equal(undo(applied).position, marked.position)
  assert.equal(redo(undo(applied)).position, applied.position)
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

test('a complete displayed candidate grid can drive hidden-single detection', () => {
  const game = makeGame('candidate-grid', 'Candidate grid', '0'.repeat(81), 'generated')
  const corner = Array(81).fill(0x1ff)
  for (let index = 0; index < 9; index++) corner[index] &= ~(1 << (3 - 1))
  corner[1] = (1 << (3 - 1)) | (1 << (5 - 1))
  const withCandidates = { ...game, position: { ...game.position, corner } }

  const displayed = completeCandidateMasks(withCandidates)
  assert.ok(displayed)
  assert.deepEqual(singleFromCandidates(valuesOf(withCandidates), displayed), [1, 3])

  corner[2] = 0
  assert.equal(completeCandidateMasks({ ...game, position: { ...game.position, corner } }), null)
})
