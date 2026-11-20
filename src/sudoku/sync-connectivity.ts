/** Gate background sync on real connectivity, not just navigator.onLine.
 * Network failures suspend uploads and WebSockets. Only a lightweight health
 * request is retried until the service can be reached again.
 */
export function createSyncConnectivity({
  isOnline = () => navigator.onLine,
  probe,
  onChange,
  retryMs = 30_000,
}: {
  isOnline?: () => boolean
  probe: () => Promise<boolean>
  onChange: (online: boolean) => void
  retryMs?: number
}) {
  let unreachable = false
  let started = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let checking: Promise<void> | undefined
  let version = 0
  // Keep the original target so teardown still works if the browser context changes.
  let browserWindow: Window | undefined

  const available = () => isOnline() && !unreachable

  function clearProbe() {
    clearTimeout(timer)
    timer = undefined
  }

  function armProbe() {
    if (!started || !unreachable || !isOnline() || timer !== undefined || checking) return
    timer = setTimeout(() => {
      timer = undefined
      void check()
    }, retryMs)
  }

  function check(): Promise<void> {
    if (!started || !unreachable || !isOnline()) return Promise.resolve()
    if (checking) return checking
    const currentVersion = version
    const request = (async () => {
      let healthy = false
      try { healthy = await probe() } catch { /* Wait for the next health check. */ }
      if (healthy && started && currentVersion === version && isOnline()) {
        unreachable = false
        clearProbe()
        onChange(true)
      }
    })()
    checking = request.finally(() => {
      checking = undefined
      armProbe()
    })
    return checking
  }

  function browserChanged() {
    if (!isOnline()) {
      version++
      clearProbe()
      onChange(false)
    } else if (unreachable) {
      void check()
    } else onChange(true)
  }

  function suspend() {
    if (unreachable) return
    unreachable = true
    version++
    clearProbe()
    onChange(false)
    armProbe()
  }

  async function verify() {
    if (!started || !available()) return
    const currentVersion = version
    let healthy = false
    try { healthy = await probe() } catch { /* Treat an unreachable health endpoint as disconnected. */ }
    if (!healthy && started && currentVersion === version && isOnline()) suspend()
  }

  return {
    available,
    suspend,
    wake: check,
    verify,
    start() {
      if (started) return
      started = true
      browserWindow = typeof window === 'undefined' ? undefined : window
      browserWindow?.addEventListener('online', browserChanged)
      browserWindow?.addEventListener('offline', browserChanged)
      armProbe()
    },
    stop() {
      started = false
      version++
      clearProbe()
      browserWindow?.removeEventListener('online', browserChanged)
      browserWindow?.removeEventListener('offline', browserChanged)
      browserWindow = undefined
    },
  }
}
