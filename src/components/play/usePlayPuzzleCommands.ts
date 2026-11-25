import { EngineError } from '../../sudoku/engine'
import { fillEntries, hasCandidates, replaceCandidates, type Game } from '../../sudoku/game'
import { addSinglesAssistance } from '../../sudoku/player-rating'
import { canApplyPuzzleResult } from '../../sudoku/puzzle-revision'
import { validation, type CheckResult } from '../../sudoku/puzzle-validation'
import { recordAction } from '../../sudoku/action-history'
import { sizedClassicPosition } from '../../sudoku/grid'
import { isAlgebraicCageList } from '../../sudoku/algebraic-cages'
import { analyzeAlgebraic } from '../../sudoku/algebraic-play'
import { sizedRulePosition } from '../../sudoku/sized-rule-game'
import { playCandidates } from '../../sudoku/variant-play'
import { solveSingleValues } from '../../sudoku/solve-singles'
import { observeTechniqueActions } from '../../sudoku/technique-history'
import type { AdvancedModes } from '../../sudoku/preferences'
import type { PuzzleTask } from './usePlayPuzzleTasks'

type PuzzleTasks = {
  beginPuzzleTask: (hint?: boolean, isolated?: boolean) => PuzzleTask
  currentTaskGame: (current: PuzzleTask) => Game | undefined
  finishPuzzleTask: (current: PuzzleTask, keepHintCollection?: boolean) => void
  hasActiveTask: () => boolean
}

type Options = {
  puzzle: {
    game: Game
    values: string
    givens: string
    cages: Game['position']['draftCages']
    draftCages: Game['position']['draftCages']
    sizedRules: Game['position']['draftSizedRules'] | NonNullable<Game['sized']>['rules']
    masks: readonly number[] | null | undefined
    displayedCandidates: readonly number[] | null
    eliminations: Game['position']['eliminations']
    solved: boolean
    draft: boolean
    completed: boolean
    previewing: boolean
    hasSingles: boolean
  }
  state: {
    busy: boolean
    disabled: boolean
    placeholder: boolean
  }
  modes: Pick<AdvancedModes,
    'generateCandidateVariants' | 'solveSinglesVariants' | 'autoRemoveCandidates' | 'autoRemoveCandidateVariants'
  >
  tasks: PuzzleTasks
  host: {
    clearResult: () => void
    showCheckResult: (result: CheckResult) => void
    showActionResult: (result: CheckResult) => void
    closeMenus: () => void
    closeSolutionPath: () => void
    requestCandidateConfirmation: (source?: HTMLElement) => void
    updateWorkingGame: (transform: (current: Game) => Game) => void
  }
}

