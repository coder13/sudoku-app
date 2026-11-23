import { bit, cellLabel, type LatinRule } from './engine.ts'

export const betweenTechnique = 'Between Line'
export const betweenRuleNote = 'Each interior digit on a Between Line is strictly between the digits in its two end circles.'

export const lockoutTechnique = 'Lockout Line'
export const lockoutMinimumGap = 4
export const lockoutRuleNote =
  'The diamonds at the ends of each Lockout Line differ by at least 4. Every digit between the diamonds is below both end digits or above both end digits.'

export function endpointLineRule(size: number, cells: readonly number[], kind: 'between' | 'lockout'): LatinRule {
  const between = kind === 'between'
  const minimumGap = between ? 2 : lockoutMinimumGap
  const first = cells[0], last = cells.at(-1)!
  const interior = cells.slice(1, -1)
  const all = (1 << size) - 1
  const pairs: { low: number; high: number; interiorMask: number }[] = []
  for (let low = 1; low <= size - minimumGap; low++) {
    for (let high = low + minimumGap; high <= size; high++) {
      const inside = (bit(high) - 1) & ~((1 << low) - 1)
      const interiorMask = between ? inside : all & ~(inside | bit(low) | bit(high))
      if (interiorMask || !interior.length) pairs.push({ low: bit(low), high: bit(high), interiorMask })
    }
  }

  const a = cellLabel(first, size), b = cellLabel(last, size)
  return {
    kind, cells,
    label: between
      ? `Each interior digit on the Between Line from ${a} to ${b} is strictly between the digits in the two end circles.`
      : `The Lockout Line diamonds at ${a} and ${b} differ by at least ${minimumGap}. Any digit between them is below both end digits or above both end digits.`,
    support(domains) {
      const firstDomain = domains[first], lastDomain = domains[last]
      let firstSupport = 0, lastSupport = 0, interiorSupport = 0
      for (const { low, high, interiorMask } of pairs) {
        const increasing = (firstDomain & low) && (lastDomain & high)
        const decreasing = (firstDomain & high) && (lastDomain & low)
        if (!(increasing || decreasing) || interior.some(cell => !(domains[cell] & interiorMask))) continue
        if (increasing) {
          firstSupport |= low
          lastSupport |= high
        }
        if (decreasing) {
          firstSupport |= high
          lastSupport |= low
        }
        interiorSupport |= interiorMask
      }
      return firstSupport ? [firstSupport, ...interior.map(cell => domains[cell] & interiorSupport), lastSupport] : null
    },
  }
}
