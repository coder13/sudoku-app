import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { renbanKey, renbanMappings } from './helpers/renban-key.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-generation.json', import.meta.url), 'utf8'))

test('literal digit-set enumeration preserves every complete source interval, including long-line permutations', () => {
  for (const source of fixture.sources) {
    const mappings = renbanMappings(source.lines.map((cells: number[]) => cells.length))
    assert.equal(mappings.length, source.id === 'Jh4o' ? 240 : 2)
    for (const mapping of mappings) for (const cells of source.lines) {
      for (let start = 1; start + cells.length - 1 <= 9; start++) {
        const image = Array.from({ length: cells.length }, (_, i) => mapping[start + i]).sort((a, b) => a - b)
        assert.equal(new Set(image).size, cells.length)
        assert.equal(image.at(-1)! - image[0], cells.length - 1)
      }
    }
  }
})

test('independent Renban identity ignores set order while rejecting mixed rules and joined sets', () => {
  const puzzle: VariantPuzzle = fixture.example.puzzle
  assert.equal(renbanKey(puzzle), renbanKey({ ...puzzle,
    rules: [...puzzle.rules!].reverse().map(rule => rule.type === 'renban' ? { ...rule, cells: [...rule.cells].reverse() } : rule) }))
  assert.throws(() => renbanKey({ ...puzzle, rules: [...puzzle.rules!, { type: 'parity', cells: [0], parity: 'odd' }] }))
  const separate: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'renban', cells: [0, 13, 21] }, { type: 'renban', cells: [21, 33, 47] },
  ] }
  assert.notEqual(renbanKey(separate), renbanKey({ ...separate, rules: [{ type: 'renban', cells: [0, 13, 21, 33, 47] }] }))
})
