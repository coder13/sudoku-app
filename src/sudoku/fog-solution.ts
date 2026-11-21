import { difficultyIndex } from './difficulty.ts'
import type { EngineRunner, LogicalSolution, SolvePosition, TechniqueCatalog } from './engine.ts'
import { fogRevealPlacements, fogView } from './fog.ts'
import { EMPTY } from './game.ts'
import { variantSolutionPath } from './variant-hints.ts'
import { getVariantPlayProfile, variantPosition } from './variant-play.ts'
import type { VariantGame } from './variants.ts'

function hardestUsedTechnique(catalog: TechniqueCatalog, counts: Readonly<Record<string, number>>) {
  let hardest: TechniqueCatalog['techniques'][number] | undefined
  for (const technique of catalog.techniques) {
    if (!counts[technique.id]) continue
    // The catalog follows native enum order. Later entries win equal tiers and costs.
    const tier = difficultyIndex(technique.difficulty)
    const previousTier = hardest ? difficultyIndex(hardest.difficulty) : -1
    if (!hardest || tier > previousTier || (tier === previousTier && technique.cost >= hardest.cost)) hardest = technique
  }
  return hardest
}

/** Follow only the deductions made before each change to the revealed grid. */
export async function solveFogPath(variant: VariantGame, run: EngineRunner, includeSteps: boolean): Promise<LogicalSolution> {
  const { techniqueOrder, catalog } = await getVariantPlayProfile()
  const steps: LogicalSolution['steps'] = []
  const positions: SolvePosition[] = []
  const counts: Record<string, number> = {}
  let points = 0
  let position: { entries: string; eliminations: readonly number[] } = { entries: EMPTY, eliminations: Array<number>(81).fill(0) }
  for (;;) {
    const initialView = fogView(variant, position.entries)!
    const oldEntries = position.entries
    // Visible givens mask redundant entries in the solver. Retain those entries
    // for reveal, since a correct earlier placement may have uncovered a given.
    const restoreEntries = (entries: string, givens: string) => [...entries].map((digit, cell) =>
      givens[cell] === '0' ? digit : oldEntries[cell]).join('')
    const trace = await run({
      type: 'variant', operation: 'trace', position: variantPosition(variant, position), techniqueOrder,
      stopAfterPlacementIn: fogRevealPlacements(initialView.cells), includeSteps,
    })
    const { end, rating } = trace
    position = { entries: restoreEntries(end.entries, end.puzzle.givens), eliminations: end.eliminations }
    const revealed = fogView(variant, position.entries)!.cells.size > initialView.cells.size
    points += rating.points
    for (const [technique, count] of Object.entries(rating.counts)) {
      counts[technique] = (counts[technique] ?? 0) + count
    }
    if (includeSteps) {
      const path = variantSolutionPath(trace)
      const snapshots = revealed ? path.positions!.slice(0, -1) : path.positions!
      steps.push(...path.steps)
      positions.push(...snapshots.map(snapshot => ({
        ...snapshot, entries: restoreEntries(snapshot.entries, snapshot.givens),
      })))
    }
    if (revealed) continue

    const solved = rating.status !== 'stalled' && [...end.puzzle.givens].every((given, cell) =>
      (given === '0' ? position.entries[cell] : given) === variant.solution[cell])
    const hardest = hardestUsedTechnique(catalog, counts)
    const result: LogicalSolution = {
      board: variant.solution, steps, ...(includeSteps && { positions }),
      rating: { techniqueOrder, scoringVersion: rating.scoringVersion,
        score: { points, counts, hardest: hardest?.id ?? null },
        status: solved ? { solved: hardest?.difficulty ?? 'easy' } : 'stalled' },
    }
    if (!solved) {
      result.exact = true
      if (includeSteps) {
        const { givens } = variant.puzzle
        const entries = [...variant.solution].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
        positions[positions.length - 1] = { givens, entries, eliminations: Array<number>(81).fill(0) }
      }
    }
    return result
  }
}
