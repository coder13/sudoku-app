import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { modularEdges, modularKey } from './helpers/modular-key.ts'
import { groupPermutations, relabelEntropy } from './helpers/entropy-key.ts'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/modular-generation.json', import.meta.url), 'utf8'))
const entropy = JSON.parse(readFileSync(new URL('./fixtures/entropic-generation.json', import.meta.url), 'utf8'))

test('constructed Modular templates keep every pure-source path and preserve the literal relation under the digit bijection', () => {
  assert.deepEqual([...fixture.mapping].sort((a: number, b: number) => a - b), Array.from({ length: 10 }, (_, digit) => digit))
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
    const before = new Set([a, b, c].map(digit => Math.floor((digit - 1) / 3))).size === 3
    const after = new Set([a, b, c].map(digit => fixture.mapping[digit] % 3)).size === 3
    assert.equal(after, before)
  }
  for (const source of fixture.sources) {
    const original = entropy.sources.find((item: { id: string }) => item.id + '-modular-construction' === source.id)
    assert.ok(original)
    assert.deepEqual(source.lines, original.lines)
    assert.deepEqual(source.geometrySource, original.source)
    assert.equal(source.completionTemplate, [...original.completionTemplate as string].map(digit => fixture.mapping[Number(digit)]).join(''))
  }
})

test('Modular identity covers every permitted remainder renaming, keeps independent paths and rejects numeric companions', () => {
  const source = fixture.sources[0]
  const puzzle: VariantPuzzle = { version: 1, givens: source.completionTemplate, rules: source.lines.map((cells: number[]) => ({ type: 'modular', cells })) }
  const expected = modularKey(puzzle), classes = [[1, 4, 7], [2, 5, 8], [3, 6, 9]]
  let checked = 0
  for (const groups of groupPermutations) for (const one of groupPermutations) for (const two of groupPermutations) for (const zero of groupPermutations) {
    const members = [one, two, zero], mapping = Array(10).fill(0)
    classes.forEach((digits, group) => digits.forEach((digit, member) => { mapping[digit] = classes[groups[group]][members[group][member]] }))
    assert.equal(modularKey({ ...puzzle, givens: relabelEntropy(puzzle.givens, mapping) }), expected)
    checked++
  }
  assert.equal(checked, 1296)
  assert.throws(() => modularKey({ ...puzzle, rules: [...puzzle.rules!, { type: 'inequality', less: 0, greater: 80 }] }))
  const line: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'modular', cells: [0, 10, 20, 30, 40] }] }
  const separate: VariantPuzzle = { ...line, rules: [{ type: 'modular', cells: [0, 10, 20] }, { type: 'modular', cells: [20, 30, 40] }] }
  const joined = modularEdges(line), independent = modularEdges(separate)
  for (let code = 0; code < 243; code++) {
    const groups = Array.from({ length: 5 }, (_, i) => Math.floor(code / 3 ** i) % 3)
    const triple = (start: number) => new Set(groups.slice(start, start + 3)).size === 3
    assert.equal(joined.every(([a, b]) => groups[a / 10] !== groups[b / 10]), triple(0) && triple(1) && triple(2))
    assert.equal(independent.every(([a, b]) => groups[a / 10] !== groups[b / 10]), triple(0) && triple(2))
  }
  assert.notEqual(modularKey(line), modularKey(separate))
})
