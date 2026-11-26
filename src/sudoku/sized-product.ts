import { positionDigit } from './digit-symbols.ts'
import type { SizedConstraintRule, SizedDigitCountRule, SizedProductCageRule, VariantRule } from './engine.ts'

type State = { allowed: number[]; conflicts: Set<number> }
const fullMask = (size: number) => (1 << size) - 1

function productSupport(cells: readonly number[], target: number, domains: readonly number[], size: number, valueOffset: number) {
  if (target === 0) {
    if (valueOffset !== 1 || !cells.some(cell => domains[cell] & 1)) return undefined
    return cells.map((cell, index) => cells.some((other, otherIndex) => otherIndex !== index && domains[other] & 1)
      ? domains[cell]
      : domains[cell] & 1)
  }
  const suffix = Array.from({ length: cells.length + 1 }, () => new Set<number>())
  suffix[cells.length].add(1)
  for (let index = cells.length - 1; index >= 0; index--) {
    const domain = domains[cells[index]]
    for (let rank = 1; rank <= size; rank++) {
      const digit = rank - valueOffset
      if (digit < 1 || !(domain & (1 << (rank - 1))) || target % digit !== 0) continue
      for (const rest of suffix[index + 1]) {
        const value = digit * rest
        if (value <= target && target % value === 0) suffix[index].add(value)
      }
    }
  }
  if (!suffix[0].has(target)) return undefined

  const support = Array<number>(cells.length).fill(0)
  let prefix = new Set([1])
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    const domain = domains[cell]
    for (let rank = 1; rank <= size; rank++) {
      const digit = rank - valueOffset
      const bit = 1 << (rank - 1)
      if (digit < 1 || !(domain & bit) || target % digit !== 0) continue
      if ([...prefix].some(before => {
        const product = before * digit
        return product <= target && target % product === 0 && suffix[index + 1].has(target / product)
      })) support[index] |= bit
    }
    const next = new Set<number>()
    for (const before of prefix) for (let rank = 1; rank <= size; rank++) {
      const digit = rank - valueOffset
      if (digit < 1 || !(domain & (1 << (rank - 1)))) continue
      const product = before * digit
      if (product <= target && target % product === 0) next.add(product)
    }
    prefix = next
  }
  return support
}

function digitCountSupport(rule: SizedDigitCountRule, domains: readonly number[]) {
  const support = Array<number>(rule.cells.length).fill(0)
  const targetBit = 1 << (rule.digit - 1)
  for (let index = 0; index < rule.cells.length; index++) {
    const cell = rule.cells[index]
    for (let digit = 1; digit <= 16; digit++) {
      const bit = 1 << (digit - 1)
      if (!(domains[cell] & bit)) continue
      const fixed = Number(digit === rule.digit) + rule.cells.reduce((count, other, otherIndex) =>
        count + Number(otherIndex !== index && domains[other] === targetBit), 0)
      const possible = Number(digit === rule.digit) + rule.cells.reduce((count, other, otherIndex) =>
        count + Number(otherIndex !== index && Boolean(domains[other] & targetBit)), 0)
      if (possible >= rule.minimum && fixed <= (rule.maximum ?? rule.cells.length)) support[index] |= bit
    }
  }
  return support
}

export function sizedProductState(rules: readonly (SizedConstraintRule | VariantRule)[] | undefined, values: string, size: number, valueOffset = 0): State | undefined {
  const productRules = rules?.filter((rule): rule is SizedProductCageRule => rule.type === 'product-cage') ?? []
  const countRules = rules?.filter((rule): rule is SizedDigitCountRule => rule.type === 'digit-count') ?? []
  if (!productRules.length && !countRules.length) return
  const allowed = Array<number>(values.length).fill(fullMask(size))
  const conflicts = new Set<number>()
  const domains = Array.from(values, (value, cell) => {
    if (value === '0') return fullMask(size)
    const digit = positionDigit(value)
    return digit >= 1 && digit <= size ? 1 << (digit - 1) : 0
  })
  for (const rule of productRules) {
    const support = productSupport(rule.cells, rule.product, domains, size, valueOffset)
    if (!support) {
      for (const cell of rule.cells) if (values[cell] !== '0') conflicts.add(cell)
      for (const cell of rule.cells) allowed[cell] = 0
    } else {
      rule.cells.forEach((cell, index) => { allowed[cell] &= support[index] })
    }
  }
  for (const rule of countRules) {
    const support = digitCountSupport(rule, domains)
    if (support.some(mask => mask === 0)) {
      for (const cell of rule.cells) if (values[cell] !== '0') conflicts.add(cell)
      for (const cell of rule.cells) allowed[cell] = 0
    } else {
      rule.cells.forEach((cell, index) => { allowed[cell] &= support[index] })
    }
  }
  return { allowed, conflicts }
}
