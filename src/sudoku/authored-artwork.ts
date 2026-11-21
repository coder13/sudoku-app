type Point = readonly [x: number, y: number]

export type AuthoredMark = { type: 'outline' | 'divider'; points: readonly Point[]; thickness: number }
  | { type: 'disc'; center: Point; radius: number; color: string }

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

export function validAuthoredArtwork(value: unknown): value is readonly AuthoredMark[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 81 && value.every(mark => {
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
    return mark.type === 'disc' && Object.keys(mark).length === 4 && size(mark.radius) &&
      point(mark.center, false) && typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color)
  })
}

export function sameAuthoredArtwork(a?: readonly AuthoredMark[], b?: readonly AuthoredMark[]) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((mark, index) => {
    const other = b[index]
    return mark.type === other.type && mark.type !== 'disc' && other.type !== 'disc'
      ? mark.thickness === other.thickness && JSON.stringify(mark.points) === JSON.stringify(other.points)
      : mark.type === 'disc' && other.type === 'disc' && mark.radius === other.radius &&
        mark.color === other.color && mark.center[0] === other.center[0] && mark.center[1] === other.center[1]
  })
}

// A drawing may carry a rule. Bind the review to the whole original export:
// Windoku I outlines four of its typed regions, and Khachkar's discs are artwork.
const reviewed = new Map<string, { layer: string; title: string; partialRegions?: true }>([
  ['6d6a3b498a48ea8bd5cd78a41495fca7c9fb0bbd8f5573a25e07b0115504d0c2', { layer: 'cosmeticLine', title: 'AJT’s Bento 🍱 flavoured with Entropy', partialRegions: true }],
  ['644e296695e5e5993472985da14111a57d7f8760bcc579ea1743103d8d6cf35a', { layer: 'cosmeticLine', title: 'Non-con 🍱', partialRegions: true }],
  ['349d55e182fa4f177aff2a5653d875fea8fe775f51f0dabe06a0f9c5c308fa7a', { layer: 'cosmeticLine', title: 'FUN-ky Bento II 🍱', partialRegions: true }],
  ['12f8cfe5848c2ae3d1ebb478a484d05ff6311c689d10c3d6a585bcde0e828f7f', { layer: 'cosmeticLine', title: 'Windoku I' }],
  ['df51c464f943b9c2436f9897ce4d5cbaaaaf3309da5c2eef68bc93ed1e8ab095', { layer: 'cosmeticShape', title: 'Khachkar' }],
])

export async function readReviewedCoachArtwork(code: string, constraints: readonly unknown[]) {
  const drawn = constraints.filter(layer => record(layer) && (layer.type === 'cosmeticLine' || layer.type === 'cosmeticShape'))
  if (drawn.length !== 1 || !record(drawn[0]) || !globalThis.crypto?.subtle) return
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  const review = reviewed.get(hash)
  const layer = drawn[0]
  if (!review || review.layer !== layer.type || !record(layer.settings) || !Array.isArray(layer.segments)) return
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
