import type { VariantPuzzle } from './engine.ts'

/** Exact visibility support from placed row digits, without using pencil marks as premises. */
export function skyscrapersState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.flatMap((rule) => (rule.type === 'skyscrapers' ? [rule] : []))
  if (!clues?.length) return
  const allowed = Array<number>(81).fill(511),
    conflicts = new Set<number>()
  const memo = new Uint8Array(512 * 10)
  for (const clue of clues) {
    const digits = clue.cells.map((cell) => Number(values[cell])),
      supported = Array<number>(9).fill(0)
    // Prefix order matters only through its used digits and visible count.
    // The used mask also determines the prefix maximum and its length.
    memo.fill(0)
    function possible(index: number, used: number, visible: number): boolean {
      const maximum = used ? 32 - Math.clz32(used) : 0
      if (visible > clue.count || visible + 9 - maximum < clue.count || visible + (maximum < 9 ? 1 : 0) > clue.count)
        return false
      if (index === 9) return visible === clue.count
      const key = used * 10 + visible
      if (memo[key]) return memo[key] === 2
      let found = false
      for (let digit = 1; digit <= 9; digit++) {
        const bit = 1 << (digit - 1)
        if (used & bit || (digits[index] && digits[index] !== digit)) continue
        if (possible(index + 1, used | bit, visible + (digit > maximum ? 1 : 0))) {
          supported[index] |= bit
          found = true
        }
      }
      memo[key] = found ? 2 : 1
      return found
    }
    possible(0, 0, 0)
    clue.cells.forEach((cell, i) => {
      allowed[cell] &= supported[i]
      if (!supported[i] && digits[i]) conflicts.add(cell)
    })
  }
  return { allowed, conflicts }
}
