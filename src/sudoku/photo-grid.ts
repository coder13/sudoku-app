export type GridCrop = { left: number; top: number; right: number; bottom: number }

export const MIN_GRID_SIZE = 90

export function luminance(pixels: Uint8ClampedArray, offset: number) {
  return (pixels[offset] * 54 + pixels[offset + 1] * 183 + pixels[offset + 2] * 19) >> 8
}

type Line = { position: number; length: number; start: number; hits: number; score: number }
type GridAxis = { start: number; end: number; major: Line[]; minor: Line[]; alignment: number }

function findLines(gray: Uint8Array, width: number, height: number, vertical: boolean) {
  const across = vertical ? width : height
  const along = vertical ? height : width
  const stride = vertical ? 1 : width
  const step = vertical ? width : 1
  const edge = 4
  const maxGap = 12
  const ridge = new Uint8Array(gray.length)
  for (let position = edge; position < across - edge; position++) {
    for (let point = 0, index = position * stride; point < along; point++, index += step) {
      const center = gray[index]
      const before = gray[index - edge * stride]
      const after = gray[index + edge * stride]
      const strength = Math.max(Math.min(before, after) - center, center - Math.max(before, after))
      if (strength >= 7) ridge[index] = 2
      else if (Math.abs(before - after) >= 38) ridge[index] = 1
    }
  }
  const lines: Line[] = []
  for (let position = edge; position < across - edge; position++) {
    let bestLength = 0
    let bestStart = 0
    let bestHits = 0
    let bestScore = 0
    let runStart = 0
    let hits = 0
    let exactHits = 0
    let last = -maxGap
    for (let point = 0, index = position * stride; point < along; point++, index += step) {
      if (!(ridge[index] || ridge[index - stride] || ridge[index + stride] || ridge[index - 2 * stride] ||
        ridge[index + 2 * stride] || ridge[index - 3 * stride] || ridge[index + 3 * stride])) continue
      if (point - last > maxGap) {
        runStart = point
        hits = 0
        exactHits = 0
      }
      last = point
      hits++
      exactHits += ridge[index]
      const length = point - runStart + 1
      // Favor the stroke center when adjacent positions have similar line coverage.
      const score = hits + exactHits / 3
      if (score > bestScore && hits >= 0.54 * length) {
        bestLength = length
        bestStart = runStart
        bestHits = hits
        bestScore = score
      }
    }
    if (bestLength >= MIN_GRID_SIZE * 0.65) lines.push({ position, length: bestLength, start: bestStart, hits: bestHits, score: bestScore })
  }
  const peaks: Line[] = []
  for (const line of lines.sort((a, b) => b.score - a.score)) {
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
      if (span < MIN_GRID_SIZE || span > maxSpan || Math.min(first.length, last.length) < span * 0.58) continue
      const pitch = span / 9
      const tolerance = Math.max(3, pitch * 0.12)
      const major = [first, last]
      const minor: Line[] = []
      let alignment = 0
      for (let cell = 1; cell < 9; cell++) {
        const expected = first.position + cell * pitch
        let match: Line | undefined
        let quality = 0
        for (const line of lines) {
          const distance = Math.abs(line.position - expected)
          if (distance > tolerance || line.length < span * 0.48 || line.length > span * 1.55) continue
          const score = line.hits / span - distance / (tolerance * 2)
          if (score <= quality) continue
          match = line
          quality = score
        }
        if (!match) continue
        if (cell % 3 === 0) {
          major.push(match)
          alignment += 1 - Math.abs(match.position - expected) / (tolerance * 2)
        } else minor.push(match)
      }
      if (major.length === 4) {
        axes.push({ start: first.position, end: last.position, major, minor, alignment })
      }
    }
  }
  return axes
}

function overlap({ major, minor }: GridAxis, { start, end }: GridAxis) {
  const span = end - start
  let quality = 0
  let count = 0
  let majorCount = 0
  for (const [index, line] of [...major, ...minor].entries()) {
    const covered = Math.max(0, Math.min(end, line.start + line.length) - Math.max(start, line.start))
    const coverage = covered / span
    const outside = (line.length - covered) / span
    if (coverage > 0.66 && outside < 0.28) {
      count++
      if (index < 4) majorCount++
    }
    quality += Math.max(0, coverage - outside) * line.hits / line.length * (index < 4 ? 2 : 0.7)
  }
  return { quality, count, majorCount }
}

/** Find intersecting sets of evenly spaced lines, independent of theme polarity. */
export function findPhotoGrids({ data, width, height }: ImageData, limit = 1, allowFaintLines = false): GridCrop[] {
  const gray = new Uint8Array(width * height)
  for (let index = 0; index < gray.length; index++) gray[index] = luminance(data, index * 4)
  const maxSpan = Math.min(width, height) * 1.2
  const columns = gridAxes(findLines(gray, width, height, true), maxSpan)
  const rows = gridAxes(findLines(gray, width, height, false), maxSpan)
  const candidates: { crop: GridCrop; score: number }[] = []
  for (const x of columns) {
    for (const y of rows) {
      const aspect = (x.end - x.start) / (y.end - y.start)
      if (aspect < 0.76 || aspect > 1.32) continue
      const vertical = overlap(x, y)
      const horizontal = overlap(y, x)
      if (vertical.majorCount < 3 || horizontal.majorCount < 3 ||
        vertical.count + horizontal.count < (allowFaintLines ? 8 : 9)) continue
      const score = 3 * (vertical.quality + horizontal.quality) + x.alignment + y.alignment - 16 * Math.abs(Math.log(aspect))
      if (candidates.length === limit && score <= candidates[limit - 1].score) continue
      const crop = { left: x.start, top: y.start, right: x.end, bottom: y.end }
      const close = Math.min(x.end - x.start, y.end - y.start) / 40
      const duplicate = candidates.findIndex(({ crop: other }) =>
        Math.abs(other.left - crop.left) < close && Math.abs(other.right - crop.right) < close &&
        Math.abs(other.top - crop.top) < close && Math.abs(other.bottom - crop.bottom) < close)
      if (duplicate >= 0) {
        if (score <= candidates[duplicate].score) continue
        candidates.splice(duplicate, 1)
      }
      candidates.push({ crop, score })
      candidates.sort((a, b) => b.score - a.score)
      if (candidates.length > limit) candidates.pop()
    }
  }
  return candidates.map(({ crop }) => crop)
}

export function findPhotoGrid(image: ImageData) {
  return findPhotoGrids(image)[0]
}

export function centeredPhotoCrop(width: number, height: number): GridCrop {
  const size = Math.min(width, height)
  const left = Math.floor((width - size) / 2)
  const top = Math.floor((height - size) / 2)
  return { left, top, right: left + size, bottom: top + size }
}
