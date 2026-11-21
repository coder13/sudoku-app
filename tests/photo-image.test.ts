import assert from 'node:assert/strict'
import { test } from 'node:test'
import { photoCell } from '../src/sudoku/photo-image.ts'

test('flags colored digits for review without flagging neutral digits on highlighted cells', () => {
  // The color check only needs pixels. Stub the canvas that receives the glyph.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) },
  })
  try {
    const boardSize = 9 * 64
    const pixels = new Uint8ClampedArray(boardSize ** 2 * 4)
    const paint = (left: number, top: number, width: number, height: number, color: readonly number[]) => {
      for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
          pixels.set(color, (y * boardSize + x) * 4)
        }
      }
    }
    for (const [cell, background, ink] of [
      [0, [207, 195, 171, 255], [20, 20, 20, 255]],
      [1, [244, 231, 194, 255], [10, 70, 180, 255]],
      [2, [40, 64, 88, 255], [247, 247, 247, 255]],
    ] as const) {
      const left = cell * 64
      paint(left, 0, 64, 64, background)
      paint(left + 30, 18, 6, 28, ink)
      paint(left + 25, 40, 16, 6, ink)
      const result = photoCell(pixels, cell)
      assert.ok(result.canvas, `cell ${cell} has a glyph`)
      assert.equal(result.review, cell === 1, `review flag for cell ${cell}`)
    }
    paint(192, 0, 64, 64, [255, 153, 0, 255])
    assert.deepEqual(photoCell(pixels, 3), { review: false })
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