/** Own asynchronous puzzle commands and apply results only to the puzzle state they started from. */
export function usePlayPuzzleCommands({ puzzle, state, modes, tasks, host }: Options) {
  const { game, values, givens, cages, draftCages, sizedRules, masks, displayedCandidates, eliminations,
    solved, draft, completed, previewing, hasSingles } = puzzle
  const { busy, disabled, placeholder } = state
  const { clearResult, showCheckResult, showActionResult, closeMenus, closeSolutionPath,
    requestCandidateConfirmation, updateWorkingGame } = host

  async function runCheck() {
    if (busy || tasks.hasActiveTask() || game.paused || placeholder) return
    if (previewing) closeSolutionPath()
    closeMenus()
    const task = tasks.beginPuzzleTask()
    const run = task.engine.run
    clearResult()
    try {
      if (draftCages && !isAlgebraicCageList(draftCages)) throw new Error('Add at least one cage with a letter before checking.')
      const status = game.variant?.fog
        ? [...values].every((digit, cell) => digit === '0' || digit === game.variant!.solution[cell])
          ? 'unique'
          : 'conflict'
        : sizedRules?.length && game.grid
          ? await run({
              type: 'sized-variant',
              position: sizedRulePosition(game.grid, { rules: sizedRules }, values),
              operation: 'analyze',
            })
          : cages
            ? await analyzeAlgebraic({ rules: cages }, values, run)
            : game.grid
              ? await run({
                  type: 'sized-classic',
                  position: sizedClassicPosition(game.grid, values),
                  operation: 'analyze',
                })
              : game.variant
                ? await run({
                    type: 'variant',
                    operation: 'analyze',
                    position: { puzzle: game.variant.puzzle, entries: game.position.entries },
                  })
                : await run({ type: 'analyze', values })
      if (!tasks.currentTaskGame(task)) return
      if (!draft && status === 'multiple') {
        showCheckResult({ text: 'This grid has more than one solution.', tone: 'neutral' })
      } else if (!draft && status !== 'search-limit') {
        showCheckResult(status === 'unique'
          ? { text: solved ? 'This puzzle is correct.' : 'Every placed digit is correct so far.', tone: 'success' }
          : { text: 'This puzzle is not correct yet.', tone: 'error' })
      } else showCheckResult(validation[status])
    } catch (error) {
      if (!tasks.currentTaskGame(task)) return
      const conflict = error instanceof EngineError && (error.code === 'conflict' || error.code === 'unsolvable')
      showCheckResult({
        text: conflict ? 'This puzzle is not correct yet.' : (error as Error).message,
        tone: conflict ? 'error' : 'neutral',
      })
    } finally {
      tasks.finishPuzzleTask(task)
    }
  }

  async function generateCandidates(confirmed = false, source?: HTMLElement) {
    if (busy || tasks.hasActiveTask() || solved || disabled) return
    if (!confirmed && hasCandidates(game.position)) {
      requestCandidateConfirmation(source)
      return
    }
    closeMenus()
    const task = tasks.beginPuzzleTask(false, false)
    try {
      const candidateMasks = await playCandidates(game, task.engine.run, modes.generateCandidateVariants)
      if (!tasks.currentTaskGame(task)) return
      if (!candidateMasks) {
        showActionResult({
          text: 'Candidates cannot be generated until the grid conflicts are resolved.',
          tone: 'error',
        })
        return
      }
      updateWorkingGame(latest => canApplyPuzzleResult(task.origin, latest)
        ? recordAction(latest, replaceCandidates(latest, candidateMasks), 'candidates')
        : latest)
    } catch (error) {
      if (!tasks.currentTaskGame(task)) return
      showActionResult({ text: (error as Error).message, tone: 'neutral' })
    } finally {
      tasks.finishPuzzleTask(task)
    }
  }

  async function solveAllSingles() {
    if (busy || tasks.hasActiveTask() || solved || draft || disabled || !hasSingles) return
    if (previewing) closeSolutionPath()
    closeMenus()
    const task = tasks.beginPuzzleTask(false, false)
    try {
      const result = await solveSingleValues(game, values, {
        eliminations,
        displayedCandidates: displayedCandidates ?? undefined,
        run: task.engine.run,
        variantRules: modes.solveSinglesVariants,
      })
      if (!tasks.currentTaskGame(task)) return
      if (result === values) {
        showActionResult({ text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      const removedCandidates = eliminations?.some(Boolean) ||
        (displayedCandidates && masks?.some((mask, cell) => values[cell] === '0' && (mask & ~displayedCandidates[cell]) !== 0))
      const assistance = values === givens && !removedCandidates && !result.includes('0') ? 'all' : 'partial'
      updateWorkingGame(latest => {
        if (!canApplyPuzzleResult(task.origin, latest)) return latest
        const next = recordAction(latest, fillEntries(
          latest, result, modes.autoRemoveCandidates, modes.autoRemoveCandidateVariants
        ), 'singles')
        if (completed) return next
        const placements = [...result].flatMap((digit, cell) =>
          digit !== '0' && values[cell] !== digit ? [{ place: { cell, digit: Number(digit) } }] : [])
        void observeTechniqueActions(latest, placements, 'automated')
        return latest.ratingAttempt
          ? { ...next, ratingAttempt: addSinglesAssistance(latest.ratingAttempt, assistance) }
          : next
      })
    } catch (error) {
      if (!tasks.currentTaskGame(task)) return
      showActionResult({ text: (error as Error).message, tone: 'neutral' })
    } finally {
      tasks.finishPuzzleTask(task)
    }
  }

  return { runCheck, generateCandidates, solveAllSingles }
}
