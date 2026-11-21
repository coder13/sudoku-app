export const maxAdjacentClueTokenLength = 1 + 6 * 3 * 144
export const maxWhisperCells = 640
export const maxWhisperTokenLength = 2 * maxWhisperCells + Math.floor(maxWhisperCells / 2) * 3
export const maxPathCells = 640
export const maxPathClueTokenLength = 7 * maxPathCells

// Each populated cell uses its index, placed digit, center mask, and corner mask.
export const positionTokenCellLength = 7
export const numberPositionTokenLength = 81 * positionTokenCellLength
export const numberAnnotationTokenLength = 11_000
