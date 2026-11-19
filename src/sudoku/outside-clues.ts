import type { VariantRule } from './engine.ts'

export type OutsideRule = Extract<VariantRule, { type: 'sandwich' | 'x-sum' }>
export type OutsideSide = 'top' | 'right' | 'bottom' | 'left'
const SIDES = { south: 'top', west: 'right', north: 'bottom', east: 'left' } as const

/** A full row or column, in the order seen from its printed outside clue. */
export function validOutsideRay(cells: readonly number[], direction: string) {
  if (!Array.isArray(cells) || cells.length !== 9) return false
  const first = cells[0]
  if (!Number.isInteger(first) || first < 0 || first >= 81) return false
  const step = direction === 'south' && first < 9 ? 9 : direction === 'north' && first >= 72 ? -9
    : direction === 'east' && first % 9 === 0 ? 1 : direction === 'west' && first % 9 === 8 ? -1 : 0
  return step !== 0 && cells.every((cell, index) => cell === first + index * step)
}

export function outsideClueLabel(rule: OutsideRule) {
  const side = SIDES[rule.direction], first = rule.cells[0]
  return `Sandwich ${rule.sum}, ${side} of ${side === 'top' || side === 'bottom' ? 'column ' + (first % 9 + 1) : 'row ' + (Math.floor(first / 9) + 1)}: digits strictly between 1 and 9 sum to ${rule.sum}; 1 and 9 are excluded.`
}

/** Keep repeated edge clues in separate lanes without moving grid coordinates. */
export function outsideClueLayout(rules?: readonly VariantRule[]) {
  const sides = { top: [], right: [], bottom: [], left: [] } as Record<OutsideSide, { rule: OutsideRule; index: number; lane: number }[]>
  const depths = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const rule of rules ?? []) {
    if (rule.type !== 'sandwich') continue
    const side = SIDES[rule.direction]
    const index = side === 'top' || side === 'bottom' ? rule.cells[0] % 9 : Math.floor(rule.cells[0] / 9)
    const lane = sides[side].filter(clue => clue.index === index).length
    sides[side].push({ rule, index, lane })
    depths[side] = Math.max(depths[side], (lane + 1) * .7)
  }
  return { sides, depths }
}
