import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from 'react'
import { createPuzzleSelectionStore } from '../sudoku/selection-preferences'

export function usePuzzleSelection(id: string, start: number) {
  // A new puzzle gets its own store before rendering, so it cannot save the previous puzzle's selection.
  const store = useMemo(() => createPuzzleSelectionStore(id, start), [id, start])
  const selection = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  const setActive = useCallback((value: SetStateAction<number>) => store.set('active', value), [store])
  const setAnchor = useCallback((value: SetStateAction<number>) => store.set('anchor', value), [store])
  const setSelected = useCallback((value: SetStateAction<number[]>) => store.set('selected', value), [store])
  return { ...selection, setActive, setAnchor, setSelected }
}
