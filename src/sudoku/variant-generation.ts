import { difficultyIndex } from './difficulty.ts'
import type { Difficulty, VariantClueLayout, VariantGenerationRequest, VariantPuzzle, VariantRule } from './engine.ts'
import seedBank from './variant-seeds.json' with { type: 'json' }
import { clueDelta } from './outside-clues.ts'
import { quadrupleCells, WINDOKU_REGIONS, type PlayableVariant } from './variants.ts'

export type VariantSeed = {
  seed: number
  maxGivens: number
  minGivens?: number
  maxAttempts?: number
  /** Fresh-search budget after all checked recipes fail to produce an unplayed puzzle. */
  retryAttempts?: number
  cageSizes?: number[]
  dotCount?: number
  markCount?: number
  markedCells?: number[]
  quadruples?: { topLeft: number; clueSize: number }[]
  minDifference?: number
  layout?: string
  lines?: number[][]
  pairs?: number[][]
  cloneGroups?: number[][][]
  outside?: ({ cells: number[]; direction: string } & ({ sum: number; count?: never } | { count: number; sum?: never }))[]
  regions?: string
}

// The engine replays these bounded searches when a fresh attempt misses its target.
export const variantSeeds: Record<PlayableVariant, Partial<Record<Difficulty, VariantSeed[]>>> = seedBank

export function jigsawLayout(regionMap: string): Extract<NonNullable<VariantPuzzle['regions']>, { type: 'jigsaw' }> {
  return { type: 'jigsaw', regions: Array.from({ length: 9 }, (_, region) =>
    [...regionMap].flatMap((id, cell) => id === String(region) ? [cell] : [])) }
}

const omitted = new Set([
  'forcing-net', 'multi-sector-locked-sets', 'sk-loop', 'grouped-discontinuous-nice-loop', 'grouped-continuous-nice-loop',
])

export function variantTechniqueOrder(variantOrder: readonly string[], classicOrder: readonly string[], difficulties: Partial<Record<string, Difficulty>>) {
  return [...new Set([...variantOrder, ...classicOrder.filter((id) => !omitted.has(id))])]
    .sort((a, b) => difficultyIndex(difficulties[a] ?? 'impossible') - difficultyIndex(difficulties[b] ?? 'impossible'))
}

export function withMediumVariantTechniques(order: string[], tiers: Partial<Record<string, Difficulty>>, techniques: readonly string[]) {
  if (!techniques.length) return order
  const index = order.findIndex(id => difficultyIndex(tiers[id] ?? 'impossible') > difficultyIndex('medium'))
  return index < 0 ? [...order, ...techniques] : [...order.slice(0, index), ...techniques, ...order.slice(index)]
}

export function variantGenerationRequest(
  id: PlayableVariant, difficulty: Difficulty, recipe: VariantSeed, techniqueOrder: readonly string[],
  seed = recipe.seed,
): VariantGenerationRequest {
  const rules: VariantRule[] = []
  const derivedClues: VariantClueLayout[] = []
  switch (id) {
    case 'windoku':
      rules.push(...WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })))
      break
    case 'diagonal':
      rules.push({ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' })
      break
    case 'anti-knight': case 'anti-king': case 'non-consecutive': case 'global-entropy':
      rules.push({ type: id })
      break
    case 'killer-cages':
      derivedClues.push({ type: 'killer-cage-sizes', sizes: recipe.cageSizes!, coverGrid: true })
      break
    case 'kropki':
      derivedClues.push({ type: 'markers', family: 'kropki', count: recipe.dotCount })
      break
    case 'xv':
      derivedClues.push({ type: 'markers', family: 'xv', count: recipe.markCount })
      break
    case 'quadruple':
      for (const clue of recipe.quadruples!) derivedClues.push({ type: 'quadruple', ...clue })
      break
    case 'parity':
      derivedClues.push({ type: 'parity', cells: recipe.markedCells! })
      break
    case 'adjacent-total':
      for (const [a, b] of recipe.pairs!) derivedClues.push({ type: 'adjacent-total', cells: [a, b] })
      break
    case 'inequality':
      for (const [a, b] of recipe.pairs!) derivedClues.push({ type: 'inequality', cells: [a, b] })
      break
    case 'thermometer': case 'between': case 'region-sum': case 'palindrome': case 'entropic': case 'modular': case 'renban':
      for (const cells of recipe.lines!) rules.push({ type: id, cells })
      break
    case 'whispers':
      for (const cells of recipe.lines!) rules.push({ type: 'whispers', cells, minDifference: recipe.minDifference! })
      break
    case 'little-killer':
      for (const clue of recipe.outside!) {
        const direction = clue.direction
        if (typeof clue.sum !== 'number') throw new Error('Missing diagonal recipe total.')
        if (direction !== 'north-east' && direction !== 'south-east' && direction !== 'south-west' && direction !== 'north-west') throw new Error('Invalid diagonal recipe direction.')
        rules.push({ type: 'little-killer', cells: clue.cells, sum: clue.sum, direction })
      }
      break
    case 'sandwich': case 'x-sum':
      for (const clue of recipe.outside!) {
        const direction = clue.direction
        if (typeof clue.sum !== 'number') throw new Error('Missing outside-clue recipe total.')
        if (direction !== 'north' && direction !== 'east' && direction !== 'south' && direction !== 'west') throw new Error('Invalid outside-clue recipe direction.')
        rules.push({ type: id, cells: clue.cells, sum: clue.sum, direction })
      }
      break
    case 'skyscrapers':
      for (const clue of recipe.outside!) {
        const direction = clue.direction
        if (typeof clue.count !== 'number' || direction !== 'north' && direction !== 'east' && direction !== 'south' && direction !== 'west') throw new Error('Invalid visibility-clue recipe.')
        rules.push({ type: 'skyscrapers', cells: clue.cells, count: clue.count, direction })
      }
      break
    case 'clone':
      for (const groups of recipe.cloneGroups!) rules.push({ type: 'clone', groups })
      break
    case 'arrow':
      for (const [circle, ...cells] of recipe.lines!) rules.push({ type: 'arrow', circle, cells })
      break
  }
  return {
    type: 'generate-variant', seed, maxAttempts: recipe.maxAttempts ?? 1,
    template: { version: 1, givens: recipe.layout ?? '0'.repeat(81), rules,
      regions: id === 'jigsaw' ? jigsawLayout(recipe.regions!) : undefined },
    derivedClues, givens: [recipe.minGivens ?? 0, recipe.maxGivens], requiredRule: id === 'windoku' ? 'extra-house' : id, difficulty, techniqueOrder,
  }
}

