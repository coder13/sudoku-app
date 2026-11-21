import { validAuthoredCornerPaths } from '../sudoku/authored-artwork.ts'

const allowedSettings = new Set([
  'colour', 'lineThickness', 'opacity', 'borderColour', 'borderThickness',
  'lineEndOffset', 'gridZoomOut', 'gridResolution', 'gridSnapToCentres', 'gridSnapToCorners',
])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readCoachAuthoredPaths(layers: readonly unknown[], size: number) {
  const paths: unknown[] = []
  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'cosmeticLine') continue
    const settings = layer.settings === undefined ? {} : layer.settings
    if (!record(settings) || Object.keys(settings).some(key => !allowedSettings.has(key)) ||
        (settings.lineEndOffset !== undefined && settings.lineEndOffset !== 0) ||
        (settings.gridZoomOut !== undefined && settings.gridZoomOut !== 0)) {
      throw new Error('This Sudoku Coach puzzle uses unsupported authored line settings.')
    }
    const { colour: color = '#000000', lineThickness = 18, opacity = 255,
      borderColour = '#aaaaaa', borderThickness = 3 } = settings
    if (typeof lineThickness !== 'number' || typeof opacity !== 'number' || typeof borderThickness !== 'number' ||
        borderThickness < 0 || !Array.isArray(layer.segments)) {
      throw new Error('This Sudoku Coach puzzle has invalid authored lines.')
    }
    for (const segment of layer.segments) {
      if (!record(segment) || segment.parameters !== undefined &&
          (!record(segment.parameters) || Object.keys(segment.parameters).length)) {
        throw new Error('This Sudoku Coach puzzle has invalid authored lines.')
      }
      paths.push({
        type: 'corner-path', points: segment.cells, thickness: lineThickness / 100, color, opacity: opacity / 255,
        ...(borderThickness && { border: { color: borderColour, thickness: borderThickness / 100 } }),
      })
    }
  }
  if (!paths.length) return
  if (!validAuthoredCornerPaths(paths, size)) throw new Error('Authored lines must follow grid corners inside the grid.')
  return paths
}
