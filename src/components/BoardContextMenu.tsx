import type { LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useActionMenuKeyboard } from './useActionMenuKeyboard'

export type BoardContextMenuAnchor = { x: number; y: number; cell: HTMLElement }
type Action = { label: string; icon: LucideIcon; unavailable?: string; run: () => void }

/** Present actions for the board's current cell selection at a pointer or keyboard anchor. */
export function BoardContextMenu({ anchor, actions, onClose }: {
  anchor: BoardContextMenuAnchor
  actions: readonly Action[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const gap = 6
    const bounds = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(gap, Math.min(anchor.x, window.innerWidth - bounds.width - gap))}px`
    menu.style.top = `${Math.max(gap, Math.min(anchor.y, window.innerHeight - bounds.height - gap))}px`
    menu.focus({ preventScroll: true })
  }, [anchor])

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose()
    }
    window.addEventListener('pointerdown', dismissOutside, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', dismissOutside, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  function closeAndFocusCell() {
    onClose()
    anchor.cell.focus({ preventScroll: true })
  }

  const onKeyDown = useActionMenuKeyboard({
    open: true, menuRef, onDismiss: closeAndFocusCell, stopEscapePropagation: true,
  })

  return createPortal(<div ref={menuRef} className="puzzle-context-menu board-context-menu" role="menu"
    aria-label="Puzzle board actions" tabIndex={-1} data-grid-click-away-exempt onKeyDown={onKeyDown}>
    {actions.map(({ label, icon: Icon, unavailable, run }) => (
      <button key={label} type="button" role="menuitem" tabIndex={-1} disabled={Boolean(unavailable)} title={unavailable} onClick={() => {
        closeAndFocusCell()
        run()
      }}>
        <Icon size={16} aria-hidden="true" /> {label}
      </button>
    ))}
  </div>, document.body)
}
