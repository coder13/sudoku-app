import { useCallback, useLayoutEffect, type KeyboardEvent, type RefObject } from 'react'
import { focusMenuItem, moveMenuItemFocus } from './menu-navigation'

type MenuEdge = 'first' | 'last'

/** Share focus entry, arrow navigation, and keyboard dismissal for action menus. */
export function useActionMenuKeyboard<Menu extends HTMLElement, Trigger extends HTMLElement>({
  open,
  menuRef,
  triggerRef,
  close,
  onDismiss,
  stopEscapePropagation = false,
  initialFocus = 'first',
}: {
  open: boolean
  menuRef: RefObject<Menu | null>
  triggerRef?: RefObject<Trigger | null>
  close?: () => void
  onDismiss?: (reason: 'escape' | 'tab') => void
  stopEscapePropagation?: boolean
  initialFocus?: MenuEdge
}) {
  useLayoutEffect(() => {
    if (open) focusMenuItem(menuRef.current, initialFocus)
  }, [open, initialFocus, menuRef])

  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      const reason = event.key === 'Escape' ? 'escape' : 'tab'
      if (reason === 'escape') {
        event.preventDefault()
        if (stopEscapePropagation) event.stopPropagation()
      }
      if (onDismiss) onDismiss(reason)
      else {
        close?.()
        triggerRef?.current?.focus({ preventScroll: true })
      }
      return
    }
    moveMenuItemFocus(event)
  }, [close, onDismiss, stopEscapePropagation, triggerRef])
}
