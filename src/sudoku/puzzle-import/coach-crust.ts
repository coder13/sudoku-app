import { record, sourceHash } from './shared.ts'

export type CoachCrustBoundaryClue = {
  side: 'top' | 'right' | 'bottom' | 'left'
  index: number
  total: number
  crossedEdges?: number
}

export type CoachCrustDefinition = {
  source: 'BKR7' | 'ABjn' | 'DZEy' | '9Z8C'
  size: 7 | 9
  clues: CoachCrustBoundaryClue[]
  authoredSolution?: string
  sharedRegion?: [number, number]
  fixedEdges?: [number, number][]
  additionalConstraints: readonly unknown[]
}

const publishedCrustSolutions: Partial<Record<CoachCrustDefinition['source'], string>> = {
  BKR7: '583967241264781395672195438891534672715342986936428517148259763427613859359876124',
}

const reviewedCrustExports = new Map<string, CoachCrustDefinition['source']>([
  ['de637fce7d10366d180d4ee6eea7456d8173b9b74de5a6fbbe33f2d4f8324b63', 'BKR7'],
  ['3a29ef6e95b1ed3c2adb86ff7f93242599576825158053581cb5fc2e73cd966b', 'ABjn'],
  ['376114ca23e4f6337af419d2aba6ade8d68da829f2aa89e66baa328fa541316e', 'DZEy'],
  ['2eb387c8fe073e88a2e1a1fb53dc148642f61ad4cd006be6cc4a4980a907f8a0', '9Z8C'],
])

type TextClue = { x: number; y: number; text: string }
type Side = CoachCrustBoundaryClue['side']

function boundaryPosition(x: number, y: number, size: number): { side: Side; index: number } | undefined {
  if (x === -0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
    return { side: 'left', index: y - 0.5 }
  }
  if (x === size + 0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
    return { side: 'right', index: y - 0.5 }
  }
  if (y === -0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
    return { side: 'top', index: x - 0.5 }
  }
  if (y === size + 0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
    return { side: 'bottom', index: x - 0.5 }
  }
  return undefined
}

function crossedEdgePosition(x: number, y: number, size: number): { side: Side; index: number } | undefined {
  if (x === -1 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
    return { side: 'left', index: y - 0.5 }
  }
  if (x === size + 1 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
    return { side: 'right', index: y - 0.5 }
  }
  if (y === -1 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
    return { side: 'top', index: x - 0.5 }
  }
  if (y === size + 1 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
    return { side: 'bottom', index: x - 0.5 }
  }
  return undefined
}

function textClues(layer: Record<string, unknown>, expectedSettings: Record<string, number>, expectedCount: number): TextClue[] | undefined {
  const settings = record(layer.settings) ? layer.settings : undefined
  if (Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
    layer.type !== 'cosmeticText' || !Array.isArray(layer.segments) ||
    !settings || Object.keys(settings).length !== Object.keys(expectedSettings).length ||
    Object.entries(expectedSettings).some(([key, value]) => settings[key] !== value) ||
    layer.segments.length !== expectedCount) return
  const clues: TextClue[] = []
  for (const segment of layer.segments) {
    if (!record(segment) || Object.keys(segment).some(key => !['cells', 'parameters'].includes(key)) ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 || !Array.isArray(segment.cells[0]) ||
      segment.cells[0].length !== 2 || !segment.cells[0].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      !record(segment.parameters) || Object.keys(segment.parameters).length !== 1 ||
      typeof segment.parameters.text !== 'string') return
    clues.push({ x: segment.cells[0][0] as number, y: segment.cells[0][1] as number, text: segment.parameters.text })
  }
  return clues
}

