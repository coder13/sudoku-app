import type { VariantPuzzle } from './engine.ts'
import { regionIndex } from './region-sum.ts'
import { isQuadrupleRule, quadrupleCells } from './variants.ts'

const ALL_DIGITS = 511
const digitMask = (digit: number) => 1 << (digit - 1)

function thermometerSupport(cells: readonly number[], values: string) {
  const low: number[] = []
  let minimum = 1
  for (const cell of cells) {
    const placed = Number(values[cell])
    if (placed && placed < minimum || minimum > 9) return
    low.push(placed || minimum)
    minimum = (placed || minimum) + 1
  }
  const masks: number[] = []
  let maximum = 9
  for (let i = cells.length - 1; i >= 0; i--) {
    const placed = Number(values[cells[i]])
    const high = placed || maximum
    if (high > maximum || low[i] > high) return
    masks[i] = (1 << high) - digitMask(low[i])
    maximum = high - 1
  }
  return masks
}

const quadrupleSums = (() => {
  const assignments: number[][] = []
  for (let a = 1; a <= 7; a++) for (let b = 1; b <= 8 - a; b++) for (let c = 1; c <= 9 - a - b; c++) {
    for (let cell = 0; cell < 4; cell++) {
      const digits = [a, b, c]
      digits.splice(cell, 0, a + b + c)
      assignments.push(digits)
    }
  }
  return assignments
})()

/** Check the printed multiplicities and the primary houses shared by the four cells. */
function quadrupleSupport(cells: readonly number[], required: readonly number[], values: string, regions: VariantPuzzle['regions'], isSum: boolean) {
  const placed = cells.map(cell => Number(values[cell]))
  const region = cells.map(cell => regionIndex(cell, regions))
  const peers = cells.map((cell, i) => cells.flatMap((other, j) => i !== j && (
    Math.floor(cell / 9) === Math.floor(other / 9) || cell % 9 === other % 9 || region[i] >= 0 && region[i] === region[j]
  ) ? [j] : []))
  const support = [0, 0, 0, 0]

  if (placed.some((digit, i) => digit && peers[i].some(other => placed[other] === digit))) return

  if (isSum) {
    for (const digits of quadrupleSums) {
      if (placed.some((digit, i) => digit && digit !== digits[i]) ||
        digits.some((digit, i) => peers[i].some(other => digits[other] === digit))) continue
      const remaining = [...digits]
      if (!required.every(digit => {
        const index = remaining.indexOf(digit)
        if (index < 0) return false
        remaining.splice(index, 1)
        return true
      })) continue
      for (const [i, digit] of digits.entries()) support[i] |= digitMask(digit)
    }
    return support[0] ? support : undefined
  }

  function assign(index: number, used: number) {
    if (index === required.length) {
      // Any unassigned digit can differ from the other three cells. After
      // fixing that digit, each remaining free cell has at most three peers.
      for (let i = 0; i < 4; i++) {
        const digit = placed[i]
        support[i] |= digit ? digitMask(digit) : ALL_DIGITS & ~peers[i].reduce((mask, other) =>
          mask | (placed[other] ? digitMask(placed[other]) : 0), 0)
      }
      return
    }
    const digit = required[index]
    for (let i = 0; i < 4; i++) {
      const previous = placed[i]
      if (used & 1 << i || previous && previous !== digit || peers[i].some(other => placed[other] === digit)) continue
      placed[i] = digit
      assign(index + 1, used | 1 << i)
      placed[i] = previous
    }
  }
  assign(0, 0)
  return support[0] ? support : undefined
}

/** Local restrictions from placed digits. Other rules still contribute their own checks. */
export function variantPlacedRuleState(puzzle: VariantPuzzle | undefined, values: string) {
  const rules = puzzle?.rules?.filter(rule => rule.type === 'parity' || rule.type === 'thermometer' || isQuadrupleRule(rule))
  if (!rules?.length) return
  const allowed = Array<number>(81).fill(ALL_DIGITS)
  const conflicts = new Set<number>()
  for (const rule of rules) {
    if (rule.type === 'parity') {
      const parity = rule.parity === 'odd' ? 0b101010101 : 0b010101010
      for (const cell of rule.cells) {
        if (values[cell] === '0') allowed[cell] &= parity
        else if (!(parity & digitMask(Number(values[cell])))) conflicts.add(cell)
      }
      continue
    }
    const cells = rule.type === 'thermometer' ? rule.cells : quadrupleCells(rule.topLeft)
    const support = rule.type === 'thermometer'
      ? thermometerSupport(cells, values) : quadrupleSupport(cells, rule.digits, values, puzzle?.regions, rule.type === 'quadruple-sum')
    for (const [i, cell] of cells.entries()) {
      if (!support && values[cell] !== '0') conflicts.add(cell)
      else if (support && values[cell] === '0') allowed[cell] &= support[i]
    }
  }
  return { allowed, conflicts }
}
