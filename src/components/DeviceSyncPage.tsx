import { Link } from '@tanstack/react-router'
import { useEffect, useState, useSyncExternalStore } from 'react'
import qrcode from 'qrcode-generator'
import { deviceSync, recoveryStorage } from '../sudoku/device-sync'

type Invitation = { link: string; expires: number; image: string }
export function DeviceSyncPage() {
  const status = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getServerSnapshot)
  const [name, setName] = useState('')
  const [ticket] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.hash.slice(1)).get('pair'))
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem(recoveryStorage + deviceSync.credentials()?.id) ?? '' } catch { return '' }
  })
  const [recovery, setRecovery] = useState('')
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof deviceSync.devices>>>([])
  const [confirm, setConfirm] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!status.linked) { setDevices([]); return }
    let open = true
    deviceSync.devices().then(list => { if (open) setDevices(list) }, e => { if (open) setError(e.message) })
    return () => { open = false }
  }, [status.linked])
  useEffect(() => {
    if (!invite) return
    const timeout = setTimeout(() => setInvite(null), Math.max(0, invite.expires - Date.now()))
    return () => clearTimeout(timeout)
  }, [invite])

  async function action(fn: () => Promise<void>) {
    setWorking(true); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.') }
    finally { setWorking(false) }
  }
  function enroll(mode: 'libraries' | 'join' | 'recover') {
    void action(async () => {
      const key = await deviceSync.enroll(mode, name.trim(), mode === 'join' ? ticket! : recovery.trim())
      setKey(key ?? '')
      if (key) {
        localStorage.setItem(recoveryStorage + deviceSync.credentials()?.id, key)
      }
      setRecovery('')
      if (ticket) history.replaceState(history.state, '', location.pathname)
    })
  }

  return <main className="page sync-page">
    <h1>Device sync</h1>
    <p role="status">{status.message || 'Link your devices to pick up a puzzle where you left off.'}</p>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    {!status.linked && status.ready && <>
      <p>Your puzzles on this device and your linked devices will be combined. You can play offline.</p>
      <label>Device name<input autoComplete="off" maxLength={60} placeholder="e.g. My phone" value={name} onChange={e => setName(e.target.value)} /></label>
      {ticket ? <button className="button primary" disabled={working || !name.trim()} onClick={() => enroll('join')}>Link this device</button> : <>
        <button className="button primary" disabled={working || !name.trim()} onClick={() => enroll('libraries')}>Enable sync</button>
        <p>Already syncing? Open Device sync on your linked device and choose “Link another device.”</p>
        <details><summary>Use a recovery key</summary>
          <label>Recovery key<input autoComplete="off" spellCheck={false} value={recovery} onChange={e => setRecovery(e.target.value)} /></label>
          <button className="button secondary" disabled={working || !name.trim() || !recovery.trim()} onClick={() => enroll('recover')}>Recover library</button>
        </details>
      </>}
    </>}
    {status.linked && <>
      {ticket && location.hash && <p>This browser already has a linked library.</p>}
      {key && <section><h2>Save your recovery key</h2>
        <p>Keep this key in your password manager. Anyone with it can link a device to your puzzles.</p>
        <label>Recovery key<input readOnly value={key} onFocus={event => event.target.select()} /></label>
        <button className="button secondary" onClick={() => {
          localStorage.removeItem(recoveryStorage + deviceSync.credentials()?.id)
          setKey('')
        }}>I saved my key</button>
      </section>}
      <button className="button primary" disabled={working} onClick={() => void action(async () => {
        const { ticket, expires } = await deviceSync.invite()
        const link = new URL('/sync', location.origin)
        link.hash = 'pair=' + ticket
        const code = qrcode(0, 'M')
        code.addData(link.href); code.make()
        setCopied(false); setInvite({ link: link.href, expires, image: code.createDataURL(4) })
      })}>Link another device</button>
      {invite && <section><h2>Open on your other device</h2>
        <img width="196" height="196" src={invite.image} alt="Scan to link a device" />
        <p>This link works once and expires at {new Date(invite.expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
        <label>Pairing link<input readOnly value={invite.link} onFocus={event => event.target.select()} /></label>
        <button className="button secondary" onClick={() => void action(async () => {
          await navigator.clipboard.writeText(invite.link); setCopied(true)
        })}>{copied ? 'Copied' : 'Copy link'}</button>
      </section>}
      <section><h2>Linked devices</h2><ul className="sync-devices">{devices.map(device => <li key={device.id}>
        <span>{device.name}{device.id === deviceSync.credentials()?.id ? ' (this device)' : ''}</span>
        {confirm === device.id ? <>
          <button className="button secondary" disabled={working} onClick={() => void action(async () => {
            await deviceSync.revoke(device.id); setDevices(items => items.filter(item => item.id !== device.id)); setConfirm('')
          })}>Confirm unlink</button>
          <button className="button secondary" onClick={() => setConfirm('')}>Cancel</button>
        </> : <button className="button secondary" onClick={() => setConfirm(device.id)}>Unlink</button>}
      </li>)}</ul>
        <button className="button secondary" disabled={working} onClick={() => void action(async () => setDevices(await deviceSync.devices()))}>Refresh devices</button>
      </section>
    </>}
    <Link to="/" search={{}} className="button secondary">Return to puzzles</Link>
  </main>
}
