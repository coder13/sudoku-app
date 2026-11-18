const key = 'sudoku-app:v1:sinclair-generation'
let sessionPreference: boolean | undefined

export function usesSinclair() {
  if (sessionPreference !== undefined) return sessionPreference
  try { return window.localStorage.getItem(key) === 'true' }
  catch { return false }
}

export function setSinclair(enabled: boolean) {
  try {
    window.localStorage.setItem(key, String(enabled))
    sessionPreference = undefined
  } catch { sessionPreference = enabled }
  window.dispatchEvent(new Event(key))
}

export function subscribeToGenerator(listener: () => void) {
  function synced(event: StorageEvent) {
    if (event.key === key || event.key === null) {
      sessionPreference = undefined
      listener()
    }
  }
  window.addEventListener(key, listener)
  window.addEventListener('storage', synced)
  return () => {
    window.removeEventListener(key, listener)
    window.removeEventListener('storage', synced)
  }
}
