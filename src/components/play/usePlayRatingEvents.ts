import { useCallback } from 'react'
import type { HintChoice } from '../../sudoku/engine'
import { completeCandidateMasks, hintEliminations, isSolved, type Game } from '../../sudoku/game'
import { hintKey } from '../../sudoku/player-rating'
import { matchesHintPosition, type HintPosition } from '../../sudoku/puzzle-help'
import { markTechniqueSolution, observeTechniqueActions } from '../../sudoku/technique-history'
import { roomStore } from '../../sudoku/storage'
import { withRatingHints } from './play-model'

type Options = {
  puzzle: { id: string; givens: string; variant: Game['variant']; gridPuzzle: boolean; completed: boolean }
  hint: { deduction?: HintChoice; position: HintPosition; previewing: boolean }
}

/** Record when a player sees a hint or opens the puzzle's solution. */
export function usePlayRatingEvents({
  puzzle: { id, givens, variant, gridPuzzle, completed },
  hint: { deduction, position, previewing },
}: Options) {
  const markHintVisible = useCallback(() => {
    if (!deduction || previewing || completed) return
    roomStore.update(id, current => {
      if (isSolved(current) || !matchesHintPosition(current, position)) return current
      const removals = hintEliminations(position.values, completeCandidateMasks(current), current.position.eliminations)
      void observeTechniqueActions(current, deduction.actions, 'hint', removals)
      return withRatingHints(current, [hintKey(deduction.actions)], false, {
        at: Date.now(),
        position: `${position.values}:${removals?.join(',') ?? ''}`,
      })
    })
  }, [completed, deduction, id, position, previewing])

  const markSolutionVisible = useCallback(() => {
    if (completed) return
    if (!gridPuzzle) markTechniqueSolution({ givens, variant })
    roomStore.finishRatingAttempt(id, 'solution')
  }, [completed, givens, gridPuzzle, id, variant])

  return { markHintVisible, markSolutionVisible }
}
