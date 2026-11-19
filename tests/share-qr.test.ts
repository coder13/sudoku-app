import assert from 'node:assert/strict'
import { test } from 'node:test'
import jsQR from 'jsqr'
import { findPaddedShareQr } from '../src/sudoku/share-qr.ts'

test('a padded share QR decodes the exact link and uses whole modules for the dividers and gaps', () => {
  const link = 'https://sudoku.klyn.gay/sync#pair=' + 'a1b2c3d4'.repeat(8)
  const qr = findPaddedShareQr(link, ({ size, data }) => {
    const margin = 4
    const scale = 4
    const edge = (size + 2 * margin) * scale
    const pixels = new Uint8ClampedArray(edge * edge * 4).fill(255)
    for (let y = margin * scale; y < edge - margin * scale; y++) {
      for (let x = margin * scale; x < edge - margin * scale; x++) {
        const row = Math.floor(y / scale) - margin
        const col = Math.floor(x / scale) - margin
        if (!data[row * size + col]) continue
        const offset = (y * edge + x) * 4
        pixels.fill(0, offset, offset + 3)
      }
    }
    return jsQR(pixels, edge, edge, { inversionAttempts: 'dontInvert' })?.data === link
  })

  assert.ok(qr)
  const [first, second] = qr.dividers
  for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) {
    const bit = qr.data[row * qr.size + col]
    if (row === first || row === second || col === first || col === second) assert.equal(bit, 1)
    else if ([first, second].some(divider => Math.abs(divider - row) === 1 || Math.abs(divider - col) === 1)) {
      assert.equal(bit, 0)
    }
  }
})

test('the generator declines a styled QR when its scan check rejects it or its link is too long', () => {
  assert.equal(findPaddedShareQr('https://sudoku.example/sync#pair=' + 'ab'.repeat(32), () => false), undefined)
  assert.equal(findPaddedShareQr('https://sudoku.example/share/' + '0123456789ab'.repeat(32), () => {
    assert.fail('An oversized link should skip the styled search')
  }), undefined)
})
