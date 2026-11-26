import { useEffectEvent, useLayoutEffect, type RefObject } from 'react'

type PlacePopover = (anchor: HTMLElement, popup: HTMLElement) => void
type ObservePopover = (anchor: HTMLElement, popup: HTMLElement) => readonly Element[]

/** Keep an anchored popover positioned while its anchor or viewport changes. */
export function useAnchoredPopover({
  open, anchorRef, popupRef, place, observe, show = false, clearInlineStyle = false,
  revision,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  popupRef: RefObject<HTMLElement | null>
  place: PlacePopover
  observe?: ObservePopover
  show?: boolean
  clearInlineStyle?: boolean
  revision?: unknown
}) {
  const update = useEffectEvent((anchor: HTMLElement, popup: HTMLElement) => place(anchor, popup))
  const observedElements = useEffectEvent((anchor: HTMLElement, popup: HTMLElement) => observe?.(anchor, popup) ?? [])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const popup = popupRef.current
    if (!open || !anchor || !popup) return
    if (show && !popup.matches(':popover-open')) popup.showPopover()

    const position = () => update(anchor, popup)
    position()
    const observer = new ResizeObserver(position)
    for (const element of observedElements(anchor, popup)) observer.observe(element)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      if (clearInlineStyle) popup.removeAttribute('style')
    }
  }, [open, anchorRef, popupRef, show, clearInlineStyle, revision])
}
