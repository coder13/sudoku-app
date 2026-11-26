export type DesktopHintSpacing = {
  gap: number
  bottomGap: number
  toolbarHeight: number
}

function cssPixels(value: string) {
  return Number.parseFloat(value) || 0
}

/** Read the measured space around a desktop hint card from its explicit layout anchors. */
export function measureDesktopHintSpacing(slot: HTMLElement, toolbar?: HTMLElement | null): DesktopHintSpacing {
  const slotStyle = getComputedStyle(slot)
  const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null
  return {
    gap: cssPixels(slotStyle.getPropertyValue('--desktop-hint-gap')),
    bottomGap: cssPixels(slotStyle.getPropertyValue('--desktop-hint-bottom-gap')),
    toolbarHeight: toolbar
      ? toolbar.offsetHeight + cssPixels(toolbarStyle?.marginBlockEnd ?? '')
      : 0,
  }
}

/** Keep the minimum puzzle space and hint spacing consistent for initial sizing and resize limits. */
export function availableDesktopHintHeight(stackHeight: number, spacing: DesktopHintSpacing, minimumPuzzleHeight = 180) {
  return Math.max(0, stackHeight - minimumPuzzleHeight - spacing.gap - spacing.bottomGap - spacing.toolbarHeight)
}
