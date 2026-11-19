import { IconButton } from './Button'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { exitDelay, usePresence } from './Presence'

/** Use when a task needs a blocking dialog with managed focus and dismissal. */
export function Modal({ title, onClose, className = '', leading, children, open = true, motionSpeed = 'standard' }: {
  title: string
  onClose: () => void
  className?: string
  leading?: ReactNode
  children: ReactNode
  open?: boolean
  motionSpeed?: 'standard' | 'overlay'
}) {
  const [closing, setClosing] = useState(false)
  const { mounted, exiting } = usePresence(open && !closing, motionSpeed)
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
    const delay = exitDelay(motionSpeed)
    if (!delay) {
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, delay)
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
          <IconButton aria-label="Close dialog" disabled={exiting} onClick={requestClose}><X size={21} /></IconButton>
        </div>
        {children}
      </div>
    </dialog>
  )
}
