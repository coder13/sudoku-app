import { centeredPhotoCrop, findPhotoGrid, MIN_GRID_SIZE, type GridCrop } from './photo-grid'

export const PHOTO_TYPES = 'image/png,image/jpeg,.png,.jpg,.jpeg'
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_EDGE = 1440
const CELL_SIZE = 64
const BOARD_SIZE = 9 * CELL_SIZE

export function imageCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  return { canvas, context }
}

export async function openPuzzlePhoto(file: Blob) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose a PNG or JPEG image under 20 MB.')
  // Some file pickers omit the MIME type. Check the signature before decoding.
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.join(',') === '137,80,78,71,13,10,26,10'
  if (!jpeg && !png) throw new Error('Choose a PNG or JPEG image of a Classic Sudoku grid.')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image could not be opened. Try a different screenshot or photo.')
  })
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    if (Math.min(width, height) < MIN_GRID_SIZE) throw new Error('This image is too small. Try a closer photo or a larger screenshot.')
    const { canvas, context } = imageCanvas(width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const detected = findPhotoGrid(context.getImageData(0, 0, width, height))
    return { canvas, url: canvas.toDataURL('image/jpeg', 0.9), detected, crop: detected ?? centeredPhotoCrop(width, height) }
  } finally {
    bitmap.close()
  }
}

export function cropPuzzlePhoto(photo: HTMLCanvasElement, { left, top, right, bottom }: GridCrop) {
  const { canvas, context } = imageCanvas(BOARD_SIZE, BOARD_SIZE)
  context.drawImage(photo, left, top, right - left, bottom - top, 0, 0, BOARD_SIZE, BOARD_SIZE)
  return { canvas, pixels: context.getImageData(0, 0, BOARD_SIZE, BOARD_SIZE).data }
}

type Glyph = { pixels: number[]; left: number; top: number; right: number; bottom: number }
const MARGIN = 8
const INNER_SIZE = CELL_SIZE - MARGIN * 2

function cellGlyphs(mask: Uint8Array) {
  const glyphs: Glyph[] = []
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue
    const pixels = [index]
    const x = index % INNER_SIZE
    const y = Math.floor(index / INNER_SIZE)
    const glyph = { pixels, left: x, top: y, right: x, bottom: y }
    mask[index] = 0
    for (let head = 0; head < pixels.length; head++) {
      const point = pixels[head]
      const x = point % INNER_SIZE
      const y = Math.floor(point / INNER_SIZE)
      glyph.left = Math.min(glyph.left, x)
      glyph.right = Math.max(glyph.right, x)
      glyph.top = Math.min(glyph.top, y)
      glyph.bottom = Math.max(glyph.bottom, y)
      for (let row = Math.max(0, y - 1); row <= Math.min(INNER_SIZE - 1, y + 1); row++) {
        for (let column = Math.max(0, x - 1); column <= Math.min(INNER_SIZE - 1, x + 1); column++) {
          const neighbor = row * INNER_SIZE + column
          if (!mask[neighbor]) continue
          mask[neighbor] = 0
          pixels.push(neighbor)
        }
      }
    }
    if (pixels.length >= 10) glyphs.push(glyph)
  }
  return glyphs.sort((a, b) => b.pixels.length - a.pixels.length)
}

function glyphImage(glyph: Glyph, thinner = false) {
  const { canvas, context } = imageCanvas(72, 72)
  const width = glyph.right - glyph.left + 1
  const height = glyph.bottom - glyph.top + 1
  const scale = 44 / Math.max(width, height)
  const startX = (canvas.width - width * scale) / 2
  const startY = (canvas.height - height * scale) / 2
  const start = thinner ? Math.round : Math.floor
  const end = thinner ? Math.round : Math.ceil
  context.fillStyle = '#000'
  for (const point of glyph.pixels) {
    const x = startX + (point % INNER_SIZE - glyph.left) * scale
    const y = startY + (Math.floor(point / INNER_SIZE) - glyph.top) * scale
    context.fillRect(start(x), start(y), end(x + scale) - start(x), end(y + scale) - start(y))
  }
  return canvas
}

/** Keep centered, full-size glyphs for OCR. Mark smaller or colored marks for review. */
export function photoCell(pixels: Uint8ClampedArray, cell: number) {
  const left = cell % 9 * CELL_SIZE + MARGIN
  const top = Math.floor(cell / 9) * CELL_SIZE + MARGIN
  const offset = (x: number, y: number) => ((top + y) * BOARD_SIZE + left + x) * 4
  const samples = [[], [], []] as number[][]
  for (const x of [2, 10, 23, 37, 45]) {
    for (const y of [2, 10, 23, 37, 45]) {
      const start = offset(x, y)
      samples.forEach((channel, index) => channel.push(pixels[start + index]))
    }
  }
  const [red, green, blue] = samples.map(channel => channel.sort((a, b) => a - b)[12])
  const mask = new Uint8Array(INNER_SIZE ** 2)
  const chroma = new Uint8Array(mask.length)
  for (let point = 0; point < mask.length; point++) {
    const start = offset(point % INNER_SIZE, Math.floor(point / INNER_SIZE))
    const dr = pixels[start] - red
    const dg = pixels[start + 1] - green
    const db = pixels[start + 2] - blue
    mask[point] = Number(Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) >= 36)
    chroma[point] = Math.max(dr, dg, db) - Math.min(dr, dg, db)
  }
  const [glyph, ...others] = cellGlyphs(mask)
  if (!glyph) return { review: false }
  const width = glyph.right - glyph.left + 1
  const height = glyph.bottom - glyph.top + 1
  const center = (INNER_SIZE - 1) / 2
  if (height < 17 || height > 45 || width > 42 || Math.abs((glyph.left + glyph.right) / 2 - center) > 9 ||
    Math.abs((glyph.top + glyph.bottom) / 2 - center) > 9) return { review: true }

  const colored = glyph.pixels.filter(point => chroma[point] >= 35).length > glyph.pixels.length * 0.55
  return { canvas: glyphImage(glyph), alternate: () => glyphImage(glyph, true), review: colored || others.length > 0 }
}
