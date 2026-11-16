import type { DeductionAction, PositionSnapshot } from './engine.ts'
import { applyDeduction, makeGame, replaceCandidates, type Game, type Position } from './game.ts'
import { lessonValues } from './lesson-diagram.ts'
import { playerActions } from './technique-progress.ts'

type LessonPosition = Pick<PositionSnapshot, 'givens' | 'entries'> & { candidates: readonly number[] }

export function makeLessonGame(puzzle: LessonPosition): Game {
  // The starting placements are fixed for this exercise. The original givens
  // still control their appearance in the shared Board component.
  return replaceCandidates(makeGame('lesson', 'Lesson example', lessonValues(puzzle), 'custom', 0),
    puzzle.candidates, { recordHistory: false })
}

export function sameLessonDigits(a: Position, b: Position): boolean {
  return a.entries === b.entries && a.center.every((mask, i) => mask === b.center[i])
    && a.corner.every((mask, i) => mask === b.corner[i])
}

export function latestLessonActions(game: Game): DeductionAction[] {
  const positions = [...game.past, game.position]
  for (let i = positions.length - 1; i > 0; i--) {
    const previous = positions[i - 1]
    const next = positions[i]
    if (sameLessonDigits(previous, next)) continue
    const before = { ...game, position: previous }
    const after = { ...game, position: next }
    const cells = Array.from({ length: 81 }, (_, cell) => cell)
    const placements = Array.from({ length: 9 }, (_, i) => playerActions(before, after, cells, 'value', i + 1)).flat()
    if (placements.length) return placements
    return Array.from({ length: 9 }, (_, i) => playerActions(before, after, cells, 'candidate', i + 1)).flat()
  }
  return []
}

export function revealLessonAction(initial: Game, action: DeductionAction): Game {
  return applyDeduction(initial, [action], initial.position.corner)
}
