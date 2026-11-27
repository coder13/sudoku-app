const COACH_TERRAIN_D8HP_PUZZLE_HASH = '127b8016b807b3f707122eb21a4a1d30c7e521e52e02d6d268af6568dbd3135e'
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
  additionalConstraints: readonly unknown[]
}

type CoachTerrainPayload = Record<string, unknown>

const allowedFields = new Set([
  'gridSize', 'givenDigits', 'colours', 'givenColours', 'givenConstraints',
  'userDigits', 'userCellCandidates', 'userBoxCandidates', 'userColours', 'userCellCandidatesColours',
  'quickDrawLineSegments', 'quickDrawSymbols', 'cells',
])

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

/** Read the reviewed Terrain puzzle and ignore only its supported player-progress fields. */
export async function readReviewedCoachTerrain(payload: CoachTerrainPayload): Promise<CoachTerrainDefinition | undefined> {
  if (Object.keys(payload).some(key => !allowedFields.has(key))) return
  if (payload.gridSize !== 9 || !Array.isArray(payload.colours) ||
    payload.colours.length !== 3 || payload.colours.some((color, index) => color !== ['green', 'purple', 'yellow'][index]) ||
    typeof payload.givenColours !== 'string' || !Array.isArray(payload.givenConstraints) || payload.givenConstraints.length < 2) {
    return
  }
  const givens = payload.givenDigits ?? '0'.repeat(81)
  if (typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) return
  const puzzleHash = await sha256(JSON.stringify({
    gridSize: payload.gridSize,
    givenDigits: givens,
    colours: payload.colours,
    givenColours: payload.givenColours,
    givenConstraints: payload.givenConstraints.slice(0, 2),
  }))
  if (puzzleHash !== COACH_TERRAIN_D8HP_PUZZLE_HASH) return

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

  return { valueChanges: changes, cellColors, clues, additionalConstraints: payload.givenConstraints.slice(2) }
}
