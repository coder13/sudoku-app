import { isFogDefinition, FOG_RULE, type FogDefinition } from './fog.ts'
import { DIFFICULTY_OPTIONS, currentDifficulty, difficultyIndex, difficultyOptionLabel, type DifficultyPreference } from './difficulty.ts'
import type { Difficulty, VariantHouse, VariantPuzzle, VariantRule } from './engine.ts'
import { lineGroupMask } from './line-groups.ts'
import { lineSkipsCells } from './line-geometry.ts'
import { quadrupleNote, quadrupleTechnique, validQuadruple } from './quadruple.ts'
import { regionSumParts } from './region-sum.ts'
import { validOutsideRay, outsideClueLabel } from './outside-clues.ts'
import { cloneLayout } from './clone.ts'
import { gridDiagonalCells, kropkiDigitExclusions } from './grid.ts'
import seedBank from './variant-seeds.json' with { type: 'json' }

export { quadrupleCells } from './quadruple.ts'

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
  'anti-king': {
    name: 'Anti-King',
    rule: 'Cells touching at a corner cannot share a digit. Check cells one row and one column apart, including across box or region borders.',
  },
  'non-consecutive': {
    name: 'Non-Consecutive',
    rule: 'Cells sharing an edge cannot contain consecutive digits. Diagonal neighbors are unrestricted by this rule, and 1 and 9 are not consecutive.',
  },
  whispers: {
    name: 'Whispers',
    rule: 'Digits in neighboring cells along a line must differ by at least the line’s minimum. German Whispers uses a minimum of 5; Dutch Whispers uses 4.',
  },
  'global-entropy': {
    name: 'Global Entropy',
    rule: 'Every 2 × 2 area contains a low digit (1–3), a medium digit (4–6) and a high digit (7–9). This includes areas across box or region borders. One group appears twice. Equal digits can repeat diagonally if all other puzzle rules allow it.',
  },
  entropic: {
    name: 'Entropic Lines',
    rule: 'Each three successive positions on an Entropic line contain one low digit (1–3), one medium digit (4–6) and one high digit (7–9). The groups repeat every three positions. Two-cell lines use different groups. Touching paths stay independent.',
  },
  modular: {
    name: 'Modular Lines',
    rule: 'Each three successive positions on a Modular line contain one digit from {1, 4, 7}, one from {2, 5, 8} and one from {3, 6, 9}. These groups have different remainders when divided by 3. The groups repeat every three positions. Two-cell lines use different groups. Touching paths stay independent. Digits may repeat if all other puzzle rules allow it.',
  },
  renban: {
    name: 'Renban',
    rule: 'Each Renban line contains a set of consecutive digits in any order, without repetition. Connected branches of one clue form one set. Overlapping clues stay independent.',
  },
  inequality: {
    name: 'Inequality',
    rule: 'The pointed end of each inequality sign faces the smaller digit. The open end faces the larger digit. A connecting line identifies the two cells when they are farther apart.',
  },
  palindrome: {
    name: 'Palindrome',
    rule: 'Each Palindrome line reads the same in both directions. Cells at matching distances from its ends contain the same digit. The middle cell of an odd-length line has no matching partner.',
  },
  parity: {
    name: 'Odd/Even',
    rule: 'Cells with a circle contain an odd digit (1, 3, 5, 7, or 9). Cells with a square contain an even digit (2, 4, 6, or 8). Unmarked cells allow either.',
  },
  between: {
    name: 'Between Lines',
    rule: 'The digits inside each Between line must lie strictly between the digits in its two circles. The smaller endpoint can be at either end. Interior digits can repeat if the other puzzle rules allow it. Touching lines stay independent.',
  },
  'region-sum': {
    name: 'Region Sum Lines',
    rule: 'Each blue line has parts with the same total. Region borders divide the line unless its listed groups say otherwise. Different lines can have different totals.',
  },
  'little-killer': {
    name: 'Little Killer',
    rule: 'Digits along each indicated diagonal must add to its outside total. Follow the arrow through the whole diagonal. Digits may repeat along a diagonal if the other puzzle rules allow it.',
  },
  sandwich: {
    name: 'Sandwich',
    rule: 'An outside clue gives the sum of the digits strictly between 1 and 9 in its row or column. Do not include 1 or 9 in the total. A zero means 1 and 9 are next to each other. Unmarked rows and columns have no Sandwich total.',
  },
  'x-sum': {
    name: 'X-Sums',
    rule: 'An outside clue gives the sum of the first X digits in its direction. The first digit is X and counts toward the sum. For example, a first digit of 3 means the first three cells add to the clue. Unmarked directions have no X-Sum total.',
  },
  skyscrapers: {
    name: 'Skyscrapers',
    rule: 'Each digit is the height of a building. An outside clue counts the buildings visible from that direction. Count the first building and each new tallest building; taller buildings hide shorter ones behind them. Unmarked directions have no visibility clue.',
  },
  clone: {
    name: 'Clone',
    rule: 'Cells with the same Clone letter must contain the same digit. Different letters can contain the same digit if the other puzzle rules allow it.',
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
  xv: {
    name: 'XV',
    rule: 'Digits joined by a V sum to 5. Digits joined by an X sum to 10. Unmarked pairs can have any sum unless a negative rule is stated.',
  },
  'adjacent-total': {
    name: 'Two-cell sums',
    rule: 'Digits joined by a Roman numeral have that total. For example, XV means 15. Unmarked pairs can have any total unless a negative V or X rule is stated.',
  },
  quadruple: {
    name: quadrupleTechnique,
    rule: quadrupleNote,
  },
} as const

