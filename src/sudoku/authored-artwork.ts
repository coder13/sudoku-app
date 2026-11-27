import type { ImportedCellColors } from './imported-colors.ts'
import { sourceHash, withoutCoachProgress } from './puzzle-import/shared.ts'

type Point = readonly [x: number, y: number]

export type AuthoredMark = { type: 'outline'; points: readonly Point[]; thickness: number }
  | { type: 'divider'; points: readonly Point[]; thickness: number }
  | { type: 'disc'; center: Point; radius: number; color: string }
  | { type: 'tile'; center: Point; size: number; rotation: number; color: string; opacity: number }
  | { type: 'text'; center: Point; text: string; size: number; color: string; opacity: number;
      outlineColor: string; outlineThickness: number; offsetY: number }

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function point(value: unknown, corner: boolean): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' &&
    coordinate >= 0 && coordinate <= 9 && Number.isInteger(coordinate - (corner ? 0 : .5)))
}

function size(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= .5
}

function artworkPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate =>
    typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 9)
}

export function validAuthoredArtwork(value: unknown): value is readonly AuthoredMark[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 512 && value.every(mark => {
    if (!record(mark)) return false
    if (mark.type === 'outline' || mark.type === 'divider') {
      const { points } = mark
      return Object.keys(mark).length === 3 && size(mark.thickness) &&
        Array.isArray(points) && points.length >= (mark.type === 'outline' ? 4 : 2) &&
        points.length <= 128 && points.every(vertex => point(vertex, true)) &&
        (mark.type === 'outline'
          ? points[0].every((coordinate, axis) => coordinate === points.at(-1)![axis])
          : points.slice(1).every(([x, y], i) => (x === points[i][0]) !== (y === points[i][1])))
    }
    if (mark.type === 'disc') return Object.keys(mark).length === 4 && size(mark.radius) &&
      point(mark.center, false) && typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color)
    if (mark.type === 'tile') return Object.keys(mark).length === 6 && artworkPoint(mark.center) &&
      typeof mark.size === 'number' && Number.isFinite(mark.size) && mark.size > 0 && mark.size <= 1 &&
      typeof mark.rotation === 'number' && Number.isFinite(mark.rotation) && Math.abs(mark.rotation) <= 360 &&
      typeof mark.opacity === 'number' && Number.isInteger(mark.opacity) && mark.opacity >= 0 && mark.opacity <= 255 &&
      typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color)
    return mark.type === 'text' && Object.keys(mark).length === 9 && artworkPoint(mark.center) &&
      typeof mark.text === 'string' && mark.text.length > 0 && mark.text.length <= 100 &&
      typeof mark.size === 'number' && Number.isFinite(mark.size) && mark.size > 0 && mark.size <= 2 &&
      typeof mark.opacity === 'number' && Number.isInteger(mark.opacity) && mark.opacity >= 0 && mark.opacity <= 255 &&
      typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color) &&
      typeof mark.outlineColor === 'string' && /^#[0-9a-f]{6}$/i.test(mark.outlineColor) &&
      typeof mark.outlineThickness === 'number' && Number.isFinite(mark.outlineThickness) && mark.outlineThickness >= 0 && mark.outlineThickness <= .1 &&
      typeof mark.offsetY === 'number' && Number.isFinite(mark.offsetY) && Math.abs(mark.offsetY) <= 1
  })
}

export function sameAuthoredArtwork(a?: readonly AuthoredMark[], b?: readonly AuthoredMark[]) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((mark, index) => {
    const other = b[index]
    if (mark.type !== other.type) return false
    if (mark.type === 'outline' || mark.type === 'divider') return other.type === mark.type &&
      mark.thickness === other.thickness && JSON.stringify(mark.points) === JSON.stringify(other.points)
    if (mark.type === 'disc') return other.type === 'disc' && mark.radius === other.radius &&
        mark.color === other.color && mark.center[0] === other.center[0] && mark.center[1] === other.center[1]
    if (mark.type === 'text') return other.type === 'text' && mark.text === other.text && mark.size === other.size &&
      mark.opacity === other.opacity && mark.color === other.color && mark.outlineColor === other.outlineColor &&
      mark.outlineThickness === other.outlineThickness && mark.offsetY === other.offsetY &&
      mark.center[0] === other.center[0] && mark.center[1] === other.center[1]
    if (mark.type !== 'tile' || other.type !== 'tile') return false
    return mark.size === other.size && mark.rotation === other.rotation &&
      mark.opacity === other.opacity && mark.color === other.color && mark.center[0] === other.center[0] &&
      mark.center[1] === other.center[1]
  })
}

