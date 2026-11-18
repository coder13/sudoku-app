import type { VariantPuzzle } from './engine.ts'

const missingGroups = (mask: number) => 3 - ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1))

export const ENTROPY_AREAS: readonly (readonly number[])[] = Array.from({ length: 64 }, (_, area) => {
  const first = Math.floor(area / 8) * 9 + area % 8
  return [first, first + 1, first + 9, first + 10]
})

/** Restrictions from placed digits only. Candidate deductions remain explicit hints. */
export function globalEntropyState(puzzle: VariantPuzzle | undefined, values: string) {
  if (!puzzle?.rules?.some(rule => rule.type === 'global-entropy')) return undefined
  const allowed = Array<number>(81).fill(511)
  const conflicts = new Set<number>()
  for (const area of ENTROPY_AREAS) {
    let groups = 0
    let empty = 0
    for (const cell of area) {
      const digit = Number(values[cell])
      if (!digit) empty++
      else groups |= 1 << Math.floor((digit - 1) / 3)
    }
    if (missingGroups(groups) > empty) {
      for (const cell of area) if (values[cell] !== '0') conflicts.add(cell)
    }
    for (const cell of area) if (values[cell] === '0') {
      let keep = 0
      for (let group = 0; group < 3; group++) {
        if (missingGroups(groups | (1 << group)) <= empty - 1) keep |= 7 << (group * 3)
      }
      allowed[cell] &= keep
    }
  }
  return { allowed, conflicts }
}
