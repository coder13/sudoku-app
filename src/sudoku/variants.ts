import { DIFFICULTY_OPTIONS, currentDifficulty, difficultyIndex, difficultyOptionLabel, type DifficultyPreference } from './difficulty.ts'
import type { Difficulty, VariantHouse, VariantPuzzle, VariantRule } from './engine.ts'
import seedBank from './variant-seeds.json' with { type: 'json' }

export const VARIANTS = {
  classic: {
    name: 'Classic',
    rule: 'Fill each row, column, and box with the digits 1–9 once each.',
  },
  'killer-cages': {
    name: 'Killer',
    rule: 'Digits in each dashed cage must add to the small total in its corner. Digits cannot repeat in a cage.',
  },
  diagonal: {
    name: 'Diagonal',
    rule: 'Each of the two marked diagonals must also contain the digits 1–9 once each.',
  },
  jigsaw: {
    name: 'Jigsaw',
    rule: 'Fill each row, column, and outlined region with the digits 1–9 once each.',
  },
  'anti-knight': {
    name: 'Anti-Knight',
    rule: 'Cells a chess knight’s move apart cannot share a digit. A knight moves two cells in one direction and one cell across.',
  },
  thermometer: {
    name: 'Thermometer',
    rule: 'Digits must increase along each thermometer from the bulb to the tip.',
  },
  arrow: {
    name: 'Arrow',
    rule: 'The digits along each arrow must add to the digit in its circle.',
  },
  kropki: {
    name: 'Kropki',
    rule: 'Digits separated by a white dot are consecutive. Across a black dot, one digit is double the other. Unmarked pairs have no extra rule.',
  },
} as const

export type VariantId = keyof typeof VARIANTS
export type PlayableVariant = Exclude<VariantId, 'classic'>
export type VariantGame = { id: PlayableVariant; puzzle: VariantPuzzle; solution: string }

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === 'string' && Object.hasOwn(VARIANTS, value)
}

// Offer only levels with recipes verified under the current technique rules.
export function variantDifficulties(variant?: VariantId): readonly DifficultyPreference[] {
  if (!variant || variant === 'classic') return DIFFICULTY_OPTIONS
  return DIFFICULTY_OPTIONS.filter((level) => Object.hasOwn(seedBank[variant], level))
}

export function variantDifficulty(variant: VariantId | undefined, preference: Difficulty): Difficulty
export function variantDifficulty(variant: VariantId | undefined, preference: DifficultyPreference): DifficultyPreference
export function variantDifficulty(variant: VariantId | undefined, preference: DifficultyPreference): DifficultyPreference {
  if (preference === 'auto') return 'auto'
  const current = currentDifficulty(preference)
  const available = variantDifficulties(variant).filter((d): d is Difficulty => d !== 'auto')
  return available.includes(current) ? current : available.reduce((best, level) =>
    Math.abs(difficultyIndex(level) - difficultyIndex(current)) < Math.abs(difficultyIndex(best) - difficultyIndex(current)) ? level : best)
}

export function variantDifficultyLabel(variant: VariantId | undefined, preference: DifficultyPreference, recommended: Difficulty) {
  return difficultyOptionLabel(preference, variantDifficulty(variant, recommended) as Difficulty)
}

const cells = Array.from({ length: 9 }, (_, i) => i)
const mainDiagonal = cells.map((i) => i * 10)
const antiDiagonal = cells.map((i) => i * 8 + 8)

export function regionMembership(regions: readonly (readonly number[])[]) {
  const membership = new Array<number>(81)
  regions.forEach((region, index) => region.forEach((cell) => { membership[cell] = index }))
  return membership
}

export function variantHouseCells(house: VariantHouse, puzzle: VariantPuzzle): readonly number[] {
  if ('row' in house) return cells.map((i) => house.row * 9 + i)
  if ('column' in house) return cells.map((i) => i * 9 + house.column)
  if ('diagonal' in house) return house.diagonal === 'main' ? mainDiagonal : antiDiagonal
  if ('extra' in house) return puzzle.rules?.filter((rule) => rule.type === 'extra-house')[house.extra]?.cells ?? []
  if (puzzle.regions?.type === 'jigsaw') return puzzle.regions.regions[house.region]
  const top = Math.floor(house.region / 3) * 27 + (house.region % 3) * 3
  return cells.map((i) => top + Math.floor(i / 3) * 9 + i % 3)
}

export function variantHouseName(house: VariantHouse, puzzle: VariantPuzzle) {
  if ('row' in house) return `row ${house.row + 1}`
  if ('column' in house) return `column ${house.column + 1}`
  if ('diagonal' in house) return house.diagonal === 'main' ? 'top-left to bottom-right diagonal' : 'top-right to bottom-left diagonal'
  if ('region' in house) return `${puzzle.regions?.type === 'jigsaw' ? 'region' : 'box'} ${house.region + 1}`
  return 'extra house'
}

