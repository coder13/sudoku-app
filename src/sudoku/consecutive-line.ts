import type { VariantPuzzle } from './engine.ts'

/** Compare the placed digits with every run, in either direction. */
export function consecutiveLineState(puzzle: VariantPuzzle | undefined, values: string) {
  const lines = puzzle?.rules?.filter(rule => rule.type === 'consecutive-line')
  if (!lines?.length) return
  const allowed = Array<number>(81).fill(511)
  const conflicts = new Set<number>()
  for (const { cells } of lines) {
    const last = cells.length - 1
    let ascending = 511, descending = 511
    for (const [index, cell] of cells.entries()) {
      const digit = Number(values[cell])
      const domain = digit ? 1 << (digit - 1) : 511
      ascending &= domain >> index
      descending &= domain >> (last - index)
    }
    for (const [index, cell] of cells.entries()) {
      allowed[cell] &= (ascending << index) | (descending << (last - index))
      if (!(ascending | descending) && values[cell] !== '0') conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
