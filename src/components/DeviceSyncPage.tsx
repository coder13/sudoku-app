import { Button, ChoiceButton, IconButton, iconButtonClassName } from './Button'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, Copy, Link2, QrCode, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import qrcode from 'qrcode-generator'
import { PairingScanner } from './PairingScanner'
import { pairingTicket } from '../sudoku/pairing-link'
import { LinkedDeviceRow } from './LinkedDeviceRow'
import { useMobileLayout } from './mobile-layout'
import { deviceSync, recoveryStorage } from '../sudoku/device-sync'

type Invitation = { link: string; expires: number; image: string }
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
  const [copied, setCopied] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const listVersion = useRef(0)
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
    const code = qrcode(0, 'M')
    code.addData(link.href); code.make()
    setCopied(false); setManualCopy(false); setInvite({ link: link.href, expires, image: code.createDataURL(4) })
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

  return <main className="page sync-page device-sync-page">
    <header className="sync-heading">
      <Link to="/" search={{}} className={iconButtonClassName('quiet')} aria-label="Return to puzzles" title="Return to puzzles"><ArrowLeft size={20} /></Link>
      <h1>Device sync</h1>
    </header>
    {status.message && <p role="status">{status.message}</p>}
    {(error || listError) && <p className="workspace-error" role="alert">{error || listError}</p>}
    {!status.linked && status.ready && (ticket ? <>
      <h2>Link this device?</h2>
      <p>Puzzles from both devices will appear together. Your settings will sync too.</p>
      <Button variant="primary" disabled={working} onClick={() => enroll('join')}>Link this device</Button>
      <Button disabled={working} onClick={() => changeStep('scan')}>Back to scanner</Button>
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
        <Button variant="quiet" onClick={() => changeStep('recover')}>Use a recovery key instead</Button>
      </> : <form className="sync-recover" onSubmit={event => { event.preventDefault(); enroll('recover') }}>
        <h2>Recover sync</h2>
        <label>Recovery key<input autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} /></label>
        <Button variant="primary" type="submit" disabled={working || !recovery.trim()}>Recover puzzles and settings</Button>
      </form>}
      <Button disabled={working} onClick={() => changeStep(step === 'scan' ? 'start' : 'scan')}>Back</Button>
    </>)}
    {status.linked && <>
      {ticket && <p>This device is already linked.</p>}
      {invite ? <section className="sync-panel sync-invitation">
        <div className="sync-panel-heading"><h2>Scan on your other device</h2>
          <IconButton variant="quiet" aria-label="Close pairing code" title="Close" onClick={() => setInvite(null)}><X size={18} /></IconButton>
        </div>
        <div className="sync-code-frame"><img className="sync-code" width="196" height="196" src={invite.image} alt="QR code to link a device" /></div>
        <div className="sync-invitation-actions"><p>Expires at {new Date(invite.expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        <Button onClick={async () => {
          try { await navigator.clipboard.writeText(invite.link); setCopied(true) } catch { setManualCopy(true) }
        }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}</Button></div>
        {manualCopy && <label>Pairing link<input readOnly autoFocus value={invite.link} onFocus={event => event.target.select()} /></label>}
      </section> : <Button variant="primary" disabled={working} onClick={() => void action(showCode)}><QrCode size={18} />Link another device</Button>}
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
