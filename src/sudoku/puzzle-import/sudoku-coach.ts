import { readReviewedCoachArtwork, reviewedCoachFillTitle } from '../authored-artwork.ts'
import { readReviewedCoachCrust } from './coach-crust.ts'
import { readReviewedCoachRowEquations } from './coach-row-equation.ts'
import { readCoachFractionalRegions } from '../coach-fractional-regions.ts'
import { readReviewedCoachAqre } from './coach-aqre.ts'
import { readReviewedCoachTextClues } from './coach-text-clues.ts'
import { readReviewedCoachBoxlessNine } from './coach-boxless-nine.ts'
import { readReviewedCoachEntropyGroupOrder } from '../coach-entropy-group-order.ts'
import { readReviewedCoachEntropyBreaks } from '../coach-entropy-breaks.ts'
import { coachNonogramRules } from '../coach-nonogram.ts'
import { coachSkyscrapersRules } from '../coach-skyscrapers.ts'
import { parseCoachEntropyWindowGroups } from '../entropy-window-groups.ts'
import { coachConnectedLines, coachConsecutiveRuns } from '../coach-lines.ts'
import { readCoachColouredLines } from '../coach-coloured-lines.ts'
import { readReviewedCoachTerrain } from './coach-terrain.ts'
import { isCoachWhispersGuide } from '../coach-whispers-guide.ts'
import type { SizedConstraintRule, SizedDifferenceRule, SizedLabeledDotsRule, VariantPuzzle, VariantRule } from '../engine.ts'
import { isFogDefinition, type FogDefinition } from '../fog.ts'
import { normalizeGivens } from '../formats.ts'
import { EMPTY } from '../game.ts'
import { connectedGridCells, FIVE_BOXLESS_GRID, gridCellsShareEdge, gridRegionIndex, isGridText, isJigsawGrid, isJigsawSize, isRectangularSize, MINI_GRID, NINE_BOXLESS_GRID, rectangularGridFromRegions, regionsFromMembership, SEVEN_BOXLESS_GRID, SIX_BOXLESS_GRID, type JigsawGrid, type SizedGrid } from '../grid.ts'
import { isHexColor, isImportedColor, validGivenCellColors, validImportedCellColors, type CandidateColors, type ImportedCellColors } from '../imported-colors.ts'
import { readCoachQuickDraw } from '../imported-drawings.ts'
import { createImportedFutoshiki } from '../../futoshiki/imported.ts'
import { createImportedCalcudoku } from '../../calcudoku/imported.ts'
import { isCoachStandaloneLine, readCoachStandaloneLine } from '../coach-standalone-lines.ts'
import { readCoachStandaloneExclusions } from '../coach-standalone-exclusions.ts'
import { readCoachStandaloneExtrema } from '../coach-standalone-extrema.ts'
import type { CageOperator } from '../../calcudoku/engine.ts'
import type { LatinParity } from '../../latin/parity.ts'
import type { LatinDiagonal } from '../../latin/diagonals.ts'
import { emptyNumberPosition, type NumberPosition } from '../../number-puzzles/progress.ts'
import { insideGridColumns, validInsideGridRows } from '../inside-grid.ts'
import { validLetteredQuadruples } from '../lettered-quadruples.ts'
import { decodeLegacyCoach, type LegacyCoachVersion } from '../legacy-coach.ts'
import type { OutsideSide } from '../outside-clues.ts'
import { closedRegionSumCells, regionIndex } from '../region-sum.ts'
import { isSizedRuleList } from '../sized-rule-game.ts'
import { cellsShareEdge } from '../variants.ts'
import { fetchPublishedExport } from './published-link.ts'
import { MAX_DECODED_LENGTH, MAX_IMPORT_LENGTH, hasData, hasMiniBoxes, jigsawLayoutError, makeImportedPuzzle, parseJSON, readRegions, record } from './shared.ts'
import type { ImportResult, PuzzleImporter } from './types.ts'

const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'
const COACH_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const COACH_CODE = /^SCv([0-9]+)_([0-9]+)_/i
const COACH_WHOLE_PROGRESS = /^32_/
const LEGACY_COACH_CODE = /^SCv([3-6])_/i
const MAX_COACH_PROGRESS_LENGTH = 1_048_576
const COACH_COLLECTION_LINK = /^\/(?:[a-z]{2}\/)?collections\/((?:[a-z0-9-]{1,64}\/){0,3}[a-z0-9-]{1,64})\/s\/([A-Za-z0-9]{1,16})\/?$/
// Retain the 5NW source's visible fills only for the exact reviewed export.
const coachRomeoAndJulietExport = 'a00378f1b8e4943815a5987cacaeeec0669db58163a9cdca19675d3f36a678e3'
// The reviewed Mini Jigsaw source describes regions that wrap over both board axes.
// Region geometry alone cannot distinguish this topology from ordinary authored regions.
const coachWrappedJigsawExport = '501832fec680e8fa268be297919615522b2a9150da212cde066797ec6e6828dc'
const COACH_FIELDS = new Set([
  'gridSize', 'givenDigits', 'regions', 'givenConstraints', 'meta', 'metaSolver', 'colours',
  'constructorPreviewDigits', 'constructorConstructionParameters', 'quickDrawLineSegments', 'quickDrawSymbols', 'cells', 'acid', 'givenColours', 'user_like',
])
const COACH_PROGRESS_FIELDS = new Set(['userDigits', 'userCellCandidates', 'userBoxCandidates', 'userColours', 'userCellCandidatesColours'])
const COACH_DRAWINGS = ['quickDrawLineSegments', 'quickDrawSymbols', 'cells']

const CLUE_STYLING = new Set(['opacity', 'colour', 'shapeSize', 'borderColour', 'borderThickness'])
const LINE_STYLING = new Set(['colour', 'colourSync', 'lineThickness', 'lineEndOffset', 'borderColour', 'borderThickness', 'opacity'])
const BULB_STYLING = new Set(['bulbSize', 'bulbBorderThickness', 'bulbBorderColour', 'bulbFillColour'])
function unsupportedClueStyling(settings: unknown) {
  return hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !CLUE_STYLING.has(key)))
}

function readCoachDigitRestrictions(constraint: Record<string, unknown>): VariantRule[] {
  const invalid = new Error('This Sudoku Coach shape layer has unsupported or invalid digit restrictions.')
  const settings = constraint.settings
  if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
    hasData(settings) && !record(settings) ||
    record(settings) && (settings.gridSnapToCorners === true || settings.gridSnapToEdges === true ||
      Object.keys(settings).some(key => !['gridSnapToCentres', 'gridSnapToCorners', 'gridSnapToEdges', 'shapeSize', 'opacity', 'colour', 'borderColour', 'borderThickness'].includes(key))) ||
    !Array.isArray(constraint.segments) || !constraint.segments.length) throw invalid
  const groups = new Map<'circle' | 'cross' | 'square', number[]>([['circle', []], ['cross', []], ['square', []]])
  for (const segment of constraint.segments) {
    if (!record(segment) || Object.keys(segment).some(key => !['cells', 'parameters'].includes(key)) ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !record(segment.parameters) ||
      Object.keys(segment.parameters).some(key => key !== 'shape') ||
      !['circle', 'cross', 'square'].includes(String(segment.parameters.shape))) throw invalid
    const [column, row] = segment.cells[0]
    if (typeof column !== 'number' || typeof row !== 'number' ||
      ![column, row].every(value => Number.isInteger(value - .5) && value >= .5 && value <= 8.5)) throw invalid
    groups.get(segment.parameters.shape as 'circle' | 'cross' | 'square')!.push((row - .5) * 9 + column - .5)
  }
  const cells = [...groups.values()].flat()
  if (new Set(cells).size !== cells.length || [...groups.values()].some(group => !group.length)) throw invalid
  return [...groups].map(([shape, cells]) => ({ type: 'digit-restriction', shape, cells,
    digits: shape === 'circle' ? [1, 2, 3] : shape === 'cross' ? [4, 5, 6, 7] : [8, 9] }))
}

function decodeBase32Hex(text: string) {
  const bytes = new Uint8Array(Math.floor(text.length * 5 / 8))
  let bits = 0
  let buffer = 0
  let offset = 0
  for (const letter of text.toLowerCase()) {
    const value = BASE32HEX.indexOf(letter)
    if (value < 0) throw new Error('This Sudoku Coach code contains an invalid character.')
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes[offset++] = (buffer >>> bits) & 255
    }
  }
  if (bits >= 5 || (buffer & ((1 << bits) - 1))) throw new Error('This Sudoku Coach code is incomplete.')
  return bytes
}

async function inflate(bytes: Uint8Array<ArrayBuffer>, limit = MAX_DECODED_LENGTH) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) throw new Error('This Sudoku Coach puzzle is too large.')
      chunks.push(decoder.decode(value, { stream: true }))
    }
    return chunks.join('') + decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export async function decodeSudokuCoachPayload(code: string): Promise<Record<string, unknown>> {
  if (code.length > MAX_IMPORT_LENGTH) throw new Error('Paste one puzzle at a time.')
  const legacy = LEGACY_COACH_CODE.exec(code)
  if (legacy) return decodeLegacyCoach(code.slice(legacy[0].length), legacy[1] as LegacyCoachVersion, MAX_DECODED_LENGTH)
  const wholeProgress = COACH_WHOLE_PROGRESS.exec(code)
  const prefix = COACH_CODE.exec(code)
  if (!wholeProgress && (!prefix || prefix[1] !== '7' || prefix[2] !== '32')) {
    throw new Error('This Sudoku Coach code uses an unsupported format. Copy the puzzle from Sudoku Coach and try again.')
  }
  const bytes = decodeBase32Hex(code.slice((wholeProgress ?? prefix)![0].length))
  const limit = wholeProgress ? MAX_COACH_PROGRESS_LENGTH : MAX_DECODED_LENGTH
  let text: string
  try {
    text = await inflate(bytes, limit)
  } catch {
    throw new Error('This Sudoku Coach code could not be opened. Copy the full puzzle code and try again.')
  }
  let data = parseJSON(text, 'Sudoku Coach', limit)
  if (wholeProgress) {
    const invalid = () => new Error('This Sudoku Coach progress has an invalid puzzle snapshot.')
    if (!record(data) || typeof data.i !== 'number' || !Number.isSafeInteger(data.i) ||
      !Array.isArray(data.a) || data.i < 0 || data.i >= data.a.length || typeof data.a[data.i] !== 'string') throw invalid()
    let snapshot: unknown
    try { snapshot = parseJSON(data.a[data.i], 'Sudoku Coach') }
    catch { throw invalid() }
    if (!record(snapshot) || snapshot.version !== 7) throw invalid()
    const puzzle = { ...snapshot }
    delete puzzle.version
    data = puzzle
  }
  if (!record(data)) throw new Error('This Sudoku Coach puzzle is unreadable.')
  return data
}

async function decodeCoach(code: string): Promise<Record<string, unknown>> {
  const data = await decodeSudokuCoachPayload(code)
  for (const [key, value] of Object.entries(data)) {
    if (!COACH_FIELDS.has(key) && !COACH_PROGRESS_FIELDS.has(key) && hasData(value)) {
      throw new Error(`This Sudoku Coach puzzle uses an unsupported field (${key}).`)
    }
  }
  if (data.givenConstraints !== undefined && !Array.isArray(data.givenConstraints)) {
    throw new Error('This Sudoku Coach puzzle has invalid rules.')
  }
  if (data.colours !== undefined && (!Array.isArray(data.colours) || data.colours.length > COACH_BASE62.length ||
    data.colours.some(colour => typeof colour !== 'string' || !colour))) {
    throw new Error('This Sudoku Coach puzzle has an invalid color palette.')
  }
  if (data.givenColours !== undefined && typeof data.givenColours !== 'string') {
    throw new Error('This Sudoku Coach puzzle has invalid authored colors.')
  }
  for (const field of COACH_PROGRESS_FIELDS) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      throw new Error(`This Sudoku Coach progress has an invalid ${field} value.`)
    }
  }
  return data
}

type CoachTypedDeclaration = { globalEntropy: true; adjacentTotals: readonly [7, 13] }
  | { cageTotals: readonly [number, number] }
type CoachPublication = {
  hasAuthorInstructions: boolean
  title?: string
  authoredRule?: 'x-sum' | 'all-black-dots' | 'line-colours' | 'mirrored-renban' | 'quad-arrows' | 'partial-regions' | 'inside-grid' | 'lettered-quadruples' | 'neighbor-match' | 'magic-square' | 'unknown-cage-sums' | 'distant-neighbors' | 'entropic-breaks' | 'entropic-group-order' | 'entropy-window-groups' | 'aqre-snake' | 'xv-empty-cosmetic-cage' | 'aqre-plus' | 'reviewed-artwork' | 'wrapped-regions' | 'sized-nonogram' | 'sized-skyscrapers' | 'sized-entropic-runaround'
  declaredRules?: CoachTypedDeclaration
  whispersGuide?: true
}

function isCoachTypedDeclaration(value: unknown): value is CoachTypedDeclaration {
  if (!record(value)) return false
  if (Object.keys(value).length === 1 && Array.isArray(value.cageTotals) && value.cageTotals.length === 2) {
    const [first, second] = value.cageTotals
    return [first, second].every(sum => Number.isInteger(sum) && sum >= 1 && sum <= 45) && first !== second
  }
  return Object.keys(value).length === 2 && value.globalEntropy === true &&
    Array.isArray(value.adjacentTotals) && value.adjacentTotals.length === 2 &&
    value.adjacentTotals[0] === 7 && value.adjacentTotals[1] === 13
}