export function reflectVariant(puzzle: VariantPuzzle, symmetry: number): VariantPuzzle {
  function cell(index: number) {
    let row = Math.floor(index / 9)
    let column = index % 9
    if (symmetry & 1) [row, column] = [column, row]
    if (symmetry & 2) row = 8 - row
    if (symmetry & 4) column = 8 - column
    return row * 9 + column
  }

  const givens = Array<string>(81)
  for (let index = 0; index < 81; index++) givens[cell(index)] = puzzle.givens[index]
  return {
    ...puzzle, givens: givens.join(''),
    regions: puzzle.regions && puzzle.regions.type !== 'boxes'
      ? { ...puzzle.regions, regions: puzzle.regions.regions.map(region => region.map(cell)) } : puzzle.regions,
    rules: puzzle.rules?.map((rule) => {
      switch (rule.type) {
        case 'diagonal': {
          const start = cell(rule.diagonal === 'main' ? 0 : 8)
          return { ...rule, diagonal: start === 0 || start === 80 ? 'main' : 'anti' }
        }
        case 'killer-cages':
          return { ...rule, cages: rule.cages.map((cage) => ({ ...cage, cells: cage.cells.map(cell) })) }
        case 'parity': case 'extra-house': case 'distinct-cells': case 'consecutive-run': return { ...rule, cells: rule.cells.map(cell) }
        case 'inside-grid': return { ...rule, rows: rule.rows.map(row => row.map(cell)) }
        case 'lettered-quadruples': return { ...rule, clues: rule.clues.map(clue => ({
          ...clue, topLeft: Math.min(...quadrupleCells(clue.topLeft).map(cell)),
        })) }
        case 'quadruple': case 'quadruple-sum': return { ...rule, topLeft: Math.min(...quadrupleCells(rule.topLeft).map(cell)) }
        case 'little-killer': {
          const [dr, dc] = clueDelta(rule.direction)
          let row = dr, column = dc
          if (symmetry & 1) [row, column] = [column, row]
          if (symmetry & 2) row = -row
          if (symmetry & 4) column = -column
          const direction = row < 0 ? column < 0 ? 'north-west' : 'north-east' : column < 0 ? 'south-west' : 'south-east'
          return { ...rule, cells: rule.cells.map(cell), direction }
        }
        case 'sandwich': case 'x-sum': case 'skyscrapers': {
          const cells = rule.cells.map(cell), step = cells[1] - cells[0]
          return { ...rule, cells, direction: step === 1 ? 'east' : step === -1 ? 'west' : step === 9 ? 'south' : 'north' }
        }
        case 'clone': return { ...rule, groups: rule.groups.map(group => group.map(cell)) }
        case 'inequality': return { ...rule, less: cell(rule.less), greater: cell(rule.greater) }
        case 'minimum': case 'maximum': return { ...rule, cells: rule.cells.map(cell) }
        case 'labeled-dots': return { ...rule, marks: rule.marks.map(mark => ({
          ...mark, cells: [cell(mark.cells[0]), cell(mark.cells[1])] as const,
        })) }
        case 'non-consecutive': return { ...rule, ...(rule.except && { except: rule.except.map(([a, b]) => [cell(a), cell(b)] as const) }) }
        case 'entropic': case 'modular': case 'whispers': return { ...rule, cells: rule.cells.map(cell) }
        case 'palindrome': case 'renban': case 'region-sum': return { ...rule, cells: rule.cells.map(cell),
          ...(rule.segments && { segments: rule.segments.map(path => path.map(cell)) }) }
        case 'thermometer': case 'between': case 'lockout': return { ...rule, cells: rule.cells.map(cell) }
        case 'arrow': return { ...rule, circle: cell(rule.circle), cells: rule.cells.map(cell) }
        case 'pill-arrow': return { ...rule, pill: [cell(rule.pill[0]), cell(rule.pill[1])], cells: rule.cells.map(cell) }
        case 'kropki': {
          const reflectMarks = (marks: typeof rule.consecutive) =>
            marks && { ...marks, pairs: marks.pairs?.map(([a, b]) => [cell(a), cell(b)] as const) }
          return { ...rule, consecutive: reflectMarks(rule.consecutive), ratioTwo: reflectMarks(rule.ratioTwo) }
        }
        case 'adjacent-total': return { ...rule, cells: [cell(rule.cells[0]), cell(rule.cells[1])] as const }
        case 'xv': {
          const reflectMarks = (marks: typeof rule.five) =>
            marks && { ...marks, pairs: marks.pairs?.map(([a, b]) => [cell(a), cell(b)] as const) }
          return { ...rule, ...(rule.five && { five: reflectMarks(rule.five) }), ...(rule.ten && { ten: reflectMarks(rule.ten) }) }
        }
        default: return rule
      }
    }),
  }
}
