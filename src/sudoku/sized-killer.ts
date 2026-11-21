import type { SizedConstraintRule, VariantRule } from './engine.ts'

type KillerRule = Extract<SizedConstraintRule, { type: 'killer-cages' }>
type Cage = KillerRule['cages'][number]
const cageSets = new WeakMap<Cage, { size: number; masks: number[] }>()

export function validSizedKillerRule(rule: KillerRule, size: number, occupied: Set<number>) {
  if (Object.keys(rule).some(key => !['type', 'cages', 'coverGrid'].includes(key)) ||
    (rule.coverGrid !== undefined && typeof rule.coverGrid !== 'boolean') ||
    !Array.isArray(rule.cages) || !rule.cages.length || rule.cages.length > size ** 2) return false
  let count = 0
  for (const item of rule.cages as readonly unknown[]) {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 2) return false
    const { cells, sum } = item as Partial<Cage>
    if (!Array.isArray(cells) || cells.length === 0 || cells.length > size || typeof sum !== 'number' || !Number.isInteger(sum)) return false
    const length = cells.length
    if (sum < length * (length + 1) / 2 || sum > length * (2 * size - length + 1) / 2) return false
    for (const cell of cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || occupied.has(cell)) return false
      occupied.add(cell)
      count++
    }
  }
  return !rule.coverGrid || count === size ** 2
}

function possibleDigitSets(cage: Cage, size: number) {
  const cached = cageSets.get(cage)
  if (cached?.size === size) return cached.masks
  const result = []
  for (let mask = 1; mask < 1 << size; mask++) {
    let count = 0, sum = 0
    for (let digit = 1; digit <= size; digit++) if (mask & (1 << (digit - 1))) {
      count++
      sum += digit
    }
    if (count === cage.cells.length && sum === cage.sum) result.push(mask)
  }
  cageSets.set(cage, { size, masks: result })
  return result
}

export function sizedKillerState(rules: readonly (SizedConstraintRule | VariantRule)[] | undefined, values: string, size: number) {
  if (!rules?.some(rule => rule.type === 'killer-cages')) return
  const allowed = Array<number>(values.length).fill((1 << size) - 1)
  const conflicts = new Set<number>()
  for (const rule of rules) if (rule.type === 'killer-cages') for (const cage of rule.cages) {
    let placed = 0, repeated = false
    for (const cell of cage.cells) {
      const digit = Number(values[cell])
      if (!digit) continue
      const bit = 1 << (digit - 1)
      repeated ||= Boolean(placed & bit)
      placed |= bit
    }
    if (repeated) {
      for (const cell of cage.cells) if (values[cell] !== '0') conflicts.add(cell)
      continue
    }
    let possible = false, remaining = 0
    for (const mask of possibleDigitSets(cage, size)) if ((mask & placed) === placed) {
      possible = true
      remaining |= mask & ~placed
    }
    for (const cell of cage.cells) {
      if (values[cell] === '0') allowed[cell] &= remaining
      else if (!possible) conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