// A drawing may carry a rule. Bind each review to its exact source layers,
// independent of player progress. Bento exports also accept appended rules.
// Windoku I outlines four of its typed regions, and Khachkar's discs are artwork.
const reviewedDrawings = new Map<string, { layer: string; title: string; partialRegions?: true; constraintCount?: number }>([
  ['92fb9f50af4684ebef1af0c900d104784c2b9265e9fb48b960f2511cce963804', { layer: 'cosmeticLine', title: 'AJT’s Bento 🍱 flavoured with Entropy', partialRegions: true, constraintCount: 12 }],
  ['925fb0996956769908a041dd7cf20450b1f4d5bbbd873a9dfce8010b256561a1', { layer: 'cosmeticLine', title: 'Non-con 🍱', partialRegions: true, constraintCount: 16 }],
  ['88426e68300e971314123430cdee9a623df296fed7c39fce9635571994d40c96', { layer: 'cosmeticLine', title: 'FUN-ky Bento II 🍱', partialRegions: true, constraintCount: 17 }],
  ['fb7f80c65aca408b1967c405a14b046925ceb62519f474e222d2091d69b495ba', { layer: 'cosmeticLine', title: 'Windoku I', constraintCount: 10 }],
  ['683b64457ad9033e09bc3165664a7fa94564086649a3165fa3ee7a2e1cbd79ce', { layer: 'cosmeticShape', title: 'Khachkar', constraintCount: 3 }],
])

// CS1G uses dense, rotated rectangle layers to spell the author's thank-you.
// Its visible rule list contains the puzzle's active rules; these shapes are art.
const reviewedShapeArtwork = new Map([
  ['b4d73c8354f88c8ea4e1ddf090847808510c1ed3e616bbf89bb115f2009e7abf', 'Thank RP you'],
])
const reviewedShapeArtworkConstraintCount = 7

const reviewedTextArtwork = new Map([
  ['babed6a85770d81c9be91fd70f6fa688eba31fc5361639579e82d8030f01cd44', 'Sunny with a chance of Entropy'],
])

