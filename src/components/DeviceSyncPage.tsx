import { Button, ChoiceButton, IconButton, buttonClassName } from './Button'
import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, Link2, QrCode } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PairingInvitation } from './PairingInvitation'
import { PairingScanner } from './PairingScanner'
import { pairingTicket, PRODUCTION_SYNC_ORIGIN } from '../sudoku/pairing-link'
import { LinkedDeviceRow } from './LinkedDeviceRow'
import { useMobileLayout } from './mobile-layout'
import { deviceSync, recoveryStorage } from '../sudoku/device-sync'
import { isSyncPage, syncPageTitles } from '../sudoku/sync-pages'

type Invitation = { ticket: string; expires: number; issuer: string }
const invitationStorage = 'sudoku-app:sync:tab-invitation'
const productionSync = import.meta.env.SUDOKU_PRODUCTION_SYNC === true
declare module '@tanstack/history' {
  interface HistoryState {
    fromSyncScanner?: boolean
  }
}
type LinkedDevice = Awaited<ReturnType<typeof deviceSync.devices>>[number]

export function DeviceSyncPage() {
  const mobile = useMobileLayout()
  const status = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getServerSnapshot)
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const current = useLocation()
  const segment = current.pathname.split('/')[2] ?? ''
  const screen = isSyncPage(segment) ? segment : 'start'
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
  const [devices, setDevices] = useState<LinkedDevice[]>([])
  const [listError, setListError] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const listVersion = useRef(0)
  const inviteButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!status.linked || screen !== 'devices') { setDevices([]); setListError(''); return }
    async function refresh() {
      if (document.hidden) return
      const version = ++listVersion.current
      try {
        const items = await deviceSync.devices()
        if (version === listVersion.current) { setDevices(items); setListError('') }
      } catch (e) {
        if (version === listVersion.current) setListError(e instanceof Error ? e.message : 'Couldn’t load devices.')
      }
    }
    void refresh()
    const unsubscribe = deviceSync.onDevicesChanged(refresh)
    return () => {
      listVersion.current++
      unsubscribe()
    }
  }, [status.linked, screen])
  useEffect(() => {
    if (screen !== 'invite' || !invite) return
    setClock(Date.now())
    const timeout = setTimeout(() => setClock(Date.now()), Math.max(0, invite.expires - Date.now()))
    return () => clearTimeout(timeout)
  }, [screen, invite])

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
    await router.navigate({ to: '/sync/$step', params: { step: 'invite' }, replace: screen === 'invite' })
  }
  function enroll(mode: 'libraries' | 'join' | 'recover') {
    void action(async () => {
      const entry = router.history.location.href
      const secret = mode === 'join' ? ticket! : mode === 'recover' ? recovery.trim() : undefined
      const key = await deviceSync.enroll(mode, secret)
      setKey(key ?? '')
      if (entry !== router.history.location.href) return
      await router.navigate({ to: '/sync/$step', params: { step: 'devices' }, replace: true, viewTransition: false })
      if (mode === 'libraries' && router.history.location.pathname === '/sync/devices') await showCode()
    })
  }

  const confirmTicket = useCallback((ticket: string) => {
    void router.navigate({ to: '/sync/$step', params: { step: 'confirm' }, hash: 'pair=' + ticket, state: { fromSyncScanner: true } })
  }, [router])
  const heading = useRef<HTMLHeadingElement>(null)
  const previousScreen = useRef(screen)
  useEffect(() => {
    if (previousScreen.current !== screen) {
      setRecovery('')
      setError('')
      const target = previousScreen.current === 'invite' && screen === 'devices' ? inviteButton : heading
      target.current?.focus({ preventScroll: true })
    }
    previousScreen.current = screen
  }, [screen])
  const backToScanner = screen === 'recover' || (screen === 'confirm' && current.state.fromSyncScanner)
  const root = screen === 'start' || screen === 'devices'
  function back() {
    // Static hosts may redirect to a trailing slash on reload, resetting the router's index.
    const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation
    if (canGoBack || (navigation?.canGoBack ?? window.history.length > 1)) router.history.back()
    else if (root) void router.navigate({ to: '/', search: {}, replace: true })
    else if (backToScanner || screen === 'invite') void router.navigate({
      to: '/sync/$step', params: { step: backToScanner ? 'scan' : 'devices' }, replace: true,
    })
    else void router.navigate({ to: '/sync', replace: true })
  }
  useEffect(() => {
    // The previous screen can stay mounted while the router transitions away.
    if (current.pathname !== '/sync' && !current.pathname.startsWith('/sync/')) return
    if (screen === 'start' && ticket) {
      void router.navigate({ to: '/sync/$step', params: { step: 'confirm' }, hash: 'pair=' + ticket, replace: true, viewTransition: false })
    } else if (status.ready && !working) {
      if (screen === 'start' && status.linked) void router.navigate({ to: '/sync/$step', params: { step: 'devices' }, replace: true, viewTransition: false })
      else if ((screen === 'invite' || screen === 'devices') && !status.linked) void router.navigate({ to: '/sync', replace: true, viewTransition: false })
      else if (screen === 'confirm' && !ticket) void router.navigate({ to: '/sync/$step', params: { step: 'scan' }, replace: true, viewTransition: false })
    }
  }, [current.pathname, screen, ticket, status.ready, status.linked, working, router])
  const activeInvite = invite && invite.expires > clock && invite.issuer === deviceSync.credentials()?.id
  return <main className="page sync-page device-sync-page">
    <header className="sync-heading">
      <IconButton variant="quiet" aria-label={root ? 'Back' : backToScanner ? 'Back to scanner' : 'Back to device sync'}
        onClick={back}><ArrowLeft size={20} /></IconButton>
      <h1 ref={heading} tabIndex={-1}>{screen === 'start' ? 'Device sync' : syncPageTitles[screen]}</h1>
    </header>
    {productionSync && <p><strong>Production sync.</strong> Changes here sync to the live app.</p>}
    {status.message && <p role="status">{status.message}</p>}
    {(error || listError) && <p className="workspace-error" role="alert">{error || listError}</p>}
    {!status.linked && status.ready && screen === 'confirm' && ticket && <>
      <p>Puzzles from both devices will appear together. Your settings will sync too.</p>
      <Button variant="primary" disabled={working} onClick={() => enroll('join')}>Link this device</Button>
    </>}
    {!status.linked && status.ready && screen === 'start' && <div className="sync-choices">
      <Link to="/sync/$step" params={{ step: 'scan' }} className={buttonClassName('secondary', 'choice-button')}>
        <QrCode aria-hidden size={22} /><span><strong>Scan QR code</strong><small>Connect to a device already syncing.</small></span>
      </Link>
      <ChoiceButton disabled={working} onClick={() => enroll('libraries')}>
        <Link2 aria-hidden size={22} /><span><strong>Set up new sync</strong><small>Start here on your first device.</small></span>
      </ChoiceButton>
    </div>}
    {!status.linked && status.ready && screen === 'scan' && <>
        <PairingScanner pairingOrigin={pairingOrigin} onTicket={confirmTicket} />
        <Link className={buttonClassName()} to="/sync/$step" params={{ step: 'recover' }}><KeyRound size={16} aria-hidden />Use a recovery key</Link>
    </>}
    {!status.linked && status.ready && screen === 'recover' &&
      <form className="sync-recover" onSubmit={event => { event.preventDefault(); enroll('recover') }}>
        <label>Recovery key<input autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} /></label>
        <Button variant="primary" type="submit" disabled={working || !recovery.trim()}>Recover puzzles and settings</Button>
      </form>}
    {status.linked && !root && screen !== 'invite' && !working && <>
      <p>This device is already linked.</p>
      <Link className={buttonClassName()} to="/sync/$step" params={{ step: 'devices' }} replace>View linked devices</Link>
    </>}
    {status.linked && screen === 'invite' && (activeInvite
      ? <PairingInvitation key={invite.ticket} link={pairingOrigin + '/sync#pair=' + invite.ticket} expires={invite.expires} onClose={back} />
      : <Button variant="primary" disabled={working} onClick={() => void action(showCode)}>Create a new link</Button>)}
    {status.linked && screen === 'devices' && <Button ref={inviteButton} variant="primary" disabled={working}
      onClick={() => void action(showCode)}><QrCode size={18} />Link another device</Button>}
    {status.linked && (screen === 'devices' || screen === 'invite') && key && <details><summary>Save recovery key</summary>
        <p>Keep this key somewhere private. Use it if you lose access to your linked devices.</p>
        <input aria-label="Recovery key" readOnly value={key} onFocus={event => event.target.select()} />
        <Button onClick={() => {
          localStorage.removeItem(recoveryStorage + deviceSync.credentials()?.id)
          setKey('')
        }}>I saved my key</Button>
      </details>}
    {status.linked && screen === 'devices' &&
      <section><h2>Linked devices</h2><ul className="sync-devices">{devices.map(device =>
        <LinkedDeviceRow key={device.id} device={device} mobile={mobile} current={device.id === deviceSync.credentials()?.id} working={working}
          rename={name => action(async () => {
            const result = await deviceSync.rename(device.id, name)
            listVersion.current++
            setDevices(items => items.map(item => item.id === device.id ? { ...item, name: result.name } : item))
          })}
          unlink={() => void action(async () => {
            await deviceSync.revoke(device.id)
            listVersion.current++
            setDevices(items => items.filter(item => item.id !== device.id))
          })} />)}</ul></section>
    }
  </main>
}