const magicSquareCoachExport = '8c4aceec22d1628faeb544944dfa6664913a08e1aaf468b4bcd5514fb7b844b1'
const unknownCageSumsCoachExport = 'a96fdbd3eb78af79cf63b1ce787f1d3a3e4a1d70b249f23a7dedb11e2667a88f'
const unknownCageSumsPublishedSolution = '513879462296154378748623591635291784127348659489567123851936247972415836364782915'
const distantNeighborsCoachExport = 'd8fb932a0c4941b1f7732f0ea32a6d50fc4adf72c5b6c0f28621e30405be9b0f'
// The published AsnF instructions name these authored cosmetic labels as X-Sums.
// Restrict that interpretation to the exact reviewed export, since raw text is otherwise ambiguous.
const authoredAsnFXSumsCoachExport = '3392bb1a0488e8778d630b4b058e1a55ee04baefa0f199b5a29ba8382c499e53'

async function readCoachMagicSquare(code: string, data: Record<string, unknown>) {
  if (await coachExportHash(code) !== magicSquareCoachExport || data.gridSize !== 9 ||
    !Array.isArray(data.givenConstraints) || data.givenConstraints.length !== 1) return
  const [layer] = data.givenConstraints
  if (!record(layer) || layer.type !== 'cage' || !Array.isArray(layer.segments) || layer.segments.length !== 13) return
  const unnumbered = layer.segments.filter(segment => record(segment) && record(segment.parameters) &&
    Object.keys(segment.parameters).length === 0)
  if (unnumbered.length !== 4 || !unnumbered.every(segment => record(segment) && Array.isArray(segment.cells) && segment.cells.length === 9)) return
  return { type: 'magic-square' as const, cells: [30, 31, 32, 39, 40, 41, 48, 49, 50] }
}

async function readCoachUnknownCageSums(code: string, data: Record<string, unknown>) {
  if (await coachExportHash(code) !== unknownCageSumsCoachExport || data.gridSize !== 9 ||
    !Array.isArray(data.givenConstraints)) return
  const layers = data.givenConstraints.filter(record)
  if (layers.length !== data.givenConstraints.length || layers.length !== 4) return
  const cageLayers = layers.filter(layer => layer.type === 'cage')
  const textLayers = layers.filter(layer => layer.type === 'cosmeticText')
  if (cageLayers.length !== 1 || textLayers.length !== 1) return
  const [cageLayer] = cageLayers, [textLayer] = textLayers
  if (!Array.isArray(cageLayer.segments) || cageLayer.segments.length !== 15 ||
    !Array.isArray(textLayer.segments) || textLayer.segments.length !== 13 || !record(textLayer.settings) ||
    Object.keys(textLayer.settings).sort().join(',') !== 'gridZoomOut,outlineColour,outlineThickness,textSize' ||
    textLayer.settings.gridZoomOut !== 1 || textLayer.settings.textSize !== 50 ||
    textLayer.settings.outlineColour !== '#e2e2e2' || textLayer.settings.outlineThickness !== 4) return
  const cages: number[][] = []
  const cageAt = new Int8Array(81).fill(-1)
  for (const [cageIndex, segment] of cageLayer.segments.entries()) {
    if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || !record(segment.parameters) ||
      Object.keys(segment.parameters).length) return
    const cells = segment.cells
    if (!cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81) || new Set(cells).size !== cells.length) return
    for (const cell of cells) {
      if (cageAt[cell] !== -1) return
      cageAt[cell] = cageIndex
    }
    cages.push([...cells])
  }
  if (cageAt.some(index => index < 0)) return
  const expectedCMarks = [[7, 4.5], [2, 4.5], [8, .5], [7, .5], [1, 8.5], [3.5, 2], [5.5, 2], [3.5, 7], [5.5, 7]]
  const expectedDecorations = [[9.5, -.5], [-.5, 9.5], [-.5, -.5], [9.5, 9.5]]
  const marks: number[][] = [], decorations: number[][] = []
  for (const segment of textLayer.segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !record(segment.parameters) ||
      Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.text !== 'string') return
    const [x, y] = segment.cells[0]
    if (segment.parameters.text === 'C') marks.push([x as number, y as number])
    else if (segment.parameters.text === '') decorations.push([x as number, y as number])
    else return
  }
  const sameCoordinates = (left: readonly (readonly number[])[], right: readonly (readonly number[])[]) =>
    left.length === right.length && new Set(left.map(point => `${point[0]}:${point[1]}`)).size === left.length &&
    right.every(point => left.some(other => point[0] === other[0] && point[1] === other[1]))
  if (!sameCoordinates(marks, expectedCMarks) || !sameCoordinates(decorations, expectedDecorations)) return
  const consecutivePairs: [number, number][] = []
  for (const [x, y] of expectedCMarks) {
    let first: number, second: number
    if (Number.isInteger(x) && Number.isInteger(y - .5) && x >= 1 && x <= 8) {
      const row = y - .5
      first = row * 9 + x - 1
      second = first + 1
    } else if (Number.isInteger(x - .5) && Number.isInteger(y) && y >= 1 && y <= 8) {
      const column = x - .5
      first = (y - 1) * 9 + column
      second = first + 9
    } else return
    const pair: [number, number] = [cageAt[first], cageAt[second]]
    if (pair[0] < 0 || pair[1] < 0 || pair[0] === pair[1]) return
    pair.sort((a, b) => a - b)
    if (consecutivePairs.some(([a, b]) => a === pair[0] && b === pair[1])) return
    consecutivePairs.push(pair)
  }
  consecutivePairs.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  return {
    rule: { type: 'unknown-cage-sums' as const, cages, consecutivePairs },
    authoredSolution: unknownCageSumsPublishedSolution,
  }
}

async function readCoachDistantNeighbors(code: string, data: Record<string, unknown>) {
  if (await coachExportHash(code) !== distantNeighborsCoachExport || data.gridSize !== 9 ||
    !Array.isArray(data.givenConstraints) || data.givenConstraints.length !== 2) return
  const layers = data.givenConstraints.filter(record)
  if (layers.length !== data.givenConstraints.length) return
  const [region] = layers.filter(layer => layer.type === 'region')
  const [lines] = layers.filter(layer => layer.type === 'cosmeticLine')
  const markedCells = [0, 4, 8, 36, 40, 44, 72, 76, 80]
  if (!region || !lines || Object.keys(region).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
    !Array.isArray(region.segments) || region.segments.length !== 1 || !record(region.segments[0]) ||
    !Array.isArray(region.segments[0].cells) || region.segments[0].cells.length !== markedCells.length ||
    region.segments[0].cells.some((cell, index) => cell !== [80, 76, 72, 36, 40, 44, 8, 4, 0][index]) ||
    !record(region.segments[0].parameters) || Object.keys(region.segments[0].parameters).length !== 0 ||
    !Array.isArray(lines.segments) || lines.segments.length !== 10 || !record(lines.settings) ||
    lines.settings.gridSnapToCorners !== true || lines.settings.gridSnapToCentres !== false) return
  return { type: 'distant-neighbors' as const, markedCells }
}

function readCoachCandidateMasks(value: unknown, size = 9): number[] {
  if (value === undefined || value === '') return Array(size ** 2).fill(0)
  const masks = typeof value === 'string' ? value.split('-') : []
  const maxMask = (1 << (size + 1)) - 2
  if (masks.length !== size ** 2 || masks.some(mask => !/^\d{1,4}$/.test(mask) || Number(mask) > maxMask || Number(mask) % 2)) {
    throw new Error('This Sudoku Coach progress has invalid candidate marks.')
  }
  // Coach stores digit d at bit d. Play stores digit d at bit d - 1.
  return masks.map(mask => Number(mask) >>> 1)
}

function readCoachColorNames(cells: readonly string[], palette: readonly unknown[]): ImportedCellColors | undefined {
  const colors: ImportedCellColors = {}
  for (const [cell, shades] of cells.entries()) {
    if (!shades) continue
    const names = [...shades].map(shade => palette[COACH_BASE62.indexOf(shade)])
    if (!names.every(isImportedColor) || new Set(names).size !== names.length) return
    colors[cell] = names.sort()
  }
  return colors
}

function readCoachPlayerColors(data: Record<string, unknown>, size = 9): ImportedCellColors | undefined {
  const cells = readCoachColourCells(data.colours, data.userColours, size)
  if (!cells) throw new Error('This Sudoku Coach progress has invalid cell colors.')
  if (!cells.length) return
  const colors = readCoachColorNames(cells, data.colours as unknown[])
  if (!colors) throw new Error('This Sudoku Coach progress has invalid or unsupported cell colors.')
  return colors
}

function readCoachCandidateColors(palette: unknown, encoded: unknown, size = 9): CandidateColors<string> | undefined {
  if (encoded === undefined || encoded === '') return
  const marks = typeof encoded === 'string' ? encoded.split('-') : []
  const invalid = () => new Error('This Sudoku Coach progress has invalid or unsupported candidate colors.')
  if (!marks.length || marks.length > size ** 3 || !Array.isArray(palette) || palette.length > COACH_BASE62.length) throw invalid()
  const colors: CandidateColors<string> = {}
  for (const mark of marks) {
    // Coach stores one color for each cell and digit, using a base62 palette index.
    const match = /^(0|[1-9]\d*)\+(0|[1-9]\d*)\+([0-9A-Za-z])$/.exec(mark)
    if (!match) throw invalid()
    const cell = Number(match[1]), digit = Number(match[2]), shade = palette[COACH_BASE62.indexOf(match[3])]
    if (cell >= size ** 2 || digit < 1 || digit > size || !isImportedColor(shade) || colors[cell]?.[digit] !== undefined) throw invalid()
    const cellColors = colors[cell] ??= {}
    cellColors[digit] = shade
  }
  return colors
}

function readCoachProgress(data: Record<string, unknown>, givens: string, size = 9): ImportResult['progress'] {
  const hasNonNineDrawings = size !== 9 && (hasData(data.quickDrawLineSegments) || hasData(data.quickDrawSymbols) ||
    record(data.cells) && Object.keys(data.cells).some(key => key !== 'NaN,NaN'))
  if (hasNonNineDrawings) throw new Error('Quick Draw progress is only supported for 9 × 9 Sudoku Coach imports.')
  const importedDrawings = size === 9 ? readCoachQuickDraw(data) : undefined
  if (!importedDrawings && ![data.userDigits, data.userCellCandidates, data.userBoxCandidates, data.userColours, data.userCellCandidatesColours].some(hasData)) return
  const importedCellColors = readCoachPlayerColors(data, size)
  const importedCandidateColors = readCoachCandidateColors(data.colours, data.userCellCandidatesColours, size)
  const digits = data.userDigits === undefined || data.userDigits === '' ? '0'.repeat(size ** 2) : data.userDigits
  if (typeof digits !== 'string' || digits.length !== size ** 2 || [...digits].some(digit => !/^[0-9]$/.test(digit) || Number(digit) > size)) {
    throw new Error('This Sudoku Coach progress has invalid placed digits.')
  }
  if ([...digits].some((digit, cell) => digit !== '0' && givens[cell] !== '0' && digit !== givens[cell])) {
    throw new Error('The Sudoku Coach progress has a placed digit that replaces a given.')
  }
  const entries = [...digits].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
  const center = readCoachCandidateMasks(data.userCellCandidates, size).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  const corner = readCoachCandidateMasks(data.userBoxCandidates, size).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  if (entries !== EMPTY || center.some(Boolean) || corner.some(Boolean) || importedCellColors || importedCandidateColors || importedDrawings) {
    return { entries, center, corner, ...(importedCellColors && { importedCellColors }),
      ...(importedCandidateColors && { importedCandidateColors }), ...(importedDrawings && { importedDrawings }) }
  }
}

function readCoachNumberPosition(data: Record<string, unknown>, givens: string, size: number): NumberPosition | undefined {
  if (![data.userDigits, data.userCellCandidates, data.userBoxCandidates].some(hasData)) return
  const digits = data.userDigits === undefined || data.userDigits === '' ? '0'.repeat(givens.length) : data.userDigits
  if (typeof digits !== 'string' || digits.length !== givens.length || !/^\d+$/.test(digits) ||
    [...digits].some(digit => Number(digit) > size)) {
    throw new Error('This Sudoku Coach progress has invalid placed digits.')
  }
  if ([...digits].some((digit, cell) => digit !== '0' && givens[cell] !== '0' && digit !== givens[cell])) {
    throw new Error('The Sudoku Coach progress has a placed digit that replaces a given.')
  }
  const position = emptyNumberPosition(size ** 2)
  position.values = [...digits].map((digit, cell) => givens[cell] === '0' ? Number(digit) : 0)
  const center = readCoachCandidateMasks(data.userCellCandidates, size)
  const corner = readCoachCandidateMasks(data.userBoxCandidates, size)
  position.notes = center.map((mask, cell) => givens[cell] === '0' ? mask | corner[cell] : 0)
  return position.values.some(Boolean) || position.notes.some(Boolean) ? position : undefined
}

