import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjustPhotoCrop, projectPhotoCrop, rectangularCrop, refinePhotoCrop, type PhotoCrop } from '../src/sudoku/photo-crop.ts'
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

test('detects a photographed grid with faint, broken cell lines and a slanted edge', () => {
  const image = screenshot(315, false, false)
  const { data, width } = image
  const shade = (x: number, y: number, value: number) => {
    const offset = (y * width + x) * 4
    data.fill(value, offset, offset + 3)
  }
  for (let y = 60; y <= 375; y++) {
    const drift = Math.round((y - 60) / 85)
    for (let x = 120 + drift; x <= 435 + drift; x++) shade(x, y, 236)
    for (let divider = 0; divider <= 9; divider++) {
      if (divider % 3 === 0 || y % 37 >= 7) shade(120 + divider * 35 + drift, y, divider % 3 === 0 ? 105 : 225)
    }
  }
  for (let divider = 0; divider <= 9; divider++) {
    const y = 60 + divider * 35
    const drift = Math.round((y - 60) / 85)
    for (let x = 120 + drift; x <= 435 + drift; x++) {
      if (divider % 3 === 0 || x % 37 >= 7) shade(x, y, divider % 3 === 0 ? 105 : 225)
    }
  }
  const bounds = findPhotoGrid(image)
  assert.ok(bounds)
  const corners = refinePhotoCrop(image, bounds)
  const expected = [[120, 60], [435, 60], [439, 375], [124, 375]]
  for (const [index, point] of corners.entries()) {
    assert.ok(Math.hypot(point.x - expected[index][0], point.y - expected[index][1]) <= 5)
  }
})

test('ignores a large 3 × 3 keypad without cell subdivisions', () => {
  const { data, width, height, colorSpace } = screenshot(275, true, false)
  data.fill(15)
  for (let divider = 0; divider <= 3; divider++) {
    for (let i = 0; i <= 270; i++) {
      const vertical = ((60 + i) * width + 120 + divider * 90) * 4
      const horizontal = ((60 + divider * 90) * width + 120 + i) * 4
      data.fill(230, vertical, vertical + 3)
      data.fill(230, horizontal, horizontal + 3)
    }
  }
  assert.equal(findPhotoGrid({ data, width, height, colorSpace }), undefined)
})

test('moves the crop within the image and rejects crossed corners', () => {
  const crop = rectangularCrop({ left: 80, top: 80, right: 260, bottom: 280 })
  assert.deepEqual(adjustPhotoCrop(crop, 'move', 100, -100, 300, 300),
    rectangularCrop({ left: 120, top: 0, right: 300, bottom: 200 }))
  assert.equal(adjustPhotoCrop(crop, 0, 250, 200, 300, 300), undefined)
  assert.deepEqual(adjustPhotoCrop(crop, 0, -20, 10, 300, 300),
    [{ x: 60, y: 90 }, ...crop.slice(1)])
})

test('maps a square grid back into a perspective crop', () => {
  const crop: PhotoCrop = [{ x: 50, y: 33 }, { x: 198, y: 13 }, { x: 241, y: 242 }, { x: 68, y: 220 }]
  const project = projectPhotoCrop(crop)
  const corners = [project(0, 0), project(1, 0), project(1, 1), project(0, 1)]
  for (const [index, point] of corners.entries()) {
    assert.ok(Math.hypot(point.x - crop[index].x, point.y - crop[index].y) < 1e-9)
  }
  const [left, middle, right] = [project(0, 0.5), project(0.5, 0.5), project(1, 0.5)]
  assert.ok(Math.abs((right.y - left.y) * (middle.x - left.x) - (right.x - left.x) * (middle.y - left.y)) < 1e-9)
})