export const PUZZLE_VARIANTS = VARIANTS

export const WINDOKU_REGIONS = [10, 14, 46, 50].map((start) =>
  Array.from({ length: 9 }, (_, index) => start + Math.floor(index / 3) * 9 + index % 3))

export function variantHouseFillCells(rule: VariantRule): readonly number[] {
  if (rule.type === 'diagonal') return gridDiagonalCells(9, rule.diagonal)
  if (rule.type === 'extra-house' && WINDOKU_REGIONS.some(region =>
    region.length === rule.cells.length && region.every(cell => rule.cells.includes(cell)))) return rule.cells
  return []
}

export type VariantId = keyof typeof VARIANTS
export type PlayableVariant = Exclude<VariantId, 'classic'>
export type PuzzleVariantId = keyof typeof PUZZLE_VARIANTS | 'mixed'
export type VariantGame = { id: Exclude<PuzzleVariantId, 'classic'>; puzzle: VariantPuzzle; solution: string; fog?: FogDefinition }

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

function disjointGroupPosition(rule: VariantRule): number | undefined {
  if (rule.type !== 'extra-house' || rule.cells.length !== 9 || new Set(rule.cells).size !== 9) return
  const position = (cell: number) => Math.floor(cell / 9) % 3 * 3 + cell % 3
  const offset = position(rule.cells[0])
  if (rule.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81 && position(cell) === offset)) return offset
}

export const DISJOINT_GROUPS_RULE = 'Disjoint Groups: cells in the same relative position within each of the nine 3 × 3 blocks also contain the digits 1–9 once each.'

/** Recognize the complete layout without changing its nine typed house rules. */
export function disjointGroupRuleIndices(rules: readonly VariantRule[]): ReadonlySet<number> {
  const groups = rules.flatMap((rule, index) => {
    const position = disjointGroupPosition(rule)
    return position === undefined ? [] : [{ index, position }]
  })
  return new Set(new Set(groups.map(group => group.position)).size === 9 ? groups.map(group => group.index) : [])
}

