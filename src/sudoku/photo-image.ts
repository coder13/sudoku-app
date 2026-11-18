import { projectPhotoCrop, rectangularCrop, refinePhotoCrop, type PhotoCrop } from './photo-crop'
import { centeredPhotoCrop, findPhotoGrids, luminance, MIN_GRID_SIZE } from './photo-grid'

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

const THIRDS = [1 / 3, 2 / 3] as const

function gridDividers(image: ImageData, crop: PhotoCrop) {
  const project = projectPhotoCrop(crop)
  const tone = (u: number, v: number) => {
    const { x, y } = project(u, v)
    return luminance(image.data, (Math.round(y) * image.width + Math.round(x)) * 4)
  }
  const matches: { position: number; hits: number; score: number }[] = []
  for (const vertical of [true, false]) {
    for (const divider of THIRDS) {
      let best = { position: divider, hits: 0, score: 0 }
      for (let adjust = -12; adjust <= 12; adjust++) {
        const position = divider + adjust / 288
        let hits = 0
        for (let sample = 2; sample < 46; sample++) {
          const along = sample / 48
          const across = (offset: number) => vertical ? tone(position + offset, along) : tone(along, position + offset)
          const center = across(0)
          const nearBefore = across(-0.008)
          const farBefore = across(-0.014)
          const nearAfter = across(0.008)
          const farAfter = across(0.014)
          const dark = Math.min(Math.max(nearBefore, farBefore), Math.max(nearAfter, farAfter)) - center
          const light = center - Math.max(Math.min(nearBefore, farBefore), Math.min(nearAfter, farAfter))
          if (Math.max(dark, light) >= 8) hits++
        }
        const score = hits - Math.abs(adjust) * 0.6
        if (score > best.score) best = { position, hits, score }
      }
      matches.push(best)
    }
  }
  // The interior box borders are useful when an adjacent keypad or page rule suggests a false crop.
  const support = matches.reduce((sum, { hits }) => sum + hits, 0)
  const confirmed = matches.every(({ hits }) => hits >= 18) && support >= 112
  const score = matches.reduce((sum, match) => sum + match.score, 0)
  const positions = matches.map(({ hits, position }, index) => hits >= 18 ? position : THIRDS[index % 2])
  return { confirmed, score, columns: [0, positions[0], positions[1], 1], rows: [0, positions[2], positions[3], 1] }
}

async function detectPhotoCrop(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, signal?: AbortSignal): Promise<PhotoCrop | undefined> {
  const { width, height } = canvas
  const image = context.getImageData(0, 0, width, height)
  let best: { crop: PhotoCrop; score: number } | undefined
  const consider = (crop: PhotoCrop) => {
    if (!crop.every(point => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)) return false
    const { confirmed, score } = gridDividers(image, crop)
    if (!confirmed) return false
    if (!best || score > best.score) best = { crop, score }
    return score >= 148
  }
  for (const bounds of findPhotoGrids(image, 3, true)) {
    const crop = refinePhotoCrop(image, bounds)
    if (consider(crop)) return crop
  }
  if (width / height >= 0.86 && width / height <= 1.16) {
    const tight = rectangularCrop({ left: 0, top: 0, right: width, bottom: height })
    if (consider(tight)) return tight
  }

  // Work on a smaller copy when looking for a tilted grid. Warp the original for OCR.
  const scale = Math.min(1, 760 / Math.max(width, height))
  const sample = imageCanvas(1, 1)
  for (const degrees of [0, -8, 8, -14, 14, -24, 24, -4, 4, -18, 18, -28, 28, -11, 11, -21, 21]) {
    await new Promise(resolve => window.setTimeout(resolve, 0))
    signal?.throwIfAborted()
    const angle = degrees * Math.PI / 180
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    sample.canvas.width = Math.ceil(scale * (width * Math.abs(cos) + height * Math.abs(sin)))
    sample.canvas.height = Math.ceil(scale * (width * Math.abs(sin) + height * Math.abs(cos)))
    const centerX = sample.canvas.width / 2
    const centerY = sample.canvas.height / 2
    sample.context.fillStyle = '#fff'
    sample.context.fillRect(0, 0, sample.canvas.width, sample.canvas.height)
    sample.context.translate(centerX, centerY)
    sample.context.rotate(angle)
    sample.context.scale(scale, scale)
    sample.context.drawImage(canvas, -width / 2, -height / 2)
    const pixels = sample.context.getImageData(0, 0, sample.canvas.width, sample.canvas.height)
    const original = ({ x, y }: { x: number; y: number }) => ({
      x: width / 2 + ((x - centerX) * cos + (y - centerY) * sin) / scale,
      y: height / 2 + ((y - centerY) * cos - (x - centerX) * sin) / scale,
    })
    for (const bounds of findPhotoGrids(pixels, 3, true)) {
      const [a, b, c, d] = refinePhotoCrop(pixels, bounds)
      const crop: PhotoCrop = [original(a), original(b), original(c), original(d)]
      if (consider(crop)) return crop
    }
  }
  return best?.crop
}

