const MIN_HINT_HEIGHT = 96
const MIN_PUZZLE_HEIGHT = 180

function pixels(value: string) {
  return Number.parseFloat(value) || 0
}

/** Measure unscaled layout once before resizing. The puzzle scale does not affect these dimensions. */
export function measureDesktopHintBounds(stack: HTMLElement, slot: HTMLElement, column: HTMLElement, puzzle: HTMLElement,
  card: HTMLElement, heading: HTMLElement, toolbar: HTMLElement) {
  const slotStyle = getComputedStyle(slot)
  const cardStyle = getComputedStyle(card)
  const toolbarHeight = toolbar.offsetHeight + pixels(getComputedStyle(toolbar).marginBlockEnd)
  const chrome = toolbarHeight + pixels(slotStyle.getPropertyValue('--desktop-hint-gap')) +
    pixels(slotStyle.getPropertyValue('--desktop-hint-bottom-gap'))
  const puzzleHeight = puzzle.offsetHeight
  const columnChrome = column.offsetTop + column.offsetHeight - puzzleHeight
  const room = stack.clientHeight - chrome - columnChrome
  const max = Math.max(0, Math.floor(room - Math.min(MIN_PUZZLE_HEIGHT, puzzleHeight)))
  const cardChrome = pixels(cardStyle.paddingBlockStart) + pixels(cardStyle.paddingBlockEnd) +
    pixels(cardStyle.borderBlockStartWidth) + pixels(cardStyle.borderBlockEndWidth)
  const min = Math.min(max, Math.max(MIN_HINT_HEIGHT, Math.ceil(cardChrome + heading.offsetHeight + 24)))
  return { chrome, room, puzzleHeight, min, max }
}

export type DesktopHintBounds = ReturnType<typeof measureDesktopHintBounds>

export function clampDesktopHintHeight(height: number, { min, max }: DesktopHintBounds) {
  return Math.min(max, Math.max(min, Math.round(height)))
}

export function desktopHintHeight(bounds: DesktopHintBounds, preferred?: number) {
  return clampDesktopHintHeight(preferred ?? bounds.room - bounds.puzzleHeight, bounds)
}

export function desktopHintPuzzleScale(height: number, { room, puzzleHeight }: DesktopHintBounds) {
  return puzzleHeight > 0 ? Math.max(0, Math.min(1, (room - height) / puzzleHeight)) : 1
}