export function extraRegionName(rules: readonly VariantRule[], index: number): string {
  if (rules[index]?.type !== 'extra-house') return 'extra region'
  const position = disjointGroupPosition(rules[index])
  if (position !== undefined) return `disjoint group at row ${Math.floor(position / 3) + 1}, column ${position % 3 + 1} within each 3 × 3 block`
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
    if (rule.type === 'entropic' || rule.type === 'modular') {
      for (const [i, from] of rule.cells.entries()) if (values[from] !== '0') {
        for (const [j, to] of rule.cells.entries()) if (i % 3 !== j % 3) masks[to] &= ~(1 << (Number(values[from]) - 1))
      }
    }
    if (rule.type === 'renban') {
      const used = rule.cells.reduce((mask, cell) => mask | (values[cell] === '0' ? 0 : 1 << (Number(values[cell]) - 1)), 0)
      for (const cell of rule.cells) masks[cell] &= ~used
    }
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
    if (rule.type === 'inequality') return a === rule.less && b === rule.greater || a === rule.greater && b === rule.less
    if (rule.type === 'diagonal') {
      const line = rule.diagonal === 'main' ? mainDiagonal : antiDiagonal
      return line.includes(a) && line.includes(b)
    }
    if (rule.type === 'anti-knight') {
      const rows = Math.abs(Math.floor(a / 9) - Math.floor(b / 9))
      const columns = Math.abs(a % 9 - b % 9)
      return rows * columns === 2
    }
    if (rule.type === 'anti-king') {
      return Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) === 1 && Math.abs(a % 9 - b % 9) === 1
    }
    if (rule.type === 'killer-cages') return rule.cages.some(({ cells }) => cells.includes(a) && cells.includes(b))
    if (rule.type === 'extra-house') return rule.cells.includes(a) && rule.cells.includes(b)
    if (rule.type === 'whispers') return rule.cells.some((cell, i) => i > 0 &&
      (cell === a && rule.cells[i - 1] === b || cell === b && rule.cells[i - 1] === a))
    if (rule.type === 'entropic' || rule.type === 'modular') return rule.cells.includes(a) && rule.cells.includes(b) && rule.cells.indexOf(a) % 3 !== rule.cells.indexOf(b) % 3
    if (rule.type === 'between' && rule.cells.includes(a) && rule.cells.includes(b)) {
      const ends = [rule.cells[0], rule.cells[rule.cells.length - 1]]
      return ends.includes(a) || ends.includes(b)
    }
    if (rule.type === 'thermometer' || rule.type === 'renban') return rule.cells.includes(a) && rule.cells.includes(b)
    return false
  })
}

export function hasMarkedPair(pairs: readonly (readonly [number, number])[] | undefined, a: number, b: number) {
  return pairs?.some(([left, right]) => (left === a && right === b) || (left === b && right === a)) ?? false
}

export function cellsShareEdge(a: number, b: number) {
  return Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9) === 1
}

export function palindromePartner(cells: readonly number[], cell: number) {
  const index = cells.indexOf(cell)
  if (index < 0 || index === cells.length - 1 - index) return undefined
  return cells[cells.length - 1 - index]
}

const ROMAN_TOTALS = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII']

/** Roman numerals used by the Coach two-cell-sum constructor. */
export function sumLabel(sum: number) {
  return ROMAN_TOTALS[sum - 3] ?? String(sum)
}

type CellExclusionRule = Extract<VariantRule, { type: 'entropic' | 'modular' | 'renban' | 'adjacent-total' | 'inequality' | 'palindrome' | 'whispers' }>
type EdgeExclusionRule = Extract<VariantRule, { type: 'non-consecutive' | 'xv' }>
const noCellExclusions: readonly CellExclusionRule[] = []
const exclusionIndexes = new WeakMap<readonly VariantRule[], ReturnType<typeof indexExclusions>>()

// Puzzle definitions share an immutable rule list across Play positions.
function indexExclusions(rules: readonly VariantRule[]) {
  const byCell = Array<CellExclusionRule[] | undefined>(81)
  const edgeRules: EdgeExclusionRule[] = []
  const kropki: Extract<VariantRule, { type: 'kropki' }>[] = []
  let clones: ReturnType<typeof cloneLayout>['at'] | undefined
  for (const rule of rules) {
    switch (rule.type) {
      case 'kropki': kropki.push(rule); continue
      case 'xv': case 'non-consecutive': edgeRules.push(rule); continue
      case 'clone': clones ??= cloneLayout(rules).at; continue
      case 'entropic': case 'modular': case 'renban': case 'adjacent-total': case 'palindrome': case 'whispers':
      case 'inequality': {
        const cells = rule.type === 'inequality' ? [rule.less, rule.greater] : new Set(rule.cells)
        for (const cell of cells) (byCell[cell] ??= []).push(rule)
      }
    }
  }
  const index = { byCell: byCell.map(local => local?.slice()), edgeRules, kropki, clones }
  exclusionIndexes.set(rules, index)
  return index
}

