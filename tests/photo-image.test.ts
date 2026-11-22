import assert from 'node:assert/strict'
import { test } from 'node:test'
import { photoCandidateMasks, photoCell } from '../src/sudoku/photo-image.ts'

const boardSize = 9 * 64

function paint(pixels: Uint8ClampedArray, left: number, top: number, width: number, height: number, color: readonly number[]) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      pixels.set(color, (y * boardSize + x) * 4)
    }
  }
}

test('flags colored digits for review without flagging neutral digits on highlighted cells', () => {
  // The color check only needs pixels. Stub the canvas that receives the glyph.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) },
  })
  try {
    const pixels = new Uint8ClampedArray(boardSize ** 2 * 4)
    for (const [cell, background, ink] of [
      [0, [207, 195, 171, 255], [20, 20, 20, 255]],
      [1, [244, 231, 194, 255], [10, 70, 180, 255]],
      [2, [40, 64, 88, 255], [247, 247, 247, 255]],
    ] as const) {
      const left = cell * 64
      paint(pixels, left, 0, 64, 64, background)
      paint(pixels, left + 30, 18, 6, 28, ink)
      paint(pixels, left + 25, 40, 16, 6, ink)
      const result = photoCell(pixels, cell)
      assert.ok(result.canvas, `cell ${cell} has a glyph`)
      assert.equal(result.review, cell === 1, `review flag for cell ${cell}`)
    }
    paint(pixels, 192, 0, 64, 64, [255, 153, 0, 255])
    assert.deepEqual(photoCell(pixels, 3), { review: false })
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('reads occupied pencil slots and preserves missing marks', () => {
  const pixels = new Uint8ClampedArray(boardSize ** 2 * 4).fill(255)
  const ink = [90, 90, 90, 255]
  const slots = [10, 32, 53]
  const marks = [[1, 3, 7], [2, 5], [4, 8, 9], [5]]
  for (const [cell, digits] of marks.entries()) {
    for (const digit of digits) {
      const x = cell * 64 + slots[(digit - 1) % 3]
      const y = slots[Math.floor((digit - 1) / 3)]
      paint(pixels, x - 2, y - 5, 5, 11, ink)
    }
    if (cell === 1) assert.equal(photoCandidateMasks(pixels), undefined)
  }
  paint(pixels, 4 * 64 + 29, 16, 6, 32, ink)
  const masks = photoCandidateMasks(pixels)
  assert.ok(masks)
  assert.deepEqual(masks.slice(0, 6), [69, 18, 392, 16, 0, 0])
  assert.deepEqual(photoCell(pixels, 3, masks[3]), { review: false })
})
