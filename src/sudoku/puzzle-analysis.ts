import type { Candidate, DeductionAction, DeductionMatch, HintChoice, ProofPattern } from './engine'

export const TECHNIQUE_FINDER_TITLE = 'Techniques'

// Keep each technique in one family. New engine techniques automatically appear
// in "Other techniques" until a more specific category is added.
export const ANALYSIS_GROUPS = [
  { title: 'Singles', techniques: ['full-house', 'hidden-single-box', 'naked-single', 'hidden-single'] },
  { title: 'Locked candidates', techniques: ['pointing', 'claiming'] },
  { title: 'Subsets', techniques: [
    'locked-pair', 'locked-triple', 'naked-pair', 'hidden-pair', 'naked-triple',
    'hidden-triple', 'naked-quadruple', 'hidden-quadruple',
  ] },
  { title: 'Wings', techniques: [
    'w-wing', 'xy-wing', 'xyz-wing', 'wxyz-wing',
    'firework-w-wing', 'firework-l-wing', 'firework-als-wing',
  ] },
  { title: 'Fish', techniques: [
    'x-wing', 'swordfish', 'jellyfish', 'finned-x-wing', 'sashimi-x-wing',
    'finned-swordfish', 'sashimi-swordfish', 'finned-jellyfish', 'sashimi-jellyfish',
    'franken-fish', 'mutant-fish', 'kraken-fish-1', 'kraken-fish-2',
  ] },
  { title: 'Single-digit patterns', techniques: [
    'skyscraper', 'two-string-kite', 'empty-rectangle', 'simple-coloring',
  ] },
  { title: 'Uniqueness', techniques: [
    'bug-plus-one', 'unique-rectangle-1', 'unique-rectangle-2', 'unique-rectangle-3',
    'unique-rectangle-4', 'unique-rectangle-5', 'unique-rectangle-6',
    'hidden-rectangle', 'unique-loop',
  ] },
  { title: 'Chains and coloring', techniques: [
    '3d-medusa', 'multi-coloring', 'x-chain', 'xy-chain', 'aic', 'discontinuous-nice-loop',
    'continuous-nice-loop', 'grouped-aic', 'grouped-discontinuous-nice-loop',
    'grouped-continuous-nice-loop', 'firework-aic', 'tridagon-aic',
    'unique-rectangle-aic', 'unique-rectangle-discontinuous-nice-loop', 'unique-rectangle-continuous-nice-loop',
  ] },
  { title: 'Almost locked sets', techniques: [
    'als-xz', 'als-xy-wing', 'als-chain', 'als-aic',
    'als-discontinuous-nice-loop', 'als-continuous-nice-loop', 'sue-de-coq',
    'death-blossom', 'multi-sector-locked-sets',
  ] },
  { title: 'Advanced patterns', techniques: [
    'fireworks', 'aligned-pair-exclusion', 'aligned-triplet-exclusion',
    'tridagon', 'exocet', 'senior-exocet', 'double-exocet', 'sk-loop',
    'pattern-overlay', 'pairwise-pattern-overlay', 'triple-pattern-overlay',
    'quadruple-pattern-overlay', 'quintuple-pattern-overlay',
  ] },
  { title: 'Forcing techniques', techniques: [
    'tridagon-forcing-net', 'forcing-chain', 'forcing-net',
    'dynamic-forcing-net', 'advanced-forcing-net', 'nested-forcing-net',
  ] },
] as const

export const ANALYSIS_TECHNIQUES = ANALYSIS_GROUPS.flatMap(({ techniques }) => [...techniques])

export type AnalysisGroup = { title: string; techniques: string[] }

const CLASSIC_SIZE = 9
const CLASSIC_CELLS = CLASSIC_SIZE * CLASSIC_SIZE
const CLASSIC_HOUSES = [
  ...Array.from({ length: CLASSIC_SIZE }, (_, row) => Array.from({ length: CLASSIC_SIZE }, (_, column) => row * CLASSIC_SIZE + column)),
  ...Array.from({ length: CLASSIC_SIZE }, (_, column) => Array.from({ length: CLASSIC_SIZE }, (_, row) => row * CLASSIC_SIZE + column)),
  ...Array.from({ length: CLASSIC_SIZE }, (_, box) => Array.from({ length: CLASSIC_SIZE }, (_, offset) =>
    (Math.floor(box / 3) * 3 + Math.floor(offset / 3)) * CLASSIC_SIZE + (box % 3) * 3 + offset % 3)),
]

/** Count the basic classic techniques directly from one position's candidates.
 * These bounded scans match the engine's distinct cell/digit target counts.
 */