/** Extra pairwise exclusions beyond the same-digit peers used by the player. */
export function variantDigitExclusions(puzzle: VariantPuzzle | undefined, from: number, to: number, digit: number) {
  const rules = puzzle?.rules
  if (!rules?.length) return 0
  const { byCell, edgeRules, kropki, clones } = exclusionIndexes.get(rules) ?? indexExclusions(rules)
  let excluded = kropki.length ? kropkiDigitExclusions(kropki, from, to, digit, 9) : 0
  const clone = clones?.[from]
  if (clone && clone === clones?.[to]) excluded |= 511 & ~(1 << (digit - 1))
  let v = false, x = false, negativeV = false, negativeX = false
  for (const rule of byCell[from] ?? noCellExclusions) {
    if ((rule.type === 'entropic' || rule.type === 'modular') && rule.cells.includes(to)) {
      const samePhase = rule.cells.indexOf(from) % 3 === rule.cells.indexOf(to) % 3
      const group = lineGroupMask(rule.type, digit)
      excluded |= samePhase ? 511 & ~group : group
    }
    if (rule.type === 'renban' && rule.cells.includes(to)) {
      for (let other = 1; other <= 9; other++) if (Math.abs(digit - other) >= rule.cells.length) excluded |= 1 << (other - 1)
    }
    if (rule.type === 'adjacent-total' && (rule.cells[0] === from && rule.cells[1] === to || rule.cells[1] === from && rule.cells[0] === to)) {
      v ||= rule.sum === 5
      x ||= rule.sum === 10
      for (let other = 1; other <= 9; other++) if (digit + other !== rule.sum) excluded |= 1 << (other - 1)
    }
    if (rule.type === 'inequality' && (from === rule.less && to === rule.greater || from === rule.greater && to === rule.less)) {
      for (let other = 1; other <= 9; other++) {
        if (from === rule.less ? other <= digit : other >= digit) excluded |= 1 << (other - 1)
      }
    }
    if (rule.type === 'palindrome' && palindromePartner(rule.cells, from) === to) {
      excluded |= 511 & ~(1 << (digit - 1))
    }
    if (rule.type === 'whispers' && rule.cells.some((cell, i) => i > 0 &&
      (cell === from && rule.cells[i - 1] === to || cell === to && rule.cells[i - 1] === from))) {
      for (let other = 1; other <= 9; other++) if (Math.abs(digit - other) < rule.minDifference) excluded |= 1 << (other - 1)
    }
  }
  if (edgeRules.length && cellsShareEdge(from, to)) for (const rule of edgeRules) {
    if (rule.type === 'xv') {
      v ||= hasMarkedPair(rule.five?.pairs, from, to)
      x ||= hasMarkedPair(rule.ten?.pairs, from, to)
      negativeV ||= rule.five?.negative === true
      negativeX ||= rule.ten?.negative === true
    } else if (!hasMarkedPair(rule.except, from, to)) {
      excluded |= (digit > 1 ? 1 << (digit - 2) : 0) | (digit < 9 ? 1 << digit : 0)
    }
  }
  if (v || x || negativeV || negativeX) for (let other = 1; other <= 9; other++) {
    const sum = digit + other
    if (v && sum !== 5 || x && sum !== 10 ||
      !v && !x && (negativeV && sum === 5 || negativeX && sum === 10)) excluded |= 1 << (other - 1)
  }
  return excluded
}

