import type { Candidate, DeductionAction, DeductionMatch, HintChoice, ProofPattern } from './engine'

// Keep each technique in one family. New engine techniques automatically appear
// in "Other techniques" until a more specific category is added.
export const ANALYSIS_GROUPS = [
  { title: 'Singles', techniques: ['full-house', 'naked-single', 'hidden-single'] },
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
    '3d-medusa', 'x-chain', 'xy-chain', 'aic', 'discontinuous-nice-loop',
    'continuous-nice-loop', 'grouped-aic', 'grouped-discontinuous-nice-loop',
    'grouped-continuous-nice-loop', 'firework-aic', 'tridagon-aic',
  ] },
  { title: 'Almost locked sets', techniques: [
    'als-xz', 'als-xy-wing', 'als-chain', 'als-aic',
    'als-discontinuous-nice-loop', 'als-continuous-nice-loop', 'sue-de-coq',
    'death-blossom', 'multi-sector-locked-sets',
  ] },
  { title: 'Advanced patterns', techniques: [
    'fireworks', 'aligned-pair-exclusion', 'aligned-triplet-exclusion',
    'tridagon', 'exocet', 'senior-exocet', 'double-exocet', 'sk-loop',
  ] },
  { title: 'Forcing techniques', techniques: [
    'tridagon-forcing-net', 'forcing-chain', 'forcing-net',
    'dynamic-forcing-net', 'advanced-forcing-net', 'nested-forcing-net',
  ] },
] as const

export const ANALYSIS_TECHNIQUES = ANALYSIS_GROUPS.flatMap(({ techniques }) => [...techniques])

export type AnalysisGroup = { title: string; techniques: string[] }

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

/** Count distinct candidate targets for a technique, regardless of whether
 * its rule places a digit or removes a candidate. Multiple proofs for the
 * same target count only once.
 */
export function techniqueTargetCount(matches: readonly DeductionMatch[], technique: string): number {
  const targets = new Set<string>()
  for (const match of matches) {
    if (!match.proofs.some((proof) => proof.technique === technique)) continue
    for (const action of match.actions) {
      const target = 'place' in action ? action.place : action.eliminate
      targets.add(`${target.cell}:${target.digit}`)
    }
  }
  return targets.size
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
