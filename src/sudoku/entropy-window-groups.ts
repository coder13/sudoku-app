import { record } from './puzzle-import/shared.ts'

export type EntropyWindowGroup = {
  cells: readonly [number, number, number, number]
  group: 'low' | 'middle' | 'high'
}

const SHAPE_GROUPS: Readonly<Record<string, EntropyWindowGroup['group']>> = {
  rect: 'low',
  'polygon-6': 'middle',
  circle: 'high',
}

/** Parse Sudoku Coach corner shapes that identify the doubled group in a 2 × 2 window. */
export function parseCoachEntropyWindowGroups(layers: readonly unknown[]): EntropyWindowGroup[] | undefined {
  const parsed: EntropyWindowGroup[] = []
  const windows = new Set<number>()

  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'cosmeticShape' || !record(layer.settings) ||
      !Array.isArray(layer.segments)) return
    const settings = layer.settings
    if (settings.gridSnapToCentres !== false || settings.gridSnapToCorners !== true ||
      Object.keys(settings).some(key => !['gridSnapToCentres', 'gridSnapToCorners', 'colour', 'shapeSize', 'borderColour', 'borderThickness'].includes(key))) return

    for (const segment of layer.segments) {
      if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
        !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !record(segment.parameters) ||
        Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.shape !== 'string') return
      const group = SHAPE_GROUPS[segment.parameters.shape]
      const [x, y] = segment.cells[0]
      if (!group || !Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > 8 || y < 1 || y > 8) return
      const topLeft = (y - 1) * 9 + x - 1
      if (windows.has(topLeft)) return
      windows.add(topLeft)
      parsed.push({ cells: [topLeft, topLeft + 1, topLeft + 9, topLeft + 10], group })
    }
  }

  return parsed.length > 0 ? parsed : undefined
}