// These reviews cover the complete authoring data and ordered cell shades.
const reviewedFills = new Map<string, { title: string; constraintCount?: number }>([
  ['fc0d8c24d3f5897483883cbb961b9e2738352ab5689f6b58a7a1ded8629aba8c', { title: 'Hallowteeth', constraintCount: 2 }],
  ['5a500262913542452647e2a3623d6caeff79a00e949ad5c4f83acea306c1f980', { title: 'Sudoku Spider', constraintCount: 1 }],
  ['5b9cb5df490c8ac7e2b55566ef5a0e37c6161f260887484c457baf7e76ad6fc8', { title: 'Pumpkin 2024', constraintCount: 0 }],
  ['3f9c2090ae6dab63a274a4c8dc16711e406bad21e077df0103671470d8e42aa0', { title: 'Halloween Candy 1', constraintCount: 0 }],
  ['6c228123fac384a93b7354da2036675e86a8d16fd5018e023f9e154caef6a5b1', { title: 'Halloween Candy 2', constraintCount: 0 }],
  ['7a700d2049444a0d0dda80de06bebc2d07e13ab5e71064b296b25e8c5cb7b38b', { title: 'Halloween Candy 3', constraintCount: 0 }],
  ['353a05eade0f1a0fb8ffc7a52f7f07f64d82f228831bb3e95b4d70a81d820ba3', { title: 'Halloween Candy 4', constraintCount: 0 }],
  ['8fe3e67f25f6dab7ad9d38f7b5ccab025ed0bbb426fcf7f08d69068f893f4138', { title: 'Halloween Candy 5', constraintCount: 0 }],
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
  const progressFree = withoutCoachProgress(data) as Record<string, unknown>
  const definition = Object.fromEntries(Object.entries(progressFree).filter(([key]) => !fieldsOutsideFillReview.has(key)))
  const keyFor = async (source: Record<string, unknown>) => {
    const material = JSON.stringify([source, fills], (_key, value) => record(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value)
    return reviewKey(material)
  }
  const key = await keyFor(definition)
  const exact = key ? reviewedFills.get(key) : undefined
  if (exact) return exact.title
  const constraints = definition.givenConstraints
  if (!Array.isArray(constraints)) return
  for (const [reviewedKey, review] of reviewedFills) {
    const count = review.constraintCount
    if (count === undefined || constraints.length <= count) continue
    const prefixDefinition = { ...definition }
    if (count === 0) delete prefixDefinition.givenConstraints
    else prefixDefinition.givenConstraints = constraints.slice(0, count)
    const prefix = await keyFor(prefixDefinition)
    if (prefix === reviewedKey) return review.title
  }
}

export async function readReviewedCoachArtwork(code: string, constraints: readonly unknown[], payload: Record<string, unknown>) {
  let hash = await sourceHash(code, payload)
  // CS1G's three reviewed shape layers are followed by active rules. A new
  // supported companion appended after those rules must not make the known
  // drawing parse as an unsupported constraint.
  if (!hash || !reviewedShapeArtwork.has(hash)) {
    const layers = payload.givenConstraints
    if (Array.isArray(layers) && layers.length > reviewedShapeArtworkConstraintCount) {
      const prefixHash = await sourceHash(code, {
        ...payload, givenConstraints: layers.slice(0, reviewedShapeArtworkConstraintCount),
      })
      if (prefixHash && reviewedShapeArtwork.has(prefixHash)) hash = prefixHash
    }
  }
  if (!hash || !reviewedDrawings.has(hash)) {
    const layers = payload.givenConstraints
    if (Array.isArray(layers)) for (const [reviewedHash, review] of reviewedDrawings) {
      const count = review.constraintCount
      if (!count || layers.length <= count) continue
      const prefixHash = await sourceHash(code, { ...payload, givenConstraints: layers.slice(0, count) })
      if (prefixHash === reviewedHash) { hash = reviewedHash; break }
    }
  }
  const textTitle = hash && reviewedTextArtwork.get(hash)
  if (textTitle) {
    const layers = constraints.filter(layer => record(layer) && layer.type === 'cosmeticText')
    if (layers.length !== 1 || !record(layers[0])) return
    const layer = layers[0]
    const settings = layer.settings
    const [segment] = Array.isArray(layer.segments) ? layer.segments : []
    if (Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !record(settings) || settings.positionVerticalOffset !== 7 || settings.opacity !== 188 ||
      settings.colour !== '#ffa852' || settings.textSize !== 91 || settings.outlineColour !== '#f77c00' ||
      settings.outlineThickness !== 1 || Object.keys(settings).some(key =>
        !['positionVerticalOffset', 'opacity', 'colour', 'textSize', 'outlineColour', 'outlineThickness'].includes(key)) ||
      !Array.isArray(layer.segments) || layer.segments.length !== 1 || !record(segment) ||
      Object.keys(segment).some(key => !['cells', 'parameters'].includes(key)) ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      segment.cells[0][0] !== 4.5 || segment.cells[0][1] !== 4.5 || !record(segment.parameters) ||
      segment.parameters.text !== 'RP' || Object.keys(segment.parameters).some(key => key !== 'text')) return
    const artwork: AuthoredMark[] = [{ type: 'text', text: segment.parameters.text as string,
      center: [segment.cells[0][0] as number, segment.cells[0][1] as number], size: (settings.textSize as number) / 200,
      color: settings.colour as string, opacity: settings.opacity as number,
      outlineColor: settings.outlineColour as string, outlineThickness: (settings.outlineThickness as number) / 100,
      offsetY: (settings.positionVerticalOffset as number) / 100 }]
    return validAuthoredArtwork(artwork) ? { layers, artwork, title: textTitle } : undefined
  }
  const reviewedTitle = hash && reviewedShapeArtwork.get(hash)
  if (reviewedTitle) {
    const layers = constraints.filter(layer => record(layer) && layer.type === 'cosmeticShape')
    const expected = [
      { color: '#be3c04', opacity: 8, size: 1, rotation: 0, count: 81 },
      { color: '#f15d1e', opacity: 178, size: .17, rotation: 45, count: 164 },
      { color: '#2142ff', opacity: 195, size: .15, rotation: 45, count: 160 },
    ]
    if (layers.length !== expected.length) return
    const artwork: AuthoredMark[] = []
    for (let index = 0; index < expected.length; index++) {
      const layer = layers[index]
      const spec = expected[index]
      if (!record(layer) || !record(layer.settings) || !Array.isArray(layer.segments) || layer.segments.length !== spec.count) return
      const settings = layer.settings
      if (settings.colour !== spec.color || settings.opacity !== spec.opacity ||
          settings.shapeSize !== spec.size * 100 || settings.borderThickness !== 0 ||
          (settings.shapeRotation ?? 0) !== spec.rotation ||
          Object.keys(settings).some(key => !['gridSnapToCentres', 'gridSnapToEdges', 'opacity', 'colour', 'shapeSize', 'shapeRotation', 'borderThickness'].includes(key))) return
      for (const segment of layer.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
            !record(segment.parameters) || segment.parameters.shape !== 'rect' ||
            Object.keys(segment.parameters).some(key => key !== 'shape') || !artworkPoint(segment.cells[0])) return
        artwork.push({ type: 'tile', center: segment.cells[0] as Point, size: spec.size,
          rotation: spec.rotation, color: spec.color, opacity: spec.opacity })
      }
    }
    if (!validAuthoredArtwork(artwork)) return
    return { layers, artwork, title: reviewedTitle }
  }
  const drawn = constraints.filter(layer => record(layer) && (layer.type === 'cosmeticLine' || layer.type === 'cosmeticShape'))
  if (drawn.length !== 1 || !record(drawn[0])) return
  if (!hash) return
  const review = reviewedDrawings.get(hash)
  const layer = drawn[0]
  if (!review || review.layer !== layer.type ||
      !record(layer.settings) || !Array.isArray(layer.segments)) return
  const settings = layer.settings
  const artwork = layer.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells)) return
    if (review.layer === 'cosmeticLine' && typeof settings.lineThickness === 'number') {
      return { type: review.partialRegions ? 'divider' : 'outline', points: segment.cells, thickness: settings.lineThickness / 100 }
    }
    if (typeof settings.shapeSize === 'number' && segment.cells.length === 1 &&
        record(segment.parameters) && segment.parameters.shape === 'circle') {
      return { type: 'disc', center: segment.cells[0], radius: (settings.shapeSize + 15) / 200, color: settings.colour }
    }
  })
  return validAuthoredArtwork(artwork) ? { layer, artwork, title: review.title, partialRegions: review.partialRegions } : undefined
}
