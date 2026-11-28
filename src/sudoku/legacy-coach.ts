// The older Coach codes store a fixed 9×9 definition followed by optional
// playing state. Convert their rule records to the same input as SCv7.
const zeroDigits = '0'.repeat(81)
const allZeroMasks = '0-'.repeat(80) + '0'
const emptyMasks = '0T'.repeat(80) + '0'
const zeroGrid = '0a81b_'
const zeroMasks = '0Ac80d0_'
const legacyPalette = ['', 'grey', 'lime', 'blue', 'purple', 'red', 'green', 'yellow', 'orange']
export type LegacyCoachVersion = '3' | '4' | '5' | '6'

const shortcuts: Record<string, string> = {
  X: '00', Y: '000', Z: '0000', y: zeroGrid, x: '0Tc80d0_',
  u: zeroGrid.repeat(6) + zeroMasks.repeat(3) + '__' + zeroGrid,
  z: zeroGrid.repeat(4) + '0Tc80d0_'.repeat(3) + '__' + zeroGrid,
}

const repetitions: Record<string, readonly [end: string, width: number]> = {
  a: ['b', 1], '(': [')', 1], c: ['d', 2], '[': [']', 2],
}

function invalidLegacy() {
  return new Error('This Sudoku Coach code uses an unsupported format or has invalid legacy data.')
}

function expandLegacy(body: string, maxLength: number) {
  // No legacy puzzle field needs arbitrary text. In particular a META
  // suffix can carry author instructions that the grid record omits.
  if (!/^[A-Za-z0-9_()[\]+.-]+$/.test(body) || body.includes('META_')) throw invalidLegacy()
  const input = body.replace(/[XYZuxyz]/g, char => shortcuts[char])
  if (input.length > maxLength) throw invalidLegacy()
  let result = ''
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    const repeat = repetitions[char]
    if (repeat) {
      const [closing, width] = repeat
      const end = input.indexOf(closing, index + 1)
      const countText = end < 0 ? '' : input.slice(index + 1, end)
      const pattern = input.slice(index - width, index)
      if (!/^\d{1,6}$/.test(countText) || pattern.length !== width || !/^[0-9AT]{1,2}$/.test(pattern)) throw invalidLegacy()
      const count = Number(countText)
      if (count < 1 || result.length + width * (count - 1) > maxLength) throw invalidLegacy()
      result += pattern.repeat(count - 1)
      index = end
    } else {
      if (result.length >= maxLength) throw invalidLegacy()
      result += char
    }
  }
  return result.replaceAll('A', '-').replaceAll('B', '+')
}

const globalRules: Partial<Record<number, string>> = {
  1: 'diagonalNegative', 2: 'diagonalPositive', 3: 'antiKnight', 4: 'antiKing',
  5: 'nonconsecutive', 30: 'globalEntropy', 31: 'nonconsecutive',
}
const lineRules: Partial<Record<number, string>> = { 10: 'thermometer', 11: 'renban', 12: 'consecutiveLine' }
const pairRules: Partial<Record<number, readonly [type: string, parameter: string, fallback: number]>> = {
  6: ['twoCellSum', 'sum', 5], 14: ['difference', 'difference', 1], 15: ['ratio', 'ratio', 2],
}
const sandwichSides = ['top', 'left', 'bottom', 'right']