export function nonConsecutiveDescription(puzzle: VariantPuzzle, rule: Extract<VariantRule, { type: 'non-consecutive' }>) {
  const exceptions = rule.except ?? []
  if (!exceptions.length) return PUZZLE_VARIANTS['non-consecutive'].rule
  const marked = exceptions.every(([a, b]) => puzzle.rules?.some(other =>
    other.type === 'kropki' && hasMarkedPair(other.consecutive?.pairs, a, b)))
  const reference = (cell: number) => `r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}`
  const detail = marked ? 'The white-dot pairs are exempt from this rule.' :
    `These pairs are exempt: ${exceptions.map(([a, b]) => `${reference(a)} and ${reference(b)}`).join('; ')}.`
  return `${PUZZLE_VARIANTS['non-consecutive'].rule} ${detail}`
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
    case 'little-killer': return Object.keys(rule).every(key => ['type', 'cells', 'direction', 'sum'].includes(key)) &&
      Number.isInteger(rule.sum) && validOutsideRay(rule.cells, rule.direction, true) && rule.sum >= rule.cells.length && rule.sum <= rule.cells.length * 9
    case 'sandwich': return Object.keys(rule).every(key => ['type', 'cells', 'direction', 'sum'].includes(key)) &&
      Number.isInteger(rule.sum) && rule.sum >= 0 && rule.sum <= 35 && validOutsideRay(rule.cells, rule.direction)
    case 'x-sum': return Object.keys(rule).every(key => ['type', 'cells', 'direction', 'sum'].includes(key)) &&
      Number.isInteger(rule.sum) && rule.sum >= 1 && rule.sum <= 45 && validOutsideRay(rule.cells, rule.direction)
    case 'skyscrapers': return Object.keys(rule).every(key => ['type', 'cells', 'direction', 'count'].includes(key)) &&
      Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 9 && validOutsideRay(rule.cells, rule.direction)
    case 'clone': return Object.keys(rule).every(key => key === 'type' || key === 'groups') &&
      Array.isArray(rule.groups) && rule.groups.length > 0 && rule.groups.every(group => validCells(group, 2))
    case 'inequality': return validCells([rule.less, rule.greater], 2)
    case 'parity': return validCells(rule.cells, 1) && (rule.parity === 'odd' || rule.parity === 'even')
    case 'quadruple': return Array.isArray(rule.digits) && validQuadruple(rule, 9)
    case 'global-entropy': return Object.keys(rule).every(key => key === 'type')
    case 'anti-knight': case 'anti-king': return true
    case 'non-consecutive': return rule.except === undefined || Array.isArray(rule.except) && rule.except.every(pair =>
      validCells(pair, 2) && pair.length === 2 && cellsShareEdge(pair[0], pair[1]))
    case 'diagonal': return rule.diagonal === 'main' || rule.diagonal === 'anti'
    case 'extra-house': return validCells(rule.cells, 9) && rule.cells.length === 9
    case 'entropic': case 'modular': return Object.keys(rule).every(key => key === 'type' || key === 'cells') && Array.isArray(rule.cells) && rule.cells.length > 0 &&
      rule.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81)
    case 'whispers': return Array.isArray(rule.cells) && rule.cells.length >= 2 && rule.cells.length <= 82 &&
      rule.cells.every((cell, i) => Number.isInteger(cell) && cell >= 0 && cell < 81 && (i === 0 || cell !== rule.cells[i - 1])) &&
      Number.isInteger(rule.minDifference) && rule.minDifference >= 1 && rule.minDifference <= 8
    case 'thermometer': return validCells(rule.cells, 2)
    case 'between': return Object.keys(rule).every(key => key === 'type' || key === 'cells') && validCells(rule.cells, 3)
    case 'region-sum': return Object.keys(rule).every(key => ['type', 'cells', 'groupByRegion', 'segments'].includes(key)) &&
      validCells(rule.cells, 2) && (rule.groupByRegion === undefined || typeof rule.groupByRegion === 'boolean') &&
      (rule.segments === undefined || Array.isArray(rule.segments) && rule.segments.length > 0 &&
        rule.segments.every(path => Array.isArray(path) && path.length > 0 && path.every(cell => Number.isInteger(cell) && rule.cells.includes(cell))) &&
        new Set(rule.segments.flat()).size === rule.cells.length)
    case 'palindrome': case 'renban': return validCells(rule.cells, rule.type === 'renban' ? 1 : 2) &&
      (rule.type !== 'renban' || rule.cells.length <= 9) && (rule.segments === undefined ||
      Array.isArray(rule.segments) && rule.segments.length > 0 &&
      rule.segments.every(path => Array.isArray(path) && path.length > 0 &&
        path.every(cell => Number.isInteger(cell) && rule.cells.includes(cell))) &&
      new Set(rule.segments.flat()).size === rule.cells.length)
    case 'arrow': return validCells([rule.circle, ...(Array.isArray(rule.cells) ? rule.cells : [])], 2)
    case 'killer-cages': return Array.isArray(rule.cages) && rule.cages.length > 0 && rule.cages.every((cage) =>
      cage && validCells(cage.cells, 1) && Number.isInteger(cage.sum) && cage.sum >= 1 && cage.sum <= 45)
    case 'kropki': return [rule.consecutive, rule.ratioTwo].every((marks) => marks === undefined ||
      marks && (marks.negative === undefined || typeof marks.negative === 'boolean') &&
      (marks.pairs === undefined || Array.isArray(marks.pairs) &&
        marks.pairs.every((pair) => validCells(pair, 2) && pair.length === 2)))
    case 'adjacent-total': return validCells(rule.cells, 2) && rule.cells.length === 2 && cellsShareEdge(rule.cells[0], rule.cells[1]) &&
      Number.isInteger(rule.sum) && rule.sum >= 3 && rule.sum <= 17
    case 'xv': return [rule.five, rule.ten].every(marks => marks === undefined ||
      marks && (marks.negative === undefined || typeof marks.negative === 'boolean') &&
      (marks.pairs === undefined || Array.isArray(marks.pairs) && marks.pairs.every(pair =>
        validCells(pair, 2) && pair.length === 2 && cellsShareEdge(pair[0], pair[1]))))
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

