import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from './Button'

/** Open or close solving panels from the input area. */
export function InputToolsMenu({ disabled, preferBelow = false, onShow, children }: {
  disabled: boolean
  preferBelow?: boolean
  onShow?: (opener: HTMLButtonElement) => void
  children: ReactNode
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const button = trigger.current
    const menu = popup.current
    if (!open || !button || !menu) return
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const inset = 8
      const below = window.innerHeight - anchor.bottom - inset
      const menuBottom = Math.min(anchor.bottom, window.innerHeight)
      const above = menuBottom - inset
      const minMenuHeight = 64
      const opensAbove = preferBelow ? below < Math.min(menu.scrollHeight, above) : above >= minMenuHeight || above >= below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`
      menu.style.left = `${Math.max(inset, Math.min(anchor.right, window.innerWidth - inset) - menu.offsetWidth)}px`
      menu.style.top = opensAbove ? 'auto' : `${Math.max(inset, anchor.bottom)}px`
      menu.style.bottom = opensAbove ? `${window.innerHeight - menuBottom}px` : 'auto'
    }
    position()
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    // Keep the open menu in place while its toggles move the input card.
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('resize', position)
      menu.removeAttribute('style')
    }
  }, [open, preferBelow])

  function close() {
    popup.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }

  return <div className="input-tools" data-no-panel-hold>
    <IconButton variant="quiet" ref={trigger} title="Input tools" aria-label="Input tools"
      disabled={disabled} aria-expanded={open} popoverTarget={id}>
      <MoreHorizontal size={19} aria-hidden="true" />
    </IconButton>
    <div ref={popup} className="app-menu input-tools-menu" id={id} role="group" aria-label="Input tools" popover="auto"
      onToggle={event => {
        const shown = event.currentTarget.matches(':popover-open')
        setOpen(shown)
        if (shown && trigger.current) onShow?.(trigger.current)
      }}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key !== 'Escape') return
        event.preventDefault()
        close()
      }}>
      {children}
    </div>
  </div>
}
