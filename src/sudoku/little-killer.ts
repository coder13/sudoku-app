import type { VariantPuzzle } from './engine.ts'

/** Sum restrictions from placed digits only. A diagonal has no extra distinctness rule. */
export function littleKillerState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.filter((rule) => rule.type === 'little-killer')
  if (!clues?.length) return
  const allowed = Array<number>(81).fill(511),
    conflicts = new Set<number>()
  for (const clue of clues) {
    const sum = clue.cells.reduce((total, cell) => total + Number(values[cell]), 0)
    const empty = clue.cells.filter((cell) => values[cell] === '0'),
      remaining = clue.sum - sum
    const possible = remaining >= empty.length && remaining <= empty.length * 9
    if (!possible) for (const cell of clue.cells) if (values[cell] !== '0') conflicts.add(cell)
    for (const cell of empty) {
      let support = 0
      if (possible)
        for (let digit = 1; digit <= 9; digit++) {
          const rest = remaining - digit
          if (rest >= empty.length - 1 && rest <= (empty.length - 1) * 9) support |= 1 << (digit - 1)
        }
      allowed[cell] &= support
    }
  }
  return { allowed, conflicts }
}
