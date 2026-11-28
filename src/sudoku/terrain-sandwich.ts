import type { VariantPuzzle, VariantRule } from './engine.ts'

type TerrainSandwich = Extract<VariantRule, { type: 'terrain-sandwich' }>

const FULL_DIGITS = 0x1ff
const CACHE_LIMIT = 256
const supportCache = new Map<string, readonly number[]>()

function terrainMaximum(values: readonly number[]) {
  const prefix = Array<number>(values.length + 1).fill(0)
  values.forEach((value, index) => { prefix[index + 1] = prefix[index] + value })
  let maximum = Number.NEGATIVE_INFINITY
  for (let one = 0; one < values.length; one++) if (values[one] === 1) {
    for (let nine = 0; nine < values.length; nine++) if (values[nine] === 9 && nine !== one) {
      const low = Math.min(one, nine), high = Math.max(one, nine)
      maximum = Math.max(maximum, prefix[high] - prefix[low + 1])
    }
  }
  return maximum
}

function terrainSupport(rule: TerrainSandwich, placed: readonly number[]) {
  const key = JSON.stringify([rule.maximum, rule.transforms, placed])
  const cached = supportCache.get(key)
  if (cached) return cached

  const support = Array<number>(9).fill(0)
  const digits = Array<number>(9).fill(0)
  const transformed = Array<number>(9).fill(0)
  const prefix = Array<number>(10).fill(0)
  const transformedValues = rule.transforms.map(transform => Array.from({ length: 10 }, (_, digit) =>
    digit * transform.multiplier + transform.offset))

  function visit(index: number, used: number) {
    if (index === digits.length) {
      for (let cell = 0; cell < digits.length; cell++) {
        transformed[cell] = transformedValues[cell][digits[cell]]
        prefix[cell + 1] = prefix[cell] + transformed[cell]
      }
      let maximum = Number.NEGATIVE_INFINITY
      for (let one = 0; one < digits.length; one++) if (transformed[one] === 1) {
        for (let nine = 0; nine < digits.length; nine++) if (transformed[nine] === 9 && nine !== one) {
          const low = Math.min(one, nine), high = Math.max(one, nine)
          maximum = Math.max(maximum, prefix[high] - prefix[low + 1])
        }
      }
      if (maximum === rule.maximum) for (let cell = 0; cell < digits.length; cell++) {
        support[cell] |= 1 << (digits[cell] - 1)
      }
      return
    }

    const fixed = placed[index]
    if (fixed) {
      const bit = 1 << (fixed - 1)
      if (used & bit) return
      digits[index] = fixed
      visit(index + 1, used | bit)
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << (digit - 1)
      if (used & bit) continue
      digits[index] = digit
      visit(index + 1, used | bit)
    }
  }

  visit(0, 0)
  if (supportCache.size >= CACHE_LIMIT) supportCache.delete(supportCache.keys().next().value!)
  supportCache.set(key, support)
  return support
}

/** Exact placed-digit support for Terrain clues touched by player entries. */
export function terrainSandwichState(puzzle: VariantPuzzle | undefined, values: string) {
  const clues = puzzle?.rules?.filter((rule): rule is TerrainSandwich => rule.type === 'terrain-sandwich')
  if (!clues?.length) return

  const allowed = Array<number>(81).fill(FULL_DIGITS)
  const conflicts = new Set<number>()
  let active = false
  for (const clue of clues) {
    const placed = clue.cells.map(cell => Number(values[cell]))
    if (!placed.some(Boolean)) continue
    active = true
    const support = terrainSupport(clue, placed)
    clue.cells.forEach((cell, index) => {
      allowed[cell] &= support[index]
      if (placed[index] && !support[index]) conflicts.add(cell)
    })
  }
  return active ? { allowed, conflicts } : undefined
}

export function terrainSandwichMaximum(rule: TerrainSandwich, digits: readonly number[]) {
  if (digits.length !== rule.cells.length) return Number.NEGATIVE_INFINITY
  return terrainMaximum(digits.map((digit, index) => digit * rule.transforms[index].multiplier + rule.transforms[index].offset))
}
