type ScaledPopoverOptions = {
  gap?: number
  preferAbove?: boolean
  heightAdjustment?: number
}

/** Position a scaled popover against a right-aligned anchor and keep it in the viewport. */
export function positionScaledRightPopover(anchorElement: HTMLElement, popup: HTMLElement, {
  gap = 8,
  preferAbove = false,
  heightAdjustment = 0,
}: ScaledPopoverOptions = {}) {
  const anchor = anchorElement.getBoundingClientRect()
  const scale = Number(getComputedStyle(popup).getPropertyValue('--desktop-layout-scale')) || 1
  const below = window.innerHeight - anchor.bottom - 2 * gap
  const above = anchor.top - 2 * gap
  const menuHeight = (popup.scrollHeight + heightAdjustment) * scale
  const opensAbove = preferAbove
    ? above > 0 && above >= Math.min(below, menuHeight)
    : menuHeight > below && above > below

  popup.style.maxHeight = `${Math.max(0, opensAbove ? above : below) / scale}px`
  const right = Math.min(anchor.right, window.innerWidth - gap)
  const height = popup.offsetHeight * scale
  const top = opensAbove ? anchor.top - gap - height : anchor.bottom + gap
  const left = Math.max(gap, right - popup.offsetWidth * scale)

  popup.style.left = `${left / scale}px`
  popup.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - height - gap)) / scale}px`
  popup.style.transformOrigin = opensAbove ? 'bottom right' : 'top right'
}
