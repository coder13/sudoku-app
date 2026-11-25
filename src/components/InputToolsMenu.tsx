import { type ReactNode, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from './Button'
import { focusMenuItem } from './menu-navigation'
import { useAnchoredPopover } from './useAnchoredPopover'
import { usePlayLayoutAnchors } from './play-layout-anchors'

/** Open or close solving panels from the input area. */
export function InputToolsMenu({ disabled, preferBelow = false, onShow, observeRef, children }: {
  disabled: boolean
  preferBelow?: boolean
  onShow?: (opener: HTMLButtonElement) => void
  observeRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const id = useId()
  const layoutAnchors = usePlayLayoutAnchors()
  const layoutRef = observeRef ?? layoutAnchors?.controls
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useAnchoredPopover({ open, anchorRef: trigger, popupRef: popup, clearInlineStyle: true, revision: preferBelow,
    observe: () => layoutRef?.current ? [layoutRef.current] : [],
    place: (button, menu) => {
      const anchor = button.getBoundingClientRect()
      const inset = 8
      if (preferBelow) {
        const scale = Number(getComputedStyle(menu).getPropertyValue('--desktop-layout-scale')) || 1
        const top = anchor.top
        const right = anchor.right
        menu.style.maxHeight = `${Math.max(0, window.innerHeight - top - inset) / scale}px`
        menu.style.left = `${(right - menu.offsetWidth * scale) / scale}px`
        menu.style.top = `${top / scale}px`
        menu.style.right = 'auto'
        menu.style.bottom = 'auto'
        return
      }
      const below = window.innerHeight - anchor.bottom - inset
      const menuBottom = Math.min(anchor.bottom, window.innerHeight)
      const above = menuBottom - inset
      const minMenuHeight = 64
      const opensAbove = above >= minMenuHeight || above >= below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`
      menu.style.left = `${Math.max(inset, Math.min(anchor.right, window.innerWidth - inset) - menu.offsetWidth)}px`
      menu.style.top = opensAbove ? 'auto' : `${Math.max(inset, anchor.bottom)}px`
      menu.style.bottom = opensAbove ? `${window.innerHeight - menuBottom}px` : 'auto'
    },
  })
  useLayoutEffect(() => {
    if (open) focusMenuItem(popup.current, 'first', 'button')
  }, [open])

  function close() {
    popup.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }

  return <div className="input-tools" data-grid-click-away-exempt data-no-panel-hold>
    <IconButton variant="quiet" ref={trigger} title="Input tools" aria-label="Input tools"
      disabled={disabled} aria-expanded={open} popoverTarget={id}>
      <MoreHorizontal size={19} aria-hidden="true" />
    </IconButton>
    <div ref={popup} className="app-menu input-tools-menu" id={id} role="group" aria-label="Input tools" data-candidate-paint-focus-keep popover="auto"
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