export function classicBasicTechniqueCounts(values: string, eliminations?: readonly number[]) {
  if (values.length !== CLASSIC_CELLS) return {}
  const masks = Array<number>(CLASSIC_CELLS).fill(0)
  for (let cell = 0; cell < CLASSIC_CELLS; cell++) {
    if (values[cell] !== '0') continue
    const row = Math.floor(cell / CLASSIC_SIZE)
    const column = cell % CLASSIC_SIZE
    const boxRow = Math.floor(row / 3) * 3
    const boxColumn = Math.floor(column / 3) * 3
    let mask = 0x1ff
    for (let index = 0; index < CLASSIC_SIZE; index++) {
      const rowDigit = Number(values[row * CLASSIC_SIZE + index])
      const columnDigit = Number(values[index * CLASSIC_SIZE + column])
      if (rowDigit) mask &= ~(1 << (rowDigit - 1))
      if (columnDigit) mask &= ~(1 << (columnDigit - 1))
      const boxDigit = Number(values[(boxRow + Math.floor(index / 3)) * CLASSIC_SIZE + boxColumn + index % 3])
      if (boxDigit) mask &= ~(1 << (boxDigit - 1))
    }
    masks[cell] = mask & ~(eliminations?.[cell] ?? 0) & 0x1ff
  }
  if (masks.some((mask, cell) => values[cell] === '0' && mask === 0)) return {}
  for (const house of CLASSIC_HOUSES) {
    const placed = new Set<string>()
    for (const cell of house) {
      const digit = values[cell]
      if (digit !== '0' && placed.has(digit)) return {}
      if (digit !== '0') placed.add(digit)
    }
  }

  const targets = new Map<string, Set<number>>([
    ['full-house', new Set()], ['hidden-single-box', new Set()], ['naked-single', new Set()],
    ['hidden-single', new Set()], ['pointing', new Set()], ['claiming', new Set()],
  ])
  function record(technique: string, cell: number, digit: number) {
    targets.get(technique)?.add(cell * 9 + digit)
  }
  for (let cell = 0; cell < CLASSIC_CELLS; cell++) {
    if (masks[cell] && !(masks[cell] & (masks[cell] - 1))) record('naked-single', cell, Math.log2(masks[cell]) + 1)
  }
  for (let houseIndex = 0; houseIndex < CLASSIC_HOUSES.length; houseIndex++) {
    const house = CLASSIC_HOUSES[houseIndex]
    const empty = house.filter(cell => values[cell] === '0')
    if (empty.length === 1) {
      const bit = masks[empty[0]] & -masks[empty[0]]
      if (bit) record('full-house', empty[0], Math.log2(bit) + 1)
    }
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << (digit - 1)
      const positions = house.filter(cell => masks[cell] & bit)
      if (positions.length === 1) {
        record('hidden-single', positions[0], digit)
        if (houseIndex >= CLASSIC_SIZE * 2) record('hidden-single-box', positions[0], digit)
      }
    }
  }

  function recordIntersection(technique: 'pointing' | 'claiming', source: readonly number[], target: readonly number[], digit: number) {
    const sourceCells = new Set(source)
    for (const cell of target) if (!sourceCells.has(cell) && masks[cell] & (1 << (digit - 1))) record(technique, cell, digit)
  }

  for (let boxIndex = 0; boxIndex < 9; boxIndex++) {
    const box = CLASSIC_HOUSES[18 + boxIndex]
    for (let digit = 1; digit <= 9; digit++) {
      const positions = box.filter(cell => masks[cell] & (1 << (digit - 1)))
      if (positions.length < 2) continue
      const row = Math.floor(positions[0] / 9)
      const column = positions[0] % 9
      if (positions.every(cell => Math.floor(cell / 9) === row)) {
        recordIntersection('pointing', box, CLASSIC_HOUSES[row], digit)
      }
      if (positions.every(cell => cell % 9 === column)) {
        recordIntersection('pointing', box, CLASSIC_HOUSES[9 + column], digit)
      }
    }
  }
  for (let houseIndex = 0; houseIndex < CLASSIC_SIZE * 2; houseIndex++) {
    const line = CLASSIC_HOUSES[houseIndex]
    for (let digit = 1; digit <= 9; digit++) {
      const positions = line.filter(cell => masks[cell] & (1 << (digit - 1)))
      if (positions.length < 2) continue
      const boxIndex = Math.floor(Math.floor(positions[0] / 9) / 3) * 3 + Math.floor((positions[0] % 9) / 3)
      if (positions.every(cell => Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3) === boxIndex)) {
        recordIntersection('claiming', line, CLASSIC_HOUSES[18 + boxIndex], digit)
      }
    }
  }

  return Object.fromEntries([...targets].map(([technique, found]) => [technique, { count: found.size }]))
}

