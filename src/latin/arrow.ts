import { cellLabel, type LatinRule } from './engine.ts'

export const arrowTechnique = 'Arrow'
export const arrowRuleNote = 'The digits along each Arrow add up to the digit in its bulb.'

function sumSets(left: number, right: number, allowed: number) {
  let sums = 0
  for (let choices = right; choices; choices &= choices - 1) {
    const total = 31 - Math.clz32(choices & -choices)
    sums |= left << total
  }
  return sums & allowed
}

export function arrowRule(size: number, cells: readonly number[]): LatinRule {
  const [bulb, ...path] = cells
  const allowed = (1 << (size + 1)) - 1
  const location = cellLabel(bulb, size)
  return {
    kind: 'arrow', cells,
    label: `The digits along the Arrow must add up to the digit in its bulb at ${location}.`,
    support(domains) {
      // In the sum masks, bit n represents a sum of n. Bit zero represents the empty path.
      const forward = [1]
      for (const cell of path) {
        const next = sumSets(forward.at(-1)!, domains[cell] << 1, allowed)
        if (!next) return null
        forward.push(next)
      }
      const targets = forward.at(-1)! & (domains[bulb] << 1)
      if (!targets) return null
      const supported = [targets >>> 1]
      // A path digit is supported when the cells before and after it can make up the rest of a target.
      let suffix = 1
      for (let index = path.length - 1; index >= 0; index--) {
        const remaining = sumSets(forward[index], suffix, allowed)
        const digits = domains[path[index]]
        let mask = 0
        for (let choices = digits; choices; choices &= choices - 1) {
          const bit = choices & -choices
          const digit = 32 - Math.clz32(bit)
          if (remaining & (targets >>> digit)) mask |= bit
        }
        supported[index + 1] = mask
        suffix = sumSets(suffix, digits << 1, allowed)
      }
      return supported
    },
  }
}