export function variantHouseMasks(puzzle: VariantPuzzle, values: string, eliminations?: readonly number[]) {
  const masks = [...values].map((digit, cell) => digit === '0' ? 511 & ~(eliminations?.[cell] ?? 0) : 0)
  const houses: VariantHouse[] = cells.flatMap((i) => [{ row: i }, { column: i }, { region: i }])
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'diagonal') houses.push({ diagonal: rule.diagonal })
    if (rule.type === 'extra-house') houses.push({ extra: houses.filter((house) => 'extra' in house).length })
  }
  for (const house of houses) {
    const indices = variantHouseCells(house, puzzle)
    let used = 0
    for (const cell of indices) {
      if (values[cell] !== '0') used |= 1 << (Number(values[cell]) - 1)
    }
    for (const cell of indices) masks[cell] &= ~used
  }
  return masks
}

export function variantPeers(puzzle: VariantPuzzle | undefined, a: number, b: number): boolean {
  if (!puzzle || a === b) return false
  return (puzzle.rules ?? []).some((rule) => {
    if (rule.type === 'diagonal') {
      const line = rule.diagonal === 'main' ? mainDiagonal : antiDiagonal
      return line.includes(a) && line.includes(b)
    }
    if (rule.type === 'anti-knight') {
      const rows = Math.abs(Math.floor(a / 9) - Math.floor(b / 9))
      const columns = Math.abs(a % 9 - b % 9)
      return rows * columns === 2
    }
    if (rule.type === 'killer-cages') return rule.cages.some(({ cells }) => cells.includes(a) && cells.includes(b))
    if (rule.type === 'extra-house') return rule.cells.includes(a) && rule.cells.includes(b)
    if (rule.type === 'thermometer') return rule.cells.includes(a) && rule.cells.includes(b)
    return false
  })
}

export function hasMarkedPair(pairs: readonly (readonly [number, number])[] | undefined, a: number, b: number) {
  return pairs?.some(([left, right]) => (left === a && right === b) || (left === b && right === a)) ?? false
}

function validCells(list: unknown, min: number) {
  return Array.isArray(list) && list.length >= min && list.length <= 81 &&
    new Set(list).size === list.length && list.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 81)
}

function validJigsawRegions(regions: unknown): boolean {
  if (!Array.isArray(regions) || regions.length !== 9 ||
    !regions.every((region) => validCells(region, 9) && region.length === 9) || new Set(regions.flat()).size !== 81) return false
  return regions.every((region: number[]) => {
    const reached = new Set([region[0]])
    for (const cell of reached) {
      for (const neighbor of region) {
        const distance = Math.abs(cell % 9 - neighbor % 9) + Math.abs(Math.floor(cell / 9) - Math.floor(neighbor / 9))
        if (distance === 1) reached.add(neighbor)
      }
    }
    return reached.size === 9
  })
}

export function isPlayablePuzzle(id: unknown, puzzle: unknown): puzzle is VariantPuzzle {
  if (typeof id !== 'string' || id === 'classic' || !Object.hasOwn(VARIANTS, id) || !puzzle || typeof puzzle !== 'object') return false
  const { version, givens, rules, regions } = puzzle as VariantPuzzle
  if (version !== 1 || typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) return false
  if (id === 'jigsaw') return regions?.type === 'jigsaw' && validJigsawRegions(regions.regions) &&
    (rules === undefined || (Array.isArray(rules) && rules.length === 0))
  if ((regions !== undefined && regions?.type !== 'boxes') || !Array.isArray(rules) || !rules.length || rules.length > 81) return false
  return rules.every((rule: VariantRule) => {
    if (!rule || rule.type !== id) return false
    switch (rule.type) {
      case 'anti-knight': return true
      case 'diagonal': return rule.diagonal === 'main' || rule.diagonal === 'anti'
      case 'thermometer': return validCells(rule.cells, 2)
      case 'arrow': return validCells([rule.circle, ...(Array.isArray(rule.cells) ? rule.cells : [])], 2)
      case 'killer-cages': return Array.isArray(rule.cages) && rule.cages.every((cage) =>
        cage && validCells(cage.cells, 1) && Number.isInteger(cage.sum) && cage.sum >= 1 && cage.sum <= 45)
      case 'kropki': return [rule.consecutive, rule.ratioTwo].every((marks) => marks === undefined ||
        marks && !marks.negative && (marks.pairs === undefined || Array.isArray(marks.pairs) &&
          marks.pairs.every((pair) => validCells(pair, 2) && pair.length === 2)))
      default: return false
    }
  })
}

export function validVariantSave(variant: unknown, givens: string): variant is VariantGame {
  if (!variant || typeof variant !== 'object') return false
  const { id, puzzle, solution } = variant as VariantGame
  return isPlayablePuzzle(id, puzzle) && puzzle.givens === givens && typeof solution === 'string' &&
    /^[1-9]{81}$/.test(solution) && [...givens].every((digit, cell) => digit === '0' || digit === solution[cell])
}
