import { sourceHash } from './shared.ts'

type Point = readonly [number, number]

export type CoachAqreSource = {
  kind: 'aqre-snake' | 'aqre-plus'
  size: 9
  givens: string
  palette: readonly string[]
  givenColours: readonly string[]
  givenShades: readonly { cell: number; color: string }[]
  boundaryPaths: readonly (readonly Point[])[]
  regions: readonly CoachAqreRegion[]
  countLabels: readonly { point: Point; text: string }[]
  circleIndicators: readonly { cell: number; point: Point }[]
  renbanPaths: readonly (readonly number[])[]
  otherRules: readonly unknown[]
}

export type CoachAqreRegion = {
  cells: readonly number[]
  count?: { type: 'fixed'; value: number } | { type: 'digit'; cell: number }
}

type Spec = Pick<CoachAqreSource, 'kind'>

const SOURCES: ReadonlyMap<string, Spec> = new Map([
  ['71eb406c800fa88c0f23592774bcfe50af3c0d672912a89b421d5222c59d2de6', {
    kind: 'aqre-snake',
  }],
  ['69876e36eb4888cbca2fc44d94d341ae83b3580edb792caba8117b144a00511f', {
    kind: 'aqre-plus',
  }],
])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}

function point(value: unknown, centersOnly = false): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate =>
    typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 9 &&
    (!centersOnly || Number.isInteger(coordinate - .5)))
}

function lineLayer(value: unknown, kind: Spec['kind']): readonly (readonly Point[])[] | undefined {
  if (!record(value) || value.type !== 'cosmeticLine' || !exactKeys(value, ['id', 'type', 'segments', 'settings']) ||
    !record(value.settings) || !Array.isArray(value.segments)) return
  const expectedSettings = kind === 'aqre-snake'
    ? { colour: '#949494', lineThickness: 10, gridSnapToCentres: false, gridSnapToCorners: true }
    : { colour: '#56b4e9', lineThickness: 7, borderThickness: 0, gridSnapToCentres: false, gridSnapToCorners: true }
  if (JSON.stringify(value.settings) !== JSON.stringify(expectedSettings)) return
  const paths: Point[][] = []
  for (const segment of value.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length < 2 || !record(segment.parameters) || Object.keys(segment.parameters).length) return
    const points = segment.cells
    // These source layers declare corner-snapped region walls. Accepting a
    // fractional point here would create wall coordinates the cell grid can
    // never match, silently changing the inferred regions.
    if (!points.every(p => point(p) && p.every(Number.isInteger))) return
    paths.push(points as Point[])
  }
  const expectedCount = kind === 'aqre-snake' ? 27 : 18
  return paths.length === expectedCount ? paths : undefined
}

function textClues(value: unknown): CoachAqreSource['countLabels'] | undefined {
  if (!record(value) || value.type !== 'cosmeticText' || !exactKeys(value, ['id', 'type', 'segments', 'settings']) ||
    !record(value.settings) || JSON.stringify(value.settings) !== JSON.stringify({
      gridSnapToCorners: false, colour: '#e69f00', textSize: 75,
    }) || !Array.isArray(value.segments) || value.segments.length !== 7) return
  const labels: { point: Point; text: string }[] = []
  for (const segment of value.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length !== 1 || !point(segment.cells[0]) ||
      (segment.cells[0] as Point).some(coordinate => coordinate >= 9) || !record(segment.parameters) ||
      !exactKeys(segment.parameters, ['text']) || typeof segment.parameters.text !== 'string' ||
      !/^(?:|[0-9])$/.test(segment.parameters.text)) return
    labels.push({ point: segment.cells[0], text: segment.parameters.text })
  }
  return labels
}

function circles(value: unknown): CoachAqreSource['circleIndicators'] | undefined {
  if (!record(value) || value.type !== 'cosmeticShape' || !exactKeys(value, ['id', 'type', 'segments', 'settings']) ||
    !record(value.settings) || Object.keys(value.settings).length || !Array.isArray(value.segments) || value.segments.length !== 15) return
  const points: CoachAqreSource['circleIndicators'][number][] = []
  for (const segment of value.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length !== 1 || !point(segment.cells[0], true) || !record(segment.parameters) ||
      !exactKeys(segment.parameters, ['shape']) || segment.parameters.shape !== 'circle') return
    const [x, y] = segment.cells[0] as Point
    points.push({ cell: (y - .5) * 9 + x - .5, point: segment.cells[0] as Point })
  }
  return points
}

