import type { VariantPuzzle } from './engine.ts'

/** Local Between and Lockout restrictions from placed digits. Houses and other rules are
 * checked separately. Interior cells may repeat when those rules permit it. */
export function endpointLineState(puzzle: VariantPuzzle | undefined, values: string) {
  const lines = puzzle?.rules?.flatMap(rule => rule.type === 'between' || rule.type === 'lockout' ? [rule] : [])
  if (!lines?.length) return
  const allowed = Array<number>(81).fill(511)
  const conflicts = new Set<number>()
  for (const { cells, type } of lines) {
    const placed = cells.map(cell => Number(values[cell]))
    const last = cells.length - 1
    const insidePlaced = placed.slice(1, last)
    const lockout = type === 'lockout'
    const support = Array<number>(cells.length).fill(0)
    for (let first = 1; first <= 9; first++) {
      if (placed[0] && placed[0] !== first) continue
      for (let end = 1; end <= 9; end++) {
        if (placed[last] && placed[last] !== end) continue
        const low = Math.min(first, end), high = Math.max(first, end)
        if (high - low < (lockout ? 4 : 2)) continue
        const inside = lockout ? ((1 << (low - 1)) - 1) | (511 & ~((1 << high) - 1))
          : ((1 << (high - 1)) - 1) & ~((1 << low) - 1)
        if (insidePlaced.some(digit => digit && !(inside & (1 << (digit - 1)))) || last > 1 && !inside) continue
        support[0] |= 1 << (first - 1)
        support[last] |= 1 << (end - 1)
        for (let i = 1; i < last; i++) support[i] |= placed[i] ? 1 << (placed[i] - 1) : inside
      }
    }
    for (const [i, cell] of cells.entries()) {
      allowed[cell] &= support[i]
      if (!support[0] && placed[i]) conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
