import { useEffect, useEffectEvent } from 'react'
import { puzzleTiming } from '../sudoku/puzzle-timing'

/** Count whole seconds in one visible tab for each puzzle. */
export function usePuzzleTimer(id: string, running: boolean, onTick: (seconds: number, puzzleId: string) => void) {
  const advance = useEffectEvent(onTick)
  useEffect(() => {
    if (!running) return
    let started: number | null = null
    let locks: LockManager | undefined = navigator.locks
    let lockRequest: AbortController | undefined

    function tick() {
      if (started === null) return
      const seconds = Math.floor((performance.now() - started) / 1000)
      if (seconds < 1) return
      started += seconds * 1000
      if (!puzzleTiming.getSnapshot().trackTime) return
      advance(seconds, id)
    }

    function start() {
      if (started !== null || lockRequest) return
      if (!locks) {
        started = performance.now()
        return
      }
      const request = new AbortController()
      lockRequest = request
      // One visible tab advances the saved clock. A second tab waits without counting.
      void locks.request(`sudoku-puzzle-timer:${id}`, { signal: request.signal }, () => {
        if (request.signal.aborted) return
        started = performance.now()
        return new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
      }).catch(() => {
        if (request.signal.aborted) return
        locks = undefined
        lockRequest = undefined
        updateVisibility()
      })
    }

    function stop() {
      tick()
      started = null
      lockRequest?.abort()
      lockRequest = undefined
    }

    function updateVisibility() {
      // Use the focused tab when Web Locks are unavailable.
      if (document.visibilityState === 'visible' && (locks || document.hasFocus())) start()
      else stop()
    }

    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', updateVisibility)
    window.addEventListener('focus', updateVisibility)
    window.addEventListener('blur', updateVisibility)
    window.addEventListener('pageshow', updateVisibility)
    window.addEventListener('pagehide', stop)
    updateVisibility()
    return () => {
      stop()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updateVisibility)
      window.removeEventListener('focus', updateVisibility)
      window.removeEventListener('blur', updateVisibility)
      window.removeEventListener('pageshow', updateVisibility)
      window.removeEventListener('pagehide', stop)
    }
  }, [id, running])
}