function renban(value: unknown): CoachAqreSource['renbanPaths'] | undefined {
  if (!record(value) || value.type !== 'renban' || !exactKeys(value, ['id', 'type', 'segments', 'settings']) ||
    !record(value.settings) || Object.keys(value.settings).length || !Array.isArray(value.segments) || value.segments.length !== 6) return
  const paths: number[][] = []
  for (const segment of value.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length < 2 || !segment.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81) ||
      !record(segment.parameters) || Object.keys(segment.parameters).length) return
    paths.push(segment.cells as number[])
  }
  return paths
}

function regionsFromBoundaries(paths: readonly (readonly Point[])[]): readonly (readonly number[])[] | undefined {
  const walls = new Set<string>()
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      const [x1, y1] = path[index - 1]
      const [x2, y2] = path[index]
      if (x1 !== x2 && y1 !== y2) return
      const length = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2))
      if (!length || !Number.isInteger(length)) return
      for (let step = 0; step < length; step++) {
        const ax = x1 + Math.sign(x2 - x1) * step
        const ay = y1 + Math.sign(y2 - y1) * step
        const bx = ax + Math.sign(x2 - x1)
        const by = ay + Math.sign(y2 - y1)
        walls.add(`${Math.min(ax, bx)},${Math.min(ay, by)},${Math.max(ax, bx)},${Math.max(ay, by)}`)
      }
    }
  }

  const cellsByRegion: number[][] = []
  const visited = new Set<number>()
  const blocked = (cell: number, neighbor: number) => {
    const row = Math.floor(cell / 9)
    const column = cell % 9
    const neighborRow = Math.floor(neighbor / 9)
    const neighborColumn = neighbor % 9
    return row === neighborRow
      ? walls.has(`${Math.max(column, neighborColumn)},${row},${Math.max(column, neighborColumn)},${row + 1}`)
      : walls.has(`${column},${Math.max(row, neighborRow)},${column + 1},${Math.max(row, neighborRow)}`)
  }
  for (let start = 0; start < 81; start++) {
    if (visited.has(start)) continue
    const cells: number[] = []
    const pending = [start]
    visited.add(start)
    while (pending.length) {
      const cell = pending.pop()!
      cells.push(cell)
      const row = Math.floor(cell / 9)
      const column = cell % 9
      for (const neighbor of [row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1,
        column > 0 ? cell - 1 : -1, column < 8 ? cell + 1 : -1]) {
        if (neighbor >= 0 && !visited.has(neighbor) && !blocked(cell, neighbor)) {
          visited.add(neighbor)
          pending.push(neighbor)
        }
      }
    }
    cellsByRegion.push(cells.sort((a, b) => a - b))
  }
  return cellsByRegion
}

function countRegions(kind: Spec['kind'], regions: readonly (readonly number[])[], givens: string,
  labels: CoachAqreSource['countLabels'], indicators: CoachAqreSource['circleIndicators']): readonly CoachAqreRegion[] | undefined {
  const containingRegionCount = (cell: number) => regions.filter(region => region.includes(cell)).length
  for (const { point: [x, y], text } of labels) {
    if (text !== '' && containingRegionCount(Math.floor(y) * 9 + Math.floor(x)) !== 1) return
  }
  if (indicators.some(({ cell }) => containingRegionCount(cell) !== 1)) return

  const result: CoachAqreRegion[] = []
  for (const cells of regions) {
    const numbers = labels.filter(({ point: [x, y], text }) => text !== '' &&
      cells.includes(Math.floor(y) * 9 + Math.floor(x)))
    const circles = indicators.filter(({ cell }) => cells.includes(cell))
    const givenDigits = cells.filter(cell => givens[cell] !== '0')
    if (kind === 'aqre-plus') {
      if (numbers.length || circles.length || givenDigits.length !== 1) return
      result.push({ cells, count: { type: 'digit', cell: givenDigits[0] } })
      continue
    }
    if (numbers.length + circles.length > 1) return
    if (numbers.length === 1) {
      result.push({ cells, count: { type: 'fixed', value: Number(numbers[0].text) } })
      continue
    }
    if (circles.length === 1) {
      const cell = circles[0].cell
      result.push({ cells, count: { type: 'digit', cell } })
      continue
    }
    result.push({ cells })
  }
  return result
}

