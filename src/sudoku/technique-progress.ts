import type { DeductionAction } from './engine.ts'
import type { Game, Mode } from './game.ts'

export const MIN_TECHNIQUE_PUZZLES = 3

export type TechniqueObservation = {
  technique: string | null
  source: 'independent' | 'hint' | 'automated'
  at: number
}

export type PuzzleTechniqueHistory = {
  givens: string
  actions: Record<string, TechniqueObservation>
  solutionRevealedAt?: number
}

export type TechniqueProgress = {
  technique: string
  withoutHints: number
  withHints: number
  hintedPuzzles: number
  puzzles: number
  independence: number | null
}

export type PuzzleTechniqueUse = {
  technique: string
  independent: number
  hints: number
}

export function autoTechniqueFocus(progress: readonly TechniqueProgress[], available: readonly string[]): string | undefined {
  // Prefer a technique the player has needed help with on more than one puzzle.
  const candidates = progress.filter(({ technique, puzzles, withHints, withoutHints, independence }) =>
    available.includes(technique) && puzzles >= 2 && withHints > withoutHints && (independence ?? 0) < 70)
  return candidates.sort((a, b) => b.puzzles - a.puzzles || (a.independence ?? 50) - (b.independence ?? 50))[0]?.technique
}

export function techniqueActionKey(action: DeductionAction): string {
  if ('place' in action) return `p${action.place.cell}:${action.place.digit}`
  return `e${action.eliminate.cell}:${action.eliminate.digit}`
}

export function playerActions(before: Game, after: Game, cells: readonly number[], mode: Mode, digit: number): DeductionAction[] {
  if (before.source === 'draft' || digit < 1 || mode === 'color' || before === after) return []
  const mask = 1 << (digit - 1)
  const actions: DeductionAction[] = []
  for (const cell of cells) {
    if (before.givens[cell] !== '0' || before.position.entries[cell] !== '0') continue
    if (mode === 'value') {
      if (after.position.entries[cell] === String(digit)) actions.push({ place: { cell, digit } })
    } else {
      const previous = before.position.center[cell] | before.position.corner[cell]
      const next = after.position.center[cell] | after.position.corner[cell]
      if ((previous & mask) !== 0 && (next & mask) === 0) actions.push({ eliminate: { cell, digit } })
    }
  }
  return actions
}

export function rememberTechniqueAction(history: PuzzleTechniqueHistory, action: string, observation: TechniqueObservation): boolean {
  if (observation.technique === null && observation.source === 'independent') return false
  const previous = history.actions[action]
  if (previous && (previous.at < observation.at ||
    (previous.at === observation.at && (previous.source !== 'independent' || observation.source === 'independent')))) return false
  history.actions[action] = observation
  return true
}

type TechniqueSample = { withoutHints: number; withHints: number }

export function summarizeTechniques(history: readonly PuzzleTechniqueHistory[]): TechniqueProgress[] {
  const techniques = new Map<string, TechniqueSample[]>()
  for (const puzzle of history) {
    const samples = new Map<string, TechniqueSample>()
    for (const action of Object.values(puzzle.actions)) {
      const { technique, source, at } = action
      if (technique === null || source === 'automated' || at >= (puzzle.solutionRevealedAt ?? Infinity)) continue
      const sample = samples.get(technique) ?? { withoutHints: 0, withHints: 0 }
      if (source === 'independent') sample.withoutHints++
      else sample.withHints++
      samples.set(technique, sample)
    }
    for (const [technique, sample] of samples) {
      const puzzles = techniques.get(technique) ?? []
      puzzles.push(sample)
      techniques.set(technique, puzzles)
    }
  }
  return Array.from(techniques, ([technique, samples]) => {
    const evidence = samples.reduce((sum, { withoutHints, withHints }) => sum + withoutHints / (withoutHints + withHints), 0)
    return {
      technique,
      withoutHints: samples.reduce((sum, puzzle) => sum + puzzle.withoutHints, 0),
      withHints: samples.reduce((sum, puzzle) => sum + puzzle.withHints, 0),
      hintedPuzzles: samples.filter(({ withHints }) => withHints > 0).length,
      puzzles: samples.length,
      independence: samples.length < MIN_TECHNIQUE_PUZZLES ? null : Math.round(100 * evidence / samples.length),
    }
  }).sort((a, b) => b.puzzles - a.puzzles || a.technique.localeCompare(b.technique))
}

export function summarizePuzzleTechniques(history?: PuzzleTechniqueHistory): PuzzleTechniqueUse[] {
  if (!history) return []
  const techniques = new Map<string, PuzzleTechniqueUse & { firstSeen: number }>()
  for (const { technique, source, at } of Object.values(history.actions)) {
    if (technique === null || source === 'automated' || at >= (history.solutionRevealedAt ?? Infinity)) continue
    const use = techniques.get(technique) ?? { technique, independent: 0, hints: 0, firstSeen: at }
    if (source === 'independent') use.independent++
    else use.hints++
    use.firstSeen = Math.min(use.firstSeen, at)
    techniques.set(technique, use)
  }
  return Array.from(techniques.values())
    .sort((first, second) => first.firstSeen - second.firstSeen || first.technique.localeCompare(second.technique))
    .map(({ firstSeen: _, ...use }) => use)
}
