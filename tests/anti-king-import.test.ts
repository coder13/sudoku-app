import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame, redo, undo, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { generationVariant, isPlayablePuzzle, variantName, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { coachCode } from './helpers/coach-code.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/anti-king-newman.json', import.meta.url), 'utf8')) as {
  puzzle: VariantPuzzle; solution: string; coachConstraint: Record<string, unknown>
}

test('King of Diamonds has its published unique completion and needs the Anti-King rule', () => {
  const result = countCellRuleSolutions(fixture.puzzle)
  assert.equal(result.count, 1)
  assert.equal(result.solution, fixture.solution)
  assert.equal(countCellRuleSolutions({ ...fixture.puzzle, rules: [] }).count, 2)
})

test('Anti-King imports retain the global rule, player-facing name and shared definition', async () => {
  const source = coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: [fixture.coachConstraint] })
  const imported = await detectPuzzle(source)
  assert.deepEqual(imported.variant, { id: 'anti-king', puzzle: fixture.puzzle })
  assert.equal(variantName(imported.variant), 'Anti-King')
  assert.equal(generationVariant(imported.variant), 'anti-king')
  assert.ok(variantRuleDescriptions(fixture.puzzle).some(text => text.includes('touching at a corner')))
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported.variant)))).variant, imported.variant)
})

test('global Anti-King clues cannot silently accept cell scopes or unknown settings', async () => {
  for (const constraint of [
    { type: 'antiKing', segments: [{ cells: [0] }], settings: {} },
    { type: 'antiKing', segments: [], settings: { negativeConstraint: true } },
    { type: 'antiKing', segments: [], settings: { distance: 2 } },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })), /unsupported/)
  assert.equal(isPlayablePuzzle('anti-king', fixture.puzzle), true)
  assert.equal(isPlayablePuzzle('classic', fixture.puzzle), false)
})

test('every geometric corner pair is recognized without row wrapping or unrelated chess moves', () => {
  for (let a = 0; a < 81; a++) {
    const corners = new Set<number>()
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
      const row = Math.floor(a / 9) + dr, col = a % 9 + dc
      if (row >= 0 && row < 9 && col >= 0 && col < 9) corners.add(row * 9 + col)
    }
    for (let b = 0; b < 81; b++) assert.equal(variantPeers(fixture.puzzle, a, b), corners.has(b), `${a}, ${b}`)
  }
  const values = Array<string>(81).fill('0')
  values[2] = values[12] = '5' // Across a box border, in different rows and columns.
  assert.deepEqual([...conflictsOf(values.join(''), fixture.puzzle)], [2, 12])
  assert.equal(conflictsOf(values.join('')).size, 0)
  values[2] = values[12] = '0'
  values[8] = values[9] = '5'
  assert.equal(conflictsOf(values.join(''), fixture.puzzle).size, 0)
})

test('placing a digit clears both kinds of candidate mark across corners and history restores them', () => {
  let game: Game = { ...makeGame('king-history', 'King of Diamonds', fixture.puzzle.givens, 'imported'),
    variant: { id: 'anti-king' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
  game = enter(game, [12, 23], 'center', 8)
  game = enter(game, [12], 'corner', 8)
  const before = game.position
  const next = enter(game, [2], 'value', 8)
  assert.equal(next.position.center[12], 0)
  assert.equal(next.position.corner[12], 0)
  assert.equal(next.position.center[23], 1 << 7)
  assert.deepEqual(undo(next).position, before)
  assert.deepEqual(redo(undo(next)).position, next.position)
})
