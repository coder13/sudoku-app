import { useCallback, useSyncExternalStore } from 'react'
import { playSession, type PlaySessionField, type PlaySessionUpdate } from '../../sudoku/play-session'

/** Bind the puzzle-keyed session store to one active Play surface. */
export function usePlaySession(puzzleId: string) {
  const snapshot = useSyncExternalStore(playSession.subscribe, playSession.getSnapshot, playSession.getServerSnapshot)
  const state = snapshot.puzzleId === puzzleId ? snapshot : null
  const set = useCallback(<K extends PlaySessionField>(field: K, value: PlaySessionUpdate<K>) => {
    playSession.set(puzzleId, field, value)
  }, [puzzleId])

  return { state, set }
}
