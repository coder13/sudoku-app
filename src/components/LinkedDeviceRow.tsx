import { Link2Off, MoreHorizontal, PencilLine, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'

function DeviceActionMenu({ label, disabled, trigger, rename, unlink }: {
  label: string
  disabled: boolean
  trigger: RefObject<HTMLButtonElement | null>
  rename: () => void
  unlink: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const container = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const last = useRef<HTMLButtonElement>(null)
  const focusLast = useRef(false)
  useLayoutEffect(() => {
    if (!open) return
    const menu = first.current?.parentElement
    const page = container.current?.closest('main')
    if (menu && menu.getBoundingClientRect().bottom > Math.min(innerHeight, page?.getBoundingClientRect().bottom ?? innerHeight)) {
      menu.dataset.above = ''
    }
    const initial = focusLast.current ? last : first
    initial.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [open])

  return <div className="sync-device-actions" ref={container}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} className="icon-button borderless" disabled={disabled}
      aria-label={'Options for ' + label} title={'Options for ' + label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { focusLast.current = false; setOpen(!open) }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        focusLast.current = event.key === 'ArrowUp'
        setOpen(true)
      }}><MoreHorizontal size={20} aria-hidden="true" /></button>
    {open && <div id={menuId} className="app-menu sync-device-menu" role="menu" aria-label={'Options for ' + label}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault()
          trigger.current?.focus()
          setOpen(false)
          return
        }
        let next
        if (event.key === 'Home') next = first
        else if (event.key === 'End') next = last
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next = document.activeElement === first.current ? last : first
        if (next) { event.preventDefault(); next.current?.focus() }
      }}>
      <button ref={first} role="menuitem" tabIndex={-1} disabled={disabled} onClick={rename}><PencilLine size={16} />Rename</button>
      <button ref={last} role="menuitem" tabIndex={-1} disabled={disabled} onClick={unlink}><Link2Off size={16} />Unlink</button>
    </div>}
  </div>
}

export function LinkedDeviceRow({ device, current, mobile, working, rename, unlink }: {
  device: { id: string; name: string }
  current: boolean
  mobile: boolean
  working: boolean
  rename: (name: string) => Promise<boolean>
  unlink: () => void
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'unlink'>('view')
  const [draft, setDraft] = useState('')
  const optionsButton = useRef<HTMLButtonElement>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const unlinkButton = useRef<HTMLButtonElement>(null)
  function close() {
    const trigger = mode === 'rename' ? renameButton : unlinkButton
    setMode('view')
    requestAnimationFrame(() => (optionsButton.current ?? trigger.current)?.focus())
  }
  function startRename() { setDraft(device.name); setMode('rename') }
  const label = device.name + (current ? ' (this device)' : '')
  if (mode === 'rename') return <li><form className="sync-rename" onSubmit={async event => {
    event.preventDefault()
    if (await rename(draft)) close()
  }} onKeyDown={event => { if (event.key === 'Escape' && !working) close() }}>
    <label className="sr-only" htmlFor={'name-' + device.id}>Device name</label>
    <input id={'name-' + device.id} autoFocus autoComplete="off" maxLength={60} placeholder="Automatic name"
      value={draft} onFocus={event => event.target.select()} onChange={event => setDraft(event.target.value)} />
    <button className="button primary" disabled={working}>Save</button>
    <button className="icon-button borderless" type="button" aria-label="Cancel rename" title="Cancel" disabled={working} onClick={close}><X size={18} /></button>
  </form></li>
  return <li onKeyDown={event => { if (mode === 'unlink' && event.key === 'Escape' && !working) close() }}>
    <div className="sync-device-label"><strong>{device.name}</strong>{current && <small>This device</small>}</div>
    {mode === 'unlink' ? <>
      <button className="button danger" disabled={working} onClick={unlink}>Confirm unlink</button>
      <button autoFocus={mobile} className="icon-button borderless" aria-label="Cancel unlink" title="Cancel" disabled={working} onClick={close}><X size={18} /></button>
    </> : mobile ? <DeviceActionMenu label={label} disabled={working} trigger={optionsButton}
      rename={startRename} unlink={() => setMode('unlink')} /> : <>
      <button className="button borderless" disabled={working} aria-label={'Rename ' + label} ref={renameButton}
        onClick={startRename}>Rename</button>
      <button className="icon-button borderless" disabled={working} aria-label={'Unlink ' + label} title={'Unlink ' + device.name}
        ref={unlinkButton} onClick={() => setMode('unlink')}><Link2Off size={17} /></button>
    </>}
  </li>
}
