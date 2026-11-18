import { Button, ChoiceButton, IconButton, iconButtonClassName } from './Button'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, Link2, QrCode } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PairingInvitation } from './PairingInvitation'
import { PairingScanner } from './PairingScanner'
import { pairingTicket } from '../sudoku/pairing-link'
import { LinkedDeviceRow } from './LinkedDeviceRow'
import { useMobileLayout } from './mobile-layout'
import { deviceSync, recoveryStorage } from '../sudoku/device-sync'

type Invitation = { link: string; expires: number }
type LinkedDevice = Awaited<ReturnType<typeof deviceSync.devices>>[number]

export function DeviceSyncPage() {
  const mobile = useMobileLayout()
  const status = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getServerSnapshot)
  const [ticket, setTicket] = useState(() => typeof window === 'undefined' ? null : pairingTicket(location.href, location.origin))
  const [step, setStep] = useState<'start' | 'scan' | 'recover'>('start')
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem(recoveryStorage + deviceSync.credentials()?.id) ?? '' } catch { return '' }
  })
  const [recovery, setRecovery] = useState('')
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [devices, setDevices] = useState<LinkedDevice[]>([])
  const [listError, setListError] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const listVersion = useRef(0)
  const inviteButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!status.linked) { setDevices([]); setListError(''); setInvite(null); return }
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
    const interval = window.setInterval(refresh, 10_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      listVersion.current++
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [status.linked])
  useEffect(() => {
    if (!invite) return
    const timeout = setTimeout(() => setInvite(null), Math.max(0, invite.expires - Date.now()))
    return () => clearTimeout(timeout)
  }, [invite])

  async function action(fn: () => Promise<void>) {
    setWorking(true); setError('')
    try { await fn(); return true } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); return false }
    finally { setWorking(false) }
  }
  async function showCode() {
    const { ticket, expires } = await deviceSync.invite()
    const link = new URL('/sync', location.origin)
    link.hash = 'pair=' + ticket
    setInvite({ link: link.href, expires })
  }
  function changeStep(next: typeof step) {
    if (location.hash.startsWith('#pair=')) history.replaceState(history.state, '', location.pathname)
    setTicket(null); setError(''); setRecovery(''); setStep(next)
  }
  function enroll(mode: 'libraries' | 'join' | 'recover') {
    void action(async () => {
      const secret = mode === 'join' ? ticket! : mode === 'recover' ? recovery.trim() : undefined
      const key = await deviceSync.enroll(mode, secret)
      setKey(key ?? '')
      changeStep('start')
      if (mode === 'libraries') await showCode()
    })
  }

  const screen = status.linked ? 'start' : ticket ? 'confirm' : step
  const heading = useRef<HTMLHeadingElement>(null)
  const previousScreen = useRef(screen)
  useEffect(() => {
    if (previousScreen.current !== screen) heading.current?.focus({ preventScroll: true })
    previousScreen.current = screen
  }, [screen])
  const headings = { start: 'Device sync', scan: 'Scan QR code', recover: 'Recover sync', confirm: 'Link this device?' }
  const backToScanner = screen === 'recover' || (screen === 'confirm' && step === 'scan')
  function closeInvitation() {
    setInvite(null)
    requestAnimationFrame(() => inviteButton.current?.focus())
  }
  return <main className="page sync-page device-sync-page">
    <header className="sync-heading">
      {screen === 'start'
        ? <Link to="/" search={{}} className={iconButtonClassName('quiet')} aria-label="Return to puzzles" title="Return to puzzles"><ArrowLeft size={20} /></Link>
        : <IconButton variant="quiet" disabled={working} aria-label={backToScanner ? 'Back to scanner' : 'Back to device sync'}
            onClick={() => changeStep(backToScanner ? 'scan' : 'start')}><ArrowLeft size={20} /></IconButton>}
      <h1 ref={heading} tabIndex={-1}>{headings[screen]}</h1>
    </header>
    {status.message && <p role="status">{status.message}</p>}
    {(error || listError) && <p className="workspace-error" role="alert">{error || listError}</p>}
    {!status.linked && status.ready && (ticket ? <>
      <p>Puzzles from both devices will appear together. Your settings will sync too.</p>
      <Button variant="primary" disabled={working} onClick={() => enroll('join')}>Link this device</Button>
    </> : step === 'start' ? <div className="sync-choices">
      <ChoiceButton disabled={working} onClick={() => enroll('libraries')}>
        <Link2 aria-hidden size={22} /><span><strong>Set up new sync</strong><small>Start here on your first device.</small></span>
      </ChoiceButton>
      <ChoiceButton disabled={working} onClick={() => changeStep('scan')}>
        <QrCode aria-hidden size={22} /><span><strong>Scan QR code</strong><small>Connect to a device already syncing.</small></span>
      </ChoiceButton>
    </div> : <>
      {step === 'scan' ? <>
        <PairingScanner onTicket={setTicket} />
        <Button onClick={() => changeStep('recover')}><KeyRound size={16} aria-hidden />Use a recovery key</Button>
      </> : <form className="sync-recover" onSubmit={event => { event.preventDefault(); enroll('recover') }}>
        <label>Recovery key<input autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} /></label>
        <Button variant="primary" type="submit" disabled={working || !recovery.trim()}>Recover puzzles and settings</Button>
      </form>}
    </>)}
    {status.linked && <>
      {ticket && <p>This device is already linked.</p>}
      {invite ? <PairingInvitation key={invite.link} link={invite.link} expires={invite.expires} onClose={closeInvitation} /> : <Button ref={inviteButton} variant="primary" disabled={working} onClick={() => void action(showCode)}><QrCode size={18} />Link another device</Button>}
      {key && <details><summary>Save recovery key</summary>
        <p>Keep this key somewhere private. Use it if you lose access to your linked devices.</p>
        <input aria-label="Recovery key" readOnly value={key} onFocus={event => event.target.select()} />
        <Button onClick={() => {
          localStorage.removeItem(recoveryStorage + deviceSync.credentials()?.id)
          setKey('')
        }}>I saved my key</Button>
      </details>}
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
    </>}
  </main>
}
