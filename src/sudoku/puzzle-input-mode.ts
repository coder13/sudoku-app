/** The mode shown by the puzzle border and floating icon while the board is playable. */
export type PuzzleInputMode = 'pen' | 'pencil' | 'highlight' | 'erase' | 'color' | 'chain' | 'branch'

type InputState = {
  drawingLinks: boolean
  browsingStrongLinks: boolean
  erasing: boolean
  coloring: boolean
  highlighting: boolean
  penciling: boolean
}

/** Always return one active mode, even while browsing tools instead of entering digits. */
export function puzzleInputMode(state: InputState): PuzzleInputMode {
  if (state.drawingLinks || state.browsingStrongLinks) return 'chain'
  if (state.erasing) return 'erase'
  if (state.coloring) return 'color'
  if (state.highlighting) return 'highlight'
  return state.penciling ? 'pencil' : 'pen'
}

/** Alternate Pen and Pencil without activating Highlight mode. */
export function togglePencilMode(penciling: boolean): boolean {
  return !penciling
}
