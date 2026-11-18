import assert from 'node:assert/strict'
import { test } from 'node:test'
import { centeredPhotoCrop, findPhotoGrid } from '../src/sudoku/photo-grid.ts'

function screenshot(size: number, dark: boolean, drawGrid = true): ImageData {
  const width = size + 240
  const height = size + 200
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const fill = (left: number, top: number, w: number, h: number, value: number) => {
    for (let y = top; y < top + h; y++) {
      for (let x = left; x < left + w; x++) {
        const offset = (y * width + x) * 4
        data.fill(value, offset, offset + 3)
      }
    }
  }
  fill(0, 0, width, height, dark ? 13 : 239)
  fill(120, 60, size, size, dark ? 30 : 250)
  // Controls and an unrelated 3 × 3 number pad outside the puzzle.
  fill(12, 38, 80, 2, 110)
  fill(12, 48, 80, 2, 100)
  for (let i = 0; i <= 3; i++) {
    fill(size + 141 + 22 * i, 90, 1, 67, 120)
    fill(size + 141, 90 + 22 * i, 67, 1, 120)
  }
  if (drawGrid) for (let i = 0; i <= 9; i++) {
    const offset = Math.round(i * size / 9)
    const major = i % 3 === 0
    const ink = dark ? (major ? 216 : 66) : (major ? 15 : 210)
    fill(120 + offset, 60, major ? 2 : 1, size + 1, ink)
    fill(120, 60 + offset, size + 1, major ? 2 : 1, ink)
  }
  return { data, width, height, colorSpace: 'srgb' }
}

test('finds the same 9 × 9 grid across image themes and zoom levels', () => {
  for (const [size, dark] of [[225, true], [600, false]] as const) {
    const crop = findPhotoGrid(screenshot(size, dark))
    assert.ok(crop)
    for (const [actual, expected] of [[crop.left, 120], [crop.top, 60], [crop.right, size + 120], [crop.bottom, size + 60]]) {
      assert.ok(Math.abs(actual - expected) <= 1)
    }
  }
})

test('ignores controls alone and offers a centered manual crop', () => {
  assert.equal(findPhotoGrid(screenshot(225, false, false)), undefined)
  assert.deepEqual(centeredPhotoCrop(465, 425), { left: 20, top: 0, right: 445, bottom: 425 })
})
