import assert from 'node:assert/strict'
import test from 'node:test'
import { enter, makeGame } from '../src/sudoku/game.ts'
import {
  autoTechniqueFocus, playerActions, rememberTechniqueAction, summarizePuzzleTechniques, summarizeTechniques,
  type PuzzleTechniqueHistory,
} from '../src/sudoku/technique-progress.ts'

test('only intentional placements and complete candidate removals count as player actions', () => {
  const game = makeGame('test', 'Test', '0'.repeat(81), 'generated')
  const withNotes = enter(enter(game, [1], 'center', 5), [1], 'corner', 5)
  const next = enter(withNotes, [0], 'value', 5)
  assert.deepEqual(playerActions(withNotes, next, [0], 'value', 5), [{ place: { cell: 0, digit: 5 } }])
  assert.deepEqual(playerActions(next, enter(next, [0], 'value', 8), [0], 'value', 8), [])
  const clearedCenter = enter(withNotes, [1], 'center', 5)
  assert.deepEqual(playerActions(withNotes, clearedCenter, [1], 'center', 5), [])
  assert.deepEqual(playerActions(clearedCenter, enter(clearedCenter, [1], 'corner', 5), [1], 'corner', 5), [
    { eliminate: { cell: 1, digit: 5 } },
  ])
  assert.deepEqual(playerActions(withNotes, enter(withNotes, [1], 'corner', 0), [1], 'corner', 0), [])
})

test('a hint seen first stays assisted even if the player move is classified first', () => {
  const puzzle: PuzzleTechniqueHistory = { givens: 'puzzle', actions: {} }
  assert.equal(rememberTechniqueAction(puzzle, 'e2:4', { at: 10, technique: 'locked-pair', source: 'independent' }), true)
  assert.equal(rememberTechniqueAction(puzzle, 'e2:4', { at: 8, technique: 'locked-pair', source: 'hint' }), true)
  assert.equal(rememberTechniqueAction(puzzle, 'e2:4', { at: 12, technique: 'naked-pair', source: 'independent' }), false)
  assert.deepEqual(summarizeTechniques([puzzle]), [
    { technique: 'locked-pair', withoutHints: 0, withHints: 1, hintedPuzzles: 1, puzzles: 1, independence: null },
  ])
})

test('a solved puzzle lists each detected technique in first-use order', () => {
  const puzzle: PuzzleTechniqueHistory = {
    givens: 'puzzle',
    solutionRevealedAt: 20,
    actions: {
      first: { at: 4, technique: 'hidden-single', source: 'independent' },
      hint: { at: 8, technique: 'locked-pair', source: 'hint' },
      repeated: { at: 12, technique: 'hidden-single', source: 'hint' },
      automated: { at: 14, technique: 'naked-single', source: 'automated' },
      revealed: { at: 21, technique: 'x-wing', source: 'independent' },
    },
  }
  assert.deepEqual(summarizePuzzleTechniques(puzzle), [
    { technique: 'hidden-single', independent: 1, hints: 1 },
    { technique: 'locked-pair', independent: 0, hints: 1 },
  ])
})

test('independence weighs each puzzle equally and ignores moves after a solution reveal', () => {
  const clean: PuzzleTechniqueHistory = { givens: 'clean', actions: {} }
  for (let cell = 0; cell < 9; cell++) {
    rememberTechniqueAction(clean, `p${cell}:5`, { at: cell, technique: 'naked-single', source: 'independent' })
  }
  const practice: PuzzleTechniqueHistory = { givens: 'practice', actions: {}, solutionRevealedAt: 11 }
  rememberTechniqueAction(practice, 'p1:5', { at: 10, technique: 'naked-single', source: 'hint' })
  rememberTechniqueAction(practice, 'p3:5', { at: 12, technique: 'naked-single', source: 'independent' })
  const assisted = { ...practice, givens: 'another-puzzle' }
  assert.equal(summarizeTechniques([clean, practice])[0].independence, null)
  assert.deepEqual(summarizeTechniques([clean, practice, assisted]), [
    { technique: 'naked-single', withoutHints: 9, withHints: 2, hintedPuzzles: 2, puzzles: 3, independence: 33 },
  ])
})

test('Auto uses the full technique profile and prioritizes supported techniques that need more practice', () => {
  const puzzles = Array.from({ length: 12 }, (_, index): PuzzleTechniqueHistory => ({
    givens: String(index),
    actions: { 'e1:3': { at: index, technique: 'pointing', source: index < 4 ? 'independent' : 'hint' } },
  }))
  assert.deepEqual(summarizeTechniques(puzzles), [
    { technique: 'pointing', withoutHints: 4, withHints: 8, hintedPuzzles: 8, puzzles: 12, independence: 33 },
  ])
  const progress = summarizeTechniques(puzzles)
  assert.equal(autoTechniqueFocus(progress, ['naked-pair', 'pointing']), 'pointing')
  assert.equal(autoTechniqueFocus(progress, ['x-wing']), undefined)
  assert.equal(autoTechniqueFocus(summarizeTechniques(puzzles.slice(0, 4)), ['pointing']), undefined)
})
