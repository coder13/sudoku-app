import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { entropicEdges, entropicKey } from './helpers/entropic-key.ts'
import { entropyRenamings, relabelEntropy } from './helpers/entropy-key.ts'
const { puzzle } = JSON.parse(readFileSync(new URL('./fixtures/entropic-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle }

test('Entropic window relations agree with literal three-group assignments and keep touching paths independent', () => {
  const line: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'entropic', cells: [0, 10, 20, 30, 40] }] }
  const separate: VariantPuzzle = { ...line, rules: [{ type: 'entropic', cells: [0, 10, 20] }, { type: 'entropic', cells: [20, 30, 40] }] }
  const edges = entropicEdges(line), independent = entropicEdges(separate)
  let joinedCount = 0, separateCount = 0
  for (let code = 0; code < 243; code++) {
    const groups = Array.from({ length: 5 }, (_, i) => Math.floor(code / 3 ** i) % 3)
    const triple = (start: number) => new Set(groups.slice(start, start + 3)).size === 3
    const joined = triple(0) && triple(1) && triple(2), apart = triple(0) && triple(2)
    assert.equal(edges.every(([a, b]) => groups[a / 10] !== groups[b / 10]), joined)
    assert.equal(independent.every(([a, b]) => groups[a / 10] !== groups[b / 10]), apart)
    if (joined) joinedCount++; if (apart) separateCount++
  }
  assert.deepEqual([joinedCount, separateCount], [6, 12])
  assert.notEqual(entropicKey(line), entropicKey(separate))
})

test('pure Entropic identity retains all 1296 permitted digit bijections and refuses numeric companions', () => {
  const expected = entropicKey(puzzle)
  for (const mapping of entropyRenamings()) assert.equal(entropicKey({ ...puzzle, givens: relabelEntropy(puzzle.givens, mapping) }), expected)
  assert.throws(() => entropicKey({ ...puzzle, rules: [...puzzle.rules!, { type: 'inequality', less: 0, greater: 80 }] }))
})
