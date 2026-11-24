import { useCallback, useSyncExternalStore, type SetStateAction } from 'react'
import { playPreferenceStore, type PlayPreferences } from '../sudoku/play-preferences'

export function usePlayPreference<K extends keyof PlayPreferences>(key: K) {
  const getSnapshot = useCallback(() => playPreferenceStore.getSnapshot()[key], [key])
  const getServerSnapshot = useCallback(() => playPreferenceStore.getServerSnapshot()[key], [key])
  const value = useSyncExternalStore(
    playPreferenceStore.subscribe, getSnapshot, getServerSnapshot,
  )
  const setValue = useCallback((value: SetStateAction<PlayPreferences[K]>) => {
    playPreferenceStore.set(key, value)
  }, [key])
  return [value, setValue] as const
}
