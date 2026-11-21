import type { VariantPuzzle } from './engine.ts'

/** Sum support for placed digits. Houses are checked separately. */
export function pillArrowState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.filter(rule => rule.type === 'pill-arrow')
  if (!clues?.length) return
  const allowed = Array<number>(81).fill(511)
  const conflicts = new Set<number>()
  for (const { pill: [tens, ones], cells } of clues) {
    const placedTens = Number(values[tens]), placedOnes = Number(values[ones])
    const sum = cells.reduce((total, cell) => total + Number(values[cell]), 0)
    const empty = cells.filter(cell => values[cell] === '0')
    let tensMask = 0, onesMask = 0, pathMask = 0
    for (let a = 1; a <= 9; a++) {
      if (placedTens && placedTens !== a) continue
      for (let b = 1; b <= 9; b++) {
        if (placedOnes && placedOnes !== b) continue
        const remaining = a * 10 + b - sum
        if (remaining < empty.length || remaining > 9 * empty.length) continue
        tensMask |= 1 << (a - 1)
        onesMask |= 1 << (b - 1)
        if (empty.length) for (let digit = 1; digit <= 9; digit++) {
          const rest = remaining - digit
          if (rest >= empty.length - 1 && rest <= 9 * (empty.length - 1)) pathMask |= 1 << (digit - 1)
        }
      }
    }
    allowed[tens] &= tensMask
    allowed[ones] &= onesMask
    for (const cell of empty) allowed[cell] &= pathMask
    if (!tensMask) for (const cell of [tens, ones, ...cells]) if (values[cell] !== '0') conflicts.add(cell)
  }
  return { allowed, conflicts }
}
