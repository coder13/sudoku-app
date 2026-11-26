import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { createEngineSession, EngineError, type EngineRunner } from '../../sudoku/engine'
import type { Game } from '../../sudoku/game'
import { puzzleSolution } from '../../sudoku/puzzle-help'
import type { SolutionPathState } from '../SolutionPath'

type LoadedSolution = {
  gameId: string
  identity: string
  retry: number
  path: SolutionPathState
}

type Options = {
  game: Game
  identity: string
  revealed: boolean
}

/** Load a solution only while its walkthrough is open, and own the solver lifetime. */
export function usePlaySolutionLoader({ game, identity, revealed }: Options) {
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState<LoadedSolution | null>(null)
  const path = loaded?.gameId === game.id && loaded.identity === identity && loaded.retry === retry
    ? loaded.path
    : null

  const requestSolution = useEffectEvent((run: EngineRunner) => puzzleSolution(game, run))

  useEffect(() => {
    if (game.paused || !revealed || path) return
    let current = true
    const engine = createEngineSession()
    const finish = (next: SolutionPathState) => {
      if (current) setLoaded({ gameId: game.id, identity, retry, path: next })
    }

    void requestSolution(engine.run).then(result => {
      if (result.positions?.length !== result.steps.length + 1) throw new Error('Missing solution positions')
      finish({ status: 'ready', trace: result })
    }).catch((error: unknown) => finish({
      status: 'unavailable',
      message: error instanceof EngineError && error.code === 'search-limit'
        ? 'The solver reached its search limit before finding a path.'
        : 'The solution couldn’t load.',
    })).finally(() => engine.close())

    return () => {
      current = false
      engine.close()
    }
  }, [game.id, game.paused, identity, path, revealed, retry])

  const retrySolution = useCallback(() => setRetry(value => value + 1), [])
  return { path, retrySolution }
}
