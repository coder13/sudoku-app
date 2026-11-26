import { useCallback, useLayoutEffect, useRef } from 'react'
import { recordAction } from '../../sudoku/action-history'
import type { AdvancedModes } from '../../sudoku/preferences'
import { addSinglesAssistance } from '../../sudoku/player-rating'
import { canApplyPuzzleResult } from '../../sudoku/puzzle-revision'
import { observeTechniqueActions } from '../../sudoku/technique-history'
import { conflictsOf, fillEntries, isSolved, onlyCandidate, valuesOf, type Game } from '../../sudoku/game'
import { playVariantPuzzle } from '../../sudoku/fog'
import { playCandidates } from '../../sudoku/variant-play'
import { runEngine, type EngineRunner } from '../../sudoku/engine'

type Options = {
  gameId: string
  enabled: boolean
  disabled: boolean
  modalOpen: boolean
  session: boolean
  solveSinglesVariants: AdvancedModes['solveSinglesVariants']
  autoRemoveCandidates: boolean
  autoRemoveCandidateVariants: AdvancedModes['autoRemoveCandidateVariants']
  updateWorkingGame: (transform: (current: Game) => Game) => void
}

/** Place solver-confirmed naked singles after a value entry and own that task's lifetime. */
export function usePlayNakedSingles({
  gameId, enabled, disabled, modalOpen, session, solveSinglesVariants,
  autoRemoveCandidates, autoRemoveCandidateVariants, updateWorkingGame,
}: Options) {
  const request = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const updateLatest = useRef(updateWorkingGame)
  updateLatest.current = updateWorkingGame

  useLayoutEffect(() => () => {
    request.current++
    abort.current?.abort()
    abort.current = null
  }, [autoRemoveCandidateVariants, autoRemoveCandidates, disabled, enabled, gameId, modalOpen, session, solveSinglesVariants])

  return useCallback(async (origin: Game) => {
    if (!enabled) return

    const task = ++request.current
    abort.current?.abort()
    abort.current = null
    const entered = valuesOf(origin)
    const puzzle = playVariantPuzzle(origin.variant, origin.position.entries)
    if (isSolved(origin) || conflictsOf(entered, puzzle, origin.grid, origin.sized?.rules).size) return

    const controller = new AbortController()
    abort.current = controller
    try {
      const run: EngineRunner = (engineRequest, options) => runEngine(engineRequest, { ...options, signal: controller.signal })
      const available = await playCandidates(origin, run, solveSinglesVariants)
      if (task !== request.current || !available || available.some((mask, cell) => entered[cell] === '0' && !mask)) return

      const placements = available.flatMap((mask, cell) => {
        const digit = entered[cell] === '0' ? onlyCandidate(mask) : null
        return digit === null ? [] : [{ place: { cell, digit } }]
      })
      if (!placements.length) return

      const result = [...entered]
      for (const { place } of placements) result[place.cell] = String(place.digit)
      const filled = result.join('')
      if (conflictsOf(filled, puzzle, origin.grid, origin.sized?.rules).size) return

      updateLatest.current(current => {
        if (!canApplyPuzzleResult(origin, current)) return current
        const next = recordAction(current, fillEntries(current, filled, autoRemoveCandidates,
          autoRemoveCandidateVariants), 'singles')
        void observeTechniqueActions(current, placements, 'automated')
        return current.ratingAttempt ? { ...next, ratingAttempt: addSinglesAssistance(current.ratingAttempt, 'partial') } : next
      })
    } catch {
      // Keep the player's move if the solver cannot find candidates.
    } finally {
      if (abort.current === controller) abort.current = null
    }
  }, [autoRemoveCandidateVariants, autoRemoveCandidates, disabled, enabled, modalOpen, solveSinglesVariants])
}
