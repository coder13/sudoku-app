import type { KeyboardEvent } from 'react'

/** Keep the selected tab visible in a horizontally clipped tab list. */
export function scrollActiveTabIntoView(list: HTMLElement | null) {
  const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!tab || !list) return
  const { left, right } = tab.getBoundingClientRect()
  const viewport = list.getBoundingClientRect()
  if (left < viewport.left) list.scrollLeft += left - viewport.left
  else if (right > viewport.right) list.scrollLeft += right - viewport.right
}

/** Apply the shared roving-key policy to a controlled tab list. */
export function moveRovingTab<Id extends string, ElementType extends HTMLElement>(event: KeyboardEvent<ElementType>, ids: readonly Id[], active: Id,
  onSelect: (id: Id) => void) {
  if (ids.length < 2 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = Math.max(0, ids.indexOf(active))
  const step = event.key === 'ArrowLeft' ? -1 : 1
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (current + step + ids.length) % ids.length
  const next = ids[index]
  onSelect(next)
  const button = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-roving-tab]')]
    .find(element => element.dataset.rovingTab === next)
  button?.focus()
}