/** Parse the reviewed Crust exports whose outside sums are stored as cosmetic text. */
export async function readReviewedCoachCrust(code: string, data: Record<string, unknown>): Promise<CoachCrustDefinition | undefined> {
  if (!Array.isArray(data.givenConstraints)) return
  let source: CoachCrustDefinition['source'] | undefined
  let baseConstraintCount = 0
  for (const count of [1, 2, 4]) {
    if (data.givenConstraints.length < count) continue
    const base = { ...data, givenConstraints: data.givenConstraints.slice(0, count) }
    const hash = await sourceHash(code, base)
    const match = hash && reviewedCrustExports.get(hash)
    if (match) { source = match; baseConstraintCount = count; break }
  }
  if (!source) return
  const size = source === 'BKR7' || source === '9Z8C' ? 9 : 7
  const isNineEdgeCount = source === '9Z8C'
  if (data.gridSize !== size || !Array.isArray(data.regions) || data.regions.length !== 0 ||
    data.givenDigits !== undefined && data.givenDigits !== '0'.repeat(size * size) ||
    data.givenConstraints.length < (source === 'ABjn' ? 2 : isNineEdgeCount ? 4 : 1)) return

  const expectedLayers = source === 'BKR7' ? [{ settings: { textSize: 60 }, count: 17 }]
    : source === 'ABjn' ? [{ settings: { textSize: 70 }, count: 15 }, { settings: { textSize: 45 }, count: 15 }]
      : source === 'DZEy' ? [{ settings: { gridZoomOut: 1, textSize: 54 }, count: 28 }]
        : [{ settings: { textSize: 70 }, count: 27 }, { settings: { textSize: 50 }, count: 27 }]
  const layers = data.givenConstraints.slice(0, expectedLayers.length).map((layer, index) =>
    record(layer) ? textClues(layer, expectedLayers[index].settings, expectedLayers[index].count) : undefined)
  if (isNineEdgeCount) {
    const region = data.givenConstraints[2]
    const line = data.givenConstraints[3]
    if (!record(region) || region.type !== 'region' || Object.keys(region).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !record(region.settings) || Object.keys(region.settings).length !== 1 || region.settings.colour !== '#c0c0c0' ||
      !Array.isArray(region.segments) || region.segments.length !== 1 || !record(region.segments[0]) ||
      Object.keys(region.segments[0]).some(key => !['cells', 'parameters'].includes(key)) ||
      !Array.isArray(region.segments[0].cells) || region.segments[0].cells.length !== 2 ||
      region.segments[0].cells[0] !== 42 || region.segments[0].cells[1] !== 72 ||
      !record(region.segments[0].parameters) || Object.keys(region.segments[0].parameters).length !== 0 ||
      !record(line) || line.type !== 'cosmeticLine' || Object.keys(line).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !record(line.settings) || Object.keys(line.settings).length !== 4 || line.settings.lineThickness !== 5 ||
      line.settings.borderThickness !== 2 || line.settings.gridSnapToCentres !== false || line.settings.gridSnapToCorners !== true ||
      !Array.isArray(line.segments) || line.segments.length !== 1 || !record(line.segments[0]) ||
      Object.keys(line.segments[0]).some(key => !['cells', 'parameters'].includes(key)) ||
      JSON.stringify(line.segments[0].cells) !== JSON.stringify([[1, 9], [1, 8]]) ||
      !record(line.segments[0].parameters) || Object.keys(line.segments[0].parameters).length !== 0) return
  } else if (data.givenConstraints.slice(0, expectedLayers.length).some(layer => !record(layer) || layer.type !== 'cosmeticText')) return
  if (layers.some(layer => !layer)) return
  const clues: CoachCrustBoundaryClue[] = []
  const seen = new Set<string>()
  for (const clue of layers[0]!) {
    const position = boundaryPosition(clue.x, clue.y, size)
    if (!position || !/^(?:0|[1-9]\d*)$/.test(clue.text)) return
    const total = Number(clue.text)
    if (!Number.isSafeInteger(total) || total > size * (size + 1) / 2) return
    const key = `${position.side}:${position.index}`
    if (seen.has(key)) return
    seen.add(key)
    clues.push({ ...position, total })
  }
  if (!clues.length) return

  if (source === 'ABjn' || isNineEdgeCount) {
    const edgeCounts = new Map<string, number>()
    for (const clue of layers[1]!) {
      const position = crossedEdgePosition(clue.x, clue.y, size)
      if (!position || !/^(?:0|[1-9]\d*)$/.test(clue.text)) return
      const count = Number(clue.text)
      if (!Number.isSafeInteger(count) || count >= size) return
      const key = `${position.side}:${position.index}`
      if (edgeCounts.has(key)) return
      edgeCounts.set(key, count)
    }
    if (edgeCounts.size !== clues.length || clues.some(clue => !edgeCounts.has(`${clue.side}:${clue.index}`))) return
    for (const clue of clues) clue.crossedEdges = edgeCounts.get(`${clue.side}:${clue.index}`)
  } else if (layers.length !== 1) return

  return {
    source, size, clues,
    additionalConstraints: data.givenConstraints.slice(baseConstraintCount),
    ...(publishedCrustSolutions[source] && { authoredSolution: publishedCrustSolutions[source] }),
    ...(isNineEdgeCount && { sharedRegion: [42, 72], fixedEdges: [[72, 73]] }),
  }
}