export function isPlayablePuzzle(id: unknown, puzzle: unknown, fog?: unknown): puzzle is VariantPuzzle {
  if ((!isPuzzleVariantId(id) || id === 'classic') ||
    !puzzle || typeof puzzle !== 'object') return false
  const { version, givens, rules, regions } = puzzle as VariantPuzzle
  if (version !== 1 || typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) return false
  if (regions !== undefined && regions?.type !== 'boxes' &&
    !(regions?.type === 'jigsaw' && validJigsawRegions(regions.regions))) return false
  // A 9×9 grid has 144 shared edges, so the cell count cannot cap its clues.
  // The interchange decoders bound the encoded and decoded input sizes.
  if (rules !== undefined && (!Array.isArray(rules) || !rules.every(isPlayableRule))) return false
  const kind = variantIdForPuzzle(puzzle as VariantPuzzle)
  if (rules?.some(rule => rule.type === 'region-sum' && regionSumParts(rule, regions).length < 2)) return false
  return fog === undefined ? kind !== 'classic' && (id === 'mixed' || kind === id) : id === 'mixed' && isFogDefinition(fog)
}

const RULE_NAMES: Record<VariantRule['type'], string> = {
  clone: VARIANTS.clone.name,
  'region-sum': VARIANTS['region-sum'].name,
  entropic: PUZZLE_VARIANTS.entropic.name,
  modular: PUZZLE_VARIANTS.modular.name,
  'little-killer': VARIANTS['little-killer'].name,
  sandwich: VARIANTS.sandwich.name,
  'x-sum': VARIANTS['x-sum'].name,
  skyscrapers: VARIANTS.skyscrapers.name,
  'global-entropy': PUZZLE_VARIANTS['global-entropy'].name,
  renban: PUZZLE_VARIANTS.renban.name,
  'adjacent-total': PUZZLE_VARIANTS['adjacent-total'].name,
  xv: PUZZLE_VARIANTS.xv.name,
  inequality: PUZZLE_VARIANTS.inequality.name,
  'extra-house': 'Extra regions',
  diagonal: VARIANTS.diagonal.name,
  'killer-cages': VARIANTS['killer-cages'].name,
  'anti-knight': VARIANTS['anti-knight'].name,
  thermometer: VARIANTS.thermometer.name,
  arrow: VARIANTS.arrow.name,
  kropki: VARIANTS.kropki.name,
  whispers: PUZZLE_VARIANTS.whispers.name,
  palindrome: PUZZLE_VARIANTS.palindrome.name,
  between: PUZZLE_VARIANTS.between.name,
  quadruple: PUZZLE_VARIANTS.quadruple.name,
  parity: PUZZLE_VARIANTS.parity.name,
  'anti-king': PUZZLE_VARIANTS['anti-king'].name,
  'non-consecutive': PUZZLE_VARIANTS['non-consecutive'].name,
}

