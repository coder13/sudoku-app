import { difficultyIndex } from './difficulty.ts'
import type { Difficulty, VariantClueLayout, VariantGenerationRequest, VariantPuzzle, VariantRule } from './engine.ts'
import seedBank from './variant-seeds.json' with { type: 'json' }
import { quadrupleCells, WINDOKU_REGIONS, type PlayableVariant } from './variants.ts'

export type VariantSeed = {
  seed: number
  maxGivens: number
  cageSizes?: number[]
  dotCount?: number
  layout?: string
  lines?: number[][]
  cloneGroups?: number[][][]
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
    case 'anti-knight':
      rules.push({ type: 'anti-knight' })
      break
    case 'killer-cages':
      derivedClues.push({ type: 'killer-cage-sizes', sizes: recipe.cageSizes!, coverGrid: true })
      break
    case 'kropki':
      derivedClues.push({ type: 'markers', family: 'kropki', count: recipe.dotCount })
      break
    case 'thermometer': case 'between': case 'region-sum':
      for (const cells of recipe.lines!) rules.push({ type: id, cells })
      break
    case 'clone':
      for (const groups of recipe.cloneGroups!) rules.push({ type: 'clone', groups })
      break
    case 'arrow':
      for (const [circle, ...cells] of recipe.lines!) rules.push({ type: 'arrow', circle, cells })
      break
  }
  return {
    type: 'generate-variant', seed, maxAttempts: 1,
    template: { version: 1, givens: recipe.layout ?? '0'.repeat(81), rules,
      regions: id === 'jigsaw' ? jigsawLayout(recipe.regions!) : undefined },
    derivedClues, givens: [0, recipe.maxGivens], requiredRule: id === 'windoku' ? 'extra-house' : id, difficulty, techniqueOrder,
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
    regions: puzzle.regions?.type === 'jigsaw'
      ? { type: 'jigsaw', regions: puzzle.regions.regions.map((region) => region.map(cell)) } : puzzle.regions,
    rules: puzzle.rules?.map((rule) => {
      switch (rule.type) {
        case 'diagonal': {
          const start = cell(rule.diagonal === 'main' ? 0 : 8)
          return { ...rule, diagonal: start === 0 || start === 80 ? 'main' : 'anti' }
        }
        case 'killer-cages':
          return { ...rule, cages: rule.cages.map((cage) => ({ ...cage, cells: cage.cells.map(cell) })) }
        case 'parity': case 'extra-house': return { ...rule, cells: rule.cells.map(cell) }
        case 'quadruple': return { ...rule, topLeft: Math.min(...quadrupleCells(rule.topLeft).map(cell)) }
        case 'clone': return { ...rule, groups: rule.groups.map(group => group.map(cell)) }
        case 'inequality': return { ...rule, less: cell(rule.less), greater: cell(rule.greater) }
        case 'non-consecutive': return { ...rule, ...(rule.except && { except: rule.except.map(([a, b]) => [cell(a), cell(b)] as const) }) }
        case 'entropic': case 'modular': case 'whispers': return { ...rule, cells: rule.cells.map(cell) }
        case 'palindrome': case 'renban': case 'region-sum': return { ...rule, cells: rule.cells.map(cell),
          ...(rule.segments && { segments: rule.segments.map(path => path.map(cell)) }) }
        case 'thermometer': case 'between': return { ...rule, cells: rule.cells.map(cell) }
        case 'arrow': return { ...rule, circle: cell(rule.circle), cells: rule.cells.map(cell) }
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