function readCoachParity(layers: readonly unknown[], size: number): LatinParity[] {
  const clues: LatinParity[] = []
  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'odd' && layer.type !== 'even') continue
    if (Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      unsupportedClueStyling(layer.settings) || !Array.isArray(layer.segments)) {
      throw new Error('This Sudoku Coach Odd/Even clue uses unsupported settings.')
    }
    for (const segment of layer.segments) {
      if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
        !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters) ||
        !Number.isInteger(segment.cells[0]) || segment.cells[0] < 0 || segment.cells[0] >= size ** 2) {
        throw new Error('This Sudoku Coach puzzle has an invalid Odd/Even cell.')
      }
      clues.push({ cell: segment.cells[0], parity: layer.type })
    }
  }
  return clues
}

function readCoachInequalities(layers: readonly unknown[]): { less: number; greater: number }[] {
  const inequalities: { less: number; greater: number }[] = []
  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'greaterLess') continue
    if (Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      hasData(layer.settings) || !Array.isArray(layer.segments)) throw new Error('This Sudoku Coach puzzle has an invalid inequality layer.')
    for (const segment of layer.segments) {
      if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
        !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
        !segment.cells.every(Number.isInteger) || hasData(segment.parameters)) {
        throw new Error('This Sudoku Coach puzzle has an invalid inequality sign.')
      }
      inequalities.push({ less: segment.cells[0], greater: segment.cells[1] })
    }
  }
  return inequalities
}

function readCoachDiagonals(layers: readonly unknown[]): LatinDiagonal[] {
  return readCoachRules(layers.filter(layer => record(layer) &&
    (layer.type === 'diagonalNegative' || layer.type === 'diagonalPositive')), {})
    .flatMap(rule => rule.type === 'diagonal' ? [rule.diagonal] : [])
}

function readCoachStandaloneRules(layers: readonly unknown[], size: number) {
  const lines = layers.flatMap(layer => !record(layer) || !isCoachStandaloneLine(layer.type)
    ? [] : readCoachStandaloneLine(layer, size))
  let exclusions: import('../../latin/exclusions.ts').LatinExclusion[] = readCoachStandaloneExclusions(layers.filter(layer => record(layer) &&
    ['antiKnight', 'antiKing', 'nonconsecutive'].includes(String(layer.type))), size)
  if (exclusions.includes('nonconsecutive')) {
    const dotRules = readCoachRules(layers.filter(layer => record(layer) && layer.type === 'difference'), {})
    const except = [...new Map(dotRules.flatMap(rule => rule.type === 'kropki' ? rule.consecutive?.pairs ?? [] : [])
      .filter(([a, b]) => Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1).map(([a, b]) => {
        const pair = [Math.min(a, b), Math.max(a, b)] as const
        return [pair.join(','), pair] as const
      })).values()]
    if (except.length) exclusions = exclusions.map(rule => rule === 'nonconsecutive'
      ? { type: 'nonconsecutive', except } : rule)
  }
  const extrema = readCoachStandaloneExtrema(layers.filter(layer => record(layer) &&
    (layer.type === 'minimum' || layer.type === 'maximum')), size)
  return { lines, exclusions, extrema }
}

const calcudokuSigns = new Map<string, CageOperator>([
  ['+', 'add'], ['x', 'multiply'], ['X', 'multiply'], ['×', 'multiply'], ['*', 'multiply'],
  ['-', 'subtract'], ['−', 'subtract'], ['÷', 'divide'], ['/', 'divide'],
])

function readCoachCalcudokuCages(layers: readonly unknown[], size: number) {
  const cages: { target: number; operator: CageOperator; cells: number[]; distinct?: true }[] = []
  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'cage' && layer.type !== 'cosmeticCage') continue
    if (Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      hasData(layer.settings) || !Array.isArray(layer.segments)) throw new Error('This Sudoku Coach cage layer uses unsupported settings.')
    for (const segment of layer.segments) {
      if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
        !Array.isArray(segment.cells) || !segment.cells.length ||
        !segment.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) ||
        !record(segment.parameters) || Object.keys(segment.parameters).length !== 1 || !('sum' in segment.parameters)) {
        throw new Error('This Sudoku Coach puzzle has an invalid Calcudoku cage.')
      }
      const cells = segment.cells as number[]
      if (layer.type === 'cage') {
        const target = segment.parameters.sum
        if (!Number.isSafeInteger(target) || Number(target) <= 0) throw new Error('This Sudoku Coach puzzle has an invalid Calcudoku target.')
        cages.push({ target: Number(target), operator: cells.length === 1 ? 'equal' : 'add', cells, ...(cells.length > 1 && { distinct: true as const }) })
        continue
      }
      const label = String(segment.parameters.sum)
      const match = /^([1-9][0-9]{0,4})([+xX×*−÷/-])?$/.exec(label)
      if (!match) throw new Error('This Sudoku Coach puzzle has an unsupported Calcudoku cage label.')
      const target = Number(match[1])
      const operator = cells.length === 1 ? 'equal' : match[2] ? calcudokuSigns.get(match[2])
        : layer.type === 'cosmeticCage' ? 'hidden' : 'add'
      if (!operator || cells.length === 1 && match[2]) throw new Error('This Sudoku Coach puzzle has an invalid Calcudoku cage operation.')
      cages.push({ target, operator, cells })
    }
  }
  return cages
}

function readCoachStandalone(data: Record<string, unknown>): ImportResult | undefined {
  if (!Array.isArray(data.regions) || data.regions.length !== 0) return
  const size = data.gridSize
  if (!Number.isInteger(size) || Number(size) < 4 || Number(size) > 9) return
  const rawLayers = data.givenConstraints ?? []
  if (!Array.isArray(rawLayers)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  if (rawLayers.some(layer => !record(layer) || typeof layer.type !== 'string' || !Array.isArray(layer.segments))) {
    throw new Error('This Sudoku Coach puzzle has invalid rules.')
  }
  const types = rawLayers.flatMap(layer => record(layer) && typeof layer.type === 'string' ? [layer.type] : [])
  const hasInequalities = types.includes('greaterLess')
  const hasCages = types.includes('cage') || types.includes('cosmeticCage')
  const isFutoshiki = hasInequalities || !hasCages
  const isCalcudoku = hasCages
  const supported = isFutoshiki
    ? new Set(['greaterLess', 'odd', 'even', 'diagonalNegative', 'diagonalPositive', 'antiKnight', 'antiKing', 'nonconsecutive', 'difference', 'minimum', 'maximum', 'thermometer', 'renban', 'entropicLine', 'modularLine', 'betweenLine', 'lockoutLine', 'arrow'])
    : new Set(['cage', 'cosmeticCage', 'odd', 'even', 'diagonalNegative', 'diagonalPositive', 'antiKnight', 'antiKing', 'nonconsecutive', 'difference', 'minimum', 'maximum', 'thermometer', 'renban', 'entropicLine', 'modularLine', 'betweenLine', 'lockoutLine', 'arrow'])
  if (types.some(type => !supported.has(type))) {
    // Let the regular importer handle boxless Sudoku variants that combine
    // Futoshiki or Calcudoku with other supported rule families.
    return
  }
  if (COACH_DRAWINGS.some(key => hasData(data[key]))) {
    throw new Error('This boxless Sudoku Coach puzzle uses unsupported authored markings.')
  }
  if (isFutoshiki && isCalcudoku) throw new Error('This Sudoku Coach puzzle mixes Futoshiki signs and Calcudoku cages.')
  const givens = data.givenDigits === undefined ? '0'.repeat(Number(size) ** 2) : data.givenDigits
  if (typeof givens !== 'string' || givens.length !== Number(size) ** 2 || !/^\d+$/.test(givens) ||
    [...givens].some(digit => Number(digit) > Number(size))) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const position = readCoachNumberPosition(data, givens, Number(size))
  const rawCellColors = readCoachColourCells(data.colours, data.givenColours, Number(size))
  if (!rawCellColors && (hasData(data.givenColours) || hasData(data.colours))) {
    throw new Error('This boxless Sudoku Coach puzzle has invalid authored colors.')
  }
  const givenCellColors = rawCellColors?.length
    ? readCoachColorNames(rawCellColors, Array.isArray(data.colours) ? data.colours : []) : undefined
  if (rawCellColors?.some(Boolean) && !givenCellColors) {
    throw new Error('This boxless Sudoku Coach puzzle has unsupported authored colors.')
  }
  const parity = readCoachParity(rawLayers, Number(size))
  const diagonals = readCoachDiagonals(rawLayers)
  const standaloneRules = readCoachStandaloneRules(rawLayers, Number(size))
  if (isFutoshiki) {
    if (givenCellColors && Object.keys(givenCellColors).length) {
      throw new Error('This boxless Sudoku Coach puzzle uses cell colors that the Latin-square import cannot preserve.')
    }
    const futoshiki = createImportedFutoshiki(Number(size), givens, readCoachInequalities(rawLayers), parity, position,
      { diagonals, ...standaloneRules })
    return { givens, futoshiki }
  }
  const cages = readCoachCalcudokuCages(rawLayers, Number(size))
  if (!cages.length) throw new Error('This Sudoku Coach puzzle has no Calcudoku cages.')
  const calcudoku = createImportedCalcudoku(Number(size), givens, cages, parity, position,
    { diagonals, ...standaloneRules, ...(givenCellColors && { givenCellColors }) })
  return { givens, calcudoku }
}

function readCoachColourCells(colours: unknown, value: unknown, size = 9): string[] | undefined {
  if (value === undefined || value === '') return []
  if (typeof value !== 'string') return
  const cellColours = value.split(',')
  if (cellColours.length !== size ** 2) return
  if (!cellColours.some(Boolean)) return []
  if (!Array.isArray(colours) || !colours.length || colours.length > COACH_BASE62.length ||
    !colours.every(colour => typeof colour === 'string' && colour.length > 0)) return
  const palette = COACH_BASE62.slice(0, colours.length)
  if (cellColours.some(shades =>
    new Set(shades).size !== shades.length || [...shades].some(shade => !palette.includes(shade)))) return
  return cellColours
}

function coachColoursWithoutExtraHouses(cellColours: string[], rules: readonly VariantRule[]): string[] {
  if (!cellColours.length) return cellColours
  const groups = new Map<string, number[]>()
  for (const [cell, shades] of cellColours.entries()) {
    for (const shade of shades) {
      const group = groups.get(shade)
      if (group) group.push(cell)
      else groups.set(shade, [cell])
    }
  }
  // The built-in region drawing already shows a colour group with this exact membership.
  const houses = rules.filter(rule => rule.type === 'extra-house')
  const covered = new Set<string>()
  for (const [shade, group] of groups) {
    if (group.length === 9 && houses.some(house => house.cells.length === group.length &&
      group.every(cell => house.cells.includes(cell)))) covered.add(shade)
  }
  return covered.size ? cellColours.map(shades => [...shades].filter(shade => !covered.has(shade)).join('')) : cellColours
}

function coachMirroredRenbansMatch(cellColours: readonly string[], rules: readonly VariantRule[], allPalindromes: boolean): boolean {
  const cellSetKey = (cells: readonly number[]) => [...cells].sort((a, b) => a - b).join(',')
  const renbans = new Set(rules.filter(rule => rule.type === 'renban').map(rule => cellSetKey(rule.cells)))
  const palindromes = rules.filter(rule => rule.type === 'palindrome')
  if (!palindromes.length) return false

  const mirrorPairs = new Set<string>()
  for (const { cells } of palindromes) {
    // A Renban on either half applies to both halves through the mirrored digits.
    // Both halves include the middle cell of an odd-length Palindrome.
    const half = Math.ceil(cells.length / 2)
    if (!renbans.has(cellSetKey(cells.slice(0, half))) && !renbans.has(cellSetKey(cells.slice(-half)))) {
      if (allPalindromes) return false
      continue
    }
    for (let index = 0; index < Math.floor(cells.length / 2); index++) {
      mirrorPairs.add(cellSetKey([cells[index], cells[cells.length - 1 - index]]))
    }
  }

  // The same pair of colours selects the two mirrored cells. Individual colours
  // are reused on several pairs, so compare the whole combination on each cell.
  const groups = new Map<string, number[]>()
  for (const [cell, shades] of cellColours.entries()) {
    if (!shades) continue
    const combination = [...shades].sort().join('')
    const group = groups.get(combination)
    if (group) group.push(cell)
    else groups.set(combination, [cell])
  }
  return [...groups.values()].every(cells => mirrorPairs.has(cellSetKey(cells)))
}

function readCoachFog(layers: readonly Record<string, unknown>[]): FogDefinition | undefined {
  if (!layers.length) return
  const visible = new Set<number>()
  const emptyObject = (value: unknown) => value === undefined || record(value) && !Object.keys(value).length
  for (const layer of layers) {
    const { segments, settings } = layer
    const segment = Array.isArray(segments) && segments.length === 1 ? segments[0] : undefined
    const fog = { initialCells: record(segment) ? segment.cells : undefined }
    if (!emptyObject(settings) || Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !record(segment) || !emptyObject(segment.parameters) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !isFogDefinition(fog)) {
      throw new Error('This Sudoku Coach Fog of War layer has invalid or unsupported reveal settings.')
    }
    for (const cell of fog.initialCells) visible.add(cell)
  }
  return { initialCells: [...visible].sort((a, b) => a - b) }
}

function readCoachFogCellColors(fog: FogDefinition, cellColours: readonly string[], palette: readonly unknown[]) {
  const initial = new Set(fog.initialCells)
  const colors: ImportedCellColors = {}
  for (const [cell, codes] of cellColours.entries()) {
    const shades = [...codes].map(code => palette[COACH_BASE62.indexOf(code)])
    // This Jigsaw Fog export paints the entire starting reveal gray. Covered
    // colors become visible as ordinary cell backgrounds when the fog clears.
    if (!shades.every(isImportedColor) ||
      (initial.has(cell) ? shades.length !== 1 || shades[0] !== 'grey' : shades.includes('grey'))) return
    if (shades.length) colors[cell] = shades
  }
  return validImportedCellColors(colors) ? colors : undefined
}

async function coachExportHash(code: string) {
  if (!globalThis.crypto?.subtle) return
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Coach leaves this rule out of a pasted Quad-Arrows export.
const quadArrowsExport = '081de6e0d36d53b949aa2fcb8c18ab5cc7a89acab4729d3ba41baddefdd2dd43'
const codeCrackerExport = 'a297ab70f94568f356c282821f9566ad8ac1e2ba287781737615518c306bab3c'
const sandwichRollExport = 'a5222a3faefbf42cdaab3c8b81958d14e5a709e89d28e45d8611fbf64a325653'
const sunnyEntropyExport = '1c8d349fc96821784cbda4323a1bc9f85d6245d7610cb2a04317c3b4815c32c6'
// The published 220V legend assigns its cosmetic orange and blue paths to
// Entropic and Region Sum rules. The raw SCv7 payload does not carry that text.
const coach220VLineColoursExport = 'a454bc2435d4d69950db865205e3cd117bd3ab325bd6c528a8d6944007f357d4'

// The Rainbow colors repeat the region map. Revival's yellow pattern adds no
// rule. Match the reviewed exports in full because other colors can encode clues.
const reviewedCoachColorExports = new Map([
  ['1be837174e67a43133a677d6f504da74724c35ece725b203f822d299954a91c1', 'Entro Quad Rainbow Jigsaw'],
  ['2ec5b5abab8e4c9e045a35d0d3a4244213e47e37462c9b598798ee53ba07f28d', 'Revival'],
])

function readCoachInsideGrid(constraints: readonly unknown[]): VariantRule[] {
  const invalid = new Error('The export does not match its published Inside Grid and Consecutive Thermometers.')
  const layers = constraints.filter(record)
  if (layers.length !== constraints.length) throw invalid
  const ofType = (type: string) => layers.filter(layer => layer.type === type)
  const regions = readCoachRules(ofType('region'), {})
  const groups = regions.map(region => region.type === 'distinct-cells' ? region.cells : [])
  const size = groups[0]?.length ?? 0
  const rows = groups.slice(0, size)
  const sameCells = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every(cell => b.includes(cell))
  if (!validInsideGridRows(rows) || groups.length !== 2 * size ||
    !insideGridColumns(rows).every(column => groups.slice(size).some(group => sameCells(group, column)))) throw invalid

  const [shape] = ofType('cosmeticShape')
  const diamonds = Array.isArray(shape?.segments) ? shape.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !record(segment.parameters) || segment.parameters.shape !== 'rect') throw invalid
    const [x, y] = segment.cells[0]
    if (typeof x !== 'number' || typeof y !== 'number' ||
      ![x, y].every(coordinate => Number.isInteger(coordinate - .5) && coordinate >= .5 && coordinate <= 8.5)) throw invalid
    return (y - .5) * 9 + x - .5
  }) : []
  if (!sameCells(rows.flat(), diamonds) || new Set(diamonds).size !== size * size) throw invalid

  const renbans = readCoachRules(ofType('renban'), {}).filter(rule => rule.type === 'renban')
  const runs = ofType('thermometer').flatMap(layer => {
    const color = record(layer.settings) ? layer.settings.colour : undefined
    if (color !== undefined && !isHexColor(color)) throw invalid
    return readCoachRules([layer], {}).map((rule): VariantRule => {
      if (rule.type !== 'thermometer') throw invalid
      const index = renbans.findIndex(line => sameCells(rule.cells, line.cells))
      if (index < 0) throw invalid
      renbans.splice(index, 1)
      return { type: 'consecutive-run', cells: rule.cells, fromBulb: true, ...(color && { color }) }
    })
  })
  if (renbans.length || !runs.length) throw invalid
  const other = layers.filter(layer => !['region', 'cosmeticShape', 'thermometer', 'renban'].includes(String(layer.type)))
  return [{ type: 'inside-grid', rows }, ...runs, ...readCoachRules(other, {})]
}

