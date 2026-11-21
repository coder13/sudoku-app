import type { ImportedCellColors } from './imported-colors.ts'

type Point = readonly [x: number, y: number]

export type AuthoredMark = { type: 'outline'; points: readonly Point[]; thickness: number }
  | { type: 'disc'; center: Point; radius: number; color: string }

export type AuthoredCornerPath = {
  type: 'corner-path'
  points: readonly Point[]
  thickness: number
  color: string
  opacity: number
  border?: { color: string; thickness: number }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function point(value: unknown, corner: boolean, gridSize = 9): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' &&
    coordinate >= 0 && coordinate <= gridSize && Number.isInteger(coordinate - (corner ? 0 : .5)))
}

function size(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= .5
}

const artworkColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export function validAuthoredArtwork(value: unknown): value is readonly AuthoredMark[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 81 && value.every(mark => {
    if (!record(mark)) return false
    if (mark.type === 'outline') {
      const { points } = mark
      return Object.keys(mark).length === 3 && size(mark.thickness) &&
        Array.isArray(points) && points.length >= 4 && points.length <= 128 && points.every(vertex => point(vertex, true)) &&
        points[0].every((coordinate, axis) => coordinate === points[points.length - 1][axis])
    }
    return mark.type === 'disc' && Object.keys(mark).length === 4 && size(mark.radius) &&
      point(mark.center, false) && artworkColor(mark.color)
  })
}

function boundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max
}

export function validAuthoredCornerPaths(value: unknown, gridSize: number): value is readonly AuthoredCornerPath[] {
  if (!Array.isArray(value) || !value.length || value.length > 81) return false
  let total = 0
  return value.every(mark => {
    if (!record(mark) || mark.type !== 'corner-path' ||
        Object.keys(mark).some(key => !['type', 'points', 'thickness', 'color', 'opacity', 'border'].includes(key))) return false
    const { points, thickness, color, opacity, border } = mark
    if (!Array.isArray(points) || points.length < 2 || !boundedNumber(thickness, 0, 1) ||
        !artworkColor(color) || !boundedNumber(opacity, 0, 1)) return false
    total += points.length
    return total <= 640 && points.every(vertex => point(vertex, true, gridSize)) &&
      (border === undefined || record(border) && Object.keys(border).length === 2 &&
        artworkColor(border.color) && boundedNumber(border.thickness, 0, thickness))
  })
}

export function sameAuthoredArtwork(a?: readonly AuthoredMark[], b?: readonly AuthoredMark[]) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((mark, index) => {
    const other = b[index]
    return mark.type === 'outline' && other.type === 'outline'
      ? mark.thickness === other.thickness && JSON.stringify(mark.points) === JSON.stringify(other.points)
      : mark.type === 'disc' && other.type === 'disc' && mark.radius === other.radius &&
        mark.color === other.color && mark.center[0] === other.center[0] && mark.center[1] === other.center[1]
  })
}

// A drawing or fill may carry a rule. Bind each review to the whole original export.
// Windoku I outlines four of its typed regions, and Khachkar's discs are artwork.
const reviewedDrawings = new Map([
  ['12f8cfe5848c2ae3d1ebb478a484d05ff6311c689d10c3d6a585bcde0e828f7f', { layer: 'cosmeticLine', title: 'Windoku I' }],
  ['df51c464f943b9c2436f9897ce4d5cbaaaaf3309da5c2eef68bc93ed1e8ab095', { layer: 'cosmeticShape', title: 'Khachkar' }],
])

// These reviews cover the complete authoring data and ordered cell shades.
const reviewedFills = new Map([
  ['5a500262913542452647e2a3623d6caeff79a00e949ad5c4f83acea306c1f980', 'Sudoku Spider'],
  ['5b9cb5df490c8ac7e2b55566ef5a0e37c6161f260887484c457baf7e76ad6fc8', 'Pumpkin 2024'],
  ['3f9c2090ae6dab63a274a4c8dc16711e406bad21e077df0103671470d8e42aa0', 'Halloween Candy 1'],
])

const fieldsOutsideFillReview = new Set([
  'colours', 'givenColours', 'userDigits', 'userCellCandidates', 'userBoxCandidates',
  'userColours', 'userCellCandidatesColours',
])

async function reviewKey(text: string) {
  if (!globalThis.crypto?.subtle) return
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function reviewedCoachFillTitle(data: Record<string, unknown>, fills: ImportedCellColors) {
  // The palette also holds player shades. The normalized fills retain the
  // author's shades while entries and candidate notes may change separately.
  const definition = Object.fromEntries(Object.entries(data).filter(([key]) => !fieldsOutsideFillReview.has(key)))
  const material = JSON.stringify([definition, fills], (_key, value) => record(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value)
  const key = await reviewKey(material)
  return key ? reviewedFills.get(key) : undefined
}

export async function readReviewedCoachArtwork(code: string, constraints: readonly unknown[]) {
  const drawn = constraints.filter(layer => record(layer) && (layer.type === 'cosmeticLine' || layer.type === 'cosmeticShape'))
  if (drawn.length !== 1 || !record(drawn[0])) return
  const hash = await reviewKey(code)
  if (!hash) return
  const review = reviewedDrawings.get(hash)
  const layer = drawn[0]
  if (!review || review.layer !== layer.type ||
      !record(layer.settings) || !Array.isArray(layer.segments)) return
  const settings = layer.settings
  const artwork = layer.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells)) return
    if (review.layer === 'cosmeticLine' && typeof settings.lineThickness === 'number') {
      return { type: 'outline', points: segment.cells, thickness: settings.lineThickness / 100 }
    }
    if (typeof settings.shapeSize === 'number' && segment.cells.length === 1 &&
        record(segment.parameters) && segment.parameters.shape === 'circle') {
      return { type: 'disc', center: segment.cells[0], radius: (settings.shapeSize + 15) / 200, color: settings.colour }
    }
  })
  return validAuthoredArtwork(artwork) ? { layer, artwork, title: review.title } : undefined
}
