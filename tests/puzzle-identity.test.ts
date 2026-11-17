import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, makeGame, normalizePuzzleIdentity, puzzleIdentity } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { WINDOKU_REGIONS, type VariantGame } from '../src/sudoku/variants.ts'
import { jigsawLayout, variantSeeds } from '../src/sudoku/variant-generation.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'

function reverseObjectFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectFields(item)]))
}

const puzzle = (extra: Partial<VariantPuzzle>): VariantPuzzle => ({ version: 1, givens: EMPTY, ...extra })
const variants: Pick<VariantGame, 'id' | 'puzzle'>[] = [
  { id: 'killer-cages', puzzle: puzzle({ rules: [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }], coverGrid: false }] }) },
  { id: 'windoku', puzzle: puzzle({ rules: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })) }) },
  { id: 'diagonal', puzzle: puzzle({ rules: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }] }) },
  { id: 'jigsaw', puzzle: puzzle({ regions: jigsawLayout(variantSeeds.jigsaw.easy![0].regions!) }) },
  { id: 'anti-knight', puzzle: puzzle({ rules: [{ type: 'anti-knight' }] }) },
  { id: 'thermometer', puzzle: puzzle({ rules: [{ type: 'thermometer', cells: [0, 1, 2] }] }) },
  { id: 'arrow', puzzle: puzzle({ rules: [{ type: 'arrow', circle: 0, cells: [9, 10] }] }) },
  { id: 'kropki', puzzle: puzzle({ rules: [{ type: 'kropki', consecutive: { pairs: [[0, 1]], negative: false },
    ratioTwo: { pairs: [[9, 10]], negative: false } }] }) },
  { id: 'quadruple', puzzle: puzzle({ rules: [{ type: 'quadruple', topLeft: 21, digits: [2, 2, 6] }] }) },
  { id: 'mixed', puzzle: puzzle({ rules: [{ type: 'diagonal', diagonal: 'main' },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] }] }) },
]

test('object key order cannot create a different identity for the same imported variant', async () => {
  for (const variant of variants) {
    const reversed = reverseObjectFields(variant)
    const imported = await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(reversed)))
    const original = { givens: EMPTY, variant }
    assert.equal(puzzleIdentity(imported), puzzleIdentity(original), variant.id)
    assert.equal(puzzleIdentity(original), `${variant.id}:${JSON.stringify(variant.puzzle)}`, 'established field order stays stable: ' + variant.id)
    assert.equal(normalizePuzzleIdentity(`${variant.id}:${JSON.stringify((reversed as typeof variant).puzzle)}`), puzzleIdentity(original))
    const saved = { ...makeGame('existing', 'Existing puzzle', EMPTY, 'imported'), variant: { ...variant, solution: EMPTY } }
    assert.equal(findImportedPuzzle([saved], imported), saved, 'import lookup shares the normalized identity: ' + variant.id)
  }
})

test('actual givens, rule payloads, and ordered line cells remain distinct', () => {
  const identity = (rules: VariantPuzzle['rules'], givens = EMPTY) => puzzleIdentity({ givens,
    variant: { id: 'arrow', puzzle: { version: 1, givens, rules } } })
  const original = identity([{ type: 'arrow', circle: 0, cells: [9, 10] }])
  assert.notEqual(identity([{ type: 'arrow', circle: 1, cells: [9, 10] }]), original)
  assert.notEqual(identity([{ type: 'arrow', circle: 0, cells: [10, 9] }]), original)
  assert.notEqual(identity([{ type: 'arrow', circle: 0, cells: [9, 10] }], '1' + EMPTY.slice(1)), original)
  const first = { type: 'arrow', circle: 0, cells: [9, 10] } as const
  const second = { type: 'arrow', circle: 2, cells: [11, 12] } as const
  assert.notEqual(identity([first, second]), identity([second, first]), 'rule-array normalization remains deliberately conservative')
})

test('unrecognized historical identities and Classic keys are retained verbatim', () => {
  for (const identity of [EMPTY, 'not-an-identity', 'arrow:broken-json', 'future-format:[1,2]', 'future-format:{"b":2,"a":1}']) {
    assert.equal(normalizePuzzleIdentity(identity), identity)
  }
  assert.equal(puzzleIdentity({ givens: EMPTY }), EMPTY)
})
