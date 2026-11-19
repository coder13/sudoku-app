import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { reflectVariant } from '../../src/sudoku/variant-generation.ts'

/** Independent identity for pure comparison controls using per-cell graph traversal. */
export function comparisonKey(puzzle: VariantPuzzle) {
  assert.ok(!puzzle.regions || puzzle.regions.type === 'boxes', 'Use standard-box comparison controls')
  assert.ok(puzzle.rules?.length && puzzle.rules.every(rule => rule.type === 'inequality' || rule.type === 'thermometer'),
    'Use complete pure comparison controls')
  let best: string | undefined
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const copy = reflectVariant(puzzle, symmetry), next = Array.from({ length: 81 }, () => new Set<number>())
    for (const rule of copy.rules!) {
      if (rule.type === 'inequality') next[rule.less].add(rule.greater)
      else if (rule.type === 'thermometer') rule.cells.slice(1).forEach((cell, index) => next[rule.cells[index]].add(cell))
    }
    const relations: [number, number][] = []
    for (let from = 0; from < 81; from++) {
      const visited = new Set<number>(), pending = [...next[from]]
      while (pending.length) {
        const to = pending.pop()!
        if (visited.has(to)) continue
        assert.notEqual(to, from, 'A strict comparison cycle has no valid assignment')
        visited.add(to); pending.push(...next[to])
      }
      for (const to of visited) relations.push([from, to])
    }
    assert.ok(relations.length)
    for (const reverse of [false, true]) {
      const givens = reverse ? [...copy.givens].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join('') : copy.givens
      const edges = relations.map(([a, b]) => reverse ? [b, a] : [a, b]).sort(([a, b], [c, d]) => a - c || b - d)
      const key = JSON.stringify([givens, edges])
      if (best === undefined || key < best) best = key
    }
  }
  return best!
}
