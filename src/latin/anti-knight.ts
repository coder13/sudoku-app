import { isKnightMove } from '../sudoku/anti-knight.ts'
import { candidateCount, cellLabel, type LatinRule } from './engine.ts'

const rulesBySize = new Map<number, readonly LatinRule[]>()

export function latinAntiKnightRules(size: number): readonly LatinRule[] {
  const cached = rulesBySize.get(size)
  if (cached) return cached

  const rules: LatinRule[] = []
  for (let a = 0; a < size ** 2; a++) {
    for (let b = a + 1; b < size ** 2; b++) {
      if (!isKnightMove(a, b, size)) continue
      rules.push({
        kind: 'anti-knight',
        cells: [a, b],
        label: `${cellLabel(a, size)} and ${cellLabel(b, size)} are a knight’s move apart. They need different digits.`,
        support(domains) {
          const left = domains[a], right = domains[b]
          const nextLeft = candidateCount(right) === 1 ? left & ~right : left
          const nextRight = candidateCount(left) === 1 ? right & ~left : right
          return nextLeft && nextRight ? [nextLeft, nextRight] : null
        },
      })
    }
  }
  rulesBySize.set(size, rules)
  return rules
}
