import type { VariantPuzzle, VariantRule } from './engine.ts'
import { regionIndex } from './region-sum.ts'

type Point = readonly [number, number]
type Stroke = readonly Point[]
const EPSILON = 1e-8
const STYLING = ['colour', 'lineThickness', 'lineEndOffset', 'borderThickness', 'gridResolution', 'gridSnapToCorners']

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(axis =>
    typeof axis === 'number' && Number.isFinite(axis) && axis > 0 && axis < 9)
}

function close(a: number, b: number) { return Math.abs(a - b) < EPSILON }
function samePoint(a: Point, b: Point) { return close(a[0], b[0]) && close(a[1], b[1]) }

function onSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point) {
  return x >= Math.min(ax, bx) - EPSILON && x <= Math.max(ax, bx) + EPSILON &&
    y >= Math.min(ay, by) - EPSILON && y <= Math.max(ay, by) + EPSILON &&
    close((x - ax) * (by - ay), (y - ay) * (bx - ax))
}

/** Recover the line's cell centers from the ends and bends of a drawn stroke. */
function centeredCells(path: Stroke): number[] {
  // Off-center strokes leave room for nearby clues. Intermediate samples
  // along a straight leg can clip a cell corner outside that leg's centerline.
  const vertices = path.filter((point, i) => i === 0 || i === path.length - 1 ||
    !onSegment(point, path[i - 1], path[i + 1]))
  if (vertices.some(point => point.some(axis => close(axis, Math.round(axis))))) {
    throw new Error('This Sudoku Coach line has an end or bend on a cell border.')
  }
  const centers = vertices.map(([x, y]) => [Math.floor(x), Math.floor(y)] as const)
  const cells = [centers[0][1] * 9 + centers[0][0]]
  for (let i = 1; i < centers.length; i++) {
    const [x, y] = centers[i - 1]
    const dx = centers[i][0] - x, dy = centers[i][1] - y
    if (dx && dy && Math.abs(dx) !== Math.abs(dy)) {
      throw new Error('This Sudoku Coach line has an ambiguous path between cells.')
    }
    for (let step = 1; step <= Math.max(Math.abs(dx), Math.abs(dy)); step++) {
      cells.push((y + step * Math.sign(dy)) * 9 + x + step * Math.sign(dx))
    }
  }
  return cells
}

function orangePath(strokes: readonly Stroke[]): Stroke {
  // The export retraces part of one slope. Remove a stroke when its
  // entire drawing is already covered by a primary stroke.
  const remaining = strokes.filter((stroke, index) => !strokes.some((other, j) =>
    (other.length > stroke.length || other.length === stroke.length && j < index) &&
    stroke.slice(1).every((point, i) => other.some((end, k) => k > 0 &&
      onSegment(point, other[k - 1], end) && onSegment(stroke[i], other[k - 1], end)))))
  const path = [...remaining.shift()!]
  while (remaining.length) {
    const joins = remaining.flatMap((stroke, index) => [
      samePoint(stroke[0], path.at(-1)!) && { index, start: false, reverse: false },
      samePoint(stroke.at(-1)!, path.at(-1)!) && { index, start: false, reverse: true },
      samePoint(stroke.at(-1)!, path[0]) && { index, start: true, reverse: false },
      samePoint(stroke[0], path[0]) && { index, start: true, reverse: true },
    ].filter(join => join !== false))
    const first = joins.find(join => join.start)
    const last = joins.find(join => !join.start)
    if (!joins.length || joins.length > Number(Boolean(first)) + Number(Boolean(last)) ||
      first && last && first.index === last.index) throw new Error('This Sudoku Coach puzzle has an ambiguous Entropic drawing.')
    const join = first ?? last!
    const stroke = [...remaining.splice(join.index, 1)[0]]
    if (join.reverse) stroke.reverse()
    if (join.start) path.unshift(...stroke.slice(0, -1))
    else path.push(...stroke.slice(1))
  }
  return path
}

export function readCoachColouredLines(layers: readonly Record<string, unknown>[], regions: VariantPuzzle['regions']): VariantRule[] {
  const orange: Stroke[] = [], blue: Stroke[] = []
  for (const { settings, segments, ...layer } of layers) {
    if (Object.keys(layer).some(key => key !== 'type' && key !== 'id') || !record(settings) ||
      Object.keys(settings).some(key => !STYLING.includes(key)) || !Array.isArray(segments) || !segments.length) {
      throw new Error('This Sudoku Coach puzzle has an unsupported coloured line layer.')
    }
    const strokes = settings.colour === '#ffbd61' ? orange : settings.colour === '#d6feff' ? blue : undefined
    if (!strokes) throw new Error('This Sudoku Coach puzzle has an undeclared line colour.')
    for (const segment of segments) {
      if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
        !Array.isArray(segment.cells) || segment.cells.length < 2 || !segment.cells.every(isPoint) ||
        segment.parameters !== undefined && (!record(segment.parameters) || Object.keys(segment.parameters).length !== 0)) {
        throw new Error('This Sudoku Coach puzzle has an invalid drawn line.')
      }
      strokes.push(segment.cells)
    }
  }
  if (!orange.length || !blue.length) throw new Error('This Sudoku Coach puzzle is missing a colour from its published line legend.')

  const entropy = centeredCells(orangePath(orange))
  if (entropy.length < 3) throw new Error('This Sudoku Coach puzzle has an incomplete Entropic drawing.')
  const sums = blue.map(stroke => {
    const cells = centeredCells(stroke)
    if (new Set(cells).size !== cells.length || new Set(cells.map(cell => regionIndex(cell, regions))).size < 2) {
      throw new Error('This Sudoku Coach puzzle has an ambiguous Region Sum drawing.')
    }
    return { type: 'region-sum' as const, cells, groupByRegion: false }
  })
  return [{ type: 'entropic', cells: entropy }, ...sums]
}
