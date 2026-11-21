import { cellLabel, type LatinRule } from './engine.ts'

export const pillArrowTechnique = 'Pill Arrow'
export const pillArrowNote = 'Read the two digits in the pill from left to right or top to bottom. The digits along the arrow add up to that number.'

export function pillDigitCells(cells: readonly number[]) {
  const [first, second] = cells
  return first < second ? [first, second] as const : [second, first] as const
}

export function pillArrowRule(size: number, cells: readonly number[]): LatinRule {
  const [tens, ones] = pillDigitCells(cells)
  const shaft = cells.slice(2)
  const digitMask = (1n << BigInt(size)) - 1n
  // Bit n marks sum n. Even the largest pill is bounded by the grid size.
  const allowed = (1n << BigInt(size * 11 + 1)) - 1n
  return {
    kind: 'pill-arrow', cells,
    label: `The digits along the Pill Arrow add up to the two-digit number read from ${cellLabel(tens, size)} to ${cellLabel(ones, size)}.`,
    support(domains) {
      const onesMask = BigInt(domains[ones])
      let targets = 0n
      for (let choices = domains[tens]; choices; choices &= choices - 1) {
        const tensDigit = 32 - Math.clz32(choices & -choices)
        targets |= onesMask << BigInt(tensDigit * 10 + 1)
      }
      if (!targets) return null
      const forward = [1n]
      for (const cell of shaft) {
        const sums = forward[forward.length - 1]
        let next = 0n
        for (let choices = domains[cell]; choices; choices &= choices - 1) {
          next |= sums << BigInt(32 - Math.clz32(choices & -choices))
        }
        next &= allowed
        if (!next) return null
        forward.push(next)
      }
      targets &= forward[shaft.length]
      if (!targets) return null

      let supportedTens = 0, supportedOnes = 0
      for (let digit = 1; digit <= size; digit++) {
        const mask = Number(targets >> BigInt(digit * 10 + 1) & digitMask)
        if (!mask) continue
        supportedTens |= 1 << (digit - 1)
        supportedOnes |= mask
      }
      const supported = cells[0] === tens ? [supportedTens, supportedOnes] : [supportedOnes, supportedTens]

      // Work backward from allowed totals. A digit is possible when a sum from
      // the prefix can reach an allowed total with that digit and the suffix.
      let reachable = targets
      for (let index = shaft.length - 1; index >= 0; index--) {
        let next = 0n, mask = 0
        for (let choices = domains[shaft[index]]; choices; choices &= choices - 1) {
          const bit = choices & -choices
          const sums = forward[index] & (reachable >> BigInt(32 - Math.clz32(bit)))
          if (!sums) continue
          mask |= bit
          next |= sums
        }
        supported[index + 2] = mask
        reachable = next
      }
      return supported
    },
  }
}
