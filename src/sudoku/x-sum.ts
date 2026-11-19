import type { VariantPuzzle } from './engine.ts'

// Nine distinct row digits have only 512 subsets, shared by every clue.
const subsets: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []))
for (let mask = 0; mask < 512; mask++) {
  let size = 0,
    sum = 0
  for (let digit = 1; digit <= 9; digit++)
    if (mask & (1 << (digit - 1))) {
      size++
      sum += digit
    }
  subsets[size][sum].push(mask)
}

/** Exact row support from placed digits and X-Sums, without using pencil marks as premises. */
export function xSumState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.flatMap((rule) => (rule.type === 'x-sum' ? [rule] : []))
  if (!clues?.length) return
  const allowed = Array<number>(81).fill(511),
    conflicts = new Set<number>()
  for (const clue of clues) {
    const digits = clue.cells.map((cell) => Number(values[cell])),
      supported = Array<number>(9).fill(0)
    let used = 0,
      duplicate = false
    for (const digit of digits)
      if (digit) {
        duplicate ||= Boolean(used & (1 << (digit - 1)))
        used |= 1 << (digit - 1)
      }
    if (!duplicate)
      for (let length = 1; length <= 9; length++) {
        const first = 1 << (length - 1)
        if (digits[0] ? digits[0] !== length : used & first) continue
        let size = 0,
          sum = length
        for (let i = 1; i < length; i++) {
          if (digits[i]) sum += digits[i]
          else size++
        }
        const remaining = 511 & ~used & ~first
        let inside = 0,
          outside = 0,
          possible = false
        for (const mask of subsets[size][clue.sum - sum] ?? [])
          if ((mask & remaining) === mask) {
            possible = true
            inside |= mask
            outside |= remaining & ~mask
          }
        if (!possible) continue
        supported[0] |= first
        for (let i = 1; i < 9; i++) supported[i] |= digits[i] ? 1 << (digits[i] - 1) : i < length ? inside : outside
      }
    clue.cells.forEach((cell, i) => {
      allowed[cell] &= supported[i]
      if (!supported[i] && digits[i]) conflicts.add(cell)
    })
  }
  return { allowed, conflicts }
}