function readCoachLetteredQuadruples(constraints: readonly unknown[]): VariantRule[] {
  const invalid = new Error('The export does not match its published lettered Quadruples.')
  const layers = constraints.filter(record)
  if (layers.length !== constraints.length) throw invalid
  const captions = layers.find(layer => layer.type === 'cosmeticText' && record(layer.settings) &&
    layer.settings.gridSnapToCentres === false && layer.settings.gridSnapToEdges === false)
  const circles = layers.find(layer => layer.type === 'cosmeticShape' && record(layer.settings) &&
    layer.settings.gridSnapToCorners === true)
  const corner = (segment: unknown) => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2) throw invalid
    const [x, y] = segment.cells[0]
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > 8 || y < 1 || y > 8) throw invalid
    return (y - 1) * 9 + x - 1
  }
  if (!Array.isArray(captions?.segments) || !Array.isArray(circles?.segments)) throw invalid
  const clues = captions.segments.map(segment => ({
    topLeft: corner(segment),
    letters: record(segment) && record(segment.parameters) ? segment.parameters.text : undefined,
  }))
  if (!validLetteredQuadruples(clues)) throw invalid
  const drawn = new Set(circles.segments.map(segment => {
    if (!record(segment) || !record(segment.parameters) || segment.parameters.shape !== 'circle') throw invalid
    return corner(segment)
  }))
  if (drawn.size !== clues.length || clues.some(clue => !drawn.has(clue.topLeft))) throw invalid
  // The original also carries transparent answer letters and decorative
  // text and shapes. Only the paired circles and their visible labels are clues.
  const typed = layers.filter(layer => !['cosmeticText', 'cosmeticShape', 'cosmeticLine'].includes(String(layer.type)))
  return [...readCoachRules(typed, {}), { type: 'lettered-quadruples', clues }]
}

