import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { IconButton } from './Button'
import { useActionMenuKeyboard } from './useActionMenuKeyboard'
import { useAnchoredPopover } from './useAnchoredPopover'
import { positionScaledRightPopover } from './scaled-popover-position'

/** Show a keyboard-accessible overflow menu for board sketch actions. */
export function SketchActionsMenu({ actions, label }: {
  actions: { label: string; icon: LucideIcon; disabled: boolean; title?: string; opensDialog?: boolean; checked?: boolean; toggle?: boolean; run: () => void }[]
  label: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  useAnchoredPopover({ open, anchorRef: trigger, popupRef: popover, clearInlineStyle: true,
    place: (button, menu) => positionScaledRightPopover(button, menu, { gap: 0, preferAbove: true }),
  })

  function close() {
    popover.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }
  const onMenuKeyDown = useActionMenuKeyboard({ open, menuRef: popover, triggerRef: trigger,
    close: () => popover.current?.hidePopover() })

  const items = actions.map(({ label: actionLabel, icon: Icon, disabled, title, opensDialog, checked, toggle, run }) => (
    <button type="button" key={actionLabel} role={toggle ? 'menuitemcheckbox' : 'menuitem'} tabIndex={-1} aria-disabled={disabled}
      aria-checked={toggle ? Boolean(checked) : undefined}
      aria-haspopup={opensDialog ? 'dialog' : undefined} title={title} onClick={() => {
      if (disabled) return
      if (!toggle) close()
      run()
    }}><Icon size={16} aria-hidden="true" />{actionLabel}</button>
  ))

  return <>
    <IconButton ref={trigger} variant="quiet" aria-label={label}
      title={label} aria-haspopup="menu" aria-expanded={open} popoverTarget={id}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown') return
        event.preventDefault()
        popover.current?.showPopover()
      }}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </IconButton>
    <div ref={popover} id={id} popover="auto" className="app-menu chain-actions-menu" role="menu" aria-label={label}
      onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
      onKeyDown={onMenuKeyDown}>
      {items}
    </div>
  </>
}