/** One hint per distinct proof pattern, with all of its supported actions.
 * Multiple candidate eliminations from the same pointing group appear together.
 */
export function techniqueHintsFromMatches(matches: readonly DeductionMatch[], technique: string): HintChoice[] {
  const patterns = new Map<string, {
    evidence: HintChoice['evidence']
    pattern: ProofPattern
    actions: Map<string, DeductionAction>
  }>()
  for (const match of matches) {
    for (const proof of match.proofs) {
      if (proof.technique !== technique) continue
      const key = JSON.stringify(proof.evidence)
      let group = patterns.get(key)
      if (!group) {
        group = { evidence: proof.evidence, pattern: proof.pattern, actions: new Map() }
        patterns.set(key, group)
      }
      for (const action of match.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        const actionKey = `${'place' in action ? 'p' : 'e'}:${candidate.cell}:${candidate.digit}`
        group.actions.set(actionKey, action)
      }
    }
  }
  return [...patterns.values()].map(({ evidence, pattern, actions }) => ({
    technique, evidence, pattern, actions: [...actions.values()].sort((left, right) => {
      const a = 'place' in left ? left.place : left.eliminate
      const b = 'place' in right ? right.place : right.eliminate
      return a.cell - b.cell || a.digit - b.digit
    }),
  }))
}

export type AnalysisCount = { count: number } | { error: string }

/** Hide only confirmed zeroes. Pending scans and errors remain visible. */
export function filterAnalysisGroups(
  groups: readonly AnalysisGroup[],
  results: Readonly<Record<string, AnalysisCount>>,
  hideZero: boolean,
  solved = false,
): AnalysisGroup[] {
  if (!hideZero) return groups.map(({ title, techniques }) => ({ title, techniques: [...techniques] }))
  return groups.flatMap(({ title, techniques }) => {
    const visible = techniques.filter((technique) => {
      if (solved) return false
      const result = results[technique]
      return result === undefined || !('count' in result) || result.count > 0
    })
    return visible.length ? [{ title, techniques: visible }] : []
  })
}

/** Use the engine catalog, not the display list, as the source of truth.
 * Any future detector without a hand-picked family is still included.
 */
export function analysisGroupsForCatalog(catalog: readonly { id: string }[]): AnalysisGroup[] {
  const available = new Set(catalog.map(({ id }) => id))
  const used = new Set<string>()
  const groups: AnalysisGroup[] = []
  for (const group of ANALYSIS_GROUPS) {
    const techniques = group.techniques.filter((id) => available.has(id) && !used.has(id))
    for (const id of techniques) used.add(id)
    if (techniques.length) groups.push({ title: group.title, techniques })
  }
  const unknown = catalog.map(({ id }) => id).filter((id) => !used.has(id))
  if (unknown.length) groups.push({ title: 'Other techniques', techniques: unknown })
  return groups
}

export type TechniqueSummary = {
  technique: string
  patterns: number
  placements: Candidate[]
  removals: Candidate[]
}

function candidateKey({ cell, digit }: Candidate) {
  return `${cell}:${digit}`
}

function sorted(candidates: Map<string, Candidate>) {
  return [...candidates.values()].sort((left, right) => left.cell - right.cell || left.digit - right.digit)
}

/** Distinct placement and removal targets, grouped by the technique that proves them.
 * A move can have more than one proof, and the same target can occur in different moves.
 */
export function summarizeDeductions(matches: readonly DeductionMatch[]): TechniqueSummary[] {
  const groups = new Map<string, {
    patterns: number
    placements: Map<string, Candidate>
    removals: Map<string, Candidate>
  }>()
  for (const match of matches) {
    for (const technique of new Set(match.proofs.map((proof) => proof.technique))) {
      const group = groups.get(technique) ?? { patterns: 0, placements: new Map(), removals: new Map() }
      group.patterns++
      for (const action of match.actions) {
        if ('place' in action) group.placements.set(candidateKey(action.place), action.place)
        else group.removals.set(candidateKey(action.eliminate), action.eliminate)
      }
      groups.set(technique, group)
    }
  }
  return [...groups].map(([technique, group]) => ({
    technique, patterns: group.patterns, placements: sorted(group.placements), removals: sorted(group.removals),
  }))
}

export function summarizeGroup(rows: readonly TechniqueSummary[]) {
  const placements = new Set(rows.flatMap((row) => row.placements.map(candidateKey)))
  const removals = new Set(rows.flatMap((row) => row.removals.map(candidateKey)))
  return { placements: placements.size, removals: removals.size }
}
