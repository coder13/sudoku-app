import type { LessonExample } from '../../src/sudoku/engine'
import examples from '../../src/sudoku/generated/lesson-examples.json?raw'
import { EMPTY, enter, fillEntries, makeGame, STARTER_GAME, type Game } from '../../src/sudoku/game'
import { learnFundamentals, lessonRoutes, type LessonBlock } from '../../src/sudoku/lessons'

export const lessonExamples: Record<string, LessonExample> = JSON.parse(examples)
export const starter: Game = { ...STARTER_GAME, difficulty: 'easy', score: 204 }
export const inProgress = {
  ...enter(enter(starter, [2], 'value', 4), [3, 5], 'corner', 2),
  elapsed: 94,
}
export const draft = makeGame('draft', 'Untitled puzzle', EMPTY, 'draft', 1)
export const namedDraft = {
  ...fillEntries(draft, starter.givens),
  title: 'Tuesday puzzle',
}
export const solved = {
  ...fillEntries(starter, '534678912672195348198342567859761423426853791713924856961537284287419635345286179'),
  id: 'solved',
  title: 'Sunday warm-up',
  elapsed: 387,
}
export const quicker = { ...solved, id: 'best', title: 'Saturday warm-up', elapsed: 312 }
export const conflictDraft = fillEntries(draft, '11' + EMPTY.slice(2))

export const singlesLesson = lessonRoutes.get('naked-single')!
export const fishLesson = lessonRoutes.get('finned-x-wing')!
export const practiceBlock = (technique: string) =>
  lessonRoutes.get(technique)!.blocks.find((block): block is Extract<LessonBlock, { type: 'practice' }> =>
    block.type === 'practice' && block.drills.some(({ example }) => example === technique))!

export const fundamentals = learnFundamentals
