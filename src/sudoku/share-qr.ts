import QRCode from 'qrcode'
import type { BitMatrix, QRCodeMaskPattern } from 'qrcode'
import type jsQR from 'jsqr'

export const SHARE_QR_WIDTH = 244

type QrMatrix = Pick<BitMatrix, 'size' | 'data'>
type PaddedQr = QrMatrix & { dividers: readonly [number, number]; changes: number }

const quietZone = 4
const masks = [0, 1, 2, 3, 4, 5, 6, 7] as const satisfies readonly QRCodeMaskPattern[]
const versions = [12, 13, 14]

function dividerPositions(size: number) {
  const first = Math.floor(size / 3)
  const last = size - 1 - first
  const positions: [number, number][] = []
  // Even coordinates leave the timing stripes dark at the crossing and white on either side.
  for (let a = first - 4; a <= first + 4; a++) {
    for (let b = last - 4; b <= last + 4; b++) {
      if (a % 2 === 0 && b % 2 === 0 && Math.abs(a + b - (size - 1)) <= 2) positions.push([a, b])
    }
  }
  return positions
}

function addBoxDividers(modules: BitMatrix, dividers: readonly [number, number]): PaddedQr | undefined {
  const { size } = modules
  const data = modules.data.slice()
  const [a, b] = dividers
  let changes = 0
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const divider = row === a || row === b || col === a || col === b
      const padding = Math.abs(row - a) === 1 || Math.abs(row - b) === 1 ||
        Math.abs(col - a) === 1 || Math.abs(col - b) === 1
      if (!divider && !padding) continue
      const index = row * size + col
      const dark = divider ? 1 : 0
      if (data[index] === dark) continue
      if (modules.isReserved(row, col)) return
      data[index] = dark
      changes++
    }
  }
  return { size, data, dividers, changes }
}

/** Find a black, padded 3×3 QR that the caller can decode as the original share link. */
export function findPaddedShareQr(link: string, canRead: (qr: QrMatrix) => boolean) {
  let minimumVersion: number
  try { minimumVersion = QRCode.create(link, { errorCorrectionLevel: 'H' }).version }
  catch { return undefined }

  for (const version of versions) {
    if (version < minimumVersion) continue
    const positions = dividerPositions(version * 4 + 17)
    const candidates: PaddedQr[] = []
    for (const maskPattern of masks) {
      const { modules } = QRCode.create(link, { version, errorCorrectionLevel: 'H', maskPattern })
      for (const dividers of positions) {
        const candidate = addBoxDividers(modules, dividers)
        if (candidate) candidates.push(candidate)
      }
    }
    candidates.sort((a, b) => a.changes - b.changes)
    const readable = candidates.find(canRead)
    if (readable) return readable
  }
}

function drawQr(qr: QrMatrix, context: CanvasRenderingContext2D) {
  const scale = 8
  const margin = quietZone * scale
  const edge = (qr.size + 2 * quietZone) * scale
  const { canvas } = context
  canvas.width = canvas.height = edge
  context.fillStyle = '#fff'
  context.fillRect(0, 0, edge, edge)
  context.fillStyle = '#000'
  for (let i = 0; i < qr.data.length; i++) {
    if (qr.data[i]) context.fillRect(margin + i % qr.size * scale, margin + Math.floor(i / qr.size) * scale, scale, scale)
  }
}

function testScan(source: HTMLCanvasElement, sample: CanvasRenderingContext2D, decode: typeof jsQR, link: string) {
  const size = SHARE_QR_WIDTH
  const frame = Math.ceil(size * 1.23)
  for (const angle of [0, 7, -7]) {
    sample.canvas.width = sample.canvas.height = frame
    sample.fillStyle = '#fff'
    sample.fillRect(0, 0, frame, frame)
    sample.translate(frame / 2, frame / 2)
    sample.rotate(angle * Math.PI / 180)
    if (angle) sample.filter = 'blur(.42px)'
    sample.drawImage(source, -size / 2, -size / 2, size, size)
    const pixels = sample.getImageData(0, 0, frame, frame).data
    if (decode(pixels, frame, frame, { inversionAttempts: 'dontInvert' })?.data !== link) return false
  }
  return true
}

/** Use for sharing a link. Fall back to a standard QR if the styled code fails a scan check. */
export async function createShareQrImage(link: string): Promise<string> {
  const fallback = () => QRCode.toDataURL(link, { margin: quietZone, scale: 8 })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const sample = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context || !sample) return fallback()
  try {
    const { default: decode } = await import('jsqr')
    const found = findPaddedShareQr(link, candidate => {
      drawQr(candidate, context)
      return testScan(canvas, sample, decode, link)
    })
    if (found) return canvas.toDataURL()
  } catch { /* A scanner or image-generation failure still leaves the standard QR available. */ }
  return fallback()
}
