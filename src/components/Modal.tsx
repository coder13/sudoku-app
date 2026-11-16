import { type ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, className = '', leading, children }: {
  title: string
  onClose: () => void
  className?: string
  leading?: ReactNode
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const element = dialog.current
    const focus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog ref={dialog} className={`dialog ${className}`} aria-labelledby={id}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="dialog-inner">
        <div className="dialog-heading">
          {leading}
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
