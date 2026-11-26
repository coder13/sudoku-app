import { IconButton } from './Button'
import { type ComponentProps, type ReactNode, type Ref, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { exitDelay, usePresence } from './Presence'

/** Use when a task needs a blocking dialog with managed focus and dismissal. */
type ModalProps = Omit<ComponentProps<'dialog'>, 'children' | 'className' | 'open' | 'onClose' | 'title'> & {
  title: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
  onClose: () => void
  className?: string
  leading?: ReactNode
  children: ReactNode
  open?: boolean
  motionSpeed?: 'standard' | 'overlay'
  returnFocus?: () => HTMLElement | null
}

export function Modal({ title, titleRef, onClose, className = '', leading, children, open = true, motionSpeed = 'standard', returnFocus, ...dialogProps }: ModalProps) {
  const [closing, setClosing] = useState(false)
  const { mounted, exiting } = usePresence(open && !closing, motionSpeed)
  const dialog = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<number | null>(null)
  const closeRequested = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const focusOnClose = useRef(returnFocus)
  focusOnClose.current = returnFocus
  const id = useId()

  useLayoutEffect(() => {
    closeRequested.current = false
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (open) setClosing(false)
  }, [open])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  function requestClose() {
    if (exiting || closeRequested.current) return
    closeRequested.current = true
    const delay = exitDelay(motionSpeed)
    if (!delay) {
      onCloseRef.current()
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      onCloseRef.current()
    }, delay)
  }

  useEffect(() => {
    if (!mounted) return
    const element = dialog.current
    const focus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      const target = focusOnClose.current?.() ?? focus
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true })
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <dialog {...dialogProps} ref={dialog} className={`dialog ${className}`} aria-labelledby={id} aria-hidden={exiting || undefined}
      data-presence={exiting ? 'exit' : 'open'} inert={exiting || undefined}
      onCancel={(event) => { event.preventDefault(); requestClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="dialog-inner">
        <div className="dialog-heading">
          {leading}
          <h2 id={id} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h2>
          <IconButton aria-label="Close dialog" disabled={exiting} onClick={requestClose}><X size={21} /></IconButton>
        </div>
        {children}
      </div>
    </dialog>
  )
}
