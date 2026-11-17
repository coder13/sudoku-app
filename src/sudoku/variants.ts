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
  windoku: {
    name: 'Windoku',
    rule: 'Each of the four shaded 3 × 3 regions must also contain the digits 1–9 once each.',
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

// Playable imported variants can be released before generation recipes exist.
export const PUZZLE_VARIANTS = {
  ...VARIANTS,
  parity: {
    name: 'Odd/Even',
    rule: 'Cells with a circle contain an odd digit (1, 3, 5, 7, or 9). Cells with a square contain an even digit (2, 4, 6, or 8). Unmarked cells allow either.',
  },
  quadruple: {
    name: 'Quadruple',
    rule: 'Each digit printed in a circle must appear in the four surrounding cells. A repeated printed digit needs that many separate cells.',
  },
} as const

export function quadrupleCells(topLeft: number): readonly number[] {
  return [topLeft, topLeft + 1, topLeft + 9, topLeft + 10]
}

export const WINDOKU_REGIONS = [10, 14, 46, 50].map((start) =>
  Array.from({ length: 9 }, (_, index) => start + Math.floor(index / 3) * 9 + index % 3))

export type VariantId = keyof typeof VARIANTS
export type PlayableVariant = Exclude<VariantId, 'classic'>
export type PuzzleVariantId = keyof typeof PUZZLE_VARIANTS | 'mixed'
export type VariantGame = { id: Exclude<PuzzleVariantId, 'classic'>; puzzle: VariantPuzzle; solution: string }

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === 'string' && Object.hasOwn(VARIANTS, value)
}

// Offer only levels with recipes verified under the current technique rules.
export function isPuzzleVariantId(value: unknown): value is PuzzleVariantId {
  return value === 'mixed' || typeof value === 'string' && Object.hasOwn(PUZZLE_VARIANTS, value)
}

/** Return a recipe only for variants with calibrated generation support. */
export function generationVariant(variant?: Pick<VariantGame, 'id'>): PlayableVariant | undefined {
  return variant && isVariantId(variant.id) ? variant.id : undefined
}

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
  if ('extra' in house) {
    const rule = puzzle.rules?.[house.extra]
    return rule?.type === 'extra-house' ? rule.cells : []
  }
  if (puzzle.regions?.type === 'jigsaw') return puzzle.regions.regions[house.region]
  const top = Math.floor(house.region / 3) * 27 + (house.region % 3) * 3
  return cells.map((i) => top + Math.floor(i / 3) * 9 + i % 3)
}

export function extraRegionName(rules: readonly VariantRule[], index: number): string {
  if (rules[index]?.type !== 'extra-house') return 'extra region'
  return `extra region ${rules.slice(0, index + 1).filter(rule => rule.type === 'extra-house').length}`
}

export function variantHouseName(house: VariantHouse, puzzle: VariantPuzzle) {
  if ('row' in house) return `row ${house.row + 1}`
  if ('column' in house) return `column ${house.column + 1}`
  if ('diagonal' in house) return house.diagonal === 'main' ? 'top-left to bottom-right diagonal' : 'top-right to bottom-left diagonal'
  if ('region' in house) return `${puzzle.regions?.type === 'jigsaw' ? 'region' : 'box'} ${house.region + 1}`
  return extraRegionName(puzzle.rules ?? [], house.extra)
}

