import type { KeyboardEvent } from 'react'

const MENU_NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'

type MenuEdge = 'first' | 'last'

function menuItems(root: ParentNode, selector: string) {
  return [...root.querySelectorAll<HTMLElement>(selector)]
    .filter(item => !item.matches(':disabled') && item.getAttribute('aria-disabled') !== 'true')
}

/** Focus an enabled action at one end of a menu, or a control group selector supplied by its host. */
export function focusMenuItem(root: ParentNode | null, edge: MenuEdge = 'first', selector = MENU_ITEM_SELECTOR) {
  if (!root) return null
  const items = menuItems(root, selector)
  const item = items.at(edge === 'first' ? 0 : -1) ?? null
  item?.focus({ preventScroll: true })
  return item
}

/** Move focus through enabled menu actions with the shared arrow-key policy. */
export function moveMenuItemFocus(event: KeyboardEvent<HTMLElement>) {
  if (!MENU_NAVIGATION_KEYS.includes(event.key)) return false

  event.preventDefault()
  event.stopPropagation()

  const items = menuItems(event.currentTarget, MENU_ITEM_SELECTOR).filter(item => item.getClientRects().length > 0)
  if (!items.length) return true

  const current = items.indexOf(document.activeElement as HTMLElement)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : current < 0 ? event.key === 'ArrowDown' ? 0 : items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[index]?.focus({ preventScroll: true })
  return true
}
