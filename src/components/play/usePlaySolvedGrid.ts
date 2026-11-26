import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isSolved, type Game } from '../../sudoku/game'
import { roomStore } from '../../sudoku/storage'

export type SolvedGridSession = { current: Game }
type SolvedGridPlayground = { session: SolvedGridSession; game: Game }

/** Keep edits made from a completed puzzle in an isolated, temporary grid session. */
export function usePlaySolvedGrid(savedGame: Game, pausedOnLaunch = false) {
  const completed = isSolved(savedGame)
  const [playgroundState, setPlaygroundState] = useState<SolvedGridPlayground | null>(null)
  const sessionRef = useRef<SolvedGridSession | null>(null)
  const playground = completed && playgroundState?.game.id === savedGame.id ? playgroundState : null
  const session = playground?.session
  const launchPaused = pausedOnLaunch && !completed && savedGame.source !== 'draft'
  const game = useMemo(
    () => playground?.game ?? (launchPaused && !savedGame.paused ? { ...savedGame, paused: true } : savedGame),
    [playground, launchPaused, savedGame],
  )
  const showResults = completed && !playground
  const showSolvedGrid = Boolean(playground)

  const reset = useCallback(() => {
    sessionRef.current = null
    setPlaygroundState(null)
  }, [])

  const openSolvedGrid = useCallback((position: Game = savedGame) => {
    const nextGame = { ...position, paused: false }
    const nextSession = { current: nextGame }
    sessionRef.current = nextSession
    setPlaygroundState({ session: nextSession, game: nextGame })
  }, [savedGame])

  const toggleSolvedView = useCallback(() => {
    if (showSolvedGrid) reset()
    else openSolvedGrid()
  }, [openSolvedGrid, reset, showSolvedGrid])

  const readWorkingGame = useCallback(() => {
    if (session) return sessionRef.current === session ? session.current : undefined
    return roomStore.getSnapshot().games.find(({ id }) => id === savedGame.id)
  }, [savedGame.id, session])

  const updateSolvedSession = useCallback((activeSession: SolvedGridSession, transform: (current: Game) => Game) => {
    if (sessionRef.current !== activeSession) return
    const nextGame = transform(activeSession.current)
    if (nextGame === activeSession.current) return
    activeSession.current = nextGame
    setPlaygroundState({ session: activeSession, game: nextGame })
  }, [])

  useLayoutEffect(() => {
    reset()
  }, [reset, savedGame.id, savedGame.source])

  useEffect(() => {
    if (!completed) reset()
  }, [completed, reset])

  return {
    completed,
    game,
    playground,
    session,
    showResults,
    showSolvedGrid,
    openSolvedGrid,
    toggleSolvedView,
    readWorkingGame,
    updateSolvedSession,
    reset,
  }
}
