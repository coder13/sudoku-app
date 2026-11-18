import { difficultyIndex } from './difficulty.ts'
import type { Deduction, Difficulty, VariantDeduction, VariantHouse, VariantPuzzle } from './engine.ts'
import { layoutPairing } from './sinclair-layout.ts'
import weights from './sinclair-weights.json' with { type: 'json' }
import type { VariantId } from './variants.ts'

type Family = 'classic' | 'killer' | 'x' | 'transfer'
type Table = Partial<Record<string, Partial<Record<string, number>>>>
const tables: Table[] = weights.counts
const vocab = weights.vocabulary
const tokens = new Map(vocab.map((id, index) => [id, index]))
const probability = tables.map(() => new Map<string, number[]>())

export function sinclairSelection(method: string, puzzle: VariantPuzzle, distance: number) {
  const pairing = layoutPairing(puzzle)
  return { method, pairing, distance, rank: distance + 4 * (1 - pairing.score) }
}

function probabilities(component: number, context: string): number[] {
  const cached = probability[component].get(context)
  if (cached) return cached
  const counts = tables[component][context]
  if (!counts) return probabilities(0, '*')
  const prior = component ? probabilities(0, '*') : vocab.map(() => 1 / vocab.length)
  const strength = component ? 10 : 4
  const total = Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), strength)
  const result = prior.map((p, i) => ((counts[i] ?? 0) + strength * p) / total)
  probability[component].set(context, result)
  return result
}

export function classicSymbol(id: string) {
  switch (id) {
    case 'full-house': return id
    case 'hidden-single-box': return 'box-single'
    case 'hidden-single': return id
    case 'naked-single': return 'cell-single'
    case 'cage-house-sum': return 'house-sum'
    case 'cage-combinations': return 'cage'
    case 'pointing': case 'claiming': case 'locked-candidates': return 'intersection'
  }
  // Match the ordering of the training vocabulary when technique names overlap.
  if (/forcing|exocet/.test(id)) return 'forcing'
  if (id.includes('overlay')) return 'overlay'
  if (/fish|x-wing/.test(id)) return 'fish'
  if (/pair|triple|quadruple/.test(id)) return 'subset'
  if (/rectangle|unique-loop|bug-plus/.test(id)) return 'uniqueness'
  if (/chain|aic|loop|color|medusa|als-/.test(id)) return 'chain'
  if (/wing|kite|skyscraper/.test(id)) return 'wing'
  return 'other'
}

export type SinclairEvent = { token: string; placements: number; eliminations: number; cell: number }
const isDiagonal = (house: VariantHouse | null) => !!house && 'diagonal' in house

export function sinclairEvent(step: Deduction | VariantDeduction): SinclairEvent {
  const evidence = step.evidence
  const diagonal = evidence && 'type' in evidence && (evidence.type === 'single' && isDiagonal(evidence.house) ||
    evidence.type === 'intersection' && (isDiagonal(evidence.source) || isDiagonal(evidence.target)))
  const placements = step.actions.filter(action => 'place' in action).length
  const first = step.actions[0]
  return { token: diagonal ? 'diagonal' : classicSymbol(step.technique), placements, eliminations: step.actions.length - placements,
    cell: ('place' in first ? first.place : first.eliminate).cell }
}

/** Single-path version of the edition's code length, replay prediction and technique-profile score. */
export function sinclairDistance(variant: VariantId, tier: Difficulty, steps: readonly (Deduction | VariantDeduction)[]) {
  return sinclairEventDistance(variant, tier, steps.map(sinclairEvent))
}

export function sinclairEventDistance(variant: VariantId, tier: Difficulty, events: readonly SinclairEvent[]) {
  const family: Family = variant === 'classic' ? 'classic' : variant === 'killer-cages' ? 'killer' : variant === 'diagonal' ? 'x' : 'transfer'
  const grade = difficultyIndex(tier)
  const count = vocab.map(() => 0)
  const quarters = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0])
  const total = events.reduce((sum, e) => sum + e.placements, 0)
  let filled = 0, bits = 0, previous = '^', last = '^', lastCell = -1
  for (const { token, placements, eliminations, cell } of events) {
    const phase = Math.min(3, Math.floor(4 * filled / Math.max(1, total)))
    const index = tokens.get(token)!
    const keys = ['*', family, `${family}/${Math.min(3, Math.floor(grade / 2))}/${phase}`,
      `${family}/${phase}/${last}`, `${last}/${phase}`, `${family}/${previous}/${last}`]
    bits -= Math.log2(keys.reduce((p, key, j) => p + weights.weights[j] * probabilities(j, key)[index], 0))
    count[index]++
    const row = Math.floor(cell / 9), col = cell % 9
    const prevRow = Math.floor(lastCell / 9), prevCol = lastCell % 9
    const nearby = lastCell >= 0 && (row === prevRow || col === prevCol ||
      Math.floor(row / 3) === Math.floor(prevRow / 3) && Math.floor(col / 3) === Math.floor(prevCol / 3))
    const q = quarters[phase]
    q[0]++
    q[1] += Number(placements > 0)
    q[2] += Math.min(eliminations, 15) / 15
    q[3] += Number(nearby)
    q[4] += Number(last === token)
    filled += placements
    previous = last
    last = token
    lastCell = cell
  }
  const n = events.length
  if (!n) throw new Error('A Sinclair solve needs at least one deduction.')
  const path = [Math.log1p(n) / 5, Math.log1p(count.filter(Boolean).length) / 3, ...count.map(x => x / n),
    ...quarters.flatMap(q => q.slice(1).map(x => x / Math.max(1, q[0])))]
  const features = [Number(family === 'killer'), Number(family === 'x'), grade / 9, ...path]
  const head = weights.replay
  const predictions = head.offset.map((offset, j) => {
    if (!head.enabled[j]) return head.familyMeans[family][j]
    const y = features.reduce((s, value, i) => s + (value - head.center[i]) / head.scale[i] * head.coefficients[i][j], offset)
    return Math.max(0, Math.min(1, y))
  })
  const target = weights.profiles[weights.targets[family][grade]]
  const player = predictions.reduce((s, v, j) => s + Math.abs(v - target.player[j]) / target.playerScale[j], 0) / predictions.length
  const profile = path.reduce((s, v, j) => s + Math.min(4, Math.abs(v - target.path[j]) / target.pathScale[j]), 0) / path.length
  return .45 * Math.min(5, Math.abs(bits / n - target.bits) / target.bitsScale) + .30 * player + .25 * profile
}
