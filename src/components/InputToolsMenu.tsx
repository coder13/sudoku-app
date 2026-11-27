import { type ReactNode, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from './Button'
import { focusMenuItem } from './menu-navigation'
import { useAnchoredPopover } from './useAnchoredPopover'
import { usePlayLayoutAnchors } from './play-layout-anchors'
import { positionScaledRightPopover } from './scaled-popover-position'

/** Open or close solving panels from the input area. */
export function InputToolsMenu({ disabled, onShow, observeRef, children }: {
  disabled: boolean
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
  useAnchoredPopover({ open, anchorRef: trigger, popupRef: popup, clearInlineStyle: true,
    observe: () => layoutRef?.current ? [layoutRef.current] : [],
    place: (button, menu) => positionScaledRightPopover(button, menu, { gap: 0, preferAbove: true }),
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
