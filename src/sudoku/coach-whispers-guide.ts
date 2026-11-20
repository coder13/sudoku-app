import type { VariantPuzzle } from './engine.ts'
import { whispersGuideDigits, whispersLinkCounts } from './whispers-guide.ts'

const SWATCHES = [
  { name: 'orange', fill: '#f7e4c5', x: 0.5, y: -0.5 },
  { name: 'yellow', fill: '#f7f7c5', x: 5.5, y: -0.5 },
  { name: 'lime', fill: '#def7c5', x: 0.5, y: 9.5 },
  { name: 'magenta', fill: '#f7c5f5', x: 5.5, y: 9.5 },
]

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const TEXT_STYLING = new Set(['gridZoomOut', 'gridSnapToCorners', 'textSize', 'gridResolution', 'outlineThickness'])

/** Accept the Coach legend when all its marks restate the typed Whispers rules. */
export function isCoachWhispersGuide(data: Record<string, unknown>, decorations: readonly Record<string, unknown>[],
  puzzle: VariantPuzzle): boolean {
  const { colours, givenColours } = data
  if (!Array.isArray(colours) || colours.length !== SWATCHES.length || new Set(colours).size !== SWATCHES.length ||
    !SWATCHES.every(swatch => colours.includes(swatch.name)) || typeof givenColours !== 'string') return false
  const expected = new Set<string>()
  for (const [index, { fill, x, y }] of SWATCHES.entries()) {
    const count = index + 1
    const [low, high] = whispersGuideDigits(count)
    expected.add(`rect:${x},${y}:${fill}`)
    expected.add(`text:${x + 2},${y}:= ${count} unique link${count === 1 ? '' : 's'}`)
    expected.add(`text:${x},${y - 0.1}:${low}`)
    expected.add(`text:${x},${y + 0.1}:${high}`)
  }
  for (const { type, segments, settings, ...rest } of decorations) {
    if (Object.keys(rest).some(key => key !== 'id') || !Array.isArray(segments) || !segments.length || !record(settings)) return false
    const shape = type === 'cosmeticShape'
    if (shape ? Object.keys(settings).length !== 1 || typeof settings.colour !== 'string'
      : Object.keys(settings).some(key => !TEXT_STYLING.has(key))) return false
    for (const segment of segments) {
      if (!record(segment) || Object.keys(segment).length !== 2 || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
        !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !segment.cells[0].every(Number.isFinite) ||
        !record(segment.parameters) || Object.keys(segment.parameters).length !== 1) return false
      const [x, y] = segment.cells[0] as [number, number]
      if (shape && segment.parameters.shape !== 'rect' || !shape && typeof segment.parameters.text !== 'string') return false
      if (!expected.delete(shape ? `rect:${x},${y}:${settings.colour}`
        : `text:${x},${y}:${segment.parameters.text}`)) return false
    }
  }
  if (expected.size) return false
  const counts = whispersLinkCounts(puzzle)
  const colourCounts = colours.map(name => SWATCHES.findIndex(swatch => swatch.name === name) + 1)
  const cells = givenColours.split(',')
  return Boolean(counts && cells.length === counts.length && cells.every((shade, cell) =>
    counts[cell] === (shade === '' ? 0 : /^[0-3]$/.test(shade) ? colourCounts[Number(shade)] : -1)))
}
