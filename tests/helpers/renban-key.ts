import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { reflectVariant } from '../../src/sudoku/variant-generation.ts'

const mappingsByLengths = new Map<string, readonly number[][]>()

/** Infer symmetries from literal images of every permitted consecutive digit set. */
export function renbanMappings(lengths: readonly number[]): readonly number[][] {
  const sizes = [...new Set(lengths)].sort((a, b) => a - b)
  const key = sizes.join(',')
  const cached = mappingsByLengths.get(key)
  if (cached) return cached
  assert.ok(sizes.every(size => size >= 1 && size <= 9))
  // A fully unrestricted S9 key needs a different enumeration strategy.
  assert.ok(sizes.some(size => size > 1 && size < 9))
  const accepted: number[][] = [], mapping = Array.from({ length: 9 }, (_, i) => i + 1)
  function visit(index: number) {
    if (index === 9) {
      if (sizes.every(size => Array.from({ length: 10 - size }, (_, first) => {
        const image = mapping.slice(first, first + size).sort((a, b) => a - b)
        return image.every((digit, index) => index === 0 || digit === image[index - 1] + 1)
      }).every(Boolean))) accepted.push([0, ...mapping])
      return
    }
    for (let next = index; next < 9; next++) {
      ;[mapping[index], mapping[next]] = [mapping[next], mapping[index]]
      visit(index + 1)
      ;[mapping[index], mapping[next]] = [mapping[next], mapping[index]]
    }
  }
  visit(0)
  mappingsByLengths.set(key, accepted)
  return accepted
}

/** Independent test identity for complete pure Renban puzzles, without native key calls. */
export function renbanKey(puzzle: VariantPuzzle) {
  const rules = puzzle.rules ?? []
  assert.ok(rules.length > 0 && rules.every(rule => rule.type === 'renban'), 'Use only complete pure Renban controls')
  const lengths = rules.flatMap(rule => rule.type === 'renban' ? [rule.cells.length] : [])
  const mappings = renbanMappings(lengths)
  let best: string | undefined
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const copy = reflectVariant(puzzle, symmetry)
    const sets = [...new Set(copy.rules!.flatMap(rule => {
      assert.equal(rule.type, 'renban')
      if (rule.type !== 'renban') return []
      assert.equal(new Set(rule.cells).size, rule.cells.length)
      return rule.cells.length === 1 ? [] : [JSON.stringify([...rule.cells].sort((a, b) => a - b))]
    }))].sort()
    for (const mapping of mappings) {
      const givens = [...copy.givens].map(digit => mapping[Number(digit)]).join('')
      const candidate = JSON.stringify([givens, copy.regions ?? { type: 'boxes' }, sets])
      if (best === undefined || candidate < best) best = candidate
    }
  }
  return best!
}
