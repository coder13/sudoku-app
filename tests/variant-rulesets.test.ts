import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generationRuleset, generationRulesets, isGenerationRulesetId, puzzleGenerationRuleset } from '../src/sudoku/variant-rulesets.ts'
import { NEW_PUZZLE_KEY, readNewPuzzlePreference, saveNewPuzzlePreference } from '../src/sudoku/preferences.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'

test('German and Dutch presets retain their numeric rules while other variants keep no preset', () => {
  assert.deepEqual(generationRulesets('whispers').map(({ id, minDifference }) => [id, minDifference]), [['german', 5], ['dutch', 4]])
  assert.equal(generationRuleset('whispers')?.id, 'german')
  assert.equal(generationRuleset('whispers', 'dutch')?.minDifference, 4)
  assert.equal(generationRuleset('parity', 'dutch'), undefined)
  assert.equal(isGenerationRulesetId('parity', 'dutch'), false)
  assert.equal(isGenerationRulesetId('whispers', 'other'), false)
})

test('saved New Puzzle choices retain a valid style and migrate old or malformed preset fields', () => {
  const storage = new MemoryStorage()
  for (const ruleset of ['german', 'dutch'] as const) {
    storage.setItem(NEW_PUZZLE_KEY, JSON.stringify({ variant: 'whispers', difficulty: 'easy', ruleset }))
    assert.deepEqual(readNewPuzzlePreference(storage), { variant: 'whispers', difficulty: 'medium', ruleset })
  }
  for (const ruleset of [undefined, 'other', 4, {}, null]) {
    storage.setItem(NEW_PUZZLE_KEY, JSON.stringify({ variant: 'whispers', difficulty: 'auto', ruleset }))
    assert.deepEqual(readNewPuzzlePreference(storage), { variant: 'whispers', difficulty: 'auto', ruleset: 'german' })
  }
  storage.setItem(NEW_PUZZLE_KEY, JSON.stringify({ variant: 'parity', difficulty: 'hard', ruleset: 'dutch' }))
  assert.deepEqual(readNewPuzzlePreference(storage), { variant: 'parity', difficulty: 'medium' })
  storage.setItem(NEW_PUZZLE_KEY, '{broken')
  assert.equal(readNewPuzzlePreference(storage), null)
  assert.equal(readNewPuzzlePreference({ getItem() { throw Error('Blocked') } }), null)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    saveNewPuzzlePreference({ variant: 'whispers', difficulty: 'medium', ruleset: 'dutch' })
    assert.deepEqual(readNewPuzzlePreference(), { variant: 'whispers', difficulty: 'medium', ruleset: 'dutch' })
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage') }
})

test('next-puzzle rulesets follow every original line minimum and never mislabel mixed or custom values', () => {
  const puzzle = (gaps: number[]): VariantPuzzle => ({ version: 1, givens: '0'.repeat(81),
    rules: gaps.map(minDifference => ({ type: 'whispers', cells: [0, 10], minDifference })) })
  assert.equal(puzzleGenerationRuleset(puzzle([5, 5])), 'german')
  assert.equal(puzzleGenerationRuleset(puzzle([4, 4])), 'dutch')
  for (const gaps of [[], [4, 5], [3], [6, 6]]) assert.equal(puzzleGenerationRuleset(puzzle(gaps)), undefined)
  assert.equal(puzzleGenerationRuleset(undefined), undefined)
})

import { assertWhispersProof } from './helpers/whispers-proof.ts'
import type { VariantDeduction } from '../src/sudoku/engine.ts'
test('direct Whispers proof checks reject a removed supported digit, false placement and absent neighbor edge', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'whispers', cells: [0, 10], minDifference: 5 }] }
  const proof: VariantDeduction = { technique: 'whispers', evidence: { type: 'constraint', cells: [0, 10], domains: [511, 511], rules: [0] },
    actions: [{ eliminate: { cell: 0, digit: 5 } }] }
  assertWhispersProof(puzzle, proof)
  assert.throws(() => assertWhispersProof(puzzle, { ...proof, actions: [{ eliminate: { cell: 0, digit: 1 } }] }))
  assert.throws(() => assertWhispersProof(puzzle, { ...proof, actions: [{ place: { cell: 0, digit: 1 } }] }))
  assert.throws(() => assertWhispersProof({ ...puzzle, rules: [{ type: 'whispers', cells: [1, 11], minDifference: 5 }] }, proof))
})
