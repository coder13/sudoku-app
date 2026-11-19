import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { transformedBoard } from './transformed-board.ts'

/** Read literal equality edges into connected sets without the engine's key implementation. */
export function palindromeGroups(puzzle: VariantPuzzle): number[][] {
  const neighbors = Array.from({ length: 81 }, () => new Set<number>())
  function connect(a: number, b: number) { if (a !== b) { neighbors[a].add(b); neighbors[b].add(a) } }
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'palindrome') for (let i = 0; i < Math.floor(rule.cells.length / 2); i++) connect(rule.cells[i], rule.cells[rule.cells.length - 1 - i])
    else if (rule.type === 'clone') for (const group of rule.groups) for (const cell of group.slice(1)) connect(group[0], cell)
    else throw Error('This independent key only models matching-digit puzzles')
  }
  const visited = new Set<number>(), groups: number[][] = []
  for (let cell = 0; cell < 81; cell++) {
    if (!neighbors[cell].size || visited.has(cell)) continue
    const pending = [cell], members: number[] = []
    while (pending.length) {
      const next = pending.pop()!
      if (visited.has(next)) continue
      visited.add(next); members.push(next); pending.push(...neighbors[next])
    }
    groups.push(members.sort((a, b) => a - b))
  }
  return groups
}

/** Equality-only puzzle identity under independent matrix transforms and digit renaming. */
export function palindromeKey(puzzle: VariantPuzzle): string {
  assert.ok(!puzzle.regions || puzzle.regions.type === 'boxes')
  const groups = palindromeGroups(puzzle)
  const labels = Array.from({ length: 81 }, (_, cell) => String.fromCharCode(0x1000 + cell)).join('')
  return Array.from({ length: 8 }, (_, symmetry) => {
    const transformed = transformedBoard(labels, symmetry)
    const renamed = new Map<string, number>()
    const givens = [...transformedBoard(puzzle.givens, symmetry)].map(digit => {
      if (digit === '0') return digit
      if (!renamed.has(digit)) renamed.set(digit, renamed.size + 1)
      return String(renamed.get(digit))
    }).join('')
    const sets = groups.map(group => group.map(cell => transformed.indexOf(labels[cell])).sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
    return JSON.stringify([givens, sets])
  }).sort()[0]
}
