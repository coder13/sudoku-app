import { Button, ChoiceButton, buttonClassName } from './Button'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { KeyRound, Link2, LoaderCircle, QrCode } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PairingInvitation } from './PairingInvitation'
import { PairingScanner } from './PairingScanner'
import { SyncConnectionStatus } from './SyncConnectionStatus'
import { pairingTicket, PRODUCTION_SYNC_ORIGIN } from '../sudoku/pairing-link'
import { LinkedDeviceRow } from './LinkedDeviceRow'
import { useMobileLayout } from './mobile-layout'
import { deviceSync, recoveryStorage } from '../sudoku/device-sync'
import { deviceSyncPath, type SyncStep } from '../sudoku/sync-steps'

type Invitation = { ticket: string; expires: number; issuer: string }
const invitationStorage = 'sudoku-app:sync:tab-invitation'
// Keep issuing links that previously installed clients can also scan.
const pairingLinkPath = '/sync#pair='
const productionSync = import.meta.env.SUDOKU_PRODUCTION_SYNC === true
declare module '@tanstack/history' {
  interface HistoryState {
    syncBack?: 'settings' | 'start' | 'scan'
  }
}
type LinkedDevice = Awaited<ReturnType<typeof deviceSync.devices>>[number]

/** Render the setup and management steps inside the Settings dialog. */
export function DeviceSyncSettings({ step, onBack }: { step: SyncStep | null; onBack: () => void }) {
  const mobile = useMobileLayout()
  const status = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getServerSnapshot)
  const connection = useSyncExternalStore(deviceSync.subscribeConnection, deviceSync.getConnection, deviceSync.getServerConnection)
  const router = useRouter()
  const current = useLocation()
  const ticket = typeof window === 'undefined' ? null : pairingTicket(new URL(current.href, location.origin).href, location.origin)
  const pairingOrigin = productionSync ? PRODUCTION_SYNC_ORIGIN : typeof window === 'undefined' ? '' : location.origin
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem(recoveryStorage + deviceSync.credentials()?.id) ?? '' } catch { return '' }
  })
  const [recovery, setRecovery] = useState('')
  const [invite, setInvite] = useState<Invitation | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(invitationStorage) ?? 'null')
      if (saved?.expires > Date.now() && /^[a-f0-9]{64}$/.test(saved.ticket) &&
          saved.issuer === deviceSync.credentials()?.id) return saved as Invitation
      sessionStorage.removeItem(invitationStorage)
    } catch { /* The invitation also works in memory when tab storage is unavailable. */ }
    return null
  })
  const [clock, setClock] = useState(Date.now)
  const deviceId = status.linked ? deviceSync.credentials()?.id : undefined
  const [deviceList, setDeviceList] = useState<{ owner: string; items: LinkedDevice[] }>()
  const devices = deviceId === undefined ? [] : deviceList?.owner === deviceId ? deviceList.items : deviceSync.cachedDevices(deviceId) ?? []
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [listError, setListError] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const listVersion = useRef(0)
  const inviteButton = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setListError('')
    setLoadingDevices(false)
    if (!deviceId || step !== null) return
    const owner = deviceId
    async function refresh() {
      if (document.hidden || !navigator.onLine) return
      const version = ++listVersion.current
      setLoadingDevices(true)
      try {
        const items = await deviceSync.devices()
        if (version === listVersion.current) {
          deviceSync.rememberDevices(owner, items)
          setDeviceList({ owner, items })
          setListError('')
        }
      } catch (e) {
        if (version === listVersion.current) setListError(e instanceof Error ? e.message : 'Could not load linked devices.')
      } finally {
        if (version === listVersion.current) setLoadingDevices(false)
      }
    }
    void refresh()
    const unsubscribe = deviceSync.onDevicesChanged(refresh)
    return () => {
      listVersion.current++
      unsubscribe()
    }
  }, [deviceId, step])

  function updateDeviceList(update: (items: LinkedDevice[]) => LinkedDevice[]) {
    if (!deviceId || deviceSync.credentials()?.id !== deviceId) return
    listVersion.current++
    setLoadingDevices(false)
    const items = update(deviceSync.cachedDevices(deviceId) ?? devices)
    deviceSync.rememberDevices(deviceId, items)
    setDeviceList({ owner: deviceId, items })
  }
  useEffect(() => {
    if (step !== 'invite' || !invite) return
    setClock(Date.now())
    const timeout = setTimeout(() => setClock(Date.now()), Math.max(0, invite.expires - Date.now()))
    return () => clearTimeout(timeout)
  }, [step, invite])

  async function action(fn: () => Promise<void>) {
    setWorking(true); setError('')
    try { await fn(); return true } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); return false }
    finally { setWorking(false) }
  }
  async function showCode() {
    const entry = router.history.location.href
    const issuer = deviceSync.credentials()!.id
    const { ticket, expires } = await deviceSync.invite()
    if (entry !== router.history.location.href || issuer !== deviceSync.credentials()?.id) return
    const invitation = { ticket, expires, issuer }
    setInvite(invitation)
    try { sessionStorage.setItem(invitationStorage, JSON.stringify(invitation)) } catch { /* Keep the open invitation usable. */ }
    const refreshing = step === 'invite'
    await router.navigate({
      to: '/settings/device-sync/$step', params: { step: 'invite' }, replace: refreshing,
      state: { syncBack: refreshing ? current.state.syncBack : 'start' },
    })
  }
  function enroll(mode: 'libraries' | 'join' | 'recover') {
    void action(async () => {
      const entry = router.history.location.href
      const secret = mode === 'join' ? ticket! : mode === 'recover' ? recovery.trim() : undefined
      const key = await deviceSync.enroll(mode, secret)
      setKey(key ?? '')
      if (entry !== router.history.location.href) return
      if (step) await router.navigate({ to: '/settings/device-sync', replace: true, viewTransition: false })
      else if (mode === 'libraries') await showCode()
    })
  }

  const confirmTicket = useCallback((ticket: string) => {
    void router.navigate({
      to: '/settings/device-sync/$step', params: { step: 'confirm' }, hash: 'pair=' + ticket,
      state: { syncBack: 'scan' },
    })
  }, [router])
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current !== step) {
      setRecovery('')
      setError('')
      content.current?.parentElement?.scrollTo(0, 0)
      if (previousStep.current === 'invite' && step === null) {
        requestAnimationFrame(() => inviteButton.current?.focus({ preventScroll: true }))
      }
    }
    previousStep.current = step
  }, [step])

  useEffect(() => {
    // Don't redirect from a screen that is transitioning away.
    const path = current.pathname.replace(/\/$/, '')
    if (path !== (step ? deviceSyncPath + '/' + step : deviceSyncPath)) return
    if (step === null && ticket) {
      void router.navigate({ to: '/settings/device-sync/$step', params: { step: 'confirm' },
        hash: 'pair=' + ticket, replace: true, viewTransition: false })
    } else if (status.ready && !working) {
      if (step === 'invite' && !status.linked) {
        void router.navigate({ to: '/settings/device-sync', replace: true, viewTransition: false })
      } else if (step === 'confirm' && !ticket) {
        void router.navigate({ to: '/settings/device-sync/$step', params: { step: 'scan' }, replace: true, viewTransition: false })
      }
    }
  }, [current.pathname, step, ticket, status.ready, status.linked, working, router])

  const activeInvite = invite && invite.expires > clock && invite.issuer === deviceSync.credentials()?.id
  return <div ref={content} className="device-sync-settings">
    {productionSync && <p><strong>Production sync.</strong> Changes here sync to the live app.</p>}
    {status.linked && step === null && <SyncConnectionStatus connection={connection} loadingAccount={status.loadingAccount} showLabel />}
    {status.message && <p role="status">{status.message}</p>}
    {(error || listError) && <p className="workspace-error" role="alert">{error || listError}</p>}
    {!status.linked && status.ready && step === 'confirm' && ticket && <>
      <p>Puzzles from both devices will appear together. Your settings will sync too.</p>
      <Button variant="primary" disabled={working} onClick={() => enroll('join')}>Link this device</Button>
    </>}
    {!status.linked && status.ready && step === null && <div className="sync-choices">
      <Link to="/settings/device-sync/$step" params={{ step: 'scan' }} state={{ syncBack: 'start' }} className={buttonClassName('secondary', 'choice-button')}>
        <QrCode aria-hidden size={22} /><span><strong>Scan QR code</strong><small>Connect to a device already syncing.</small></span>
      </Link>
      <ChoiceButton disabled={working} onClick={() => enroll('libraries')}>
        <Link2 aria-hidden size={22} /><span><strong>Set up new sync</strong><small>Start here on your first device.</small></span>
      </ChoiceButton>
    </div>}
    {!status.linked && status.ready && step === 'scan' && <>
        <PairingScanner pairingOrigin={pairingOrigin} onTicket={confirmTicket} />
        <Link className={buttonClassName()} to="/settings/device-sync/$step" params={{ step: 'recover' }} state={{ syncBack: 'scan' }}><KeyRound size={16} aria-hidden />Use a recovery key</Link>
    </>}
    {!status.linked && status.ready && step === 'recover' &&
      <form className="sync-recover" onSubmit={event => { event.preventDefault(); enroll('recover') }}>
        <label>Recovery key<input autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} /></label>
        <Button variant="primary" type="submit" disabled={working || !recovery.trim()}>Recover puzzles and settings</Button>
      </form>}
    {status.linked && step !== null && step !== 'invite' && !working && <>
      <p>This device is already linked.</p>
      <Link className={buttonClassName()} to="/settings/device-sync" replace>View linked devices</Link>
    </>}
    {status.linked && step === 'invite' && (activeInvite
      ? <PairingInvitation key={invite.ticket} link={pairingOrigin + pairingLinkPath + invite.ticket} expires={invite.expires} onClose={onBack} />
      : <Button variant="primary" disabled={working} onClick={() => void action(showCode)}>Create a new link</Button>)}
    {status.linked && step === null && <Button ref={inviteButton} variant="primary" disabled={working}
      onClick={() => void action(showCode)}><QrCode size={18} />Link another device</Button>}
    {status.linked && (step === null || step === 'invite') && key && <details><summary>Save recovery key</summary>
        <p>Keep this key somewhere private. Use it if you lose access to your linked devices.</p>
        <input aria-label="Recovery key" readOnly value={key} onFocus={event => event.target.select()} />
        <Button onClick={() => {
          localStorage.removeItem(recoveryStorage + deviceSync.credentials()?.id)
          setKey('')
        }}>I saved my key</Button>
      </details>}
    {status.linked && step === null &&
      <section><h3>Linked devices</h3>
        {loadingDevices && connection.mode !== 'offline' && <p className="sync-connection-label" role="status">
          <LoaderCircle size={14} className="loading-spinner" aria-hidden="true" /> Loading linked devices…
        </p>}
        <ul className="sync-devices">{devices.map(device =>
        <LinkedDeviceRow key={device.id} device={device} mobile={mobile} current={device.id === deviceSync.credentials()?.id} working={working}
          rename={name => action(async () => {
            const result = await deviceSync.rename(device.id, name)
            updateDeviceList(items => items.map(item => item.id === device.id ? { ...item, name: result.name } : item))
          })}
          unlink={() => void action(async () => {
            await deviceSync.revoke(device.id)
            updateDeviceList(items => items.filter(item => item.id !== device.id))
          })} />)}</ul></section>
    }
  </div>
}
