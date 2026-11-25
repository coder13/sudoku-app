import type { SizedConstraintRule, SizedNonogramRule } from './engine.ts'

export const nonogramCells = ({ axis, index }: SizedNonogramRule, size: number) =>
  Array.from({ length: size }, (_, offset) => axis === 'row' ? index * size + offset : offset * size + index)

export const nonogramDescription = ({ axis, index, digits, runs }: SizedNonogramRule) =>
  `Nonogram clue for ${axis} ${index + 1}. The digits ${digits.join(', ')} form runs of ${runs.join(', ')} in order.`

export function validNonogramRule(rule: SizedNonogramRule, size: number) {
  const { axis, index, digits, runs } = rule
  return Object.keys(rule).length === 5 && (axis === 'row' || axis === 'column') &&
    Number.isInteger(index) && index >= 0 && index < size &&
    Array.isArray(digits) && digits.length > 0 && digits.length <= size &&
    digits.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size) && new Set(digits).size === digits.length &&
    Array.isArray(runs) && runs.length > 0 && runs.length <= size &&
    runs.every(run => Number.isInteger(run) && run > 0 && run <= size) &&
    runs.reduce((total, run) => total + run, 0) === digits.length && digits.length + runs.length - 1 <= size
}

const placements = new WeakMap<SizedNonogramRule, { size: number; masks: number[] }>()

function runPlacements(rule: SizedNonogramRule, size: number) {
  const cached = placements.get(rule)
  if (cached?.size === size) return cached.masks
  const masks: number[] = []
  const add = (index: number, start: number, marked: number) => {
    if (index === rule.runs.length) {
      masks.push(marked)
      return
    }
    const run = rule.runs[index]
    const room = rule.runs.slice(index).reduce((sum, length) => sum + length + 1, -1)
    for (let at = start; at <= size - room; at++) {
      add(index + 1, at + run + 1, marked | ((1 << run) - 1) << at)
    }
  }
  add(0, 0, 0)
  placements.set(rule, { size, masks })
  return masks
}

/** Apply a run clue to the digit groups that still fit around the placed digits. */
export function nonogramState(rules: readonly SizedConstraintRule[] | undefined, values: string, size: number) {
  const clues = rules?.filter(rule => rule.type === 'nonogram')
  if (!clues?.length) return
  const full = (1 << size) - 1
  const allowed = Array<number>(values.length).fill(full)
  const conflicts = new Set<number>()
  for (const rule of clues) {
    const cells = nonogramCells(rule, size)
    const selected = rule.digits.reduce((mask, digit) => mask | 1 << (digit - 1), 0)
    let marks = 0, gaps = 0
    cells.forEach((cell, index) => {
      const digit = Number(values[cell])
      if (digit > 0) {
        if (selected & 1 << (digit - 1)) marks |= 1 << index
        else gaps |= 1 << index
      }
    })
    let canMark = 0, canGap = 0
    for (const placement of runPlacements(rule, size)) {
      if ((placement & marks) === marks && !(placement & gaps)) {
        canMark |= placement
        canGap |= full & ~placement
      }
    }
    if (!(canMark | canGap)) {
      for (const cell of cells) if (values[cell] !== '0') conflicts.add(cell)
      continue
    }
    cells.forEach((cell, index) => {
      if (values[cell] === '0') {
        allowed[cell] &= (canMark & 1 << index ? selected : 0) | (canGap & 1 << index ? full & ~selected : 0)
      }
    })
  }
  return { allowed, conflicts }
}
