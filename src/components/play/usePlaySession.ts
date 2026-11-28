import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { playSession, type PlaySessionField, type PlaySessionUpdate } from '../../sudoku/play-session'

/** Bind the puzzle-keyed session store to one active Play surface. */
export function usePlaySession(puzzleId: string) {
  const snapshot = useSyncExternalStore(playSession.subscribe, playSession.getSnapshot, playSession.getServerSnapshot)
  // The route and session can update in either order. Read the displayed
  // puzzle's layout before mounting its panels.
  const state = useMemo(() => snapshot.puzzleId === puzzleId ? snapshot : playSession.readPuzzle(puzzleId), [snapshot, puzzleId])
  const set = useCallback(<K extends PlaySessionField>(field: K, value: PlaySessionUpdate<K>) => {
    playSession.set(puzzleId, field, value)
  }, [puzzleId])

  return { state, set }
}
