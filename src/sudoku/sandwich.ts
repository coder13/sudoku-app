import type { VariantPuzzle } from './engine.ts'

// The seven possible filling digits produce only 128 distinct subsets.
const subsets: number[][][] = Array.from({ length: 8 }, () => Array.from({ length: 36 }, () => []))
for (let subset = 0; subset < 128; subset++) {
  let mask = 0, size = 0, sum = 0
  for (let i = 0; i < 7; i++) if (subset & 1 << i) { mask |= 1 << (i + 1); size++; sum += i + 2 }
  subsets[size][sum].push(mask)
}

/** Exact row support from placed digits and Sandwich totals, without candidate deductions. */
export function sandwichState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.flatMap(rule => rule.type === 'sandwich' ? [rule] : [])
  if (!clues?.length) return
  const allowed = Array<number>(81).fill(511), conflicts = new Set<number>()
  for (const clue of clues) {
    const digits = clue.cells.map(cell => Number(values[cell]))
    const supported = Array<number>(9).fill(0)
    let used = 0, duplicate = false
    for (const digit of digits) if (digit) {
      duplicate ||= Boolean(used & 1 << (digit - 1))
      used |= 1 << (digit - 1)
    }
    const remaining = 254 & ~used // 2–8 only; bread is assigned separately.
    if (!duplicate) for (let one = 0; one < 9; one++) for (let nine = 0; nine < 9; nine++) {
      if (one === nine || digits[one] && digits[one] !== 1 || digits[nine] && digits[nine] !== 9 ||
        digits.some((digit, i) => digit === 1 && i !== one || digit === 9 && i !== nine)) continue
      const low = Math.min(one, nine), high = Math.max(one, nine)
      let size = 0, sum = 0
      for (let i = low + 1; i < high; i++) { if (digits[i]) sum += digits[i]; else size++ }
      let inside = 0, outside = 0, possible = false
      for (const mask of subsets[size][clue.sum - sum] ?? []) if ((mask & remaining) === mask) {
        possible = true; inside |= mask; outside |= remaining & ~mask
      }
      if (!possible) continue
      for (let i = 0; i < 9; i++) supported[i] |= digits[i] ? 1 << (digits[i] - 1)
        : i === one ? 1 : i === nine ? 256 : i > low && i < high ? inside : outside
    }
    clue.cells.forEach((cell, i) => {
      allowed[cell] &= supported[i]
      if (!supported[i] && digits[i]) conflicts.add(cell)
    })
  }
  return { allowed, conflicts }
}
