import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPuzzle, parsePuzzle, STARTER, type ShareFormat } from '../src/sudoku/formats.ts'
import { jigsawLayout, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'
import {
  applyDeduction, candidateCount, clearCandidateColors, completeCandidateMasks, conflictsOf, enter, fillEntries, hasCandidate, isPuzzleSaved, makeGame, marksOf, onlyCandidate, paintCandidate, redo,
  needsInitialCandidates, paintCandidateStroke, replaceCandidates, restartGame, setGamePaused, singleFromCandidates, STARTER_GAME, undo, valuesOf,
} from '../src/sudoku/game.ts'

test('Jigsaw uses irregular regions for candidate removal and conflicts', () => {
  const givens = '0'.repeat(81)
  const regions = jigsawLayout(variantSeeds.jigsaw.easy![0].regions!)
  const puzzle = { version: 1, givens, regions } as const
  assert.ok(isPlayablePuzzle('jigsaw', puzzle))
  const solution = '387625149165947283924813765712569834853274691496138572539782416648351927271496358'
  const game = { ...makeGame('jigsaw', 'Jigsaw', givens, 'generated'), variant: { id: 'jigsaw' as const, puzzle, solution } }

  const moved = 56
  const regionPeer = 27
  const boxNeighbor = 64
  const withCandidates = enter(game, [regionPeer, boxNeighbor], 'candidate', 1)
  const placed = enter(withCandidates, [moved], 'value', 1)
  assert.equal(hasCandidate(placed.position.center[regionPeer] | placed.position.corner[regionPeer], 1), false)
  assert.equal(hasCandidate(placed.position.center[boxNeighbor] | placed.position.corner[boxNeighbor], 1), true)
  const repeated = [...givens]
  for (const cell of [moved, regionPeer, boxNeighbor]) repeated[cell] = '1'
  assert.deepEqual(conflictsOf(repeated.join(''), puzzle), new Set([moved, regionPeer]))
  const overlapping = { ...regions, regions: regions.regions.map((region, index) => index === 0 ? regions.regions[1] : region) }
  assert.equal(isPlayablePuzzle('jigsaw', { ...puzzle, regions: overlapping }), false)
})

test('saved puzzle state is independent from its source and survives a reset', () => {
  assert.equal(isPuzzleSaved(STARTER_GAME), false)
  assert.equal(isPuzzleSaved({ ...STARTER_GAME, source: 'custom' }), true)
  assert.equal(isPuzzleSaved({ ...STARTER_GAME, source: 'custom', saved: false }), false)

  const reset = restartGame({ ...STARTER_GAME, saved: true, archived: true })
  assert.equal(reset.saved, true)
  assert.equal(reset.archived, true)
})

test('only a started puzzle can be paused and resumed', () => {
  assert.equal(setGamePaused(STARTER_GAME, true), STARTER_GAME)

  const started = enter(STARTER_GAME, [2], 'candidate', 4)
  const paused = setGamePaused(started, true)
  assert.equal(paused.paused, true)
  assert.equal(setGamePaused(paused, true), paused)
  assert.equal(setGamePaused(paused, false).paused, false)
})

test('candidate matching treats masks as sets', () => {
  const pair = (1 << (2 - 1)) | (1 << (7 - 1))
  assert.equal(candidateCount(pair), 2)
  assert.equal(candidateCount(pair | (1 << (7 - 1))), 2)
  assert.equal(hasCandidate(pair, 2), true)
  assert.equal(hasCandidate(pair, 7), true)
  assert.equal(hasCandidate(pair, 4), false)
})

test('a naked single is the only displayed candidate in its cell', () => {
  assert.equal(onlyCandidate(1 << (4 - 1)), 4)
  assert.equal(onlyCandidate(0), null)
  assert.equal(onlyCandidate((1 << (2 - 1)) | (1 << (7 - 1))), null)
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

test('dragged candidate edits apply the same action to every cell and undo together', () => {
  const initial = enter(STARTER_GAME, [3], 'candidate', 4)
  const first = paintCandidateStroke(initial, initial, [2, 3], 'candidate', 4, 'add')
  assert.equal(hasCandidate(first.position.corner[2], 4), true)
  assert.equal(hasCandidate(first.position.corner[3], 4), true)

  const extended = paintCandidateStroke(first, initial, [2, 3, 18, 0], 'candidate', 4, 'add')
  assert.equal(hasCandidate(extended.position.corner[18], 4), true)
  assert.equal(extended.position.corner[0], 0, 'givens are not editable')
  assert.equal(extended.past.length, initial.past.length + 1)
  assert.deepEqual(undo(extended).position, initial.position)
  assert.deepEqual(redo(undo(extended)).position, extended.position)

  const removed = paintCandidateStroke(extended, extended, [2, 3], 'candidate', 4, 'remove')
  assert.equal(hasCandidate(removed.position.corner[2], 4), false)
  assert.equal(hasCandidate(removed.position.corner[3], 4), false)
  assert.equal(hasCandidate(removed.position.corner[18], 4), true)
  assert.deepEqual(undo(removed).position, extended.position)
})

test('dragged candidate edits respect separate center and corner layouts', () => {
  const initial = enter(STARTER_GAME, [2], 'center', 5)
  const next = paintCandidateStroke(initial, initial, [2, 3], 'corner', 7, 'add')
  assert.equal(hasCandidate(next.position.center[2], 5), true)
  assert.equal(hasCandidate(next.position.corner[2], 7), true)
  assert.equal(hasCandidate(next.position.corner[3], 7), true)
  assert.equal(next.past.length, initial.past.length + 1)
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

test('individual candidates in one cell can have different colors alongside a cell color', () => {
  const rose = { cell: 2, digit: 4 }
  const lavender = { cell: 2, digit: 7 }
  const candidates = enter(enter(STARTER_GAME, [2], 'center', 4), [2], 'corner', 7)
  const cell = enter(candidates, [2], 'color', 5)
  const painted = paintCandidate(paintCandidate(cell, rose, 1), lavender, 6)

  assert.deepEqual(painted.position.candidateColors, { 2: { 4: 1, 7: 6 } })
  assert.equal(painted.position.colors[2], 5)
  assert.equal(paintCandidate(painted, lavender, 6), painted)
  assert.equal(paintCandidate(painted, { cell: 2, digit: 9 }, 1), painted)

  const erased = paintCandidate(painted, lavender, 0)
  assert.deepEqual(erased.position.candidateColors, { 2: { 4: 1 } })
  assert.equal(erased.position.corner[2], painted.position.corner[2])
  assert.equal(undo(erased).position, painted.position)
  assert.equal(redo(undo(erased)).position, erased.position)

  const cleared = clearCandidateColors(painted)
  assert.equal(cleared.position.candidateColors, undefined)
  assert.equal(cleared.position.colors[2], 5)
  assert.equal(undo(cleared).position, painted.position)
})

test('candidate colors follow a digit across layouts and are removed with the candidate', () => {
  const candidate = { cell: 2, digit: 4 }
  const marked = paintCandidate(enter(STARTER_GAME, [2], 'center', 4), candidate, 1)
  const both = enter(marked, [2], 'corner', 4)
  const corner = enter(both, [2], 'center', 4)
  assert.equal(corner.position.candidateColors, marked.position.candidateColors)
  assert.equal(enter(corner, [2], 'corner', 4).position.candidateColors, undefined)
  assert.equal(enter(corner, [2], 'value', 7).position.candidateColors, undefined)
  assert.equal(enter(corner, [3], 'value', 4).position.candidateColors, undefined)

  const generated = replaceCandidates(marked, corner.position.corner)
  assert.equal(generated.position.candidateColors, marked.position.candidateColors)
  const removed = replaceCandidates(generated, STARTER_GAME.position.corner, { recordHistory: false })
  assert.equal(removed.position.candidateColors, undefined)
  const eliminated = applyDeduction(generated, [{ eliminate: candidate }], generated.position.corner)
  assert.equal(eliminated.position.candidateColors, undefined)
  assert.equal(undo(eliminated).position, generated.position)
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

test('automatic generation only initializes puzzles without existing candidate work', () => {
  const puzzle = makeGame('candidate-initialization', 'Candidate initialization', STARTER, 'custom')
  const masks = Array<number>(81).fill(0)
  masks[2] = (1 << (4 - 1)) | (1 << (7 - 1))
  assert.equal(needsInitialCandidates(puzzle), true)
  assert.equal(needsInitialCandidates(enter(puzzle, [3], 'value', 6)), true)

  const generated = replaceCandidates(puzzle, masks, { recordHistory: false })
  assert.equal(generated.candidatesInitialized, true)
  assert.equal(generated.started, false)
  const edited = enter(generated, [2], 'candidate', 7)
  assert.deepEqual(marksOf(edited.position.corner[2]), [4])
  assert.equal(needsInitialCandidates(edited), false)

  const legacy = { ...enter(edited, [2], 'candidate', 0), candidatesInitialized: undefined }
  assert.equal(needsInitialCandidates(legacy), false, 'older saves can have empty grids with candidate history')
  const changed = enter(legacy, [3], 'value', 6)
  assert.equal(changed.candidatesInitialized, true)
  assert.equal(needsInitialCandidates({ ...changed, past: [], future: [] }), false)

  const undone = undo(enter(puzzle, [2], 'corner', 4))
  assert.equal(needsInitialCandidates({ ...undone, candidatesInitialized: undefined }), false, 'redo can restore legacy candidates')
  assert.equal(needsInitialCandidates(restartGame(edited)), true)
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
