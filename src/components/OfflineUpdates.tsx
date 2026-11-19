import { Button } from './Button'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MotionSurface } from './Presence'
import { markUpdateReload } from '../sudoku/update-reload'

export function OfflineUpdates() {
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const { hostname } = window.location
    const local = import.meta.env.DEV || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === '[::1]' || /^127(?:\.\d+){3}$/.test(hostname) || !hostname.includes('.')
    if (local) {
      setUpdateWorker(null)
      const controlled = Boolean(navigator.serviceWorker.controller)
      void Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))),
        'caches' in window ? caches.keys().then((keys) => Promise.all(keys
          .filter((key) => key.startsWith('sudoku-app-shell-') || key.startsWith('gridroom-shell-'))
          .map((key) => caches.delete(key)))) : Promise.resolve(),
      ]).then(() => {
        // The current document stays controlled until navigation even after its worker is unregistered.
        if (controlled) window.location.reload()
      })
      return
    }
    if (import.meta.env.PROD) {
      let disposed = false
      let reloading = false
      let controlled = Boolean(navigator.serviceWorker.controller)
      const removeInstallingListeners = new Set<() => void>()
      const handleControllerChange = () => {
        if (!controlled) {
          controlled = true
          return
        }
        if (reloading) return
        reloading = true
        markUpdateReload(window.location.href)
        window.location.reload()
      }
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

      let removeRegistrationListeners = () => {}
      void navigator.serviceWorker.register('/sw.js').then((registration) => {
        if (disposed) return
        const offer = (worker: ServiceWorker | null) => {
          if (worker && navigator.serviceWorker.controller) setUpdateWorker(worker)
        }
        const watchInstalling = () => {
          const installing = registration.installing
          if (!installing) return
          const handleStateChange = () => {
            if (installing.state === 'installed') offer(registration.waiting ?? installing)
          }
          installing.addEventListener('statechange', handleStateChange)
          removeInstallingListeners.add(() => installing.removeEventListener('statechange', handleStateChange))
        }
        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => {})
        }
        offer(registration.waiting)
        registration.addEventListener('updatefound', watchInstalling)
        watchInstalling()
        document.addEventListener('visibilitychange', checkForUpdate)
        removeRegistrationListeners = () => {
          registration.removeEventListener('updatefound', watchInstalling)
          document.removeEventListener('visibilitychange', checkForUpdate)
        }
      }).catch(() => { /* Local saves remain available when service workers are blocked. */ })
      return () => {
        disposed = true
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
        removeRegistrationListeners()
        removeInstallingListeners.forEach((remove) => remove())
      }
    }
  }, [])

  function installUpdate() {
    if (!updateWorker || updating) return
    setUpdating(true)
    updateWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  return <UpdatePrompt open={Boolean(updateWorker)} updating={updating} onDismiss={() => setUpdateWorker(null)} onUpdate={installUpdate} />
}

export function UpdatePrompt({ open = true, updating, onDismiss, onUpdate }: {
  open?: boolean; updating: boolean; onDismiss: () => void; onUpdate: () => void
}) {
  return (
    <MotionSurface>{open && <aside className="update-prompt" role="dialog" aria-labelledby="update-title" aria-describedby="update-description">
      <span className="update-prompt-icon" aria-hidden="true"><Download size={20} /></span>
      <span className="update-prompt-copy">
        <strong id="update-title">App update ready</strong>
        <small id="update-description">A newer offline version is ready to use.</small>
      </span>
      <span className="update-prompt-actions">
        <Button disabled={updating} onClick={onDismiss}>Later</Button>
        <Button variant="primary" disabled={updating} onClick={onUpdate}>{updating ? 'Updating…' : 'Update app'}</Button>
      </span>
    </aside>}</MotionSurface>
  )
}
