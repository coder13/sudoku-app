export const settingsEditedEvent = 'sudoku-settings-edited'

export function notifySettingsEdit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(settingsEditedEvent))
}
