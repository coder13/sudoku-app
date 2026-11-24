export const MOBILE_RESIZE_STEP = 16

/**
 * The resize budget includes the flexible space above and below the cards.
 * The input panel can use that space before the puzzle needs to shrink.
 */
export function mobileInputResizeBudget(inputHeight: number, puzzleHeight: number, unusedSpace: number): number {
  return inputHeight + puzzleHeight + Math.max(0, unusedSpace)
}

/** Keep the grid at its natural size until the surrounding blank space is used. */
export function mobileResizedPuzzleHeight(
  total: number, inputHeight: number, naturalPuzzleHeight: number, minimumPuzzleHeight: number,
): number {
  return Math.max(minimumPuzzleHeight, Math.min(naturalPuzzleHeight, total - inputHeight))
}

/** During a resize preview, use the full available column width, not the
 * narrower width at which the drag started. This works in both directions.
 */
export function mobilePreviewGridWidth(availableWidth: number, puzzleHeight: number, chromeHeight: number): number {
  return Math.max(0, Math.min(availableWidth, puzzleHeight - chromeHeight))
}