/** Describe the active puzzle independently of its generation recipe. */
export function variantName(variant?: Pick<VariantGame, 'id' | 'puzzle' | 'fog'>): string {
  if (!variant) return VARIANTS.classic.name
  if (variant.fog) return 'Fog of War'
  if (variant.id !== 'mixed') return PUZZLE_VARIANTS[variant.id].name
  const { rules, regions } = variant.puzzle
  const names = [
    ...(regions?.type === 'jigsaw' ? [VARIANTS.jigsaw.name] : []),
    ...(rules?.map(rule => RULE_NAMES[rule.type]) ?? []),
  ]
  return [...new Set(names)].filter(Boolean).join(' + ')
}

export type VariantRuleSectionId = 'classic' | 'jigsaw' | VariantRule['type']
export type VariantRuleSection = { id: VariantRuleSectionId; title: string; descriptions: string[] }

function baseRuleSection(puzzle: VariantPuzzle): VariantRuleSection {
  return puzzle.regions?.type === 'jigsaw'
    ? { id: 'jigsaw', title: 'Jigsaw Sudoku', descriptions: [VARIANTS.jigsaw.rule] }
    : { id: 'classic', title: 'Normal Sudoku', descriptions: [VARIANTS.classic.rule] }
}

function describedVariantRules(puzzle: VariantPuzzle) {
  const rules = puzzle.rules ?? []
  const disjoint = disjointGroupRuleIndices(rules)
  return rules.map((rule, index) => {
    const descriptions: string[] = []
    switch (rule.type) {
      case 'little-killer':
        descriptions.push(VARIANTS['little-killer'].rule, outsideClueLabel(rule))
        break
      case 'sandwich':
        descriptions.push(VARIANTS.sandwich.rule, outsideClueLabel(rule))
        break
      case 'x-sum':
        descriptions.push(VARIANTS['x-sum'].rule, outsideClueLabel(rule))
        break
      case 'skyscrapers':
        descriptions.push(VARIANTS.skyscrapers.rule, outsideClueLabel(rule))
        break
      case 'clone':
        descriptions.push(VARIANTS.clone.rule)
        for (const set of cloneLayout(puzzle.rules).sets) descriptions.push(`Clone ${set.label}: ${set.cells
          .map(cell => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`).join(', ')} must contain the same digit.`)
        break
      case 'global-entropy':
        descriptions.push(PUZZLE_VARIANTS['global-entropy'].rule)
        break
      case 'entropic':
        descriptions.push(PUZZLE_VARIANTS.entropic.rule)
        break
      case 'modular':
        descriptions.push(PUZZLE_VARIANTS.modular.rule)
        break
      case 'between':
        descriptions.push(PUZZLE_VARIANTS.between.rule)
        if (lineSkipsCells(rule.cells)) {
          descriptions.push('A dashed Between connector skips cells. Only the endpoint circles and cells with a small dot belong to that line.')
        }
        break
      case 'region-sum': {
        descriptions.push(VARIANTS['region-sum'].rule)
        const number = puzzle.rules!.slice(0, index + 1).filter(rule => rule.type === 'region-sum').length
        if (rule.segments) {
          const at = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
          descriptions.push(`Region Sum line ${number}: ${regionSumParts(rule, puzzle.regions)
            .map(part => part.map(at).join(' + ')).join(' = ')}. Each listed group has the same total.`)
        } else descriptions.push(`Region Sum line ${number}: ${rule.groupByRegion
          ? 'combine all visits to the same region into one total; each visited region has the same total.'
          : 'each separate visit to a region has the same total.'}`)
        if ((rule.segments ?? [rule.cells]).some(path => lineSkipsCells(path))) descriptions.push(
          'A dashed Region Sum connector skips cells. Only cells with a small dot belong to that line.')
        break
      }
      case 'renban':
        descriptions.push(PUZZLE_VARIANTS.renban.rule)
        break
      case 'inequality':
        descriptions.push(PUZZLE_VARIANTS.inequality.rule)
        break
      case 'adjacent-total':
        descriptions.push(PUZZLE_VARIANTS['adjacent-total'].rule)
        break
      case 'xv':
        descriptions.push(PUZZLE_VARIANTS.xv.rule)
        if (rule.five?.negative) descriptions.push('Digits in cells sharing an edge without a V or X cannot sum to 5.')
        if (rule.ten?.negative) descriptions.push('Digits in cells sharing an edge without a V or X cannot sum to 10.')
        break
      case 'non-consecutive':
        descriptions.push(nonConsecutiveDescription(puzzle, rule))
        break
      case 'anti-king':
        descriptions.push(PUZZLE_VARIANTS['anti-king'].rule)
        break
      case 'parity':
        descriptions.push(rule.parity === 'odd'
          ? 'Cells with a circle contain an odd digit: 1, 3, 5, 7, or 9.'
          : 'Cells with a square contain an even digit: 2, 4, 6, or 8.')
        break
      case 'whispers': {
        const at = (cell: number) => `r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}`
        descriptions.push(`Whispers line from ${at(rule.cells[0])} to ${at(rule.cells.at(-1)!)}: neighboring digits along it must differ by at least ${rule.minDifference}. Cells farther apart on the line may repeat a digit if the other rules allow it.`)
        break
      }
      case 'palindrome':
        descriptions.push(PUZZLE_VARIANTS.palindrome.rule)
        if (rule.segments) descriptions.push(`This Palindrome clue pairs ${new Intl.ListFormat('en', { type: 'conjunction' }).format(
          rule.cells.slice(0, Math.floor(rule.cells.length / 2)).map((cell, i) => {
            const at = (site: number) => `r${Math.floor(site / 9) + 1}c${site % 9 + 1}`
            return `${at(cell)} with ${at(rule.cells[rule.cells.length - 1 - i])}`
          }))}.`)
        break
      case 'quadruple':
        descriptions.push(PUZZLE_VARIANTS.quadruple.rule)
        break
      case 'diagonal':
        descriptions.push(`The ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal must also contain the digits 1–9 once each.`)
        break
      case 'extra-house':
        descriptions.push(disjoint.has(index) ? DISJOINT_GROUPS_RULE : 'Each shaded extra region must also contain the digits 1–9 once each.')
        break
      case 'kropki': {
        const marked = [
          rule.consecutive?.pairs?.length && 'Digits separated by a white dot are consecutive.',
          rule.ratioTwo?.pairs?.length && 'Across a black dot, one digit is double the other.',
        ].filter(Boolean).join(' ')
        if (marked) descriptions.push(marked)
        if (rule.consecutive?.negative) descriptions.push('Digits in cells sharing an edge without a Kropki dot cannot be consecutive.')
        if (rule.ratioTwo?.negative) descriptions.push('For cells sharing an edge without a Kropki dot, neither digit can be twice the other.')
        break
      }
      default:
        if (isVariantId(rule.type)) descriptions.push(VARIANTS[rule.type].rule)
    }
    return { id: rule.type, descriptions }
  })
}

/** Explain every active rule, including the direction and negative dot clues. */
export function variantRuleDescriptions(puzzle: VariantPuzzle, fog?: FogDefinition): string[] {
  return [...new Set([...(fog ? [FOG_RULE] : []), ...baseRuleSection(puzzle).descriptions, ...describedVariantRules(puzzle).flatMap(rule => rule.descriptions)])]
}

export function variantRuleSections(puzzle: VariantPuzzle, fog?: FogDefinition): VariantRuleSection[] {
  const sections = new Map<VariantRuleSectionId, VariantRuleSection>()
  const base = baseRuleSection(puzzle)
  sections.set(base.id, fog ? { ...base, descriptions: [FOG_RULE, ...base.descriptions] } : base)
  for (const { id, descriptions } of describedVariantRules(puzzle)) {
    if (!descriptions.length) continue
    const current = sections.get(id)
    if (current) current.descriptions = [...new Set([...current.descriptions, ...descriptions])]
    else sections.set(id, { id, title: id === 'killer-cages' ? 'Killer Sudoku' : RULE_NAMES[id], descriptions })
  }
  return [...sections.values()]
}

export function validVariantSave(variant: unknown, givens: string): variant is VariantGame {
  if (!variant || typeof variant !== 'object') return false
  const { id, puzzle, solution, fog } = variant as VariantGame
  return isPlayablePuzzle(id, puzzle, fog) && puzzle.givens === givens && typeof solution === 'string' &&
    /^[1-9]{81}$/.test(solution) && [...givens].every((digit, cell) => digit === '0' || digit === solution[cell])
}
