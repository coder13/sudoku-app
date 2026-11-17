import type { Candidate, DeductionMatch } from './engine'

// Keep the quick scan bounded to common, local patterns. Deep chain and forcing
// searches can be expensive and should not block ordinary play.
export const ANALYSIS_GROUPS = [
  { title: 'Singles', kind: 'placements', techniques: ['full-house', 'naked-single', 'hidden-single'] },
  { title: 'Locked candidates', kind: 'removals', techniques: ['pointing', 'claiming'] },
  { title: 'Subsets', kind: 'removals', techniques: [
    'locked-pair', 'locked-triple', 'naked-pair', 'hidden-pair', 'naked-triple',
    'hidden-triple', 'naked-quadruple', 'hidden-quadruple',
  ] },
  { title: 'Wings', kind: 'removals', techniques: ['w-wing', 'xy-wing', 'xyz-wing', 'wxyz-wing'] },
  { title: 'Fish', kind: 'removals', techniques: [
    'x-wing', 'swordfish', 'jellyfish', 'finned-x-wing', 'sashimi-x-wing',
    'finned-swordfish', 'sashimi-swordfish',
  ] },
  { title: 'Single-digit patterns', kind: 'removals', techniques: [
    'skyscraper', 'two-string-kite', 'empty-rectangle', 'simple-coloring',
  ] },
  { title: 'Uniqueness', kind: 'placements', techniques: ['bug-plus-one'] },
] as const

export const ANALYSIS_TECHNIQUES: string[] = ANALYSIS_GROUPS.flatMap(({ techniques }) => [...techniques])

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