export async function openPuzzlePhoto(file: Blob, signal?: AbortSignal) {
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
    signal?.throwIfAborted()
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    if (Math.min(width, height) < MIN_GRID_SIZE) throw new Error('This image is too small. Try a closer photo or a larger screenshot.')
    const { canvas, context } = imageCanvas(width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const detected = await detectPhotoCrop(canvas, context, signal)
    return { canvas, url: canvas.toDataURL('image/jpeg', 0.9), detected,
      crop: detected ?? rectangularCrop(centeredPhotoCrop(width, height)) }
  } finally {
    bitmap.close()
  }
}

export function cropPuzzlePhoto(photo: HTMLCanvasElement, crop: PhotoCrop) {
  const { canvas, context } = imageCanvas(BOARD_SIZE, BOARD_SIZE)
  const source = photo.getContext('2d')!.getImageData(0, 0, photo.width, photo.height)
  const { rows, columns } = gridDividers(source, crop)
  const [a, b, c, d] = crop
  if (a.y === b.y && b.x === c.x && c.y === d.y && d.x === a.x &&
    rows[1] === THIRDS[0] && rows[2] === THIRDS[1] && columns[1] === THIRDS[0] && columns[2] === THIRDS[1]) {
    context.drawImage(photo, a.x, a.y, b.x - a.x, d.y - a.y, 0, 0, BOARD_SIZE, BOARD_SIZE)
    return { canvas, pixels: context.getImageData(0, 0, BOARD_SIZE, BOARD_SIZE).data }
  }
  const flattened = context.createImageData(BOARD_SIZE, BOARD_SIZE)
  const project = projectPhotoCrop(crop)
  const points = (dividers: number[]) => Array.from({ length: BOARD_SIZE }, (_, index) => {
    const position = (index + 0.5) / (BOARD_SIZE / 3)
    const box = Math.floor(position)
    return dividers[box] + (position - box) * (dividers[box + 1] - dividers[box])
  })
  const horizontal = points(columns)
  const vertical = points(rows)
  const pixels = source.data
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let column = 0; column < BOARD_SIZE; column++) {
      const point = project(horizontal[column], vertical[row])
      const x = Math.min(photo.width - 1, Math.max(0, point.x - 0.5))
      const y = Math.min(photo.height - 1, Math.max(0, point.y - 0.5))
      const left = Math.floor(x)
      const top = Math.floor(y)
      const right = Math.min(photo.width - 1, left + 1)
      const bottom = Math.min(photo.height - 1, top + 1)
      const offset = (row * BOARD_SIZE + column) * 4
      for (let channel = 0; channel < 3; channel++) {
        const upper = pixels[(top * photo.width + left) * 4 + channel] * (1 - x + left) +
          pixels[(top * photo.width + right) * 4 + channel] * (x - left)
        const lower = pixels[(bottom * photo.width + left) * 4 + channel] * (1 - x + left) +
          pixels[(bottom * photo.width + right) * 4 + channel] * (x - left)
        flattened.data[offset + channel] = upper * (1 - y + top) + lower * (y - top)
      }
      flattened.data[offset + 3] = 255
    }
  }
  context.putImageData(flattened, 0, 0)
  return { canvas, pixels: flattened.data }
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

function centeredGlyph(glyphs: Glyph[], minimumHeight = 13) {
  const center = (INNER_SIZE - 1) / 2
  return glyphs.find(glyph => {
    const width = glyph.right - glyph.left + 1
    const height = glyph.bottom - glyph.top + 1
    return height >= minimumHeight && height <= 44 && width >= 4 && width <= 41 && glyph.pixels.length >= 18 &&
      Math.abs((glyph.left + glyph.right) / 2 - center) <= 11 &&
      Math.abs((glyph.top + glyph.bottom) / 2 - center) <= 13
  })
}

