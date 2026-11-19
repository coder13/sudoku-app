import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { transformedBoard } from './transformed-board.ts'
import { groupPermutations } from './entropy-key.ts'

/** Derive different-group relations from literal triples, independently of native path offsets. */
export function groupLineEdges(puzzle: VariantPuzzle, family: 'entropic' | 'modular'): number[][] {
  assert.ok(puzzle.rules?.length && puzzle.rules.every(rule => rule.type === family))
  const relations = new Map<string, number[]>()
  function pair(a: number, b: number) { const cells = [Math.min(a, b), Math.max(a, b)]; relations.set(cells.join(','), cells) }
  for (const rule of puzzle.rules) {
    if (rule.type !== 'entropic' && rule.type !== 'modular') throw Error('Expected pure group-line paths')
    if (rule.cells.length === 2) pair(rule.cells[0], rule.cells[1])
    for (let start = 0; start + 2 < rule.cells.length; start++) {
      const [a, b, c] = rule.cells.slice(start, start + 3)
      pair(a, b); pair(a, c); pair(b, c)
    }
  }
  return [...relations.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Enumerate geometry and all six group-name assignments; no mixed numeric rules are accepted. */
export function groupLineKey(puzzle: VariantPuzzle, family: 'entropic' | 'modular', groupOf: (digit: number) => number): string {
  assert.ok(!puzzle.regions || puzzle.regions.type === 'boxes')
  const edges = groupLineEdges(puzzle, family), labels = Array.from({ length: 81 }, (_, cell) => String.fromCharCode(0x1000 + cell)).join('')
  const keys: string[] = []
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = transformedBoard(labels, symmetry), board = transformedBoard(puzzle.givens, symmetry)
    const relations = edges.map(edge => edge.map(cell => transformed.indexOf(labels[cell])).sort((a, b) => a - b)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const groups of groupPermutations) {
      const members = Array.from({ length: 3 }, () => new Map<string, number>())
      const given = [...board].map(digit => {
        if (digit === '0') return digit
        const group = groupOf(Number(digit)), seen = members[group]
        if (!seen.has(digit)) seen.set(digit, seen.size + 1)
        return String(groups[group] * 3 + seen.get(digit)!)
      }).join('')
      keys.push(JSON.stringify([given, relations]))
    }
  }
  return keys.sort()[0]
}