export function variantHouseMasks(puzzle: VariantPuzzle, values: string, eliminations?: readonly number[]) {
  const masks = [...values].map((digit, cell) => digit === '0' ? 511 & ~(eliminations?.[cell] ?? 0) : 0)
  const houses: VariantHouse[] = cells.flatMap((i) => [{ row: i }, { column: i }, { region: i }])
  for (const [index, rule] of (puzzle.rules ?? []).entries()) {
    if (rule.type === 'diagonal') houses.push({ diagonal: rule.diagonal })
    if (rule.type === 'extra-house') houses.push({ extra: index })
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

function isPlayableRule(rule: VariantRule): boolean {
  if (!rule || typeof rule !== 'object') return false
  switch (rule.type) {
    case 'parity': return validCells(rule.cells, 1) && (rule.parity === 'odd' || rule.parity === 'even')
    case 'quadruple': return Number.isInteger(rule.topLeft) && rule.topLeft >= 0 && rule.topLeft < 72 && rule.topLeft % 9 < 8 &&
      Array.isArray(rule.digits) && rule.digits.length >= 1 && rule.digits.length <= 4 &&
      rule.digits.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= 9)
    case 'anti-knight': return true
    case 'diagonal': return rule.diagonal === 'main' || rule.diagonal === 'anti'
    case 'extra-house': return validCells(rule.cells, 9) && rule.cells.length === 9
    case 'thermometer': return validCells(rule.cells, 2)
    case 'arrow': return validCells([rule.circle, ...(Array.isArray(rule.cells) ? rule.cells : [])], 2)
    case 'killer-cages': return Array.isArray(rule.cages) && rule.cages.length > 0 && rule.cages.every((cage) =>
      cage && validCells(cage.cells, 1) && Number.isInteger(cage.sum) && cage.sum >= 1 && cage.sum <= 45)
    case 'kropki': return [rule.consecutive, rule.ratioTwo].every((marks) => marks === undefined ||
      marks && (marks.negative === undefined || typeof marks.negative === 'boolean') &&
      (marks.pairs === undefined || Array.isArray(marks.pairs) &&
        marks.pairs.every((pair) => validCells(pair, 2) && pair.length === 2)))
    default: return false
  }
}

/** Identify a named recipe when all rules belong to that variant. */
export function variantIdForPuzzle(puzzle: VariantPuzzle): PuzzleVariantId {
  const rules = puzzle.rules ?? []
  if (puzzle.regions?.type === 'jigsaw') return rules.length ? 'mixed' : 'jigsaw'
  if (!rules.length) return 'classic'
  const first = rules[0].type
  if (first === 'extra-house') {
    return rules.length === WINDOKU_REGIONS.length &&
      rules.every(rule => rule.type === 'extra-house') &&
      WINDOKU_REGIONS.every(region => rules.some(rule =>
        rule.type === 'extra-house' && rule.cells.length === 9 && region.every(cell => rule.cells.includes(cell))))
      ? 'windoku' : 'mixed'
  }
  return isPuzzleVariantId(first) && rules.every(rule => rule.type === first) ? first : 'mixed'
}

export function isPlayablePuzzle(id: unknown, puzzle: unknown): puzzle is VariantPuzzle {
  if ((!isPuzzleVariantId(id) || id === 'classic') ||
    !puzzle || typeof puzzle !== 'object') return false
  const { version, givens, rules, regions } = puzzle as VariantPuzzle
  if (version !== 1 || typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) return false
  if (regions !== undefined && regions?.type !== 'boxes' &&
    !(regions?.type === 'jigsaw' && validJigsawRegions(regions.regions))) return false
  if (rules !== undefined && (!Array.isArray(rules) || rules.length > 81 || !rules.every(isPlayableRule))) return false
  const kind = variantIdForPuzzle(puzzle as VariantPuzzle)
  return kind !== 'classic' && (id === 'mixed' || kind === id)
}

const RULE_NAMES: Partial<Record<VariantRule['type'], string>> = {
  'extra-house': 'Extra regions',
  diagonal: VARIANTS.diagonal.name,
  'killer-cages': VARIANTS['killer-cages'].name,
  'anti-knight': VARIANTS['anti-knight'].name,
  thermometer: VARIANTS.thermometer.name,
  arrow: VARIANTS.arrow.name,
  kropki: VARIANTS.kropki.name,
  quadruple: PUZZLE_VARIANTS.quadruple.name,
  parity: PUZZLE_VARIANTS.parity.name,
}

/** Describe the active puzzle independently of its generation recipe. */
export function variantName(variant?: Pick<VariantGame, 'id' | 'puzzle'>): string {
  if (!variant) return VARIANTS.classic.name
  if (variant.id !== 'mixed') return PUZZLE_VARIANTS[variant.id].name
  const { rules, regions } = variant.puzzle
  const names = [
    ...(regions?.type === 'jigsaw' ? [VARIANTS.jigsaw.name] : []),
    ...(rules?.map(rule => RULE_NAMES[rule.type]) ?? []),
  ]
  return [...new Set(names)].filter(Boolean).join(' + ')
}

/** Explain every active rule, including the direction and negative dot clues. */
export function variantRuleDescriptions(puzzle: VariantPuzzle): string[] {
  const descriptions: string[] = [puzzle.regions?.type === 'jigsaw' ? VARIANTS.jigsaw.rule : VARIANTS.classic.rule]
  for (const rule of puzzle.rules ?? []) {
    switch (rule.type) {
      case 'parity':
        descriptions.push(rule.parity === 'odd'
          ? 'Cells with a circle contain an odd digit: 1, 3, 5, 7, or 9.'
          : 'Cells with a square contain an even digit: 2, 4, 6, or 8.')
        break
      case 'quadruple':
        descriptions.push(PUZZLE_VARIANTS.quadruple.rule)
        break
      case 'diagonal':
        descriptions.push(`The ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal must also contain the digits 1–9 once each.`)
        break
      case 'extra-house':
        descriptions.push('Each shaded extra region must also contain the digits 1–9 once each.')
        break
      case 'kropki':
        descriptions.push('Digits separated by a white dot are consecutive. Across a black dot, one digit is double the other.')
        if (rule.consecutive?.negative) descriptions.push('Every adjacent pair of consecutive digits has a white dot.')
        if (rule.ratioTwo?.negative) descriptions.push('Every adjacent pair with one digit double the other has a black dot.')
        break
      default:
        if (isVariantId(rule.type)) descriptions.push(VARIANTS[rule.type].rule)
    }
  }
  return [...new Set(descriptions)]
}

export function validVariantSave(variant: unknown, givens: string): variant is VariantGame {
  if (!variant || typeof variant !== 'object') return false
  const { id, puzzle, solution } = variant as VariantGame
  return isPlayablePuzzle(id, puzzle) && puzzle.givens === givens && typeof solution === 'string' &&
    /^[1-9]{81}$/.test(solution) && [...givens].every((digit, cell) => digit === '0' || digit === solution[cell])
}