async function fromCoach(code: string, publication?: CoachPublication | null, fromCollection = false): Promise<ImportResult> {
  const data: Record<string, unknown> = /^[0-9]{81}$/.test(code) ? { gridSize: 9, givenDigits: code } : await decodeCoach(code)
  const terrain = await readReviewedCoachTerrain(code, data)
  if (terrain) throw new Error('This Sudoku Coach Terrain puzzle uses transformed values that the engine does not support yet.')
  const crust = await readReviewedCoachCrust(code, data)
  if (crust) {
    const grid = crust.size === 7 ? SEVEN_BOXLESS_GRID : NINE_BOXLESS_GRID
    const direction = { top: 'south', right: 'west', bottom: 'north', left: 'east' } as const
    const clues = crust.clues.map(({ side, index, total, crossedEdges }) => ({
      direction: direction[side],
      cells: Array.from({ length: crust.size }, (_, offset) => side === 'top' ? offset * crust.size + index
        : side === 'bottom' ? (crust.size - offset - 1) * crust.size + index
          : side === 'left' ? index * crust.size + offset : index * crust.size + crust.size - offset - 1),
      sum: total,
      ...(crossedEdges !== undefined && { crossed: crossedEdges }),
    }))
    const title = crust.source === 'BKR7' ? 'Crust of Void'
      : crust.source === 'ABjn' ? 'Crust of Edge-Count [7x7]'
        : crust.source === '9Z8C' ? 'Crust of Edge-Count [9x9]' : 'Mini Random Crust #1'
    return { givens: '0'.repeat(crust.size ** 2), grid, sizedRules: [{
      type: 'crust', clues,
      ...(crust.sharedRegion && { sharedRegion: crust.sharedRegion }),
      ...(crust.fixedEdges && { fixedEdges: crust.fixedEdges }),
    }], title, ...(crust.authoredSolution && { authoredSolution: crust.authoredSolution, authoredSolutionOnly: true as const }) }
  }
  const standalone = publication !== null && !publication?.hasAuthorInstructions ? readCoachStandalone(data) : undefined
  if (standalone) return { ...standalone, ...(publication?.title && { title: publication.title }) }
  if (data.gridSize === 4 || isRectangularSize(data.gridSize) || isJigsawSize(data.gridSize)) {
    const reviewedEntropicRunaround = publication?.authoredRule === 'sized-entropic-runaround' && data.gridSize === 6 &&
      await coachExportHash(code) === 'eaa3711145076e992c920d15677b5f02651e829cbec2b1ba95a0d37c7f93162f'
    if (fromCollection && (!publication || publication.hasAuthorInstructions) ||
      publication?.hasAuthorInstructions && publication.authoredRule !== 'wrapped-regions' && publication.authoredRule !== 'sized-nonogram' &&
      publication.authoredRule !== 'sized-skyscrapers' && publication.authoredRule !== 'x-sum' && !reviewedEntropicRunaround) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    const { givens, grid, rules, progress, givenCellColors, reviewedTitle } = await readCoachSized(data, code,
      publication?.authoredRule === 'sized-nonogram', publication?.authoredRule === 'sized-skyscrapers',
      publication?.authoredRule === 'x-sum')
    if (publication?.hasAuthorInstructions && rules.some(rule => rule.type === 'quadruple')) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    return { givens, grid, ...(grid.size !== 4 || 'regions' in grid || rules.length ? { sizedRules: rules } : {}), ...(progress && { progress }),
      ...(givenCellColors && { givenCellColors }),
      ...((publication?.title ?? reviewedTitle) && { title: publication?.title ?? reviewedTitle }) }
  }
  if (data.gridSize !== 9) {
    throw new Error('Import supports 4 × 4, 5 × 5 Jigsaw, 6 × 6, 7 × 7 Jigsaw, 8 × 8, and 9 × 9 Sudoku Coach grids.')
  }
  if (publication === null) throw new Error('Open this short link in Sudoku Coach, then use Copy → Puzzle.')
  if (publication?.hasAuthorInstructions && !publication.authoredRule && !publication.declaredRules && !publication.whispersGuide) {
    throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
  }
  const givens = data.givenDigits === undefined ? EMPTY : data.givenDigits
  if (typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const encodedLayers = data.givenConstraints ?? []
  if (!Array.isArray(encodedLayers)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const isFogLayer = (layer: unknown): layer is Record<string, unknown> => record(layer) && layer.type === 'fog'
  let fog = readCoachFog(encodedLayers.filter(isFogLayer))
  const constraints = fog ? encodedLayers.filter(layer => !isFogLayer(layer)) : encodedLayers
  const boxlessNine = await readReviewedCoachBoxlessNine(code, data)
  if (boxlessNine) {
    if (publication?.hasAuthorInstructions) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    const regions: VariantPuzzle['regions'] = { type: 'partial', regions: [] }
    const ruleLayers = constraints.filter(layer => !record(layer) || layer.type !== 'cosmeticLine').map(layer => {
      if (!record(layer) || layer.type !== 'cage' || !Array.isArray(layer.segments) ||
        !layer.segments.every(segment => record(segment) && Array.isArray(segment.cells) &&
          record(segment.parameters) && Object.keys(segment.parameters).length === 0)) return layer
      // These unsummed nine-cell cages impose distinct digits. Their overlap
      // with numbered cages means they must stay separate from Killer totals.
      return { ...layer, type: 'region' }
    })
    const rules = readCoachRules(ruleLayers, { regions })
    const imported = makeImportedPuzzle('0'.repeat(81), rules, regions)
    return { ...imported, authoredArtwork: boxlessNine.artwork }
  }
  const aqre = await readReviewedCoachAqre(code, data)
  const expectedAqreKind = publication?.authoredRule === 'aqre-snake' ? 'aqre-snake'
    : publication?.authoredRule === 'aqre-plus' ? 'aqre-plus' : undefined
  if (expectedAqreKind && aqre?.source.kind !== expectedAqreKind) {
    throw new Error('The Aqre export does not match its published shading rules.')
  }
  if (publication?.authoredRule === 'xv-empty-cosmetic-cage' &&
    await coachExportHash(code) !== 'c7c2be5873de87e5168278e3f135cb5e5c1d5c470f87757076d54b64693c9806') {
    throw new Error('The XV Entropy export does not match its reviewed empty cage layer.')
  }
  if (aqre) {
    const source = aqre.source
    const regions: VariantPuzzle['regions'] = { type: 'partial', regions: [] }
    const rules: VariantRule[] = readCoachRules(source.otherRules, { regions })
    rules.push(...source.renbanPaths.map(cells => ({ type: 'renban' as const, cells })))
    rules.push({
      type: 'aqre',
      kind: source.kind === 'aqre-plus' ? 'plus' : 'snake',
      regions: source.regions.map(({ cells, count }) => ({
        cells,
        ...(count && { count: count.type === 'digit'
          ? { type: 'digit-cell' as const, cell: count.cell }
          : count }),
      })),
      givenShades: source.givenShades.map(({ cell, color }) => ({
        cell,
        shade: color === 'blue' ? 'shaded' as const : 'unshaded' as const,
      })),
    })
    const imported = makeImportedPuzzle(givens, rules, regions)
    return { ...imported, ...(publication?.title && { title: publication.title }) }
  }
  const entropyGroupOrder = await readReviewedCoachEntropyGroupOrder(code, data)
  const entropyBreaks = await readReviewedCoachEntropyBreaks(code, data)
  if (publication?.authoredRule === 'entropy-window-groups' &&
    await coachExportHash(code) !== sunnyEntropyExport) {
    throw new Error('The Global Entropy export does not match its reviewed shape clues.')
  }
  if (publication?.authoredRule === 'entropic-breaks' && !entropyBreaks) {
    throw new Error('The Entropic Spiral source does not match its published broken-line instructions.')
  }
  if (publication?.authoredRule === 'entropic-group-order' && !entropyGroupOrder) {
    throw new Error('The Entropic Order source does not match its published outside clues.')
  }
  const textClues = await readReviewedCoachTextClues(code, data)
  const magicSquare = await readCoachMagicSquare(code, data)
  const unknownCageSums = await readCoachUnknownCageSums(code, data)
  const distantNeighbors = await readCoachDistantNeighbors(code, data)
  const authoredAsnFXSums = !publication && constraints.some(layer => record(layer) && layer.type === 'cosmeticText') &&
    await coachExportHash(code) === authoredAsnFXSumsCoachExport
  const reviewed220VLineLegend = !publication && constraints.some(layer => record(layer) && layer.type === 'cosmeticLine') &&
    await coachExportHash(code) === coach220VLineColoursExport
  if (publication?.authoredRule === 'unknown-cage-sums' && !unknownCageSums) {
    throw new Error('The Sudoku Coach export does not match its published unknown cage totals.')
  }
  if (publication?.authoredRule === 'distant-neighbors' && !distantNeighbors) {
    throw new Error('The Sudoku Coach export does not match its published box identity clues.')
  }
  const artwork = await readReviewedCoachArtwork(code, constraints)
  if (publication?.authoredRule === 'reviewed-artwork' && !artwork?.layers) {
    throw new Error('The CS1G export does not match its reviewed authored artwork.')
  }
  let regions: VariantPuzzle['regions'] = Array.isArray(data.regions) && data.regions.length === 0
    ? { type: 'partial', regions: [] } : readRegions(data.regions)
  if (publication?.authoredRule === 'partial-regions' && !artwork?.partialRegions) {
    throw new Error('The export does not match its published region outlines.')
  }
  const guideLayers = constraints.every(layer => record(layer) &&
    ['whisper', 'cosmeticShape', 'cosmeticText'].includes(String(layer.type))) &&
    constraints.some(layer => layer.type === 'whisper') && constraints.some(layer => layer.type === 'cosmeticShape')
    ? constraints.filter(layer => layer.type !== 'whisper') : []
  const artworkLayers = artwork && 'layers' in artwork ? artwork.layers ?? [] : artwork ? [artwork.layer] : []
  const cellColours = readCoachColourCells(data.colours, data.givenColours)
  const hasQuadruples = constraints.some(layer => record(layer) && layer.type === 'quadruple')
  const hasShapeLayer = constraints.some(layer => record(layer) && layer.type === 'cosmeticShape')
  const declaredInsideGrid = publication?.authoredRule === 'inside-grid'
  const declaredLettered = publication?.authoredRule === 'lettered-quadruples'
  const exportHash = (!publication && hasQuadruples || declaredInsideGrid || declaredLettered || hasShapeLayer || !fog && cellColours?.some(Boolean))
    ? await coachExportHash(code) : undefined
  const entropyLayers = exportHash === sunnyEntropyExport
    ? constraints.filter(layer => record(layer) && layer.type === 'cosmeticShape') : []
  const entropyGroups = entropyLayers.length ? parseCoachEntropyWindowGroups(entropyLayers) : undefined
  if (exportHash === sunnyEntropyExport && (!entropyGroups || entropyGroups.length !== 14)) {
    throw new Error('The Sudoku Coach export does not match its published Global Entropy shape windows.')
  }
  const textClueLayers = textClues || entropyGroupOrder
    ? constraints.filter(layer => record(layer) && layer.type === 'cosmeticText') : []
  const reviewedLayers = [...artworkLayers, ...entropyLayers, ...textClueLayers,
    ...(unknownCageSums ? constraints.filter(layer => record(layer) && layer.type === 'cosmeticText') : [])]
  const encodedRules = entropyGroupOrder ? entropyGroupOrder.source.otherRules
    : unknownCageSums ? constraints.filter(layer => record(layer) && layer.type !== 'cage' && layer.type !== 'cosmeticText')
    : guideLayers.length ? constraints.filter(layer => layer.type === 'whisper')
    : reviewedLayers.length ? constraints.filter(layer => !reviewedLayers.includes(layer)) : constraints
  const insideGrid = exportHash === codeCrackerExport && (!publication || declaredInsideGrid)
  const lettered = exportHash === sandwichRollExport && (!publication || declaredLettered)
  if (declaredLettered && !lettered) throw new Error('The export does not match its published lettered Quadruples.')
  if (declaredInsideGrid && !insideGrid) throw new Error('The export does not match its published Inside Grid.')
  const rawQuadArrows = !publication && exportHash === quadArrowsExport
  const reviewedColorTitle = !fog && !publication?.hasAuthorInstructions && exportHash
    ? reviewedCoachColorExports.get(exportHash) : undefined
  const authoredRule = rawQuadArrows ? 'quad-arrows' : magicSquare ? 'magic-square' : unknownCageSums ? 'unknown-cage-sums' :
    distantNeighbors ? 'distant-neighbors' : authoredAsnFXSums ? 'x-sum' :
      reviewed220VLineLegend ? 'line-colours' : publication?.authoredRule
  const sourceRules = distantNeighbors ? encodedRules.filter(layer => !record(layer) || layer.type !== 'cosmeticLine') : encodedRules
  let rules = lettered ? readCoachLetteredQuadruples(encodedRules)
    : insideGrid ? readCoachInsideGrid(encodedRules) : readCoachRules(sourceRules, { regions, authoredRule })
  if (textClues) rules.push(textClues.rule)
  if (entropyGroupOrder) rules.push(...entropyGroupOrder.source.orders.map(({ cells, digits }) => ({
    type: 'digit-order' as const, cells: [...cells], digits: [...digits],
  })))
  if (entropyBreaks) rules.push(...entropyBreaks.rules)
  if (magicSquare) rules.push(magicSquare)
  if (unknownCageSums) rules.push(unknownCageSums.rule)
  if (distantNeighbors) rules.push(distantNeighbors)
  if (entropyGroups) rules.push(...entropyGroups.map(group => ({ type: 'entropy-window-group' as const, ...group })))
  const reviewedRomeoAndJuliet = exportHash === coachRomeoAndJulietExport && !publication?.hasAuthorInstructions
  if (artwork?.partialRegions) {
    const marked = rules.filter(rule => rule.type === 'extra-house')
    if (regions?.type !== 'partial' || !marked.length) throw new Error('The Bento puzzle is missing its marked regions.')
    regions = { type: 'partial', regions: marked.map(rule => [...rule.cells].sort((a, b) => a - b)) }
    rules = rules.filter(rule => rule.type !== 'extra-house')
  }
  if (authoredRule === 'quad-arrows' && !rules.some(rule => rule.type === 'quadruple-sum')) {
    throw new Error('This Sudoku Coach Quad-Arrows export is missing its circles.')
  }
  const palette = Array.isArray(data.colours) ? data.colours : []
  const whispersGuide = guideLayers.length > 0 && cellColours !== undefined && isCoachWhispersGuide(
    cellColours.map(shade => shade === '' ? '' : shade.length === 1 ? palette[COACH_BASE62.indexOf(shade)] : undefined),
    guideLayers, { version: 1, givens, regions, rules },
  )
  if (guideLayers.length > 0 && !whispersGuide || publication?.whispersGuide && !whispersGuide) {
    throw new Error('This Sudoku Coach puzzle has an unsupported Whispers guide.')
  }
  const declaredMirroredRenban = publication?.authoredRule === 'mirrored-renban'
  if (declaredMirroredRenban && (!cellColours || !coachMirroredRenbansMatch(cellColours, rules, true))) {
    throw new Error('The Sudoku Coach export does not match its published mirrored Renban rules and markings.')
  }
  const unsupportedDrawings = publication && COACH_DRAWINGS.some(key => hasData(data[key]))
  if (unsupportedDrawings || !cellColours) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
  const regionLegend = !fog && regions?.type === 'jigsaw' && cellColours.length
    ? readCoachColorNames(cellColours, palette) : undefined
  const reviewedRomeoAndJulietColors = reviewedRomeoAndJuliet ? readCoachColorNames(cellColours, palette) : undefined
  if (reviewedRomeoAndJuliet && !reviewedRomeoAndJulietColors) {
    throw new Error('The Sudoku Coach Romeo and Juliet export has invalid cell colors.')
  }
  let givenCellColors = reviewedRomeoAndJulietColors ?? (regionLegend &&
    validGivenCellColors(regionLegend, { puzzle: { version: 1, givens, regions } }) ? regionLegend : undefined)
  let fillTitle: string | undefined = givenCellColors
    ? reviewedRomeoAndJuliet ? 'Romeo and Juliet' : reviewedColorTitle : undefined
  if (!givenCellColors && !whispersGuide && !declaredMirroredRenban) {
    const remaining = coachColoursWithoutExtraHouses(cellColours, rules)
    if (remaining.some(Boolean) && !coachMirroredRenbansMatch(remaining, rules, false)) {
      if (!fog && !publication?.hasAuthorInstructions) {
        const plainCollectionArtwork = !rules.length && (!regions || regions.type === 'boxes') &&
          (fromCollection || LEGACY_COACH_CODE.test(code))
        const fills = readCoachColorNames(remaining, palette)
        if (fills && !plainCollectionArtwork) fillTitle = reviewedColorTitle ?? await reviewedCoachFillTitle(data, fills)
        if (plainCollectionArtwork || fillTitle) givenCellColors = fills
      }
      if (!givenCellColors) {
        const cellColors = fog && regions?.type === 'jigsaw' && !publication?.hasAuthorInstructions
          ? readCoachFogCellColors(fog, cellColours, palette) : undefined
        if (!fog || !cellColors) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
        fog = { ...fog, cellColors }
      }
    }
  }
  if (publication?.authoredRule === 'all-black-dots') {
    const black = rules.find(rule => rule.type === 'kropki' && rule.ratioTwo !== undefined)
    if (black?.type !== 'kropki' || !black.ratioTwo) {
      throw new Error('The Sudoku Coach export is missing the black Kropki dot layer from the published rules.')
    }
    // Native negative Kropki exempts edges with either color of dot. The
    // author's complete black-dot rule exempts only the black dots.
    if (rules.some(rule => rule.type === 'kropki' && rule.consecutive?.pairs?.length)) {
      throw new Error('This Sudoku Coach puzzle uses white dots with an authored complete black-dot rule.')
    }
    black.ratioTwo = { ...black.ratioTwo, negative: true }
  }
  const declaration = publication?.declaredRules
  if (declaration && 'cageTotals' in declaration) {
    const cages = rules.flatMap(rule => rule.type === 'killer-cages' ? rule.cages : [])
    if (!cages.length || cages.some(cage => !declaration.cageTotals.includes(cage.sum))) {
      throw new Error('The Sudoku Coach cage totals do not match the published description.')
    }
  } else if (declaration && (!rules.some(rule => rule.type === 'global-entropy') ||
    !declaration.adjacentTotals.every(sum => rules.some(rule => rule.type === 'adjacent-total' && rule.sum === sum)))) {
    throw new Error('The Sudoku Coach export is missing rules from the published description.')
  }
  const imported = makeImportedPuzzle(givens, rules, regions, fog)
  const progress = readCoachProgress(data, givens)
  const title = publication?.title ?? artwork?.title ?? textClues?.title ?? (entropyBreaks && 'Entropic Spiral') ??
    (entropyGroupOrder && 'Entropic Order') ?? fillTitle ??
    (authoredAsnFXSums ? 'X sums #3' : rawQuadArrows ? 'Quad-Arrows' : insideGrid ? 'Code Cracker' : lettered ? 'Sandwich Roll ;)' : undefined)
  return { ...imported, ...(title && { title }), ...(progress && { progress }),
    ...(unknownCageSums && { authoredSolution: unknownCageSums.authoredSolution, authoredSolutionOnly: true as const }),
    ...((artwork || textClues) && { authoredArtwork: [...(artwork?.artwork ?? []), ...(textClues?.artwork ?? [])] }),
    ...(whispersGuide && { whispersGuide: true }), ...(givenCellColors && { givenCellColors }) }
}

function readCoachPairMarkers(constraint: Record<string, unknown>, kind: 'difference' | 'ratio') {
  const { settings, segments } = constraint
  if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key))) {
    throw new Error(`This Sudoku Coach ${kind} layer has unsupported fields.`)
  }
  if (hasData(settings) && (!record(settings) ||
    Object.keys(settings).some(key => key !== 'negativeConstraint') ||
    settings.negativeConstraint !== undefined && typeof settings.negativeConstraint !== 'boolean')) {
    throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${kind}.`)
  }
  if (!Array.isArray(segments)) throw new Error(`This Sudoku Coach puzzle has invalid ${kind} markers.`)
  const markers = segments.map(segment => {
    if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== kind)) {
      throw new Error(`This Sudoku Coach puzzle has an invalid ${kind} marker.`)
    }
    const amount = segment.parameters[kind]
    return { cells: segment.cells as [number, number], amount: amount === undefined ? (kind === 'difference' ? 1 : 2) : amount }
  })
  return { markers, negative: record(settings) && settings.negativeConstraint === true }
}

function coachOutsideRay(side: OutsideSide, index: number, size = 9) {
  const direction = side === 'top' ? 'south' : side === 'bottom' ? 'north' : side === 'left' ? 'east' : 'west'
  const cells = Array.from({ length: size }, (_, i) => side === 'top' ? i * size + index : side === 'bottom' ? (size - 1 - i) * size + index
    : side === 'left' ? index * size + i : index * size + size - 1 - i)
  return { direction, cells } as const
}

function readCoachXSums(constraint: Record<string, unknown>, segments: readonly unknown[], size = 9) {
  const { settings } = constraint
  if (constraint.type !== 'cosmeticText' ||
    Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key))) {
    throw new Error('This Sudoku Coach X-Sums layer has unsupported fields.')
  }
  if (settings !== undefined && (!record(settings) || Object.keys(settings).some(key =>
    !['gridZoomOut', 'gridSnapToCorners', 'gridSnapToEdges', 'textSize'].includes(key)) ||
    (settings.gridZoomOut !== undefined && settings.gridZoomOut !== 1) ||
    (settings.gridSnapToCorners !== undefined && settings.gridSnapToCorners !== false) ||
    (settings.gridSnapToEdges !== undefined && settings.gridSnapToEdges !== false) ||
    (settings.textSize !== undefined && !(typeof settings.textSize === 'number' && Number.isFinite(settings.textSize) && settings.textSize > 0)))) {
    throw new Error('This Sudoku Coach X-Sums layer uses unsupported settings.')
  }
  const clues: Extract<VariantRule, { type: 'x-sum' }>[] = []
  const outsideLines = new Set<string>()
  const cellCenter = (coordinate: number) => coordinate >= 0.5 && coordinate <= size - 0.5 && Number.isInteger(coordinate - 0.5)
  for (const segment of segments) {
    if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !segment.cells[0].every(Number.isFinite) || !record(segment.parameters) ||
      Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.text !== 'string') {
      throw new Error('This Sudoku Coach puzzle has an invalid X-Sum label.')
    }
    const { text } = segment.parameters
    if (!text) continue
    const [x, y] = segment.cells[0] as [number, number]
    const side = cellCenter(x) && y === -0.5 ? 'top' : cellCenter(x) && y === size + 0.5 ? 'bottom'
      : cellCenter(y) && x === -0.5 ? 'left' : cellCenter(y) && x === size + 0.5 ? 'right' : undefined
    const sum = Number(text)
    const maximum = size * (size + 1) / 2
    if (!side || !/^[1-9][0-9]?$/.test(text) || sum > maximum) {
      throw new Error(`This Sudoku Coach X-Sum needs a total from 1 through ${maximum} beside a row or column.`)
    }
    const index = (side === 'top' || side === 'bottom' ? x : y) - 0.5
    const line = `${side}:${index}`
    if (outsideLines.has(line)) throw new Error('This Sudoku Coach X-Sums puzzle has multiple totals for the same outside line.')
    outsideLines.add(line)
    clues.push({ type: 'x-sum', ...coachOutsideRay(side, index, size), sum })
  }
  return clues
}

function readCoachRules(constraints: unknown, { regions, grid, authoredRule }: {
  regions?: VariantPuzzle['regions']; grid?: SizedGrid; authoredRule?: CoachPublication['authoredRule']
} = {}): VariantRule[] {
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const rules: VariantRule[] = []
  const numbered = new Set(constraints.flatMap(constraint => {
    if (!record(constraint) || constraint.type !== 'ratio' && constraint.type !== 'difference') return []
    const { type } = constraint
    const defaultValue = type === 'ratio' ? 2 : 1
    return readCoachPairMarkers(constraint, type).markers.some(mark => mark.amount !== defaultValue) ? [type] : []
  }))
  const drawnLines: Record<string, unknown>[] = []
  for (const constraint of constraints) {
    if (!record(constraint) || !Array.isArray(constraint.segments) || typeof constraint.type !== 'string') {
      throw new Error('This Sudoku Coach puzzle has invalid rules.')
    }
    if (constraint.type !== 'consecutiveLine' &&
      Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key))) {
      throw new Error(`This Sudoku Coach rule has unsupported fields (${constraint.type}).`)
    }
    if (constraint.segments.some(segment => !record(segment) ||
      Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters'))) {
      throw new Error(`This Sudoku Coach rule has unsupported segment fields (${constraint.type}).`)
    }
    // These layers contribute nothing when the export contains no paths or labels.
    if ((constraint.type === 'consecutiveLine' || constraint.type === 'cosmeticCage' || !grid && constraint.type === 'cosmeticText') &&
      constraint.segments.length === 0 &&
      (constraint.settings === undefined || record(constraint.settings) && Object.keys(constraint.settings).length === 0) &&
      Object.keys(constraint).every(key => ['id', 'type', 'segments', 'settings'].includes(key))) continue
    if (constraint.type === 'cosmeticText' && authoredRule === 'x-sum') {
      rules.push(...readCoachXSums(constraint, constraint.segments, grid?.size ?? 9))
      continue
    }
    if (constraint.type === 'cosmeticLine' && authoredRule === 'line-colours') {
      drawnLines.push(constraint)
      continue
    }
    if (!['region', 'consecutiveLine', 'difference', 'ratio', 'odd', 'even', 'whisper', 'thermometer', 'arrow', 'pillArrow', 'betweenLine', 'lockoutLine', 'regionSumLine', 'palindromeLine', 'renban', 'entropicLine', 'modularLine', 'sandwich', 'littleKiller', 'cage', 'cosmeticShape'].includes(constraint.type) && hasData(constraint.settings)) throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
    if (constraint.type === 'cosmeticShape') {
      rules.push(...readCoachDigitRestrictions(constraint))
    } else if (constraint.type === 'minimum' || constraint.type === 'maximum') {
      const { type, segments } = constraint
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key))) {
        throw new Error(`This Sudoku Coach puzzle has an invalid ${type} layer.`)
      }
      const cells = segments.map(segment => {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${type} cell.`)
        }
        return segment.cells[0]
      })
      if (cells.length) rules.push({ type, cells, ignoreMarkedNeighbors: true })
    } else if (constraint.type === 'odd' || constraint.type === 'even') {
      if (unsupportedClueStyling(constraint.settings)) throw new Error('This Sudoku Coach Odd/Even clue uses unsupported settings.')
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Odd/Even cells.')
      const cells: number[] = []
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Odd/Even cell.')
        }
        cells.push(segment.cells[0])
      }
      rules.push({ type: 'parity', cells, parity: constraint.type })
    } else if (constraint.type === 'littleKiller') {
      if (hasData(constraint.settings) && (!record(constraint.settings) || Object.keys(constraint.settings).some(key => key !== 'colour'))) {
        throw new Error('This Sudoku Coach Little Killer clue uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Little Killer clues.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || !Array.isArray(segment.cells[0]) ||
          segment.cells[0].length !== 2 || !segment.cells[0].every(value => Number.isInteger(value) && value >= -1 && value <= 9) ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'positive' && key !== 'value') ||
          typeof segment.parameters.positive !== 'boolean' || !Number.isInteger(segment.parameters.value) || Number(segment.parameters.value) < 1) {
          throw new Error('This Sudoku Coach puzzle has an invalid or cosmetic Little Killer clue.')
        }
        const [x, y] = segment.cells[0] as number[]
        const inside = (row: number, column: number) => row >= 0 && row < 9 && column >= 0 && column < 9
        if (inside(y, x)) throw new Error('This Sudoku Coach Little Killer clue must start outside the grid.')
        let dr = segment.parameters.positive ? -1 : 1, dc = 1
        if (!inside(y + dr, x + dc)) { dr = -dr; dc = -dc }
        if (!inside(y + dr, x + dc)) throw new Error('This Sudoku Coach Little Killer arrow misses the grid.')
        const cells: number[] = []
        for (let row = y + dr, column = x + dc; inside(row, column); row += dr, column += dc) cells.push(row * 9 + column)
        const direction = dr < 0 ? dc < 0 ? 'north-west' : 'north-east' : dc < 0 ? 'south-west' : 'south-east'
        rules.push({ type: 'little-killer', direction, cells, sum: Number(segment.parameters.value) })
      }
    } else if (constraint.type === 'sandwich') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'outsideLevel' && key !== 'textColour') ||
        settings.outsideLevel !== undefined && settings.outsideLevel !== 1)) {
        throw new Error('This Sudoku Coach Sandwich clue uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Sandwich clues.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length || !record(segment.parameters) ||
          Object.keys(segment.parameters).some(key => !['side', 'index', 'value'].includes(key))) {
          throw new Error('This Sudoku Coach puzzle has an invalid Sandwich clue.')
        }
        const { side, index, value } = segment.parameters
        if (typeof side !== 'string' || !['top', 'right', 'bottom', 'left'].includes(side) || !Number.isInteger(index) || Number(index) < 0 || Number(index) > 8 ||
          !Number.isInteger(value) || Number(value) < 0 || Number(value) > 35) throw new Error('This Sudoku Coach puzzle has an invalid Sandwich clue.')
        const size = grid?.size ?? 9
        const maximum = (size * (size + 1)) / 2 - size - 1
        if (typeof side !== 'string' || !['top', 'right', 'bottom', 'left'].includes(side) || !Number.isInteger(index) || Number(index) < 0 || Number(index) >= size ||
          !Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) throw new Error('This Sudoku Coach puzzle has an invalid Sandwich clue.')
        rules.push({ type: 'sandwich', ...coachOutsideRay(side as OutsideSide, Number(index), size), sum: Number(value) })
      }
    } else if (constraint.type === 'quadruple') {
      if (grid && !constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Quadruple clues.')
      const size = grid?.size ?? 9
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'digits') ||
          typeof segment.parameters.digits !== 'string' || !/^[1-9]{1,4}$/.test(segment.parameters.digits) ||
          [...segment.parameters.digits].some(digit => Number(digit) > size)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Quadruple clue.')
        }
        rules.push({ type: authoredRule === 'quad-arrows' ? 'quadruple-sum' : 'quadruple',
          topLeft: segment.cells[0], digits: [...segment.parameters.digits].map(Number) })
      }
    } else if (constraint.type === 'cage') {
      const { settings } = constraint
      if (hasData(settings) && (grid || !record(settings) || Object.keys(settings).some(key => key !== 'horizontalOffset') ||
        typeof settings.horizontalOffset !== 'number' || !Number.isFinite(settings.horizontalOffset) ||
        settings.horizontalOffset < 0 || settings.horizontalOffset > 100)) {
        throw new Error('This Sudoku Coach puzzle uses unsupported settings for cage.')
      }
      const cages = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !record(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Killer cage.')
        }
        const sum = segment.parameters.sum
        const unnumberedNineCellCage = authoredRule === 'magic-square' &&
          Object.keys(segment.parameters).length === 0 && segment.cells.length === 9
        if (!unnumberedNineCellCage &&
          (Object.keys(segment.parameters).length !== 1 || typeof sum !== 'number')) {
          throw new Error('This Sudoku Coach puzzle has an invalid Killer cage.')
        }
        return unnumberedNineCellCage
          ? { cells: segment.cells, sum: 45, showSum: false }
          : { cells: segment.cells, sum: sum as number }
      })
      if (!cages.length) throw new Error('This Sudoku Coach puzzle has no Killer cages.')
      rules.push({ type: 'killer-cages', cages })
    } else if (constraint.type === 'diagonalPositive' || constraint.type === 'diagonalNegative' || constraint.type === 'antiKnight' || constraint.type === 'antiKing' || constraint.type === 'nonconsecutive' || constraint.type === 'globalEntropy') {
      if (constraint.segments.length) throw new Error(`This Sudoku Coach puzzle uses unsupported cells for ${constraint.type}.`)
      if (constraint.type === 'globalEntropy') rules.push({ type: 'global-entropy' })
      else if (constraint.type === 'antiKnight') rules.push({ type: 'anti-knight' })
      else if (constraint.type === 'antiKing') rules.push({ type: 'anti-king' })
      else if (constraint.type === 'nonconsecutive') rules.push({ type: 'non-consecutive' })
      else rules.push({ type: 'diagonal', diagonal: constraint.type === 'diagonalNegative' ? 'main' : 'anti' })
    } else if (constraint.type === 'twoCellSum') {
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no two-cell sum clues.')
      const five: [number, number][] = [], ten: [number, number][] = []
      const totals: Extract<VariantRule, { type: 'adjacent-total' }>[] = []
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'sum')) {
          throw new Error('This Sudoku Coach puzzle has an invalid two-cell sum clue.')
        }
        const sum = segment.parameters.sum
        if (typeof sum !== 'number' || !Number.isInteger(sum) || sum < 3 || sum > 17) throw new Error('This Sudoku Coach two-cell sum must be an integer from 3 through 17.')
        if (sum === 5) five.push(segment.cells as [number, number])
        else if (sum === 10) ten.push(segment.cells as [number, number])
        else totals.push({ type: 'adjacent-total', cells: segment.cells as [number, number], sum })
      }
      if (five.length || ten.length) rules.push({ type: 'xv', ...(five.length > 0 && { five: { pairs: five } }), ...(ten.length > 0 && { ten: { pairs: ten } }) })
      rules.push(...totals)
    } else if (constraint.type === 'greaterLess') {
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no inequality signs.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid inequality sign.')
        }
        rules.push({ type: 'inequality', less: segment.cells[0], greater: segment.cells[1] })
      }
    } else if (constraint.type === 'difference' || constraint.type === 'ratio') {
      const kind = constraint.type
      const { markers, negative } = readCoachPairMarkers(constraint, kind)
      if (numbered.has(kind)) {
        const size = grid?.size ?? 9
        const min = kind === 'ratio' ? 2 : 1
        const max = kind === 'ratio' ? size : size - 1
        const marks = markers.map(({ cells, amount }) => {
          if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < min || amount > max) {
            throw new Error(`A ${kind} marker must be a whole number between ${min} and ${max}.`)
          }
          return { cells, value: amount }
        })
        if (marks.length || negative) rules.push({ type: 'labeled-dots', relation: kind, marks, ...(negative && { negative }) })
      } else {
        const marks = { pairs: markers.map(({ cells }) => cells), negative }
        rules.push(kind === 'difference'
          ? { type: 'kropki', consecutive: marks }
          : { type: 'kropki', ratioTwo: marks })
      }
    } else if (constraint.type === 'region') {
      const settings = constraint.settings
      if (unsupportedClueStyling(settings)) {
        throw new Error('This Sudoku Coach extra region uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no extra regions.')
      const color = record(settings) ? settings.colour : undefined
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid extra region.')
        }
        if (grid || segment.cells.length === 9) {
          rules.push({ type: 'extra-house', cells: segment.cells })
        } else {
          if (color !== undefined && !isHexColor(color)) throw new Error('This Sudoku Coach shaded group uses an unsupported color.')
          rules.push({ type: 'distinct-cells', cells: segment.cells, ...(color && { color }) })
        }
      }
    } else if (constraint.type === 'consecutiveLine') {
      const settings = constraint.settings
      const color = record(settings) ? settings.colour : undefined
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
        hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key))) ||
        color !== undefined && !isHexColor(color)) {
        throw new Error('This Sudoku Coach Consecutive Line uses unsupported settings.')
      }
      const size = grid?.size ?? 9
      const paths = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 2 || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Consecutive Line segment.')
        }
        return segment.cells as number[]
      })
      for (const cells of coachConsecutiveRuns(paths, size)) rules.push({ type: 'consecutive-run', cells, ...(color && { color }) })
    } else if (constraint.type === 'palindromeLine' || constraint.type === 'renban' || constraint.type === 'regionSumLine') {
      const name = constraint.type === 'renban' ? 'Renban' : constraint.type === 'regionSumLine' ? 'Region Sum' : 'Palindrome'
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no ${name} cells.`)
      const paths = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 81)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} segment.`)
        }
        return segment.cells as number[]
      })
      for (const line of coachConnectedLines(paths)) {
        if (constraint.type !== 'regionSumLine') {
          rules.push({ type: constraint.type === 'renban' ? 'renban' : 'palindrome', ...line })
          continue
        }
        const drawing = line.segments ?? [line.cells]
        const cells = closedRegionSumCells(line.cells, drawing, cell => grid
          ? gridRegionIndex(grid, cell) : regionIndex(cell, regions))
        rules.push({ type: 'region-sum', cells, groupByRegion: false,
          ...(line.segments || cells !== line.cells ? { segments: drawing } : {}) })
      }
    } else if (constraint.type === 'entropicLine' || constraint.type === 'modularLine') {
      const name = constraint.type === 'entropicLine' ? 'Entropic' : 'Modular'
      if (hasData(constraint.settings) && (!record(constraint.settings) || Object.keys(constraint.settings).some(key => !LINE_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no ${name} cells.`)
      // Coach jX1r7/jX1r8 compile each segment independently. Touching paths
      // must not use the connected-component grouping of Renban/Palindrome.
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 81)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} path.`)
        }
        rules.push({ type: constraint.type === 'entropicLine' ? 'entropic' : 'modular', cells: segment.cells })
      }
    } else if (constraint.type === 'betweenLine' || constraint.type === 'lockoutLine') {
      const lockout = constraint.type === 'lockoutLine'
      const name = lockout ? 'Lockout' : 'Between'
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
        !LINE_STYLING.has(key) && !BULB_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length && !lockout) throw new Error('This Sudoku Coach puzzle has no Between lines.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < (lockout ? 2 : 3) || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} line.`)
        }
        rules.push({ type: lockout ? 'lockout' : 'between', cells: segment.cells })
      }
    } else if (constraint.type === 'whisper') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'difference' && !LINE_STYLING.has(key)))) {
        throw new Error('This Sudoku Coach Whispers line uses unsupported settings.')
      }
      const difference = record(settings) ? settings.difference ?? 5 : 5
      if (!Number.isInteger(difference) || Number(difference) < 1 || Number(difference) > 8 || !constraint.segments.length) {
        throw new Error('This Sudoku Coach Whispers line has an unsupported minimum difference or no cells.')
      }
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an unsupported Whispers line.')
        }
        rules.push({ type: 'whispers', cells: segment.cells, minDifference: Number(difference) })
      }
    } else if (constraint.type === 'pillArrow') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key) && !BULB_STYLING.has(key) && key !== 'arrowHeadLength'))) {
        throw new Error('This Sudoku Coach Pill Arrow uses unsupported settings.')
      }
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 3 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Pill Arrow.')
        }
        const [first, start, ...cells] = segment.cells
        // Coach reads its two pill digits in row-major order even when drawn in reverse.
        const fromTens = start < first
        rules.push({ type: 'pill-arrow', pill: fromTens ? [start, first] : [first, start], cells, ...(fromTens && { fromTens }) })
      }
    } else if (constraint.type === 'thermometer' || constraint.type === 'arrow') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
        !LINE_STYLING.has(key) && (constraint.type === 'thermometer'
          ? key !== 'bulbSize' : !BULB_STYLING.has(key) && key !== 'arrowHeadLength')))) {
        throw new Error(`This Sudoku Coach ${constraint.type} uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no cells for ${constraint.type}.`)
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an unsupported ${constraint.type}.`)
        }
        if (constraint.type === 'thermometer') rules.push({ type: 'thermometer', cells: segment.cells })
        else {
          const [circle, ...cells] = segment.cells
          rules.push({ type: 'arrow', circle, cells })
        }
      }
    } else {
      throw new Error(`This Sudoku Coach rule is not supported yet (${constraint.type}).`)
    }
  }
  if (authoredRule === 'line-colours') {
    if (!(['entropic', 'modular', 'region-sum'] as const).every(type => rules.some(rule => rule.type === type))) {
      throw new Error('This Sudoku Coach export is missing a rule from its published line legend.')
    }
    rules.push(...readCoachColouredLines(drawnLines, regions))
  } else if (authoredRule === 'x-sum') {
    const clues = rules.filter(rule => rule.type === 'x-sum')
    if (!clues.length) throw new Error('This Sudoku Coach X-Sums puzzle has no outside totals.')
    if (new Set(clues.map(rule => `${rule.direction}:${rule.cells[0]}`)).size !== clues.length) {
      throw new Error('This Sudoku Coach puzzle has multiple X-Sums for the same side of a row or column.')
    }
  }
  // Coach exempts white-dot edges from its global Non-Consecutive rule.
  const whiteDots = rules.flatMap(rule => rule.type === 'kropki' ? rule.consecutive?.pairs ?? []
    : rule.type === 'labeled-dots' && rule.relation === 'difference' ? rule.marks.map(mark => mark.cells) : [])
  const exceptions = [...new Map(whiteDots.filter(([a, b]) => cellsShareEdge(a, b)).map(([a, b]) => {
    const pair = [Math.min(a, b), Math.max(a, b)] as const
    return [pair.join(','), pair] as const
  })).values()]
  if (exceptions.length) for (const [index, rule] of rules.entries()) {
    if (rule.type === 'non-consecutive') rules[index] = { ...rule, except: exceptions }
  }
  return rules
}

/** Decode a six-by-six Coach export without dropping active rules. */
export async function decodeCoachSix(code: string) {
  const data = await decodeCoach(code)
  if (data.gridSize !== 6) throw new Error('This Sudoku Coach puzzle does not have a 6 × 6 grid.')
  return readCoachSized(data)
}

async function readCoachSized(data: Record<string, unknown>, code?: string, publishedNonogram = false, publishedSkyscrapers = false,
  publishedXSums = false) {
  const { gridSize: size, regions } = data
  if (publishedNonogram && (size !== 6 || !Array.isArray(regions) || regions.length !== 0)) {
    throw new Error('The published Sudoku Coach Nonogram export does not match its reviewed 6 × 6 Latin square.')
  }
  if (publishedSkyscrapers && (size !== 7 || !Array.isArray(regions) || regions.length !== 0)) {
    throw new Error('The published Sudoku Coach Skyscrapers export does not match its reviewed 7 × 7 Latin square.')
  }
  const nonogramRules = publishedNonogram
    ? coachNonogramRules(Array.isArray(data.givenConstraints) ? data.givenConstraints : [], 6,
      'Fill the 6×6 grid with numbers 1 to 6 so that:\nEach number appears exactly once per row and once per column (Latin square rule).\nNumbers outside the grid indicate groups of consecutive even numbers (2, 4, 6) in that row or column. (For example, a clue "2 1" means a group of 2 even numbers followed later by a single even number.)\nGroups of even numbers are separated by at least one odd number (1, 3, 5).')
    : []
  const skyscrapersRules = publishedSkyscrapers
    ? coachSkyscrapersRules(Array.isArray(data.givenConstraints) ? data.givenConstraints : [], 7,
      'Skyscrapers: Digits displayed on the grid also represent heights of "skyscrapers". Larger values being taller skyscrapers than smaller ones. Clues outside the grid indicate the number of "skyscrapers" visible from that direction.')
    : []
  const fractionalRegions = code ? await readCoachFractionalRegions(code, data.givenConstraints, Number(size)) : undefined
  const rowEquations = code && size === 5
    ? await readReviewedCoachRowEquations(data.givenConstraints, 5) : undefined
  if (regions !== undefined && (!Array.isArray(regions) || !regions.every(label => Number.isInteger(label) && label >= 0))) {
    throw new Error('This Sudoku Coach puzzle has invalid regions.')
  }
  const labels = Array.isArray(regions) ? regions : undefined
  const distinct = isJigsawSize(size) && labels ? [...new Set<number>(labels)] : []
  const explicit = isJigsawSize(size) && labels?.length === size ** 2 && distinct.length === size
    ? { size, regions: regionsFromMembership(labels.map(label => distinct.indexOf(label)), size) } : undefined
  const wrappedExplicit = code && await coachExportHash(code) === coachWrappedJigsawExport && explicit &&
    explicit.regions.some(region => !connectedGridCells(region, Number(size))) &&
    explicit.regions.every(region => connectedGridCells(region, Number(size), true))
    ? { ...explicit, wrapAround: true as const } satisfies JigsawGrid
    : explicit
  const rectangular = isRectangularSize(size) && labels ? rectangularGridFromRegions(size, labels) : undefined
  const grid = size === 4 ? labels === undefined || hasMiniBoxes(labels) ? MINI_GRID : isJigsawGrid(wrappedExplicit, true) ? wrappedExplicit : undefined
    : size === 5 && labels?.length === 0 && (fractionalRegions || rowEquations) ? FIVE_BOXLESS_GRID
    : publishedNonogram ? SIX_BOXLESS_GRID
    : size === 7 && labels?.length === 0 ? SEVEN_BOXLESS_GRID
      : rectangular ?? (isJigsawSize(size) && isJigsawGrid(wrappedExplicit, true) ? wrappedExplicit : undefined)
  if (!grid) throw new Error(size === 4 && labels !== undefined && !hasMiniBoxes(labels) ? jigsawLayoutError(4)
    : size === 4 ? 'Mini Sudoku import requires four 2 × 2 boxes.'
      : isJigsawSize(size) ? jigsawLayoutError(size)
      : size === 8 ? 'Import requires eight rectangular boxes of 2 × 4 or 4 × 2 cells.'
        : 'Import requires six rectangular boxes of 2 × 3 or 3 × 2 cells.')
  const givens = data.givenDigits === undefined ? '0'.repeat(grid.size ** 2) : data.givenDigits
  if (typeof givens !== 'string' || !isGridText(givens, grid)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const progress = readCoachProgress(data, givens, grid.size)
  const rawCellColors = readCoachColourCells(data.colours, data.givenColours, grid.size)
  const palette = Array.isArray(data.colours) ? data.colours : []
  const paletteIsForPlayerProgress = Boolean(progress && (hasData(data.userColours) || hasData(data.userCellCandidatesColours)) &&
    !hasData(data.givenColours) && !rawCellColors?.some(Boolean))
  const regionLegend = rawCellColors?.length && 'regions' in grid
    ? readCoachColorNames(rawCellColors, palette) : undefined
  let givenCellColors = regionLegend && validGivenCellColors(regionLegend, undefined, grid) ? regionLegend : undefined
  let reviewedTitle: string | undefined
  if (!givenCellColors && (hasData(data.givenColours) || hasData(data.colours) && !paletteIsForPlayerProgress)) {
    const fills = rawCellColors?.length ? readCoachColorNames(rawCellColors, palette) : undefined
    reviewedTitle = fills ? await reviewedCoachFillTitle(data, fills) : undefined
    if (!fills || !reviewedTitle) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
    givenCellColors = fills
  }
  if (COACH_DRAWINGS.some(key => hasData(data[key])) && !progress?.importedDrawings ||
    (hasData(data.givenColours) && !givenCellColors) || (hasData(data.colours) && !givenCellColors && !paletteIsForPlayerProgress)) {
    throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
  }
  const constraints = data.givenConstraints === undefined ? [] : data.givenConstraints
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const active = constraints.filter(rule => !fractionalRegions?.artwork.has(rule) &&
    !(rowEquations && record(rule) && (rule.type === 'cosmeticCage' || rule.type === 'cosmeticText')) && !(record(rule) &&
    ['odd', 'even', 'thermometer', 'palindromeLine', 'renban'].includes(String(rule.type)) &&
    Object.keys(rule).every(key => ['id', 'type', 'segments', 'settings'].includes(key)) &&
    Array.isArray(rule.segments) && rule.segments.length === 0 &&
    (rule.settings === undefined || rule.settings === null || record(rule.settings) && Object.keys(rule.settings).length === 0)))
  const supported = ['diagonalNegative', 'diagonalPositive', 'antiKnight', 'antiKing', 'nonconsecutive', 'greaterLess', 'cage', 'region', 'odd', 'even', 'thermometer', 'betweenLine', 'renban', 'difference', 'ratio', 'arrow', 'regionSumLine', 'whisper', 'quadruple', 'modularLine', 'twoCellSum', 'littleKiller', 'sandwich', 'globalEntropy', ...(publishedNonogram || publishedSkyscrapers || publishedXSums ? ['cosmeticText'] : [])]
  if (active.some(rule => !record(rule) || !supported.includes(String(rule.type)))) {
    throw new Error(`This ${grid.size} × ${grid.size} Sudoku Coach export includes an unsupported active rule.`)
  }
  const ruleLayers = publishedNonogram || publishedSkyscrapers ? active.filter(rule => !record(rule) || rule.type !== 'cosmeticText') : active
  const rules = ruleLayers.flatMap((constraint): (VariantRule | SizedConstraintRule | SizedDifferenceRule | SizedLabeledDotsRule)[] => {
    if (publishedXSums && record(constraint) && constraint.type === 'cosmeticText') {
      if (!Array.isArray(constraint.segments)) throw new Error('This Sudoku Coach X-Sums layer has invalid labels.')
      return readCoachXSums(constraint, constraint.segments, Number(size))
    }
    if (record(constraint) && constraint.type === 'globalEntropy') {
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
        !Array.isArray(constraint.segments) || constraint.segments.length !== 0) {
        throw new Error('This Sudoku Coach Global Entropy layer has unsupported cells or fields.')
      }
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'groups'))) {
        throw new Error('This Sudoku Coach Global Entropy layer has unsupported settings.')
      }
      const groups = record(settings) && Array.isArray(settings.groups) ? settings.groups : undefined
      if (!groups || groups.length !== 3 || groups.some(group => !Array.isArray(group) ||
        group.length === 0 || group.some(digit => !Number.isInteger(digit) || digit < 1 || digit > grid.size)) ||
        groups.flat().length !== grid.size || new Set(groups.flat()).size !== grid.size) {
        throw new Error('This Sudoku Coach Global Entropy layer needs three explicit digit groups on this grid.')
      }
      return [{ type: 'global-entropy', ...(groups && { groups }) }]
    }
    if (record(constraint) && constraint.type === 'greaterLess') {
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
        hasData(constraint.settings) || !Array.isArray(constraint.segments)) {
        throw new Error('This Sudoku Coach puzzle has an inequality layer with unsupported fields or settings.')
      }
      if (constraint.segments.length === 0) throw new Error('This Sudoku Coach puzzle has no inequality signs.')
      return constraint.segments.map(segment => {
        if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
          !Array.isArray(segment.cells) || segment.cells.length !== 2 || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= grid.size ** 2) || segment.cells[0] === segment.cells[1] ||
          !gridCellsShareEdge(segment.cells[0], segment.cells[1], grid.size)) throw new Error('This Sudoku Coach puzzle has an invalid inequality sign.')
        return { type: 'inequality', less: segment.cells[0], greater: segment.cells[1] }
      })
    }
    if (record(constraint) && constraint.type === 'nonconsecutive') {
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
        !Array.isArray(constraint.segments) || constraint.segments.length !== 0 || hasData(constraint.settings)) {
        throw new Error('This Sudoku Coach Non-Consecutive layer uses unsupported settings or cells.')
      }
      const except = constraints.flatMap(layer => {
        if (!record(layer) || layer.type !== 'difference') return []
        const { markers } = readCoachPairMarkers(layer, 'difference')
        return markers.filter(marker => marker.amount === 1 && Number.isInteger(marker.cells[0]) && Number.isInteger(marker.cells[1]) &&
          marker.cells.every(cell => cell >= 0 && cell < grid.size ** 2) && gridCellsShareEdge(marker.cells[0], marker.cells[1], grid.size))
          .map(({ cells: [a, b] }) => [Math.min(a, b), Math.max(a, b)] as const)
      })
      return [{ type: 'non-consecutive', ...(except.length && { except }) }]
    }
    if (record(constraint) && constraint.type === 'littleKiller' && publishedNonogram &&
      Array.isArray(constraint.segments) && constraint.segments.length === 0 &&
      (!hasData(constraint.settings) || record(constraint.settings) && Object.keys(constraint.settings).length === 0)) return []
    if (record(constraint) && constraint.type === 'littleKiller') return readCoachSizedLittleKiller(constraint, grid.size)
    if (!record(constraint) || constraint.type !== 'difference' && constraint.type !== 'ratio') return readCoachRules([constraint], { grid })
    const relation = constraint.type
    const { markers, negative } = readCoachPairMarkers(constraint, relation)
    const ratio = relation === 'ratio'
    if (markers.every(({ amount }) => amount === (ratio ? 2 : 1))) {
      const layer = { pairs: markers.map(({ cells }) => cells), negative }
      return [ratio ? { type: 'kropki', ratioTwo: layer } : { type: 'kropki', consecutive: layer }]
    }
    const minimum = ratio ? 2 : 1, maximum = ratio ? grid.size : grid.size - 1
    const marks = markers.map(({ cells, amount }) => {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < minimum || amount > maximum) {
        throw new Error(`A ${ratio ? 'Ratio' : 'Difference'} marker on this grid must be a whole number between ${minimum} and ${maximum}.`)
      }
      return { cells, value: amount }
    })
    return ratio || negative ? [{ type: 'labeled-dots', relation, marks, negative }]
      : marks.map(({ cells, value }) => ({ type: 'difference', cells, difference: value }))
  })
  if (rowEquations) rules.push(...rowEquations)
  rules.push(...nonogramRules, ...skyscrapersRules)
  if (fractionalRegions) rules.push(fractionalRegions.rule)
  if (publishedXSums && !rules.some(rule => rule.type === 'x-sum')) {
    throw new Error('This Sudoku Coach X-Sums puzzle has no outside totals.')
  }
  if (!isSizedRuleList(rules, grid)) throw new Error('This Sudoku Coach export contains invalid rules.')
  return { version: 2 as const, grid, givens, rules, ...(progress && { progress }),
    ...(givenCellColors && { givenCellColors }), ...(reviewedTitle && { reviewedTitle }) }
}

function readCoachSizedLittleKiller(constraint: Record<string, unknown>, size: number): VariantRule[] {
  if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
    hasData(constraint.settings) && (!record(constraint.settings) || Object.keys(constraint.settings).some(key => key !== 'colour'))) {
    throw new Error('This Sudoku Coach Little Killer clue uses unsupported settings.')
  }
  if (!Array.isArray(constraint.segments) || constraint.segments.length === 0) throw new Error('This Sudoku Coach puzzle has no Little Killer clues.')
  return constraint.segments.map(segment => {
    if (!record(segment) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 || !Array.isArray(segment.cells[0]) ||
      segment.cells[0].length !== 2 || !segment.cells[0].every(value => Number.isInteger(value) && value >= -1 && value <= size) ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'positive' && key !== 'value') ||
      typeof segment.parameters.positive !== 'boolean' || !Number.isInteger(segment.parameters.value) || Number(segment.parameters.value) < 1) {
      throw new Error('This Sudoku Coach puzzle has an invalid or cosmetic Little Killer clue.')
    }
    const [x, y] = segment.cells[0] as number[]
    const inside = (row: number, column: number) => row >= 0 && row < size && column >= 0 && column < size
    if (inside(y, x)) throw new Error('This Sudoku Coach Little Killer clue must start outside the grid.')
    let dr = segment.parameters.positive ? -1 : 1, dc = 1
    if (!inside(y + dr, x + dc)) { dr = -dr; dc = -dc }
    if (!inside(y + dr, x + dc)) throw new Error('This Sudoku Coach Little Killer arrow misses the grid.')
    const cells: number[] = []
    for (let row = y + dr, column = x + dc; inside(row, column); row += dr, column += dc) cells.push(row * size + column)
    const direction = dr < 0 ? dc < 0 ? 'north-west' : 'north-east' : dc < 0 ? 'south-west' : 'south-east'
    const sum = Number(segment.parameters.value)
    if (sum < cells.length || sum > size * cells.length) throw new Error('This Sudoku Coach Little Killer clue has an impossible sum.')
    return { type: 'little-killer', direction, cells, sum }
  })
}

function readPublication(coach: unknown): CoachPublication | null {
  return record(coach) && typeof coach.hasAuthorInstructions === 'boolean'
    ? { hasAuthorInstructions: coach.hasAuthorInstructions,
      ...((coach.authoredRule === 'x-sum' || coach.authoredRule === 'all-black-dots' ||
        coach.authoredRule === 'line-colours' || coach.authoredRule === 'mirrored-renban' || coach.authoredRule === 'quad-arrows' || coach.authoredRule === 'partial-regions' || coach.authoredRule === 'inside-grid' || coach.authoredRule === 'lettered-quadruples' || coach.authoredRule === 'neighbor-match' || coach.authoredRule === 'magic-square' || coach.authoredRule === 'unknown-cage-sums' || coach.authoredRule === 'distant-neighbors' || coach.authoredRule === 'entropic-breaks' || coach.authoredRule === 'entropic-group-order' || coach.authoredRule === 'entropy-window-groups' || coach.authoredRule === 'aqre-snake' || coach.authoredRule === 'xv-empty-cosmetic-cage' || coach.authoredRule === 'aqre-plus' || coach.authoredRule === 'reviewed-artwork' || coach.authoredRule === 'wrapped-regions' || coach.authoredRule === 'sized-nonogram' || coach.authoredRule === 'sized-skyscrapers' || coach.authoredRule === 'sized-entropic-runaround') && { authoredRule: coach.authoredRule }),
      ...(isCoachTypedDeclaration(coach.declaredRules) && { declaredRules: coach.declaredRules }),
      ...(coach.whispersGuide === true && { whispersGuide: true }),
      title: typeof coach.title === 'string' ? coach.title.trim().slice(0, 72) : undefined }
    : null
}

export const sudokuCoach = {
  format: 'Sudoku Coach',
  links: {
    domains: ['sudoku.coach'],
    async read(url) {
      const collection = COACH_COLLECTION_LINK.exec(url.pathname)
      if (collection) {
        const [, path, id] = collection
        const { code, coach } = await fetchPublishedExport('sudoku-coach', `collections/${path}/${id}`)
        return fromCoach(code, readPublication(coach), true)
      }
      const id = url.pathname.match(/^\/(?:[a-z]{2}\/)?s\/([A-Za-z0-9]{1,16})\/?$/i)?.[1]
      if (id) {
        const { code, coach } = await fetchPublishedExport('sudoku-coach', id)
        return fromCoach(code, readPublication(coach))
      }
      const code = url.pathname.match(/^\/(?:[a-z]{2}\/)?(?:play|solver|construct)\/([^/]+)\/?$/i)?.[1] ?? ''
      if (code.toLowerCase().startsWith('scv') || COACH_WHOLE_PROGRESS.test(code)) return fromCoach(decodeURIComponent(code))
      if (/^[0-4.]{16}$/.test(code)) return { givens: code.replaceAll('.', '0'), grid: MINI_GRID }
      if (/^[0-9.]{81}$/.test(code)) return { givens: normalizeGivens(code) }
      throw new Error('This Sudoku Coach link does not contain a puzzle code. Open it and use Copy → Puzzle.')
    },
  },
  readText(text) {
    if (text.toLowerCase().startsWith('scv') || COACH_WHOLE_PROGRESS.test(text)) return fromCoach(text)
  },
} as const satisfies PuzzleImporter
