import { useCallback, useRef } from 'react'
import { canApplyPuzzleResult } from '../../sudoku/puzzle-revision'
import { createEngineSession, runEngine, type EngineSession } from '../../sudoku/engine'
import type { Game } from '../../sudoku/game'

export type PuzzleTask = { origin: Game; engine: EngineSession; hint: boolean }

type Options = {
  game: Game
  readWorkingGame: () => Game | undefined
  setBusy: (busy: boolean) => void
}

/** Own solver task lifetimes, cancellation, and stale-result guards for play. */
export function usePlayPuzzleTasks({ game, readWorkingGame, setBusy }: Options) {
  const task = useRef<PuzzleTask | null>(null)
  const hintEngine = useRef<EngineSession | null>(null)
  const techniqueHintRequest = useRef(0)
  const hintPageRequest = useRef(0)

  const invalidateTechniqueHints = useCallback(() => {
    techniqueHintRequest.current++
  }, [])

  const cancelHintWork = useCallback(() => {
    invalidateTechniqueHints()
    hintPageRequest.current++
    hintEngine.current?.close()
    hintEngine.current = null
    if (task.current?.hint) {
      task.current.engine.close()
      task.current = null
      setBusy(false)
    }
  }, [invalidateTechniqueHints, setBusy])

  const cancelPendingPuzzleWork = useCallback(() => {
    const current = task.current
    if (!current) return false
    if (current.hint) {
      cancelHintWork()
      return true
    }
    current.engine.close()
    task.current = null
    setBusy(false)
    return false
  }, [cancelHintWork, setBusy])

  const beginPuzzleTask = useCallback((hint = false, isolated = true) => {
    if (hint) cancelHintWork()
    const abort = new AbortController()
    const engine: EngineSession = isolated ? createEngineSession() : {
      run: (request, options) => runEngine(request, { ...options, signal: abort.signal }),
      close: () => abort.abort(),
    }
    const next = { origin: game, engine, hint }
    task.current = next
    if (hint) hintEngine.current = engine
    setBusy(true)
    return next
  }, [cancelHintWork, game, setBusy])

  const currentTaskGame = useCallback((current: PuzzleTask) => {
    const latest = readWorkingGame()
    return task.current === current && canApplyPuzzleResult(current.origin, latest) ? latest : undefined
  }, [readWorkingGame])

  const finishPuzzleTask = useCallback((current: PuzzleTask, keepHintCollection = false) => {
    if (!keepHintCollection || task.current !== current) {
      current.engine.close()
      if (hintEngine.current === current.engine) hintEngine.current = null
    }
    if (task.current === current) {
      task.current = null
      setBusy(false)
    }
  }, [setBusy])

  const hasActiveTask = useCallback(() => task.current !== null, [])
  const nextTechniqueHintRequest = useCallback(() => ++techniqueHintRequest.current, [])
  const isTechniqueHintRequestCurrent = useCallback((request: number) => request === techniqueHintRequest.current, [])
  const nextHintPageRequest = useCallback(() => ++hintPageRequest.current, [])
  const activeHintEngine = useCallback(() => hintEngine.current, [])
  const isHintPageRequestCurrent = useCallback((request: number, engine: EngineSession) =>
    request === hintPageRequest.current && hintEngine.current === engine, [])

  return {
    beginPuzzleTask,
    currentTaskGame,
    finishPuzzleTask,
    cancelHintWork,
    cancelPendingPuzzleWork,
    hasActiveTask,
    nextTechniqueHintRequest,
    isTechniqueHintRequestCurrent,
    nextHintPageRequest,
    activeHintEngine,
    isHintPageRequestCurrent,
  }
}
