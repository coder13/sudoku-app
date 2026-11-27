import { useEffect, useState } from 'react'
import { createEngineSession } from '../../sudoku/engine'
import { hasUniquenessProof, type Game } from '../../sudoku/game'
import { applyPuzzleGrade, needsPuzzleGrade, ratePuzzle } from '../../sudoku/puzzle-rating'
import { roomStore } from '../../sudoku/storage'

type Options = {
  game: Game
  givens: string
  variant: Game['variant']
  nonUnique: boolean
  draft: boolean
  completed: boolean
  gridPuzzle: boolean
}

/** Rate eligible puzzles in the background and expose whether rating is pending. */
export function usePlayPuzzleRating({ game, givens, variant, nonUnique, draft, completed, gridPuzzle }: Options) {
  const [failure, setFailure] = useState<{ gameId: string; source: Game['source'] } | null>(null)
  const needsRating = needsPuzzleGrade(game)
  const needsAttempt = !gridPuzzle && !completed && !game.practiceTechnique && !game.ratingAttempt &&
    (!variant?.fog || game.score !== null)
  const ratingFailed = failure?.gameId === game.id && failure.source === game.source

  useEffect(() => {
    if (draft || game.paused || !needsRating && !needsAttempt) return
    let current = true
    const engine = createEngineSession()
    void ratePuzzle(givens, variant, engine.run, nonUnique,
      Boolean(variant && hasUniquenessProof(game))).then(grade => {
      if (!current) return
      roomStore.update(game.id, latest => latest.givens === givens && latest.variant === variant
        ? applyPuzzleGrade(latest, grade)
        : latest, { derived: true })
    }).catch(() => {
      if (current) setFailure({ gameId: game.id, source: game.source })
    }).finally(() => engine.close())
    return () => {
      current = false
      engine.close()
    }
  }, [game.id, game.source, game.paused, givens, draft, needsAttempt, needsRating, nonUnique, variant])

  return { ratingPending: !draft && needsRating && !ratingFailed }
}
