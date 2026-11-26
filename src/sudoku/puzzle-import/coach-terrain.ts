const COACH_TERRAIN_D8HP_HASH = '3703ff495ec8e279f091b9f36fab3b7ca462f1cea9505a02247718c682c7ac77'
const COACH_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export type CoachTerrainValueChange =
  | { color: 'yellow'; operation: 'multiply'; amount: 2 }
  | { color: 'green'; operation: 'add'; amount: 3 }
  | { color: 'purple'; operation: 'add'; amount: -3 }

export type CoachTerrainSandwichClue = {
  direction: 'south' | 'east'
  index: number
  maximum: number
}

export type CoachTerrainDefinition = {
  valueChanges: readonly CoachTerrainValueChange[]
  cellColors: readonly (CoachTerrainValueChange['color'] | null)[]
  clues: readonly CoachTerrainSandwichClue[]
}

type CoachTerrainPayload = {
  gridSize?: unknown
  colours?: unknown
  givenColours?: unknown
  givenConstraints?: unknown
}

const changes: readonly CoachTerrainValueChange[] = [
  { color: 'yellow', operation: 'multiply', amount: 2 },
  { color: 'green', operation: 'add', amount: 3 },
  { color: 'purple', operation: 'add', amount: -3 },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) return undefined
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Read only the reviewed Terrain export whose authored prose supplies its rule semantics. */
export async function readReviewedCoachTerrain(code: string, payload: CoachTerrainPayload): Promise<CoachTerrainDefinition | undefined> {
  if (payload.gridSize !== 9 || !Array.isArray(payload.colours) ||
    payload.colours.length !== 3 || payload.colours.some((color, index) => color !== ['green', 'purple', 'yellow'][index]) ||
    typeof payload.givenColours !== 'string' || !Array.isArray(payload.givenConstraints) || payload.givenConstraints.length !== 2) {
    return
  }
  if (await sha256(code) !== COACH_TERRAIN_D8HP_HASH) return

  const rawColors = payload.givenColours.split(',')
  if (rawColors.length !== 81 || rawColors.some(color => color.length > 1 || color !== '' && !COACH_BASE62.slice(0, 3).includes(color))) {
    throw new Error('The published Terrain export has an invalid cell value map.')
  }
  const palette = payload.colours as CoachTerrainValueChange['color'][]
  const cellColors = rawColors.map(color => color === '' ? null : palette[COACH_BASE62.indexOf(color)])

  const textLayer = payload.givenConstraints[0]
  const sandwichLayer = payload.givenConstraints[1]
  if (!isRecord(textLayer) || textLayer.type !== 'cosmeticText' ||
    !isRecord(textLayer.settings) || textLayer.settings.gridZoomOut !== 1 || textLayer.settings.textSize !== 88 ||
    Object.keys(textLayer.settings).some(key => key !== 'gridZoomOut' && key !== 'textSize') ||
    !Array.isArray(textLayer.segments) || textLayer.segments.length !== 15 ||
    !isRecord(sandwichLayer) || sandwichLayer.type !== 'sandwich' ||
    !Array.isArray(sandwichLayer.segments) || sandwichLayer.segments.length !== 0 ||
    !isRecord(sandwichLayer.settings) || Object.keys(sandwichLayer.settings).length !== 0) {
    throw new Error('The published Terrain export has changed its authored Sandwich clues.')
  }

  const clues = textLayer.segments.map(segment => {
    if (!isRecord(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !isRecord(segment.parameters) ||
      Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.text !== 'string' ||
      !/^-?\d+$/.test(segment.parameters.text)) {
      throw new Error('The published Terrain export has an invalid authored Sandwich clue.')
    }
    const [x, y] = segment.cells[0]
    const maximum = Number(segment.parameters.text)
    if (typeof x !== 'number' || typeof y !== 'number' ||
      !((y === -0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= 8.5) ||
        (x === -0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= 8.5)) ||
      !Number.isSafeInteger(maximum)) {
      throw new Error('The published Terrain export has an out-of-grid Sandwich clue.')
    }
    return y === -0.5
      ? { direction: 'south' as const, index: x - 0.5, maximum }
      : { direction: 'east' as const, index: y - 0.5, maximum }
  })
  const keys = clues.map(({ direction, index }) => `${direction}:${index}`)
  if (new Set(keys).size !== clues.length) throw new Error('The published Terrain export repeats an authored Sandwich clue.')

  return { valueChanges: changes, cellColors, clues }
}
