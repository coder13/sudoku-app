import { quadrupleCells } from './variants.ts'

export type LetteredQuadruple = { topLeft: number; letters: string }

export function validLetteredQuadruples(value: unknown): value is readonly LetteredQuadruple[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return false
  const corners = new Set<number>()
  const letters = new Set<string>()
  for (const clue of value) {
    if (!clue || typeof clue !== 'object' || Array.isArray(clue) || Object.keys(clue).length !== 2 ||
      !Number.isInteger(clue.topLeft) || clue.topLeft < 0 || clue.topLeft >= 72 || clue.topLeft % 9 === 8 ||
      typeof clue.letters !== 'string' || !/^[A-Z]{1,4}$/.test(clue.letters) || corners.has(clue.topLeft)) return false
    corners.add(clue.topLeft)
    for (const letter of clue.letters) letters.add(letter)
  }
  return letters.size <= 9
}

/** A partial grid must leave a different digit available for each letter. */
export function permitsLetteredQuadruples(clues: readonly LetteredQuadruple[], values: string) {
  const key = new Map<string, number>()
  for (const { topLeft, letters } of clues) {
    const area = quadrupleCells(topLeft).map(cell => Number(values[cell]))
    const blanks = area.filter(digit => digit === 0).length
    for (const letter of new Set(letters)) {
      const count = [...letters].filter(other => other === letter).length
      let mask = key.get(letter) ?? 511
      for (let digit = 1; digit <= 9; digit++) {
        if (area.filter(placed => placed === digit).length + blanks < count) mask &= ~(1 << (digit - 1))
      }
      if (mask === 0) return false
      key.set(letter, mask)
    }
  }
  const domains = [...key.values()]
  const failed = new Set<number>()
  function match(index: number, used: number): boolean {
    if (index === domains.length) return true
    // The number of bits in used also specifies index.
    if (failed.has(used)) return false
    for (let free = domains[index] & ~used; free; free &= free - 1) {
      if (match(index + 1, used | (free & -free))) return true
    }
    failed.add(used)
    return false
  }
  return match(0, 0)
}