function legacyConstraint(record: string) {
  const match = /^(\d{1,2})((?:[IP]\d{1,3})*)$/.exec(record)
  if (!match) throw invalidLegacy()
  const id = Number(match[1])
  const cells: number[] = [], parameters: number[] = []
  for (const [, marker, value] of match[2].matchAll(/([IP])(\d{1,3})/g)) {
    (marker === 'I' ? cells : parameters).push(Number(value))
  }
  if (cells.some(cell => cell >= 81)) throw invalidLegacy()
  const layer = (type: string, values: Record<string, unknown> = {}) => ({ type, segments: [{ cells, parameters: values }] })
  const global = globalRules[id]
  const line = lineRules[id]
  const pair = pairRules[id]
  if (global && cells.length === 0 && parameters.length === 0) return { type: global, segments: [] }
  if (line && cells.length >= 2 && parameters.length === 0) return layer(line)
  if (pair && cells.length === 2 && parameters.length <= 1) {
    const [type, key, fallback] = pair
    return layer(type, { [key]: parameters[0] ?? fallback })
  }
  if (id === 13 && cells.length === 1 && parameters.length === 1) {
    const [parity] = parameters
    if (parity === 1 || parity === 2) return layer(parity === 1 ? 'odd' : 'even')
  }
  if (id === 20 && cells.length === 0 && parameters.length === 3) {
    const [sideIndex, index, value] = parameters
    const side = sandwichSides[sideIndex - 1]
    if (side) return layer('sandwich', { side, index, value })
  }
  // The optional parameter is the palette number for the outlined house.
  if (id === 40 && cells.length === 9 && parameters.length <= 1) return layer('region')
  if (!global && !line && !pair && ![13, 20, 40].includes(id)) {
    throw new Error(`This Sudoku Coach legacy rule is not supported yet (${id}).`)
  }
  throw invalidLegacy()
}

export function decodeLegacyCoach(body: string, version: LegacyCoachVersion, maxLength: number): Record<string, unknown> {
  const [givens, colors, ...fields] = expandLegacy(body, maxLength).split('_')
  if (!/^[0-9]{81}$/.test(givens) || !/^[0-8]{81}$/.test(colors ?? '') || !fields.length) throw invalidLegacy()
  // SCv3 stored its rule record after the playing fields. Later versions moved it before them.
  const v3 = version === '3'
  const clues = fields[v3 ? 11 : 0] ?? ''
  const state = v3 ? fields : fields.slice(1)
  const mask = (field: string) => field === allZeroMasks || field === emptyMasks
  // The published Coach serializer maps state slots 2, 5 and 7 to
  // userDigits, userCellCandidates and userBoxCandidates for SCv3–SCv6.
  const [previewDigits, constructionParameters, userDigits, userColors, userShades,
    userCellCandidates, candidateSelection, userBoxCandidates, candidateColors, drawing, highlights, extra, masks, ...annotations] = state
  if (state.length !== 1 || state[0] !== '') {
    const early = v3 || version === '4'
    const fullLength = early ? 12 : version === '5' ? 13 : 16
    if (state.length < fullLength || state.slice(fullLength).some(Boolean)) throw invalidLegacy()
    const inactiveTail = early ? v3 || extra === '' : extra === zeroDigits &&
      (version === '5' ? masks === '' : mask(masks) && !annotations.some(Boolean))
    if (![previewDigits, userDigits].every(field => /^[0-9]{81}$/.test(field)) ||
        [constructionParameters, userColors, userShades, highlights].some(field => field !== zeroDigits) ||
        !mask(candidateSelection) || candidateColors || drawing || !inactiveTail) {
      throw new Error('This Sudoku Coach legacy code includes unsupported playing state or annotations. Copy the puzzle definition to import it.')
    }
  }
  if (clues && !clues.startsWith('R')) throw invalidLegacy()
  const givenConstraints = clues ? clues.slice(1).split('R').map(legacyConstraint) : []
  const artwork = colors === zeroDigits ? undefined : {
    colours: legacyPalette.slice(1),
    givenColours: [...colors].map(shade => shade === '0' ? '' : String(Number(shade) - 1)).join(','),
  }
  const emptyCandidateMasks = (field: string) => mask(field) ? allZeroMasks : field
  return { gridSize: 9, givenDigits: givens, givenConstraints,
    ...(userDigits !== undefined && userDigits !== zeroDigits && { userDigits }),
    ...(userCellCandidates !== undefined && !mask(userCellCandidates) && { userCellCandidates: emptyCandidateMasks(userCellCandidates) }),
    ...(userBoxCandidates !== undefined && !mask(userBoxCandidates) && { userBoxCandidates: emptyCandidateMasks(userBoxCandidates) }),
    ...artwork }
}
