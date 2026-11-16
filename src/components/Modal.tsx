import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { usePresence } from './Presence'

export function Modal({ title, onClose, className = '', leading, children, open = true, exitDuration = 150 }: {
  title: string
  onClose: () => void
  className?: string
  leading?: ReactNode
  children: ReactNode
  open?: boolean
  exitDuration?: number
}) {
  const [closing, setClosing] = useState(false)
  const { mounted, exiting } = usePresence(open && !closing, exitDuration)
  const dialog = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<number | null>(null)
  const id = useId()

  useEffect(() => {
    if (open) setClosing(false)
  }, [open])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  function requestClose() {
    if (exiting) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, exitDuration)
  }

  useEffect(() => {
    if (!mounted) return
    const element = dialog.current
    const focus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true })
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <dialog ref={dialog} className={`dialog ${className}`} aria-labelledby={id} aria-hidden={exiting || undefined}
      data-presence={exiting ? 'exit' : 'open'} inert={exiting || undefined}
      onCancel={(event) => { event.preventDefault(); requestClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="dialog-inner">
        <div className="dialog-heading">
          {leading}
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" disabled={exiting} onClick={requestClose}><X size={21} /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
