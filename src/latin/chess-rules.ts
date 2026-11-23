import { isKingCornerMove } from '../sudoku/anti-king.ts'
import { isKnightMove } from '../sudoku/anti-knight.ts'
import { candidateCount, cellLabel, type LatinRule } from './engine.ts'

const knightRulesBySize = new Map<number, readonly LatinRule[]>()
const kingRulesBySize = new Map<number, readonly LatinRule[]>()

export function latinAntiKnightRules(size: number): readonly LatinRule[] {
  return chessRules(size, 'anti-knight', knightRulesBySize, isKnightMove, 'are a knight’s move apart')
}

export function latinAntiKingRules(size: number): readonly LatinRule[] {
  return chessRules(size, 'anti-king', kingRulesBySize, isKingCornerMove, 'touch at a corner')
}

function chessRules(
  size: number, kind: 'anti-knight' | 'anti-king', rulesBySize: Map<number, readonly LatinRule[]>,
  isMove: (a: number, b: number, size: number) => boolean, relation: string,
): readonly LatinRule[] {
  const cached = rulesBySize.get(size)
  if (cached) return cached

  const rules: LatinRule[] = []
  for (let a = 0; a < size ** 2; a++) {
    for (let b = a + 1; b < size ** 2; b++) {
      if (!isMove(a, b, size)) continue
      rules.push({
        kind,
        cells: [a, b],
        label: `${cellLabel(a, size)} and ${cellLabel(b, size)} ${relation}. They need different digits.`,
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
