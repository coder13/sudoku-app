import { useSyncExternalStore } from 'react'
import { appPreferencesStore, type AppPreferenceKey, type AppPreferences, type PreferenceUpdate } from '../sudoku/preferences-store'

/** Subscribe screens to the shared, persisted application settings snapshot. */
export function useAppPreferences(): [AppPreferences, typeof setAppPreference] {
  const preferences = useSyncExternalStore(appPreferencesStore.subscribe, appPreferencesStore.getSnapshot, appPreferencesStore.getServerSnapshot)
  return [preferences, setAppPreference]
}

function setAppPreference<K extends AppPreferenceKey>(key: K, update: PreferenceUpdate<AppPreferences[K]>) {
  appPreferencesStore.set(key, update)
}
