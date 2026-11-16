import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPuzzle, parsePuzzle, STARTER, type ShareFormat } from '../src/sudoku/formats.ts'
import { conflictsOf, enter, redo, STARTER_GAME, undo, valuesOf } from '../src/sudoku/game.ts'

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
  const marked = enter(STARTER_GAME, [2, 3], 'center', 4)
  assert.equal(marked.position.center[2], 8)
  assert.equal(marked.position.center[3], 8)
  assert.equal(undo(marked).position, STARTER_GAME.position)
  assert.equal(redo(undo(marked)).position, marked.position)
  const conflict = enter(marked, [2], 'value', 3)
  assert.deepEqual([...conflictsOf(valuesOf(conflict))], [1, 2])
})