/** Decode the reviewed Aqre exports into the typed source model used by import. */
export async function readReviewedCoachAqre(code: string, data: Record<string, unknown>): Promise<{
  source: CoachAqreSource
} | undefined> {
  if (!Array.isArray(data.givenConstraints)) return
  let spec: Spec | undefined
  for (let count = data.givenConstraints.length; count > 0; count -= 1) {
    const base = { ...data, givenConstraints: data.givenConstraints.slice(0, count) }
    const hash = await sourceHash(code, base)
    const match = hash && SOURCES.get(hash)
    if (match) { spec = match; break }
  }
  if (!spec) return
  if (data.gridSize !== 9 || typeof data.givenDigits !== 'string' || !/^[0-9]{81}$/.test(data.givenDigits) ||
    !Array.isArray(data.regions) || data.regions.length ||
    spec.kind === 'aqre-snake' && (!Array.isArray(data.colours) || !data.colours.every(color => typeof color === 'string')) ||
    !Array.isArray(data.givenConstraints) ||
    !data.givenConstraints.every(record)) return
  const constraints = data.givenConstraints
  const one = (type: string) => {
    const found = constraints.filter(layer => layer.type === type)
    return found.length === 1 ? found[0] : undefined
  }
  const boundaryPaths = lineLayer(one('cosmeticLine'), spec.kind)
  if (!boundaryPaths) return
  const regionCells = regionsFromBoundaries(boundaryPaths)
  if (!regionCells) return
  const textLayer = one('cosmeticText')
  const shapeLayer = one('cosmeticShape')
  const countLabels = spec.kind === 'aqre-snake' ? textLayer && textClues(textLayer) : []
  const circleIndicators = spec.kind === 'aqre-snake' ? shapeLayer && circles(shapeLayer) : []
  const palette = Array.isArray(data.colours) ? data.colours as string[] : []
  const givenColours = typeof data.givenColours === 'string' ? data.givenColours.split(',') : []
  if (spec.kind === 'aqre-snake' && (!countLabels || !circleIndicators || palette.length !== 2 ||
    !palette.includes('blue') || !palette.includes('orange') || givenColours.length !== 81 ||
    givenColours.some(color => color !== '' && color !== '0' && color !== '1'))) return
  if (spec.kind === 'aqre-plus' && (textLayer || shapeLayer || data.givenColours !== undefined)) return
  const renbanLayer = spec.kind === 'aqre-plus' ? one('renban') : undefined
  const renbanPaths = spec.kind === 'aqre-plus' ? renbanLayer && renban(renbanLayer) : []
  if (spec.kind === 'aqre-plus' && !renbanPaths) return
  const givenShades = givenColours.flatMap((shade, cell) => shade === '' ? [] : [{
    cell, color: palette[Number(shade)],
  }])
  const regions = countRegions(spec.kind, regionCells, data.givenDigits,
    countLabels ?? [], circleIndicators ?? [])
  if (!regions) return
  const known = new Set(['cosmeticLine', ...(spec.kind === 'aqre-snake' ? ['cosmeticText', 'cosmeticShape'] : ['renban'])])
  if (constraints.some(layer => typeof layer.type !== 'string') ||
    constraints.filter(layer => known.has(layer.type as string)).length !== known.size) return
  return {
    source: {
      kind: spec.kind,
      size: 9,
      givens: data.givenDigits,
      palette,
      givenColours,
      givenShades,
      boundaryPaths,
      regions,
      countLabels: countLabels ?? [],
      circleIndicators: circleIndicators ?? [],
      renbanPaths: renbanPaths ?? [],
      otherRules: constraints.filter(layer => !known.has(layer.type as string)),
    },
  }
}