function grayscaleGlyph(glyph: Glyph, tone: Int16Array) {
  const left = Math.max(0, glyph.left - 2)
  const top = Math.max(0, glyph.top - 2)
  const width = Math.min(INNER_SIZE - left, glyph.right - left + 3)
  const height = Math.min(INNER_SIZE - top, glyph.bottom - top + 3)
  const source = imageCanvas(width, height)
  const image = source.context.createImageData(width, height)
  const polarity = Math.sign(glyph.pixels.reduce((sum, point) => sum + tone[point], 0))
  const strengths = glyph.pixels.map(point => Math.abs(tone[point])).sort((a, b) => a - b)
  const ink = Math.max(20, strengths[Math.floor(strengths.length * 0.82)])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.max(0, tone[(top + y) * INNER_SIZE + left + x] * polarity - 5)
      const offset = (y * width + x) * 4
      image.data.fill(255 * (1 - value / ink), offset, offset + 3)
      image.data[offset + 3] = 255
    }
  }
  source.context.putImageData(image, 0, 0)
  const { canvas, context } = imageCanvas(72, 72)
  const scale = 52 / Math.max(width, height)
  context.drawImage(source.canvas, (72 - width * scale) / 2, (72 - height * scale) / 2, width * scale, height * scale)
  return canvas
}

function smoothCell(tone: Int16Array) {
  const rows = tone.map((value, index) => {
    const x = index % INNER_SIZE
    return ((x > 1 ? tone[index - 2] : value) + (x > 0 ? tone[index - 1] : value) +
      value * 2 + (x < INNER_SIZE - 1 ? tone[index + 1] : value) + (x < INNER_SIZE - 2 ? tone[index + 2] : value)) / 6
  })
  return rows.map((value, index) => ((rows[index - 2 * INNER_SIZE] ?? value) + (rows[index - INNER_SIZE] ?? value) +
    value * 2 + (rows[index + INNER_SIZE] ?? value) + (rows[index + 2 * INNER_SIZE] ?? value)) / 6)
}

/** Isolate the centered digit from border strokes and camera noise. */
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
  const contrast = new Uint8Array(INNER_SIZE ** 2)
  const tone = new Int16Array(contrast.length)
  const chroma = new Uint8Array(contrast.length)
  for (let point = 0; point < contrast.length; point++) {
    const start = offset(point % INNER_SIZE, Math.floor(point / INNER_SIZE))
    const dr = pixels[start] - red
    const dg = pixels[start + 1] - green
    const db = pixels[start + 2] - blue
    contrast[point] = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db))
    tone[point] = (dr * 54 + dg * 183 + db * 19) >> 8
    chroma[point] = Math.max(dr, dg, db) - Math.min(dr, dg, db)
  }
  const strong = cellGlyphs(contrast.map(value => Number(value >= 36)))
  const primary = centeredGlyph(strong)
  // Temper screen moiré and blur by pooling each pixel with its neighbors.
  const denoised = tone.map((value, index) => (value * 4 +
    (tone[index - INNER_SIZE] ?? value) + (tone[index + INNER_SIZE] ?? value) +
    (tone[index - 1] ?? value) + (tone[index + 1] ?? value)) / 8)
  const fromTone = (values: Int16Array, threshold: number, minimumHeight: number) => {
    const dark = cellGlyphs(Uint8Array.from(values, value => Number(value <= -threshold)))
    const light = cellGlyphs(Uint8Array.from(values, value => Number(value >= threshold)))
    return centeredGlyph([...dark, ...light].sort((a, b) => b.pixels.length - a.pixels.length), minimumHeight)
  }
  let softTone = denoised
  let secondary = fromTone(softTone, 17, 12)
  if (!primary && !secondary) {
    softTone = smoothCell(tone)
    secondary = fromTone(softTone, 9, 10)
    if (!secondary) {
      softTone = denoised
      secondary = fromTone(softTone, 11, 11)
    }
  }
  const glyph = primary ?? secondary
  if (!glyph) return { review: strong.some(mark => mark.pixels.length >= 18) }

  const colored = glyph.pixels.filter(point => chroma[point] >= 35).length > glyph.pixels.length * 0.55
  return { canvas: glyphImage(glyph), alternate: () => glyphImage(secondary ?? glyph, true),
    grayscale: () => grayscaleGlyph(secondary ?? glyph, softTone),
    review: colored || !primary || strong.some(mark => mark !== primary && centeredGlyph([mark]) !== undefined) }
}
