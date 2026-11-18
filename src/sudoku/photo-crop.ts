import { luminance, MIN_GRID_SIZE, type GridCrop } from './photo-grid.ts'

type Point = { x: number; y: number }
export type PhotoCrop = readonly [Point, Point, Point, Point]
export type CropHandle = 'move' | 0 | 1 | 2 | 3

export function rectangularCrop({ left, top, right, bottom }: GridCrop): PhotoCrop {
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
}

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(low, value), high)
}

function usableCrop(corners: PhotoCrop) {
  return corners.every((point, i) => {
    const next = corners[(i + 1) % 4]
    const previous = corners[(i + 3) % 4]
    const dx = next.x - point.x
    const dy = next.y - point.y
    return Math.hypot(dx, dy) >= MIN_GRID_SIZE / 2 &&
      dx * (previous.y - point.y) - dy * (previous.x - point.x) > MIN_GRID_SIZE ** 2 / 5
  })
}

export function adjustPhotoCrop(corners: PhotoCrop, handle: CropHandle, dx: number, dy: number, width: number, height: number): PhotoCrop | undefined {
  const next: [Point, Point, Point, Point] = [...corners]
  if (handle === 'move') {
    const xs = corners.map(point => point.x)
    const ys = corners.map(point => point.y)
    dx = clamp(dx, -Math.min(...xs), width - Math.max(...xs))
    dy = clamp(dy, -Math.min(...ys), height - Math.max(...ys))
    const move = ({ x, y }: Point) => ({ x: x + dx, y: y + dy })
    return [move(corners[0]), move(corners[1]), move(corners[2]), move(corners[3])]
  }
  const { x, y } = corners[handle]
  next[handle] = { x: clamp(x + dx, 0, width), y: clamp(y + dy, 0, height) }
  return usableCrop(next) ? next : undefined
}

// Fit an outer edge near the detected rectangle. Each fit samples across the full
// edge so a digit, shadow, or gap in a worn line has little influence.
function fitEdge(image: ImageData, position: number, start: number, end: number, vertical: boolean) {
  const { data, width, height } = image
  const span = end - start
  const radius = Math.min(26, Math.max(3, Math.floor(span / 23)))
  const step = Math.max(1, Math.floor(radius / 10))
  const across = vertical ? width : height
  const stride = vertical ? 1 : width
  const along = vertical ? width : 1
  const margin = Math.max(2, Math.round(span / 180))
  const matches: [number, number][] = [[0, 0]]
  for (let offset = -radius; offset <= radius; offset += step) {
    for (let other = -radius; other <= radius; other += step) matches.push([offset, other])
  }
  let best = { first: position, last: position, quality: 0 }
  for (const [offset, other] of matches) {
    const first = position + offset
    const last = position + other
    let quality = 0
    const samples = 64
    for (let i = 2; i < samples - 2; i++) {
      const fraction = i / samples
      const center = Math.round(first + fraction * (last - first))
      if (center < margin || center >= across - margin) continue
      const at = (center * stride + Math.round(start + fraction * span) * along) * 4
      const before = luminance(data, at - margin * stride * 4)
      const value = luminance(data, at)
      const after = luminance(data, at + margin * stride * 4)
      const ridge = Math.max(Math.min(before, after) - value, value - Math.max(before, after))
      quality += Math.min(60, Math.max(ridge, Math.abs(before - after) * 0.66))
    }
    quality = quality / samples - (Math.abs(offset) + Math.abs(other)) * 0.10
    if (quality > best.quality) best = { first, last, quality }
  }
  return best.quality > 6 ? best : { first: position, last: position }
}

export function refinePhotoCrop(image: ImageData, bounds: GridCrop): PhotoCrop {
  const { left, top, right, bottom } = bounds
  const columns = [left, right].map(x => fitEdge(image, x, top, bottom, true))
  const rows = [top, bottom].map(y => fitEdge(image, y, left, right, false))
  const corner = (column: number, row: number) => {
    const x = columns[column]
    const y = rows[row]
    const xSlope = (x.last - x.first) / (bottom - top)
    const ySlope = (y.last - y.first) / (right - left)
    const atX = (x.first + xSlope * (y.first - top - ySlope * left)) / (1 - xSlope * ySlope)
    return { x: clamp(atX, 0, image.width), y: clamp(y.first + ySlope * (atX - left), 0, image.height) }
  }
  const refined: PhotoCrop = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]
  return usableCrop(refined) ? refined : rectangularCrop(bounds)
}

/** Project a point in the flattened grid back into the source photograph. */
export function projectPhotoCrop([a, b, c, d]: PhotoCrop) {
  const dx = a.x - b.x + c.x - d.x
  const dy = a.y - b.y + c.y - d.y
  const bx = b.x - c.x
  const by = b.y - c.y
  const cx = d.x - c.x
  const cy = d.y - c.y
  const determinant = bx * cy - cx * by
  const g = (dx * cy - cx * dy) / determinant
  const h = (bx * dy - dx * by) / determinant
  const x1 = b.x - a.x + g * b.x
  const x2 = d.x - a.x + h * d.x
  const y1 = b.y - a.y + g * b.y
  const y2 = d.y - a.y + h * d.y
  return (u: number, v: number) => {
    const w = 1 + g * u + h * v
    return { x: (a.x + x1 * u + x2 * v) / w, y: (a.y + y1 * u + y2 * v) / w }
  }
}
