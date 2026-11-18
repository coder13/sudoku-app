export type GridCrop = { left: number; top: number; right: number; bottom: number }

export const MIN_GRID_SIZE = 90

function luminance(pixels: Uint8ClampedArray, offset: number) {
  return (pixels[offset] * 54 + pixels[offset + 1] * 183 + pixels[offset + 2] * 19) >> 8
}

type Line = { position: number; length: number; start: number }
type GridAxis = { start: number; end: number; lines: Line[]; alignment: number }

function findLines(gray: Uint8Array, width: number, height: number, vertical: boolean) {
  const across = vertical ? width : height
  const along = vertical ? height : width
  const stride = vertical ? 1 : width
  const step = vertical ? width : 1
  const edge = 4
  const lines: Line[] = []
  for (let position = edge; position < across - edge; position++) {
    let bestLength = 0
    let bestStart = 0
    let runStart = 0
    let last = -4
    for (let point = 0, index = position * stride; point < along; point++, index += step) {
      const center = gray[index]
      const before = gray[index - edge * stride]
      const after = gray[index + edge * stride]
      if (Math.max(Math.min(before, after) - center, center - Math.max(before, after)) < 13) continue
      if (point - last > 4) runStart = point
      last = point
      if (point - runStart + 1 > bestLength) {
        bestLength = point - runStart + 1
        bestStart = runStart
      }
    }
    if (bestLength >= MIN_GRID_SIZE * 0.65) lines.push({ position, length: bestLength, start: bestStart })
  }
  const peaks: Line[] = []
  for (const line of lines.sort((a, b) => b.length - a.length)) {
    if (peaks.every(peak => Math.abs(peak.position - line.position) > 5)) peaks.push(line)
    if (peaks.length === 100) break
  }
  return peaks.sort((a, b) => a.position - b.position)
}

function gridAxes(lines: Line[], maxSpan: number) {
  const axes: GridAxis[] = []
  for (const [index, first] of lines.entries()) {
    for (let end = index + 1; end < lines.length; end++) {
      const last = lines[end]
      const span = last.position - first.position
      if (span < MIN_GRID_SIZE || span > maxSpan) continue
      const pitch = span / 9
      const tolerance = Math.max(3, pitch * 0.12)
      const matched = [first, last]
      let alignment = 0
      let majors = 0
      for (let cell = 1; cell < 9; cell++) {
        const expected = first.position + cell * pitch
        const match = lines.find(line => Math.abs(line.position - expected) <= tolerance &&
          line.length >= span * 0.55 && line.length <= span * 1.45)
        if (!match) continue
        matched.push(match)
        alignment += 1 - Math.abs(match.position - expected) / (tolerance * 2)
        if (cell % 3 === 0) majors++
      }
      if (matched.length >= 8 && majors === 2) {
        axes.push({ start: first.position, end: last.position, lines: matched, alignment })
      }
    }
  }
  return axes
}

function overlap({ lines }: GridAxis, { start, end }: GridAxis) {
  const span = end - start
  return lines.filter(line =>
    Math.abs(line.start - start) < span * 0.14 &&
    Math.abs(line.start + line.length - end) < span * 0.14).length
}

/** Find two intersecting sets of evenly spaced lines, independent of theme polarity. */
export function findPhotoGrid({ data, width, height }: ImageData): GridCrop | undefined {
  const gray = new Uint8Array(width * height)
  for (let index = 0; index < gray.length; index++) gray[index] = luminance(data, index * 4)
  const maxSpan = Math.min(width, height) * 1.2
  const columns = gridAxes(findLines(gray, width, height, true), maxSpan)
  const rows = gridAxes(findLines(gray, width, height, false), maxSpan)
  let best: GridCrop | undefined
  let bestScore = 0
  for (const x of columns) {
    for (const y of rows) {
      const aspect = (x.end - x.start) / (y.end - y.start)
      if (aspect < 0.8 || aspect > 1.25) continue
      const vertical = overlap(x, y)
      const horizontal = overlap(y, x)
      if (vertical < 7 || horizontal < 7) continue
      const score = vertical + horizontal + x.alignment + y.alignment
      if (score <= bestScore) continue
      bestScore = score
      best = { left: x.start, top: y.start, right: x.end, bottom: y.end }
    }
  }
  return best
}

export function centeredPhotoCrop(width: number, height: number): GridCrop {
  const size = Math.min(width, height)
  const left = Math.floor((width - size) / 2)
  const top = Math.floor((height - size) / 2)
  return { left, top, right: left + size, bottom: top + size }
}
