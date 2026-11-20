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
