import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame, redo, undo, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isPlayablePuzzle, variantDigitExclusions, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countWhispersSolutions } from './helpers/whispers-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { coachCode } from './helpers/coach-code.ts'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const constraints = fixture.puzzle.rules!.map(rule => { assert.equal(rule.type, 'whispers'); return { type: 'whisper', settings: {}, segments: [{ cells: rule.cells, parameters: {} }] } })

test('Brain Zaps has its published unique completion and needs its Whispers rules', () => {
  assertVariantCompletion(fixture.puzzle, fixture.solution)
  const result = countWhispersSolutions(fixture.puzzle)
  assert.equal(result.count, 1); assert.equal(result.solution, fixture.solution)
  assert.equal(countWhispersSolutions({ ...fixture.puzzle, rules: [] }).count, 2)
})

test('Whispers import preserves every ordered cell, minimum difference and shared puzzle definition', async () => {
  const imported = await detectPuzzle(coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: constraints }))
  assert.deepEqual(imported.variant, { id: 'whispers', puzzle: fixture.puzzle })
  assert.equal(generationVariant(imported.variant), 'whispers')
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported.variant)))).variant, imported.variant)
  assert.equal(variantRuleDescriptions(fixture.puzzle).filter(text => text.includes('differ by at least 5')).length, 4)
  for (const gap of [1, 2, 4, 5, 8]) {
    const value = await detectPuzzle(coachCode({ givenConstraints: [{ type: 'whisper', settings: { difference: gap, colour: '#abcd12', lineThickness: 5 }, segments: [{ cells: [0, 10, 20], parameters: {} }] }] }))
    assert.deepEqual(value.variant?.puzzle.rules, [{ type: 'whispers', cells: [0, 10, 20], minDifference: gap }])
  }
})

test('malformed Whispers lines and unrecognized semantics are rejected instead of lost', async () => {
  for (const constraint of [
    { settings: { difference: 0 }, cells: [0, 1] }, { settings: { difference: 9 }, cells: [0, 1] },
    { settings: { difference: '4' }, cells: [0, 1] }, { settings: { negativeConstraint: true }, cells: [0, 1] },
    { settings: {}, cells: [0] }, { settings: {}, cells: [0, 0] }, { settings: {}, cells: [0, 81] },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'whisper', settings: constraint.settings, segments: [{ cells: constraint.cells, parameters: {} }] }] })))
  assert.equal(isPlayablePuzzle('whispers', { ...fixture.puzzle, rules: [{ type: 'whispers', cells: [0, 10], minDifference: 1.5 }] }), false)
})

test('line adjacency controls digit conflicts, candidate cleanup and undo without making the entire line distinct', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'whispers', cells: [0, 10, 20, 30], minDifference: 5 }] }
  for (let digit = 1; digit <= 9; digit++) for (let other = 1; other <= 9; other++) {
    const expected = Math.abs(digit - other) < 5
    assert.equal(Boolean(variantDigitExclusions(puzzle, 0, 10, digit) & 1 << (other - 1)), expected)
    assert.equal(Boolean(variantDigitExclusions(puzzle, 10, 0, digit) & 1 << (other - 1)), expected)
    assert.equal(variantDigitExclusions(puzzle, 0, 30, digit), 0)
  }
  assert.equal(variantPeers(puzzle, 0, 10), true); assert.equal(variantPeers(puzzle, 0, 30), false)
  const entries = [...puzzle.givens]; entries[0] = '4'; entries[10] = '8'
  assert.deepEqual([...conflictsOf(entries.join(''), puzzle)], [0, 10])
  entries[10] = '9'; assert.equal(conflictsOf(entries.join(''), puzzle).size, 0)
  let game: Game = { ...makeGame('whispers-history', 'Whispers', puzzle.givens, 'imported'), variant: { id: 'whispers' as const, puzzle, solution: fixture.solution } }
  game = enter(game, [10, 30], 'center', 8); game = enter(game, [10], 'corner', 8)
  const next = enter(game, [0], 'value', 4)
  assert.equal(next.position.center[10], 0); assert.equal(next.position.corner[10], 0)
  assert.equal(next.position.center[30], 1 << 7)
  assert.deepEqual(undo(next).position, game.position); assert.deepEqual(redo(undo(next)).position, next.position)
})

test('every geometric symmetry preserves complete line order and the independently checked completion', () => {
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(fixture.puzzle, symmetry)
    const solution = reflectVariant({ ...fixture.puzzle, givens: fixture.solution }, symmetry).givens
    assertVariantCompletion(puzzle, solution)
    assert.equal(isPlayablePuzzle('whispers', puzzle), true)
    assert.deepEqual(countWhispersSolutions(puzzle).solution, solution)
  }
})


test('Whispers constraints from unmodified real Coach exports retain every minimum and ordered segment', async () => {
  const examples = JSON.parse(readFileSync(new URL('./fixtures/whispers-coach.json', import.meta.url), 'utf8')).examples as { code: string }[]
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  for (const { code } of examples) {
    const bits = [...code.slice('SCv7_32_'.length)].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
    const bytes = Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))
    const data = JSON.parse(inflateSync(bytes).toString('utf8'))
    const constraints = data.givenConstraints.filter((rule: { type: string }) => rule.type === 'whisper')
    // Isolate this family for its decoder contract; whole exports still retain
    // their unsupported companion clues in the separate rejection checks.
    const result = await detectPuzzle(coachCode({ givenDigits: data.givenDigits, givenConstraints: constraints }))
    const expected = constraints.flatMap((rule: { settings: { difference?: number }; segments: { cells: number[] }[] }) =>
      rule.segments.map(segment => ({ type: 'whispers', cells: segment.cells, minDifference: rule.settings.difference ?? 5 })))
    assert.deepEqual(result.variant?.puzzle.rules, expected)
  }
})

test('a closed Whispers walk preserves its closing rule during import, conflicts and candidate cleanup', async () => {
  const cells = [0, 10, 20, 0]
  const imported = await detectPuzzle(coachCode({ givenConstraints: [{ type: 'whisper', settings: { difference: 4 }, segments: [{ cells, parameters: {} }] }] }))
  assert.deepEqual(imported.variant?.puzzle.rules, [{ type: 'whispers', cells, minDifference: 4 }])
  const puzzle = imported.variant!.puzzle
  const values = [...puzzle.givens]; values[0] = '2'; values[10] = '9'; values[20] = '5'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)], [0, 20])
  let game: Game = { ...makeGame('whispers-closed', 'Whispers loop', puzzle.givens, 'imported'), variant: { id: 'whispers' as const, puzzle, solution: fixture.solution } }
  game = enter(game, [20], 'center', 5)
  const changed = enter(game, [0], 'value', 2)
  assert.equal(changed.position.center[20], 0)
  assert.deepEqual(undo(changed).position, game.position)
})
