import { useCallback, useSyncExternalStore, type SetStateAction } from 'react'
import { playPreferenceStore, type PlayPreferences } from '../sudoku/play-preferences'

export function usePlayPreference<K extends keyof PlayPreferences>(key: K) {
  const preferences = useSyncExternalStore(
    playPreferenceStore.subscribe, playPreferenceStore.getSnapshot, playPreferenceStore.getServerSnapshot,
  )
  const setValue = useCallback((value: SetStateAction<PlayPreferences[K]>) => {
    playPreferenceStore.set(key, value)
  }, [key])
  return [preferences[key], setValue] as const
}
