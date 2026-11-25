import { Button, IconButton } from './Button'
import { Link2Off, MoreHorizontal, PencilLine, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useActionMenuKeyboard } from './useActionMenuKeyboard'

function DeviceActionMenu({ label, disabled, trigger, menuBoundaryRef, rename, unlink }: {
  label: string
  disabled: boolean
  trigger: RefObject<HTMLButtonElement | null>
  menuBoundaryRef: RefObject<HTMLElement | null>
  rename: () => void
  unlink: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const container = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const focusLast = useRef(false)
  const [openAbove, setOpenAbove] = useState(false)
  useLayoutEffect(() => {
    if (!open) return
    const boundary = menuBoundaryRef.current
    const shouldOpenAbove = Boolean(menu.current && menu.current.getBoundingClientRect().bottom >
      Math.min(innerHeight, boundary?.getBoundingClientRect().bottom ?? innerHeight))
    setOpenAbove(shouldOpenAbove)
  }, [open])
  const onMenuKeyDown = useActionMenuKeyboard({ open, menuRef: menu, triggerRef: trigger,
    close: () => setOpen(false), initialFocus: focusLast.current ? 'last' : 'first' })
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
    <IconButton ref={trigger} variant="quiet" disabled={disabled}
      aria-label={'Options for ' + label} title={'Options for ' + label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { focusLast.current = false; setOpenAbove(false); setOpen(!open) }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        focusLast.current = event.key === 'ArrowUp'
        setOpenAbove(false)
        setOpen(true)
      }}><MoreHorizontal size={20} aria-hidden="true" /></IconButton>
    {open && <div ref={menu} id={menuId} className="app-menu sync-device-menu" data-above={openAbove || undefined} role="menu" aria-label={'Options for ' + label}
      onKeyDown={onMenuKeyDown}>
      <button role="menuitem" tabIndex={-1} disabled={disabled} onClick={rename}><PencilLine size={16} />Rename</button>
      <button role="menuitem" tabIndex={-1} disabled={disabled} onClick={unlink}><Link2Off size={16} />Unlink</button>
    </div>}
  </div>
}

export function LinkedDeviceRow({ device, current, mobile, working, menuBoundaryRef, rename, unlink }: {
  device: { id: string; name: string }
  current: boolean
  mobile: boolean
  working: boolean
  menuBoundaryRef: RefObject<HTMLElement | null>
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
  }} onKeyDown={event => { if (event.key === 'Escape' && !working) { event.preventDefault(); close() } }}>
    <label className="sr-only" htmlFor={'name-' + device.id}>Device name</label>
    <input id={'name-' + device.id} autoFocus autoComplete="off" maxLength={60} placeholder="Automatic name"
      value={draft} onFocus={event => event.target.select()} onChange={event => setDraft(event.target.value)} />
    <Button variant="primary" type="submit" disabled={working}>Save</Button>
    <IconButton variant="quiet" type="button" aria-label="Cancel rename" title="Cancel" disabled={working} onClick={close}><X size={18} /></IconButton>
  </form></li>
  return <li onKeyDown={event => { if (mode === 'unlink' && event.key === 'Escape' && !working) { event.preventDefault(); close() } }}>
    <div className="sync-device-label"><span>{device.name}</span>{current && <small>This device</small>}</div>
    {mode === 'unlink' ? <>
      <Button variant="danger" disabled={working} onClick={unlink}>Confirm unlink</Button>
      <IconButton autoFocus={mobile} variant="quiet" aria-label="Cancel unlink" title="Cancel" disabled={working} onClick={close}><X size={18} /></IconButton>
    </> : mobile ? <DeviceActionMenu label={label} disabled={working} trigger={optionsButton} menuBoundaryRef={menuBoundaryRef}
      rename={startRename} unlink={() => setMode('unlink')} /> : <>
      <Button variant="quiet" disabled={working} aria-label={'Rename ' + label} ref={renameButton}
        onClick={startRename}>Rename</Button>
      <IconButton variant="quiet" disabled={working} aria-label={'Unlink ' + label} title={'Unlink ' + device.name}
        ref={unlinkButton} onClick={() => setMode('unlink')}><Link2Off size={17} /></IconButton>
    </>}
  </li>
}
