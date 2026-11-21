import type { AdjacentClue, AdjacentClues } from '../latin/adjacent-clues.ts'
import type { LatinClues, LatinPathClue } from '../latin/path-clues.ts'
import type { LatinParity } from '../latin/parity.ts'
import type { WhisperLine } from '../latin/whispers.ts'
import { readCoachAuthoredPaths } from '../number-puzzles/coach-authored-paths.ts'
import type { NumberImportAnnotations } from '../number-puzzles/imported-annotations.ts'
import type { NumberPosition } from '../number-puzzles/progress.ts'
import type { CalcudokuImport } from '../calcudoku/imported.ts'
import type { FutoshikiEntry } from '../futoshiki/catalog.ts'
import type { Inequality } from '../futoshiki/engine.ts'
import lzString from 'lz-string'
import type { CollectionReference } from './collection-reference.ts'
import type { SizedConstraintRule, SizedDifferenceRule, SizedLabeledDotsRule, VariantPuzzle, VariantRule } from './engine.ts'
import { parsePuzzle, textGridCells } from './formats.ts'
import { gridRegionIndex, isGridText, isMiniGrid, isJigsawGrid, isJigsawSize, isRectangularSize, MINI_GRID, rectangularGridFromRegions, regionsFromMembership, SEVEN_BOXLESS_GRID, type SizedGrid } from './grid.ts'
import { EMPTY, type Position } from './game.ts'
import { isImportedColor, validImportedCellColors, type CandidateColors, type ImportedCellColors } from './imported-colors.ts'
import { readCoachQuickDraw } from './imported-drawings.ts'
import { readReviewedCoachArtwork, type AuthoredMark } from './authored-artwork.ts'
import { isFogDefinition, type FogDefinition } from './fog.ts'
import { downloadSharedPuzzle, isSharedPuzzleId } from './puzzle-sharing.ts'
import { coachConnectedLines } from './coach-lines.ts'
import { readCoachColouredLines } from './coach-coloured-lines.ts'
import { isCoachWhispersGuide } from './coach-whispers-guide.ts'
import { decodeLegacyCoach, type LegacyCoachVersion } from './legacy-coach.ts'
import type { OutsideSide } from './outside-clues.ts'
import { validQuadruple, type Quadruple } from './quadruple.ts'
import { closedRegionSumCells, regionIndex } from './region-sum.ts'
import { decodeSizedSudokuPad, decodeSudokuPadEnvelope } from './sized-sudoku-pad.ts'
import { isAlgebraicCageList } from './algebraic-cages.ts'
import { readLinkedDoubleArrowSudokuPad, readSizedRuleSudokuPad } from './sized-rule-sudoku-pad.ts'
import { isSizedRuleList, type SizedRuleGame } from './sized-rule-game.ts'
import type { AlgebraicDefinition } from './algebraic-game.ts'
import { cellsShareEdge, isPlayablePuzzle, isPuzzleVariantId, variantIdForPuzzle, type VariantGame } from './variants.ts'

export const MAX_IMPORT_LENGTH = 20_000
const MAX_DECODED_LENGTH = 128_000
const MAX_COACH_PROGRESS_LENGTH = 1_048_576
const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'
const COACH_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const DIGIT_RUNS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'
const COACH_CODE = /^SCv([0-9]+)_([0-9]+)_/i
const COACH_WHOLE_PROGRESS = /^32_/
const LEGACY_COACH_CODE = /^SCv([3-6])_/i
const COACH_COLLECTION_LINK = /^\/(?:[a-z]{2}\/)?collections\/((?:[a-z0-9-]{1,64}\/){0,3}[a-z0-9-]{1,64})\/s\/([A-Za-z0-9]{1,16})\/?$/
const FP_CODE = /^fpuz(?:zles)?/i
const COACH_FIELDS = new Set([
  'gridSize', 'givenDigits', 'regions', 'givenConstraints', 'meta', 'metaSolver', 'colours',
  'constructorPreviewDigits', 'constructorConstructionParameters', 'quickDrawLineSegments', 'quickDrawSymbols', 'cells', 'acid', 'givenColours',
])
const COACH_DRAWINGS = ['quickDrawLineSegments', 'quickDrawSymbols', 'cells']
const COACH_AUTHORED_MARKINGS = [...COACH_DRAWINGS, 'givenColours', 'colours']
const FPUZZLES_BASE_FIELDS = ['size', 'grid', 'title', 'author', 'ruleset', 'solution', 'successMessage']
const FPUZZLES_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'killercage', 'clone', 'diagonal+', 'diagonal-'])
const FPUZZLES_EIGHT_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'killercage', 'diagonal+', 'diagonal-'])
const FPUZZLES_JIGSAW_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'thermometer', 'difference', 'ratio', 'negative', 'xv', 'cage', 'highlightConflicts', 'rectangle'])
const PLAIN_RULES = /^\s*(?:(?:normal|standard) (?:classic )?sudoku rules apply[.!]?)?\s*$/i
const FP_JIGSAW_BASE = /^(?:normal|standard) irregular(?: ([57])\s*[×x]\s*\1)? sudoku rules apply(?:\.|: fill each row, column and region with the digits 1[-–]([57])\.)$/i
const FP_JIGSAW_THERMOMETER = /^(?:Digits along a thermometer must strictly increase from the bulb to the end|Thermometers: Digits along a thermometer must increase starting at the bulb)\.$/i
const FP_ANTI_SUM = /^Anti-Sum(?: \((\d{1,2})\))?: Digits in orthogonally (?:adjacent|connected) cells may not sum to (\d{1,2})\.$/i
const FP_JIGSAW_DOTS = /^A white dot with a number in it implies the difference between two cells\. A black dot with a number in it implies the ratio relationship between two cells\.$/i
const FP_ROW_COLUMN_SUM = /^Diamond-Sum: Digits in cells horizontally connected by a diamond sum to their row index\. Digits in cells vertically connected by a diamond sum to their column index\.(?: (Not all diamonds are given\.))?$/i
const PLAIN_EIGHT_RULES = /^\s*(?:normal|standard) 8\s*[×x]\s*8 sudoku rules apply[.!]?\s*$/i
const PLAIN_MINI_RULES = /^\s*(?:normal|standard) 4\s*[×x]\s*4 sudoku rules apply[.!]?\s*$/i

export type ImportFormat = 'Sudoku Coach' | 'Sudoku Exchange' | 'SudokuPad' | 'f-puzzles' | 'Puzzle link' | 'HoDoKu' | 'Text grid'
export type ImportedPuzzle = {
  givens: string
  format: ImportFormat
  futoshiki?: FutoshikiEntry
  calcudoku?: CalcudokuImport
  variant?: Pick<VariantGame, 'id' | 'puzzle' | 'fog'>
  grid?: SizedGrid
  sizedRules?: SizedRuleGame['rules']
  sizedAuthor?: string
  authoredSolution?: string
  algebraic?: AlgebraicDefinition
  title?: string
  sharedPuzzleId?: string
  collection?: CollectionReference
  progress?: Pick<Position, 'entries' | 'center' | 'corner' | 'importedCellColors' | 'importedCandidateColors' | 'importedDrawings'>
  givenCellColors?: ImportedCellColors
  authoredArtwork?: readonly AuthoredMark[]
  whispersGuide?: true
}

export async function importSharedPuzzle(id: string, signal?: AbortSignal): Promise<ImportedPuzzle> {
  const { givens, variant, collection, title, grid, algebraic, sizedRules, sizedAuthor, whispersGuide, givenCellColors, authoredArtwork } = await downloadSharedPuzzle(id, signal)
  const sizing = algebraic && 'sudokuPad' in algebraic ? decodeSizedSudokuPad(algebraic.sudokuPad) : undefined
  if (sizing && sizing.givens !== givens) throw new Error('The SudokuPad definition does not match the shared givens.')
  const cages = sizing ? { rules: sizing.rules, source: sizing.source } : algebraic && 'rules' in algebraic ? algebraic : undefined
  return { givens, variant, collection, title, grid, sizedRules, sizedAuthor, ...(cages && { algebraic: cages }),
    ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }), ...(authoredArtwork && { authoredArtwork }),
    sharedPuzzleId: id.toLowerCase(), format: 'Puzzle link' }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasData(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (record(value)) return Object.keys(value).length > 0
  return value !== undefined && value !== null && value !== false && value !== ''
}

const CLUE_STYLING = new Set(['opacity', 'colour', 'shapeSize', 'borderColour', 'borderThickness'])
const LINE_STYLING = new Set(['colour', 'colourSync', 'lineThickness', 'lineEndOffset', 'borderColour', 'borderThickness', 'opacity'])
const BULB_STYLING = new Set(['bulbSize', 'bulbBorderThickness', 'bulbBorderColour', 'bulbFillColour'])
function unsupportedClueStyling(settings: unknown) {
  return hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !CLUE_STYLING.has(key)))
}

function standardRegion(cell: number) {
  return Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
}

function readRegions(labels: unknown): VariantPuzzle['regions'] {
  if (labels === undefined) return
  if (!Array.isArray(labels) || labels.length !== 81 ||
    labels.some((label) => !Number.isInteger(label) || label < 0 || label > 9)) {
    throw new Error('This puzzle has an invalid region map.')
  }
  const groups = new Map<number, number[]>()
  labels.forEach((label, cell) => {
    const group = groups.get(label)
    if (group) group.push(cell)
    else groups.set(label, [cell])
  })
  const regions = [...groups.values()]
  if (regions.length === 9 && regions.every((region) => region.length === 9 &&
    region.every((cell) => standardRegion(cell) === standardRegion(region[0])))) return
  return { type: 'jigsaw', regions }
}

function hasMiniBoxes(labels: unknown): boolean {
  if (!Array.isArray(labels) || labels.length !== 16 || labels.some(label => !Number.isInteger(label) || label < 0)) return false
  const topLeftCells = [0, 2, 8, 10]
  const expected = topLeftCells.map(cell => labels[cell])
  return new Set(expected).size === 4 && labels.every((label, cell) =>
    label === expected[Math.floor(cell / 8) * 2 + Math.floor(cell % 4 / 2)])
}

function makeImportedPuzzle(format: ImportFormat, givens: string, rules: VariantRule[], regions: VariantPuzzle['regions'], fog?: FogDefinition): ImportedPuzzle {
  const puzzle: VariantPuzzle = { version: 1, givens, ...(regions && { regions }), ...(rules.length && { rules }) }
  // Validate the complete rule list before using it to choose a display name.
  if (!rules.length && !regions && !fog) return { givens, format }
  if (!isPlayablePuzzle('mixed', puzzle, fog)) throw new Error('This puzzle has unsupported or invalid rules.')
  const id = fog ? 'mixed' : variantIdForPuzzle(puzzle)
  if (id === 'classic') return { givens, format }
  return { givens, format, variant: { id, puzzle, ...(fog && { fog }) } }
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

function parseJSON(text: string, format: ImportFormat, limit = MAX_DECODED_LENGTH): unknown {
  try {
    if (text && text.length <= limit) return JSON.parse(text)
  } catch { /* Show a format-specific error below. */ }
  throw new Error(`This ${format} puzzle is unreadable. Copy it again and try once more.`)
}

async function decodeCoach(code: string): Promise<Record<string, unknown>> {
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
    // An export stores serialized snapshots and the index of the visible one.
    const invalid = () => new Error('This Sudoku Coach progress has an invalid puzzle snapshot.')
    if (!record(data) || typeof data.i !== 'number' || !Number.isSafeInteger(data.i) ||
      !Array.isArray(data.a) || data.i < 0 || data.i >= data.a.length || typeof data.a[data.i] !== 'string') throw invalid()
    const snapshot = parseJSON(data.a[data.i], 'Sudoku Coach')
    if (!record(snapshot) || snapshot.version !== 7) throw invalid()
    const { version, ...puzzle } = snapshot
    data = puzzle
  }
  if (!record(data)) throw new Error('This Sudoku Coach puzzle is unreadable.')
  for (const [key, value] of Object.entries(data)) {
    if (!COACH_FIELDS.has(key) && !key.startsWith('user') && hasData(value)) {
      throw new Error(`This Sudoku Coach puzzle uses an unsupported field (${key}).`)
    }
  }
  return data
}

type CoachTypedDeclaration = { globalEntropy: true; adjacentTotals: readonly [7, 13] }
  | { cageTotals: readonly [number, number] }
type CoachPublication = {
  hasAuthorInstructions: boolean
  title?: string
  authoredRule?: 'x-sum' | 'all-black-dots' | 'line-colours' | 'mirrored-renban'
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
  const cells = readCoachColourCells(data.colours, data.userColours, size ** 2)
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
    const match = /^([1-7]\d|80|\d)\+([1-9])\+([0-9A-Za-z])$/.exec(mark)
    if (!match) throw invalid()
    const cell = Number(match[1]), digit = Number(match[2]), shade = palette[COACH_BASE62.indexOf(match[3])]
    if (cell >= size ** 2 || digit > size || !isImportedColor(shade) || colors[cell]?.[digit] !== undefined) throw invalid()
    const cellColors = colors[cell] ??= {}
    cellColors[digit] = shade
  }
  return colors
}

function readCoachProgressDigits(value: unknown, givens: string, size: number) {
  const digits = value === undefined || value === '' ? '0'.repeat(givens.length) : value
  if (typeof digits !== 'string' || digits.length !== givens.length || !/^\d+$/.test(digits) ||
    [...digits].some(digit => Number(digit) > size)) {
    throw new Error('This Sudoku Coach progress has invalid placed digits.')
  }
  if ([...digits].some((digit, cell) => digit !== '0' && givens[cell] !== '0' && digit !== givens[cell])) {
    throw new Error('The Sudoku Coach progress has a placed digit that replaces a given.')
  }
  return [...digits].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
}

function readCoachNumberPosition(data: Record<string, unknown>, givens: string, size: number): NumberPosition | undefined {
  if (![data.userDigits, data.userCellCandidates, data.userBoxCandidates].some(hasData)) return
  const values = Array.from(readCoachProgressDigits(data.userDigits, givens, size), Number)
  const notes = readCoachCandidateMasks(data.userCellCandidates, size).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  const cornerNotes = readCoachCandidateMasks(data.userBoxCandidates, size).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  if (values.some(Boolean) || notes.some(Boolean) || cornerNotes.some(Boolean)) return { values, notes, cornerNotes }
}

function readCoachNumberAnnotations(data: Record<string, unknown>, size: number, published: boolean, layers: readonly unknown[]): NumberImportAnnotations | undefined {
  const codes = readCoachColourCells(data.colours, data.givenColours, size ** 2)
  const givenColors = codes?.length ? readCoachColorNames(codes, data.colours as unknown[]) : undefined
  if (!codes || codes.length && !givenColors) throw new Error('This Sudoku Coach puzzle has unsupported cell colors.')
  const cellColors = readCoachPlayerColors(data, size)
  const candidateColors = readCoachCandidateColors(data.colours, data.userCellCandidatesColours, size)
  const quickDraw = readCoachQuickDraw(data, size)
  const authoredPaths = readCoachAuthoredPaths(layers, size)
  if (givenColors || cellColors || candidateColors || quickDraw || authoredPaths) {
    return { ...(givenColors && { givenColors }), ...(cellColors && { cellColors }), ...(candidateColors && { candidateColors }),
      ...(authoredPaths && { authoredPaths }), ...(quickDraw && (published ? { givenDrawings: quickDraw } : { drawings: quickDraw })) }
  }
}

function readCoachProgress(data: Record<string, unknown>, givens: string): ImportedPuzzle['progress'] {
  const importedDrawings = readCoachQuickDraw(data)
  if (!importedDrawings && ![data.userDigits, data.userCellCandidates, data.userBoxCandidates, data.userColours, data.userCellCandidatesColours].some(hasData)) return
  const importedCellColors = readCoachPlayerColors(data)
  const importedCandidateColors = readCoachCandidateColors(data.colours, data.userCellCandidatesColours)
  const entries = readCoachProgressDigits(data.userDigits, givens, 9)
  const center = readCoachCandidateMasks(data.userCellCandidates).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  const corner = readCoachCandidateMasks(data.userBoxCandidates).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  if (entries !== EMPTY || center.some(Boolean) || corner.some(Boolean) || importedCellColors || importedCandidateColors || importedDrawings) {
    return { entries, center, corner, ...(importedCellColors && { importedCellColors }),
      ...(importedCandidateColors && { importedCandidateColors }), ...(importedDrawings && { importedDrawings }) }
  }
}

function readCoachColourCells(colours: unknown, value: unknown, cellCount = 81): string[] | undefined {
  if (value === undefined || value === '') return []
  if (typeof value !== 'string') return
  const cellColours = value.split(',')
  if (cellColours.length !== cellCount) return
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

function checkStandaloneCoachPublication(publication?: CoachPublication | null) {
  if (publication === null) throw new Error('Open this short link in Sudoku Coach, then use Copy → Puzzle.')
  if (publication?.hasAuthorInstructions) {
    throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
  }
}

function isCoachBoxlessOnlyLayer(layer: unknown) {
  return record(layer) && (layer.type === 'antiKnight' || layer.type === 'globalEntropy' || layer.type === 'quadruple' || layer.type === 'pillArrow' || layer.type === 'cosmeticLine' || layer.type === 'greaterLess' || layer.type === 'twoCellSum' || layer.type === 'whisper' ||
    (layer.type === 'palindromeLine' || layer.type === 'consecutiveLine' || layer.type === 'lockoutLine' || layer.type === 'betweenLine') && (!Array.isArray(layer.segments) || layer.segments.length > 0))
}

function needsStandaloneSevenGrid(layers: readonly unknown[]) {
  return layers.some(layer => isCoachBoxlessOnlyLayer(layer) || record(layer) && layer.type === 'region' &&
    Array.isArray(layer.segments) && layer.segments.some(segment =>
      record(segment) && Array.isArray(segment.cells) && segment.cells.length !== 7))
}

function isCoachBoxlessLayer(layer: unknown) {
  return isCoachBoxlessOnlyLayer(layer) || record(layer) && (layer.type === 'difference' || layer.type === 'ratio' ||
    layer.type === 'palindromeLine' || layer.type === 'consecutiveLine' || layer.type === 'lockoutLine' || layer.type === 'betweenLine' || layer.type === 'thermometer' || layer.type === 'arrow' || layer.type === 'renban' || layer.type === 'region' ||
    layer.type === 'odd' || layer.type === 'even')
}

async function fromCoach(code: string, publication?: CoachPublication | null, fromCollection = false): Promise<ImportedPuzzle> {
  const data: Record<string, unknown> = /^[0-9]{81}$/.test(code) ? { gridSize: 9, givenDigits: code } : await decodeCoach(code)
  const futoshiki = await readCoachFutoshiki(data, Boolean(publication))
  if (futoshiki) {
    checkStandaloneCoachPublication(publication)
    return futoshiki
  }
  const { gridSize: size, regions: encodedRegions, givenConstraints: layers } = data
  if (typeof size === 'number' && Number.isInteger(size) && size >= 3 && size <= 9 &&
    Array.isArray(encodedRegions) && encodedRegions.length === 0 && Array.isArray(layers) &&
    layers.some(layer => record(layer) && (layer.type === 'cosmeticCage' || layer.type === 'cage' &&
      (size !== 7 || needsStandaloneSevenGrid(layers))))) {
    checkStandaloneCoachPublication(publication)
    const annotations = readCoachNumberAnnotations(data, size, Boolean(publication), layers)
    const { givenColors, ...otherAnnotations } = annotations ?? {}
    // Keep the same portable definition for the existing single-color cages.
    const colors = givenColors && Object.values(givenColors).every(shades => shades?.length === 1)
      ? Array.from({ length: size ** 2 }, (_, cell) => givenColors[cell]?.[0] ?? '') : []
    const { readCoachCalcudoku } = await import('../calcudoku/imported.ts')
    const cages = layers.filter(layer => !isCoachBoxlessLayer(layer))
    const calcudoku = readCoachCalcudoku({ ...data, givenConstraints: cages }, colors,
      readCoachInequalities(layers), readCoachLatinClues(layers, size))
    const position = readCoachNumberPosition(data, calcudoku.givens, calcudoku.size)
    if (position) calcudoku.position = position
    const retainedAnnotations = colors.length ? otherAnnotations : annotations
    if (retainedAnnotations && Object.keys(retainedAnnotations).length) calcudoku.annotations = retainedAnnotations
    return { givens: calcudoku.givens, format: 'Sudoku Coach', calcudoku }
  }
  if (data.gridSize === 4 || isRectangularSize(data.gridSize) || isJigsawSize(data.gridSize)) {
    if (fromCollection && (!publication || publication.hasAuthorInstructions)) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    const { givens, grid, rules } = readCoachSized(data)
    return { givens, grid, ...(grid.size !== 4 || rules.length ? { sizedRules: rules } : {}),
      ...(fromCollection && publication?.title && { title: publication.title }), format: 'Sudoku Coach' }
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
  const reviewedArtwork = await readReviewedCoachArtwork(code, constraints)
  const regions = readRegions(data.regions)
  const guideLayers = constraints.every(layer => record(layer) &&
    ['whisper', 'cosmeticShape', 'cosmeticText'].includes(String(layer.type))) &&
    constraints.some(layer => layer.type === 'whisper') && constraints.some(layer => layer.type === 'cosmeticShape')
    ? constraints.filter(layer => layer.type !== 'whisper') : []
  const encodedRules = guideLayers.length ? constraints.filter(layer => layer.type === 'whisper')
    : reviewedArtwork ? constraints.filter(layer => layer !== reviewedArtwork.layer) : constraints
  const rules = readCoachRules(encodedRules, { regions, authoredRule: publication?.authoredRule })
  const cellColours = readCoachColourCells(data.colours, data.givenColours)
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
  let givenCellColors: ImportedCellColors | undefined
  if (!whispersGuide && !declaredMirroredRenban) {
    const remaining = coachColoursWithoutExtraHouses(cellColours, rules)
    if (remaining.some(Boolean) && !coachMirroredRenbansMatch(remaining, rules, false)) {
      if (!fog && !rules.length && (!regions || regions.type === 'boxes') &&
        !publication?.hasAuthorInstructions && (fromCollection || LEGACY_COACH_CODE.test(code))) {
        givenCellColors = readCoachColorNames(remaining, palette)
        if (!givenCellColors) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
      } else {
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
  const imported = makeImportedPuzzle('Sudoku Coach', givens, rules, regions, fog)
  const progress = readCoachProgress(data, givens)
  const title = publication?.title ?? reviewedArtwork?.title
  return { ...imported, ...(title && { title }), ...(progress && { progress }),
    ...(reviewedArtwork && { authoredArtwork: reviewedArtwork.artwork }),
    ...(whispersGuide && { whispersGuide: true }), ...(givenCellColors && { givenCellColors }) }
}

async function readCoachFutoshiki(data: Record<string, unknown>, published: boolean): Promise<ImportedPuzzle | undefined> {
  if (!Array.isArray(data.regions) || data.regions.length !== 0) return
  const constraints = data.givenConstraints ?? []
  if (!Array.isArray(constraints) || constraints.some(layer => !isCoachBoxlessLayer(layer))) return
  const size = data.gridSize
  // Keep the existing Sudoku route for 7 × 7 boxless grids with its supported rules.
  if (size === 7 && !needsStandaloneSevenGrid(constraints)) return

  const { createImportedFutoshiki, isFutoshikiSize } = await import('../futoshiki/imported.ts')
  if (!isFutoshikiSize(size)) return
  const inequalities = readCoachInequalities(constraints)
  const givens = data.givenDigits === undefined ? '0'.repeat(size ** 2) : data.givenDigits
  if (typeof givens !== 'string' || givens.length !== size ** 2 || !/^\d+$/.test(givens) ||
    [...givens].some(digit => Number(digit) > size)) {
    throw new Error('This Sudoku Coach puzzle has invalid givens.')
  }

  const position = readCoachNumberPosition(data, givens, size)
  const annotations = readCoachNumberAnnotations(data, size, published, constraints)
  const clues = readCoachLatinClues(constraints, size)
  return { givens, format: 'Sudoku Coach', futoshiki: createImportedFutoshiki(size, givens, inequalities, { position, annotations, ...clues }) }
}

function readCoachInequalities(layers: readonly unknown[]): Inequality[] {
  const inequalities: Inequality[] = []
  for (const layer of layers) {
    if (!record(layer) || layer.type !== 'greaterLess') continue
    if (hasData(layer.settings) || !Array.isArray(layer.segments)) {
      throw new Error('This Sudoku Coach puzzle has an invalid inequality layer.')
    }
    for (const segment of layer.segments) {
      if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
        !segment.cells.every(Number.isInteger) || hasData(segment.parameters)) {
        throw new Error('This Sudoku Coach puzzle has an invalid inequality sign.')
      }
      const [less, greater] = segment.cells
      inequalities.push({ less, greater })
    }
  }
  return inequalities
}

function readCoachPairMarkers(constraint: Record<string, unknown>, kind: 'difference' | 'ratio') {
  const { settings, segments } = constraint
  if (hasData(settings) && (!record(settings) ||
    Object.keys(settings).some(key => key !== 'negativeConstraint') ||
    settings.negativeConstraint !== undefined && typeof settings.negativeConstraint !== 'boolean')) {
    throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${kind}.`)
  }
  if (!Array.isArray(segments)) throw new Error(`This Sudoku Coach puzzle has invalid ${kind} markers.`)
  const markers = segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== kind)) {
      throw new Error(`This Sudoku Coach puzzle has an invalid ${kind} marker.`)
    }
    const amount = segment.parameters[kind]
    return { cells: segment.cells as [number, number], amount: amount === undefined ? (kind === 'difference' ? 1 : 2) : amount }
  })
  return { markers, negative: record(settings) && settings.negativeConstraint === true }
}

function readCoachTwoCellSums(constraint: Record<string, unknown>, size: number) {
  if (!Array.isArray(constraint.segments) || !constraint.segments.length) {
    throw new Error('This Sudoku Coach puzzle has no two-cell sum clues.')
  }
  const maximum = 2 * size - 1
  return constraint.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'sum')) {
      throw new Error('This Sudoku Coach puzzle has an invalid two-cell sum clue.')
    }
    const sum = segment.parameters.sum
    if (typeof sum !== 'number' || !Number.isInteger(sum) || sum < 3 || sum > maximum) {
      throw new Error(`This Sudoku Coach two-cell sum must be an integer from 3 through ${maximum}.`)
    }
    return { type: 'sum' as const, cells: segment.cells as [number, number], value: sum }
  })
}

function readCoachAdjacentClues(layers: readonly unknown[], size: number): AdjacentClues | undefined {
  const marks: AdjacentClue[] = []
  let negativeDifference = false
  let negativeRatio = false
  for (const layer of layers) {
    if (!record(layer)) continue
    const type = layer.type
    if (type === 'difference' || type === 'ratio') {
      const { markers, negative } = readCoachPairMarkers(layer, type)
      for (const { cells, amount } of markers) {
        if (typeof amount !== 'number') throw new Error(`This Sudoku Coach puzzle has an invalid ${type} marker.`)
        marks.push({ cells, type, value: amount })
      }
      if (negative && type === 'difference') negativeDifference = true
      if (negative && type === 'ratio') negativeRatio = true
    } else if (type === 'twoCellSum') {
      if (hasData(layer.settings)) throw new Error('This Sudoku Coach puzzle uses unsupported settings for twoCellSum.')
      marks.push(...readCoachTwoCellSums(layer, size))
    }
  }
  if (marks.length || negativeDifference || negativeRatio) {
    return { marks, ...(negativeDifference && { negativeDifference: true }), ...(negativeRatio && { negativeRatio: true }) }
  }
}

function readCoachWhispers(layer: Record<string, unknown>, size: number): (WhisperLine & { cells: number[] })[] {
  const { settings, segments } = layer
  if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'difference' && !LINE_STYLING.has(key)))) {
    throw new Error('This Sudoku Coach Whispers line uses unsupported settings.')
  }
  const difference = record(settings) ? settings.difference ?? 5 : 5
  if (!Number.isInteger(difference) || Number(difference) < 1 || Number(difference) >= size ||
    !Array.isArray(segments) || !segments.length) {
    throw new Error('This Sudoku Coach Whispers line has an unsupported minimum difference or no cells.')
  }
  return segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
      throw new Error('This Sudoku Coach puzzle has an unsupported Whispers line.')
    }
    return { cells: segment.cells, minDifference: Number(difference) }
  })
}

function readCoachDirectedPaths(constraint: Record<string, unknown>): number[][] {
  const { settings, segments, type } = constraint
  const arrow = type === 'arrow' || type === 'pillArrow'
  const supportsStyle = (key: string) => LINE_STYLING.has(key) ||
    (type === 'thermometer' ? key === 'bulbSize' : BULB_STYLING.has(key) || arrow && key === 'arrowHeadLength')
  if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !supportsStyle(key)))) {
    throw new Error(`This Sudoku Coach ${type} uses unsupported settings.`)
  }
  if (!Array.isArray(segments) || !segments.length) throw new Error(`This Sudoku Coach puzzle has no cells for ${type}.`)
  return segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
      throw new Error(`This Sudoku Coach puzzle has an unsupported ${type}.`)
    }
    return segment.cells
  })
}

function readCoachBetweenPaths(constraint: Record<string, unknown>): number[][] {
  const { settings, segments } = constraint
  if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
    !LINE_STYLING.has(key) && !BULB_STYLING.has(key)))) {
    throw new Error('This Sudoku Coach Between line uses unsupported settings.')
  }
  if (!Array.isArray(segments) || !segments.length) throw new Error('This Sudoku Coach puzzle has no Between lines.')
  return segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 3 || hasData(segment.parameters)) {
      throw new Error('This Sudoku Coach puzzle has an invalid Between line.')
    }
    return segment.cells
  })
}

function readCoachExtraRegions(layer: Record<string, unknown>): number[][] {
  if (unsupportedClueStyling(layer.settings)) {
    throw new Error('This Sudoku Coach extra region uses unsupported settings.')
  }
  if (!Array.isArray(layer.segments) || !layer.segments.length) {
    throw new Error('This Sudoku Coach puzzle has no extra regions.')
  }
  return layer.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.every(Number.isInteger) || hasData(segment.parameters)) {
      throw new Error('This Sudoku Coach puzzle has an invalid extra region.')
    }
    return segment.cells
  })
}

function checkCoachGlobalEntropy(layer: Record<string, unknown>) {
  if (hasData(layer.settings)) throw new Error('This Sudoku Coach puzzle uses unsupported settings for globalEntropy.')
  if (!Array.isArray(layer.segments) || layer.segments.length) {
    throw new Error('This Sudoku Coach puzzle uses unsupported cells for globalEntropy.')
  }
}

function readCoachQuadruples(layer: Record<string, unknown>, size: number): Quadruple[] {
  if (hasData(layer.settings)) throw new Error('This Sudoku Coach puzzle uses unsupported settings for Quadruple.')
  if (!Array.isArray(layer.segments)) throw new Error('This Sudoku Coach puzzle has invalid Quadruple clues.')
  return layer.segments.map(segment => {
    const invalid = () => new Error('This Sudoku Coach puzzle has an invalid Quadruple clue.')
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'digits') ||
      typeof segment.parameters.digits !== 'string' || !/^[1-9]{1,4}$/.test(segment.parameters.digits)) throw invalid()
    const clue = { topLeft: segment.cells[0], digits: [...segment.parameters.digits].map(Number) }
    if (!validQuadruple(clue, size)) throw invalid()
    return clue
  })
}

function readCoachParityCells(layer: Record<string, unknown>, size: number): number[] {
  if (unsupportedClueStyling(layer.settings)) throw new Error('This Sudoku Coach Odd/Even clue uses unsupported settings.')
  if (!Array.isArray(layer.segments) || !layer.segments.length) throw new Error('This Sudoku Coach puzzle has no Odd/Even cells.')
  return layer.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters) ||
      !Number.isInteger(segment.cells[0]) || segment.cells[0] < 0 || segment.cells[0] >= size ** 2) {
      throw new Error('This Sudoku Coach puzzle has an invalid Odd/Even cell.')
    }
    return segment.cells[0]
  })
}

function readCoachLatinClues(layers: readonly unknown[], size: number): LatinClues {
  const whispers: WhisperLine[] = []
  const pathClues: LatinPathClue[] = []
  const extraRegions: number[][] = []
  const quadruples: Quadruple[] = []
  const parity: LatinParity[] = []
  let globalEntropy: true | undefined
  let antiKnight: true | undefined
  for (const layer of layers) {
    if (!record(layer)) continue
    if (layer.type === 'whisper') whispers.push(...readCoachWhispers(layer, size))
    if (layer.type === 'region') extraRegions.push(...readCoachExtraRegions(layer))
    if (layer.type === 'globalEntropy') {
      checkCoachGlobalEntropy(layer)
      globalEntropy = true
    }
    if (layer.type === 'quadruple') quadruples.push(...readCoachQuadruples(layer, size))
    const type = layer.type
    if (type === 'antiKnight') {
      if (hasData(layer.settings) || !Array.isArray(layer.segments) || layer.segments.length) {
        throw new Error('This Sudoku Coach Anti-Knight rule uses unsupported cells or settings.')
      }
      antiKnight = true
      continue
    }
    if (type === 'odd' || type === 'even') {
      if (!Array.isArray(layer.segments) || layer.segments.length || hasData(layer.settings)) {
        for (const cell of readCoachParityCells(layer, size)) parity.push({ cell, parity: type })
      }
      continue
    }
    if (type === 'betweenLine') {
      if (!Array.isArray(layer.segments) || layer.segments.length || hasData(layer.settings)) {
        for (const cells of readCoachBetweenPaths(layer)) pathClues.push({ type: 'between', cells })
      }
      continue
    }
    if (type === 'thermometer' || type === 'arrow' || type === 'pillArrow' || type === 'lockoutLine') {
      // Each segment is its own constraint, even when paths share an endpoint.
      const pathType = type === 'lockoutLine' ? 'lockout' : type === 'pillArrow' ? 'pill-arrow' : type
      if (!Array.isArray(layer.segments) || layer.segments.length || hasData(layer.settings)) {
        for (const cells of readCoachDirectedPaths(layer)) pathClues.push({ type: pathType, cells })
      }
      continue
    }
    if (type !== 'palindromeLine' && type !== 'consecutiveLine' && type !== 'renban') continue
    const { segments, settings } = layer
    if (!Array.isArray(segments) || hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key)))) {
      throw new Error('This Sudoku Coach line uses unsupported settings.')
    }
    if (type === 'renban' && !segments.length) throw new Error('This Sudoku Coach puzzle has no Renban cells.')
    const paths = segments.map(segment => {
      if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || hasData(segment.parameters) ||
        segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
        throw new Error('This Sudoku Coach puzzle has an invalid line segment.')
      }
      return segment.cells as number[]
    })
    const pathType = type === 'palindromeLine' ? 'palindrome' : type === 'consecutiveLine' ? 'consecutive' : 'renban'
    for (const line of coachConnectedLines(paths)) pathClues.push({ ...line, type: pathType })
  }
  return {
    adjacentClues: readCoachAdjacentClues(layers, size), whispers, pathClues,
    ...(extraRegions.length && { extraRegions }), globalEntropy, ...(quadruples.length && { quadruples }),
    ...(parity.length && { parity: parity.sort((a, b) => a.cell - b.cell) }),
    ...(antiKnight && { antiKnight }),
  }
}

function coachOutsideRay(side: OutsideSide, index: number) {
  const direction = side === 'top' ? 'south' : side === 'bottom' ? 'north' : side === 'left' ? 'east' : 'west'
  const cells = Array.from({ length: 9 }, (_, i) => side === 'top' ? i * 9 + index : side === 'bottom' ? (8 - i) * 9 + index
    : side === 'left' ? index * 9 + i : index * 9 + 8 - i)
  return { direction, cells } as const
}

function readCoachXSums(constraint: Record<string, unknown>, segments: readonly unknown[]) {
  const { settings } = constraint
  if (settings !== undefined && (!record(settings) || Object.keys(settings).some(key =>
    !['gridZoomOut', 'gridSnapToCorners', 'gridSnapToEdges', 'textSize'].includes(key)) ||
    (settings.gridZoomOut !== undefined && settings.gridZoomOut !== 1) ||
    (settings.gridSnapToCorners !== undefined && settings.gridSnapToCorners !== false) ||
    (settings.gridSnapToEdges !== undefined && settings.gridSnapToEdges !== false) ||
    (settings.textSize !== undefined && !(typeof settings.textSize === 'number' && Number.isFinite(settings.textSize) && settings.textSize > 0)))) {
    throw new Error('This Sudoku Coach X-Sums layer uses unsupported settings.')
  }
  const clues: Extract<VariantRule, { type: 'x-sum' }>[] = []
  const cellCenter = (coordinate: number) => coordinate >= 0.5 && coordinate <= 8.5 && Number.isInteger(coordinate - 0.5)
  for (const segment of segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !segment.cells[0].every(Number.isFinite) || !record(segment.parameters) ||
      Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.text !== 'string') {
      throw new Error('This Sudoku Coach puzzle has an invalid X-Sum label.')
    }
    const { text } = segment.parameters
    if (!text) continue
    const [x, y] = segment.cells[0] as [number, number]
    const side = cellCenter(x) && y === -0.5 ? 'top' : cellCenter(x) && y === 9.5 ? 'bottom'
      : cellCenter(y) && x === -0.5 ? 'left' : cellCenter(y) && x === 9.5 ? 'right' : undefined
    const sum = Number(text)
    if (!side || !/^[1-9][0-9]?$/.test(text) || sum > 45) {
      throw new Error('This Sudoku Coach X-Sum needs a total from 1 through 45 beside a row or column.')
    }
    clues.push({ type: 'x-sum', ...coachOutsideRay(side, (side === 'top' || side === 'bottom' ? x : y) - 0.5), sum })
  }
  return clues
}

function readCoachRules(constraints: unknown, { regions, grid, authoredRule }: {
  regions?: VariantPuzzle['regions']; grid?: SizedGrid; authoredRule?: CoachPublication['authoredRule']
} = {}): VariantRule[] {
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const rules: VariantRule[] = []
  const drawnLines: Record<string, unknown>[] = []
  for (const constraint of constraints) {
    if (!record(constraint) || !Array.isArray(constraint.segments) || typeof constraint.type !== 'string') {
      throw new Error('This Sudoku Coach puzzle has invalid rules.')
    }
    // These layers contribute nothing when the export contains no paths or labels.
    if ((constraint.type === 'consecutiveLine' || !grid && constraint.type === 'cosmeticText') && constraint.segments.length === 0 &&
      (constraint.settings === undefined || record(constraint.settings) && Object.keys(constraint.settings).length === 0) &&
      Object.keys(constraint).every(key => ['id', 'type', 'segments', 'settings'].includes(key))) continue
    if (constraint.type === 'cosmeticText' && authoredRule === 'x-sum') {
      rules.push(...readCoachXSums(constraint, constraint.segments))
      continue
    }
    if (constraint.type === 'cosmeticLine' && authoredRule === 'line-colours') {
      drawnLines.push(constraint)
      continue
    }
    if (!['region', 'difference', 'ratio', 'odd', 'even', 'whisper', 'thermometer', 'arrow', 'betweenLine', 'regionSumLine', 'palindromeLine', 'renban', 'entropicLine', 'modularLine', 'sandwich', 'littleKiller', 'cage', 'globalEntropy'].includes(constraint.type) && hasData(constraint.settings)) throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
    if (constraint.type === 'odd' || constraint.type === 'even') {
      rules.push({ type: 'parity', cells: readCoachParityCells(constraint, grid?.size ?? 9), parity: constraint.type })
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
        rules.push({ type: 'sandwich', ...coachOutsideRay(side as OutsideSide, Number(index)), sum: Number(value) })
      }
    } else if (constraint.type === 'quadruple') {
      for (const clue of readCoachQuadruples(constraint, 9)) rules.push({ type: 'quadruple', ...clue })
    } else if (constraint.type === 'cage') {
      const { settings } = constraint
      if (hasData(settings) && (grid || !record(settings) || Object.keys(settings).some(key => key !== 'horizontalOffset') ||
        typeof settings.horizontalOffset !== 'number' || !Number.isFinite(settings.horizontalOffset) ||
        settings.horizontalOffset < 0 || settings.horizontalOffset > 100)) {
        throw new Error('This Sudoku Coach puzzle uses unsupported settings for cage.')
      }
      const cages = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !record(segment.parameters) ||
          Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.sum !== 'number') {
          throw new Error('This Sudoku Coach puzzle has an invalid Killer cage.')
        }
        return { cells: segment.cells, sum: segment.parameters.sum }
      })
      if (!cages.length) throw new Error('This Sudoku Coach puzzle has no Killer cages.')
      rules.push({ type: 'killer-cages', cages })
    } else if (constraint.type === 'globalEntropy') {
      checkCoachGlobalEntropy(constraint)
      rules.push({ type: 'global-entropy' })
    } else if (constraint.type === 'diagonalPositive' || constraint.type === 'diagonalNegative' || constraint.type === 'antiKnight' || constraint.type === 'antiKing' || constraint.type === 'nonconsecutive') {
      if (constraint.segments.length) throw new Error(`This Sudoku Coach puzzle uses unsupported cells for ${constraint.type}.`)
      if (constraint.type === 'antiKnight') rules.push({ type: 'anti-knight' })
      else if (constraint.type === 'antiKing') rules.push({ type: 'anti-king' })
      else if (constraint.type === 'nonconsecutive') rules.push({ type: 'non-consecutive' })
      else rules.push({ type: 'diagonal', diagonal: constraint.type === 'diagonalNegative' ? 'main' : 'anti' })
    } else if (constraint.type === 'twoCellSum') {
      const five: [number, number][] = [], ten: [number, number][] = []
      const totals: Extract<VariantRule, { type: 'adjacent-total' }>[] = []
      for (const { cells, value: sum } of readCoachTwoCellSums(constraint, 9)) {
        if (sum === 5) five.push(cells)
        else if (sum === 10) ten.push(cells)
        else totals.push({ type: 'adjacent-total', cells, sum })
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
      const expected = kind === 'difference' ? 1 : 2
      if (markers.some(({ amount }) => amount !== expected)) {
        throw new Error(`This Sudoku Coach ${kind} marker is not supported yet.`)
      }
      const marks = { pairs: markers.map(({ cells }) => cells), negative }
      rules.push(kind === 'difference'
        ? { type: 'kropki', consecutive: marks }
        : { type: 'kropki', ratioTwo: marks })
    } else if (constraint.type === 'region') {
      for (const cells of readCoachExtraRegions(constraint)) rules.push({ type: 'extra-house', cells })
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
    } else if (constraint.type === 'betweenLine') {
      for (const cells of readCoachBetweenPaths(constraint)) rules.push({ type: 'between', cells })
    } else if (constraint.type === 'whisper') {
      for (const line of readCoachWhispers(constraint, 9)) rules.push({ type: 'whispers', ...line })
    } else if (constraint.type === 'thermometer' || constraint.type === 'arrow') {
      const thermometer = constraint.type === 'thermometer'
      for (const path of readCoachDirectedPaths(constraint)) {
        if (thermometer) rules.push({ type: 'thermometer', cells: path })
        else {
          const [circle, ...cells] = path
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
  // Coach exempts difference markers from its global relation, independently of rule order.
  // The positive dot remains a separate rule and still requires a difference of one.
  const exceptions = [...new Map(rules.flatMap(rule => rule.type === 'kropki'
    ? (rule.consecutive?.pairs ?? []).filter(([a, b]) => cellsShareEdge(a, b)).map(([a, b]) => {
      const pair = [Math.min(a, b), Math.max(a, b)] as const
      return [pair.join(','), pair] as const
    }) : [])).values()]
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

function jigsawLayoutError(size: 5 | 7) {
  const count = size === 5 ? 'five' : 'seven'
  return `A ${size} × ${size} Jigsaw grid needs ${count} connected regions of ${count} cells.`
}

function readCoachSized(data: Record<string, unknown>) {
  const { gridSize: size, regions } = data
  const labels = Array.isArray(regions) && regions.every(label => Number.isInteger(label) && label >= 0) ? regions : undefined
  const distinct = isJigsawSize(size) && labels ? [...new Set<number>(labels)] : []
  const explicit = isJigsawSize(size) && labels?.length === size ** 2 && distinct.length === size
    ? { size, regions: regionsFromMembership(labels.map(label => distinct.indexOf(label)), size) } : undefined
  const grid = isJigsawSize(size) ? size === 7 && labels?.length === 0 ? SEVEN_BOXLESS_GRID : isJigsawGrid(explicit) ? explicit : undefined
    : isRectangularSize(size) ? labels && rectangularGridFromRegions(size, labels)
      : regions === undefined || hasMiniBoxes(regions) ? MINI_GRID : undefined
  if (!grid) throw new Error(size === 4 ? 'Mini Sudoku import requires four 2 × 2 boxes.'
    : isJigsawSize(size) ? jigsawLayoutError(size)
      : size === 8 ? 'Import requires eight rectangular boxes of 2 × 4 or 4 × 2 cells.'
        : 'Import requires six rectangular boxes of 2 × 3 or 3 × 2 cells.')
  const givenDigits = grid.size === 6 ? data.givenDigits ?? undefined : data.givenDigits
  const givens = givenDigits === undefined ? '0'.repeat(grid.size ** 2) : givenDigits
  if (!isGridText(givens, grid)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  if (COACH_AUTHORED_MARKINGS.some(key => hasData(data[key]))) {
    throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
  }
  const constraints = grid.size === 6 ? data.givenConstraints ?? [] :
    data.givenConstraints === undefined ? [] : data.givenConstraints
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const active = constraints.filter(rule => !(record(rule) &&
    ['odd', 'even', 'thermometer', 'palindromeLine', 'renban'].includes(String(rule.type)) &&
    Array.isArray(rule.segments) && rule.segments.length === 0 && !hasData(rule.settings)))
  const supported = ['diagonalNegative', 'diagonalPositive', 'cage', 'region', 'odd', 'even', 'thermometer', 'renban', 'difference', 'ratio', 'arrow', 'regionSumLine']
  if (active.some(rule => !record(rule) || !supported.includes(String(rule.type)))) {
    throw new Error(`This ${grid.size} × ${grid.size} Sudoku Coach export includes an unsupported active rule.`)
  }
  const rules = active.flatMap((constraint): (VariantRule | SizedDifferenceRule | SizedLabeledDotsRule)[] => {
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
  if (!isSizedRuleList(rules, grid)) throw new Error('This Sudoku Coach export contains invalid rules.')
  return { version: 2 as const, grid, givens, rules }
}

function digitRuns(code: string, format: ImportFormat): ImportedPuzzle {
  if (/^[0-9.]{81}$/.test(code)) return { givens: parsePuzzle(code), format }
  if (!/^[0-9A-Za-x]{1,81}$/.test(code)) throw new Error(`This ${format} link is missing its puzzle grid.`)
  const givens = Array.from(code, (character) => {
    const value = DIGIT_RUNS.indexOf(character)
    return String(value % 10) + '0'.repeat(Math.floor(value / 10))
  }).join('')
  return { givens: parsePuzzle(givens), format }
}

function fpCellIndex(value: unknown, size = 9) {
  const match = typeof value === 'string' ? /^R([1-9])C([1-9])$/i.exec(value) : null
  if (!match || Number(match[1]) > size || Number(match[2]) > size) {
    throw new Error('This f-puzzles export contains an invalid cell reference.')
  }
  return (Number(match[1]) - 1) * size + Number(match[2]) - 1
}

function antiSumFromClause(clause: string, size: number) {
  const match = FP_ANTI_SUM.exec(clause.trim())
  if (!match) return
  const sum = Number(match[2])
  if (sum >= 2 && sum <= 2 * size && (match[1] === undefined || Number(match[1]) === sum)) return sum
}

function fpJigsawMetadata(data: Record<string, unknown>, hasAntiSum: boolean) {
  if (data.highlightConflicts !== undefined && typeof data.highlightConflicts !== 'boolean') return false
  if (hasData(data.xv)) return false
  if (hasData(data.negative)) {
    const flags = data.negative
    if (!(hasAntiSum && Array.isArray(data.xv) && Array.isArray(flags) && flags.length === 1 && flags[0] === 'xv')) return false
  }
  if (!hasData(data.cage)) return true
  return typeof data.successMessage === 'string' && Array.isArray(data.cage) && data.cage.every(cage =>
    record(cage) && Object.keys(cage).length === 4 && cage.value === `msgcorrect: ${data.successMessage}` &&
    cage.outlineC === '#ffffff00' && cage.fontC === '#ffffff00' &&
    Array.isArray(cage.cells) && cage.cells.length === 1 && cage.cells[0] === 'R1C1')
}

function fpRowColumnSum(data: Record<string, unknown>, clauses: readonly string[], size: number): SizedConstraintRule | undefined {
  const statements = clauses.map(clause => FP_ROW_COLUMN_SUM.exec(clause)).filter(match => match !== null)
  if (statements.length === 0 && !hasData(data.rectangle)) return
  if (statements.length !== 1 || data.rectangle !== undefined && !Array.isArray(data.rectangle)) {
    throw new Error('This f-puzzles export has unsupported rectangles or diamond rules.')
  }
  const rectangles = Array.isArray(data.rectangle) ? data.rectangle : []
  const pairs = rectangles.map(mark => {
    if (!record(mark) || Object.keys(mark).length !== 7 || !Array.isArray(mark.cells) || mark.cells.length !== 2 ||
      mark.width !== 0.25 || mark.height !== 0.25 || mark.angle !== 45 ||
      mark.baseC !== '#000000' || mark.outlineC !== '#000000' || mark.fontC !== '#000000') {
      throw new Error('This f-puzzles export has a rectangle that the app cannot read as a diamond.')
    }
    return [fpCellIndex(mark.cells[0], size), fpCellIndex(mark.cells[1], size)] as const
  })
  return { type: 'row-column-sum', pairs, ...(statements[0][1] && { requireUnmarked: true }) }
}

function fromFPuzzlesJigsaw(data: Record<string, unknown>, size: 5 | 7, labels: readonly unknown[], givens: string, format: ImportFormat): ImportedPuzzle {
  const regions: number[][] = Array.from({ length: size }, () => [])
  for (const [cell, label] of labels.entries()) {
    if (typeof label !== 'number' || !Number.isInteger(label) || label < 0 || label >= size) {
      throw new Error('This f-puzzles export has invalid region labels.')
    }
    regions[label].push(cell)
  }
  const grid = { size, regions }
  if (!isJigsawGrid(grid)) throw new Error(jigsawLayoutError(size))
  const rules: SizedConstraintRule[] = []
  if (hasData(data.thermometer)) {
    if (!Array.isArray(data.thermometer)) throw new Error('This f-puzzles export has invalid thermometers.')
    for (const clue of data.thermometer) {
      if (!record(clue) || Object.keys(clue).some(key => key !== 'lines') || !Array.isArray(clue.lines) || !clue.lines.length) {
        throw new Error('This f-puzzles export has invalid thermometers.')
      }
      for (const path of clue.lines) {
        if (!Array.isArray(path)) throw new Error('This f-puzzles export has an invalid thermometer path.')
        rules.push({ type: 'thermometer', cells: path.map(cell => fpCellIndex(cell, size)) })
      }
    }
  }
  for (const relation of ['difference', 'ratio'] as const) {
    const layer = data[relation]
    if (!hasData(layer)) continue
    if (!Array.isArray(layer)) throw new Error('This f-puzzles export has invalid labeled dots.')
    const marks = layer.map(clue => {
      if (!record(clue) || Object.keys(clue).length !== 2 ||
        !Array.isArray(clue.cells) || clue.cells.length !== 2 || !/^[1-9]$/.test(String(clue.value))) {
        throw new Error('This f-puzzles export has an invalid labeled dot.')
      }
      const cells = [fpCellIndex(clue.cells[0], size), fpCellIndex(clue.cells[1], size)] as const
      return { cells, value: Number(clue.value) }
    })
    rules.push({ type: 'labeled-dots', relation, marks })
  }
  const [, ...clauses] = jigsawRuleClauses(data.ruleset)
  const antiSums = clauses.map(clause => antiSumFromClause(clause, size)).filter(sum => sum !== undefined)
  if (!fpJigsawMetadata(data, antiSums.length > 0)) throw new Error('This f-puzzles export includes unsupported XV rules or cages.')
  const diamonds = fpRowColumnSum(data, clauses, size)
  if (diamonds) rules.push(diamonds)
  for (const sum of new Set(antiSums)) rules.push({ type: 'anti-sum', sum })
  if (clauses.some(clause => FP_JIGSAW_THERMOMETER.test(clause)) && !rules.some(rule => rule.type === 'thermometer') ||
    clauses.some(clause => FP_JIGSAW_DOTS.test(clause)) && !rules.some(rule => rule.type === 'labeled-dots') ||
    !isSizedRuleList(rules, grid)) {
    throw new Error('This f-puzzles export has missing or invalid clues.')
  }
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 72) : ''
  const author = typeof data.author === 'string' ? data.author.trim().slice(0, 72) : ''
  const authoredSolution = Array.isArray(data.solution) && data.solution.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size)
    ? data.solution.join('') : undefined
  return { givens, grid, format, sizedRules: rules, ...(title && { title }), ...(author && { sizedAuthor: author }),
    ...(authoredSolution?.length === size ** 2 && { authoredSolution }) }
}

function jigsawRuleClauses(text: unknown) {
  return typeof text === 'string' ? text.trim().split(/\n\s*\n/).map(line => line.trim().replace(/\s+/g, ' ')) : []
}

function knownJigsawRuleset(text: string, size: number) {
  const [base, ...clauses] = jigsawRuleClauses(text)
  const match = FP_JIGSAW_BASE.exec(base)
  const sizes = match?.slice(1).filter(value => value !== undefined)
  return !!sizes?.length && sizes.every(value => Number(value) === size) && clauses.every(clause =>
    FP_JIGSAW_THERMOMETER.test(clause) || FP_JIGSAW_DOTS.test(clause) || FP_ROW_COLUMN_SUM.test(clause) || antiSumFromClause(clause, size) !== undefined)
}

function fromFPuzzles(input: string, format: 'f-puzzles' | 'SudokuPad'): ImportedPuzzle {
  const code = input.replaceAll(' ', '+')
  // f-puzzles uses LZ-String Base64. Limit compressed input before decoding it.
  const data = parseJSON(input.startsWith('{') ? input :
    /^[A-Za-z0-9+/=]{1,10000}$/.test(code) ? lzString.decompressFromBase64(code) : '', format)
  if (!record(data) || data.size !== 4 && !isJigsawSize(data.size) && data.size !== 8 && data.size !== 9 || !Array.isArray(data.grid) || data.grid.length !== data.size) {
    throw new Error('Import supports 4 × 4, 5 × 5 Jigsaw, 7 × 7 Jigsaw, 8 × 8, and 9 × 9 f-puzzles grids.')
  }
  const size = data.size
  const mini = size === MINI_GRID.size
  const jigsaw = isJigsawSize(size)
  const eight = size === 8
  const fields = jigsaw ? FPUZZLES_JIGSAW_FIELDS : eight ? FPUZZLES_EIGHT_FIELDS : FPUZZLES_FIELDS
  for (const [key, value] of Object.entries(data)) {
    if (!fields.has(key) && hasData(value)) throw new Error(`This f-puzzles rule is not supported yet (${key}).`)
  }
  if (hasData(data.ruleset) && (typeof data.ruleset !== 'string' ||
    !PLAIN_RULES.test(data.ruleset) && !(mini && PLAIN_MINI_RULES.test(data.ruleset)) &&
    !(eight && PLAIN_EIGHT_RULES.test(data.ruleset)) && !(jigsaw && knownJigsawRuleset(data.ruleset, size)))) {
    throw new Error('This f-puzzles export contains custom rules text. Import requires rules the app can read from the board.')
  }
  const labels: unknown[] = []
  const digits: string[] = []
  for (const row of data.grid) {
    if (!Array.isArray(row) || row.length !== size) throw new Error('This f-puzzles export has an invalid grid.')
    for (const cell of row) {
      if (!record(cell) || cell.given && (!/^[1-9]$/.test(String(cell.value)) || Number(cell.value) > size)) {
        throw new Error('This f-puzzles export has invalid givens.')
      }
      for (const [key, value] of Object.entries(cell)) {
        if (!['value', 'given', 'region', 'centerPencilMarks', 'cornerPencilMarks'].includes(key) && hasData(value)) {
          throw new Error(`This f-puzzles cell clue is not supported yet (${key}).`)
        }
      }
      const index = digits.length
      // On these Jigsaw grids, f-puzzles omits labels for the default row regions.
      const region = jigsaw ? Math.floor(index / size)
        : mini ? Math.floor(index / 8) * 2 + Math.floor(index % 4 / 2) : eight ? undefined : standardRegion(index)
      labels.push(cell.region === undefined ? region : cell.region)
      digits.push(cell.given ? String(cell.value) : '0')
    }
  }
  if (jigsaw) return fromFPuzzlesJigsaw(data, size, labels, digits.join(''), format)
  if (mini) {
    if (!hasMiniBoxes(labels)) throw new Error('Mini Sudoku import requires four 2 × 2 boxes.')
    if (['killercage', 'clone', 'diagonal+', 'diagonal-'].some(key => hasData(data[key]))) {
      throw new Error('This 4 × 4 f-puzzles grid has rules that Mini Sudoku cannot import yet.')
    }
    return { givens: digits.join(''), grid: MINI_GRID, format }
  }
  const rules: VariantRule[] = []
  for (const key of ['diagonal+', 'diagonal-']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error('This f-puzzles export has an invalid diagonal.')
  }
  if (data['diagonal+'] === true) rules.push({ type: 'diagonal', diagonal: 'anti' })
  if (data['diagonal-'] === true) rules.push({ type: 'diagonal', diagonal: 'main' })
  if (data.clone !== undefined) {
    if (!Array.isArray(data.clone)) throw new Error('This f-puzzles export has invalid Clone clues.')
    for (const clue of data.clone) {
      if (!record(clue) || Object.keys(clue).some(key => key !== 'cells' && key !== 'cloneCells') ||
        !Array.isArray(clue.cells) || !clue.cells.length || !Array.isArray(clue.cloneCells) || clue.cells.length !== clue.cloneCells.length) {
        throw new Error('This f-puzzles export has invalid Clone clues.')
      }
      const copies = clue.cloneCells.map(cell => fpCellIndex(cell))
      const original = clue.cells.map(cell => fpCellIndex(cell))
      if (new Set(original).size !== original.length || new Set(copies).size !== copies.length) throw new Error('This f-puzzles export has invalid Clone clues.')
      rules.push({ type: 'clone', groups: original.map((cell, i) => [cell, copies[i]]) })
    }
  }
  if (hasData(data.killercage)) {
    if (!Array.isArray(data.killercage)) throw new Error('This f-puzzles export has invalid Killer cages.')
    rules.push({ type: 'killer-cages', cages: data.killercage.map((cage: unknown) => {
      if (!record(cage) || !Array.isArray(cage.cells) || !/^[0-9]{1,2}$/.test(String(cage.value))) {
        throw new Error('This f-puzzles export has a Killer cage without a valid sum.')
      }
      return { cells: cage.cells.map(cell => fpCellIndex(cell, size)), sum: Number(cage.value) }
    }) })
  }
  if (eight) {
    const grid = labels.every((label): label is number => typeof label === 'number' && Number.isInteger(label) && label >= 0)
      ? rectangularGridFromRegions(8, labels) : undefined
    if (!grid) throw new Error('This 8 × 8 puzzle needs explicit 2 × 4 or 4 × 2 boxes.')
    if (!isSizedRuleList(rules, grid)) throw new Error('This 8 × 8 f-puzzles puzzle contains invalid rules.')
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 72) : ''
    const author = typeof data.author === 'string' ? data.author.trim().slice(0, 72) : ''
    return { givens: digits.join(''), grid, format, sizedRules: rules, ...(title && { title }), ...(author && { sizedAuthor: author }) }
  }
  return makeImportedPuzzle(format, digits.join(''), rules, readRegions(labels))
}

function fromSudokuPad(code: string, format: ImportFormat = 'SudokuPad'): ImportedPuzzle {
  if (/^scf/i.test(code)) return digitRuns(code.slice(3), 'SudokuPad')
  if (FP_CODE.test(code)) return fromFPuzzles(code.replace(FP_CODE, ''), 'SudokuPad')
  if (/^(scl|ctc)/i.test(code)) {
    const data = decodeSudokuPadEnvelope(code)
    if (record(data) && Array.isArray(data.cells) && Array.isArray(data.regions) &&
      (data.regions.length === 4 || isRectangularSize(data.regions.length)) && data.cells.length === data.regions.length + 2) {
      return { ...readLinkedDoubleArrowSudokuPad(data), format }
    }
    if (record(data) && Array.isArray(data.cells) && (isRectangularSize(data.cells.length) ||
      data.cells.length === 4 && ['lines', 'underlays', 'overlays', 'arrows'].some(field => Object.hasOwn(data, field)))) {
      return { ...readSizedRuleSudokuPad(data), format }
    }
    const { givens, grid, rules, source } = decodeSizedSudokuPad(code, data)
    return { givens, grid, algebraic: { rules, source }, format }
  }
  throw new Error('This SudokuPad link does not contain the puzzle data. For Classic puzzles, copy the 81 givens.')
}

async function publishedPuzzle(source: 'sudoku-coach' | 'sudokupad', path: string) {
  const response = await fetch(`/api/v1/import/${source}/${path}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(typeof error === 'string' ? error : 'Could not open this published puzzle.')
  }
  const data: unknown = await response.json()
  const { code, coach } = record(data) ? data : {}
  if (typeof code !== 'string' || code.length > MAX_IMPORT_LENGTH) throw new Error('This link does not contain a supported puzzle export.')
  const publication: CoachPublication | null = record(coach) && typeof coach.hasAuthorInstructions === 'boolean'
    ? { hasAuthorInstructions: coach.hasAuthorInstructions,
      ...((coach.authoredRule === 'x-sum' || coach.authoredRule === 'all-black-dots' ||
        coach.authoredRule === 'line-colours' || coach.authoredRule === 'mirrored-renban') && { authoredRule: coach.authoredRule }),
      ...(isCoachTypedDeclaration(coach.declaredRules) && { declaredRules: coach.declaredRules }),
      ...(coach.whispersGuide === true && { whispersGuide: true }),
      title: typeof coach.title === 'string' ? coach.title.trim().slice(0, 72) : undefined }
    : null
  return { code, publication }
}

export async function detectPuzzle(input: string): Promise<ImportedPuzzle> {
  const text = input.trim().replace(/^```(?:text)?\s*([\s\S]*?)\s*```$/i, '$1')
  if (text.length > MAX_IMPORT_LENGTH) throw new Error('Paste one puzzle at a time.')
  const link = /^(?:www\.)?(?:sudoku\.coach|sudokuexchange\.com|(?:beta\.)?sudokupad\.app|f-puzzles\.com)\//i.test(text)
    ? `https://${text}` : text
  const base = 'https://sudoku.invalid'
  const ownOrigin = globalThis.window?.location?.origin
  const url = /^(https?:\/\/|#(?:puzzle|variant|sized)=|\/\?share=)/i.test(link) && URL.canParse(link, base)
    ? new URL(link, ownOrigin ?? base) : null
  if (url) {
    if (url.origin === ownOrigin && url.pathname === '/' && url.searchParams.has('share')) {
      const id = url.searchParams.get('share')
      if (!isSharedPuzzleId(id)) throw new Error('This puzzle link is invalid.')
      return importSharedPuzzle(id)
    }
    if (url.hash.startsWith('#sized=')) {
      const shared = parseJSON(new URLSearchParams(url.hash.slice(1)).get('sized') ?? '', 'Puzzle link')
      if (record(shared) && shared.version === 2 && typeof shared.sudokuPad === 'string' &&
        Object.keys(shared).every(key => key === 'version' || key === 'sudokuPad') && /^(scl|ctc)/i.test(shared.sudokuPad)) {
        return fromSudokuPad(shared.sudokuPad, 'Puzzle link')
      }
      if (!record(shared) || shared.version !== 2 || !isMiniGrid(shared.grid) || !isGridText(shared.givens, MINI_GRID) ||
        Object.keys(shared).some(key => !['version', 'grid', 'givens', 'rules'].includes(key))) {
        throw new Error('This link is missing a supported sized Sudoku puzzle.')
      }
      if (shared.rules !== undefined) {
        if (!isAlgebraicCageList(shared.rules)) throw new Error('This sized puzzle has unsupported rules or invalid algebraic cages.')
        return { givens: shared.givens, format: 'Puzzle link', grid: MINI_GRID, algebraic: { rules: shared.rules } }
      }
      return { givens: shared.givens, format: 'Puzzle link', grid: MINI_GRID }
    }
    if (url.hash.startsWith('#variant=')) {
      const shared = parseJSON(new URLSearchParams(url.hash.slice(1)).get('variant') ?? '', 'Puzzle link')
      if (!record(shared) || !isPuzzleVariantId(shared.id) || shared.id === 'classic' || !isPlayablePuzzle(shared.id, shared.puzzle, shared.fog)) {
        throw new Error('This link is missing a valid Sudoku variant.')
      }
      const variant: NonNullable<ImportedPuzzle['variant']> = { id: shared.id, puzzle: shared.puzzle, ...(isFogDefinition(shared.fog) && { fog: shared.fog }) }
      return { givens: variant.puzzle.givens, format: 'Puzzle link', variant }
    }
    if (url.hash.startsWith('#puzzle=')) return { givens: parsePuzzle(url.href), format: 'Puzzle link' }
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'sudoku.coach') {
      const collection = COACH_COLLECTION_LINK.exec(url.pathname)
      if (collection) {
        const [, path, id] = collection
        const { code, publication } = await publishedPuzzle('sudoku-coach', `collections/${path}/${id}`)
        return fromCoach(code, publication, true)
      }
      const id = url.pathname.match(/^\/(?:[a-z]{2}\/)?s\/([A-Za-z0-9]{1,16})\/?$/i)?.[1]
      if (id) {
        const { code, publication } = await publishedPuzzle('sudoku-coach', id)
        return fromCoach(code, publication)
      }
      const code = url.pathname.match(/^\/(?:[a-z]{2}\/)?(?:play|solver|construct)\/([^/]+)\/?$/i)?.[1] ?? ''
      if (code.toLowerCase().startsWith('scv') || COACH_WHOLE_PROGRESS.test(code)) return fromCoach(decodeURIComponent(code))
      if (/^[0-4.]{16}$/.test(code)) return { givens: code.replaceAll('.', '0'), format: 'Sudoku Coach', grid: MINI_GRID }
      if (/^[0-9.]{81}$/.test(code)) return { givens: parsePuzzle(code), format: 'Sudoku Coach' }
      throw new Error('This Sudoku Coach link does not contain a puzzle code. Open it and use Copy → Puzzle.')
    }
    if (host === 'sudokuexchange.com' && /^\/play\/?$/.test(url.pathname)) return digitRuns(url.searchParams.get('s') ?? '', 'Sudoku Exchange')
    if (host === 'f-puzzles.com') return fromFPuzzles(url.searchParams.get('load') ?? '', 'f-puzzles')
    if (['sudokupad.app', 'beta.sudokupad.app', 'sudokupad.svencodes.com', 'app.crackingthecryptic.com'].includes(host)) {
      const pathCode = decodeURIComponent(url.pathname.slice(1)).replace(/\/$/, '')
      const code = pathCode || url.searchParams.get('puzzleid') || ''
      if ((host === 'sudokupad.app' || host === 'beta.sudokupad.app') && /^[A-Za-z0-9_-]{1,64}$/.test(code) &&
        !/^(?:scl|ctc|scf|fpuz)/i.test(code)) return fromSudokuPad((await publishedPuzzle('sudokupad', code)).code)
      return fromSudokuPad(code)
    }
    throw new Error('This link format is not supported. Try pasting the puzzle code or its 81 givens.')
  }
  if (text.toLowerCase().startsWith('scv') || COACH_WHOLE_PROGRESS.test(text)) return fromCoach(text)
  if (/^(scf|scl|ctc)/i.test(text)) return fromSudokuPad(text)
  if (FP_CODE.test(text)) return fromFPuzzles(text.replace(FP_CODE, ''), 'f-puzzles')
  if (text.startsWith('{') || /^N4[A-Za-z0-9+/=]+$/.test(text)) return fromFPuzzles(text, 'f-puzzles')
  const mini = textGridCells(text).replaceAll('.', '0')
  if (isGridText(mini, MINI_GRID)) return { givens: mini, format: 'Text grid', grid: MINI_GRID }
  return { givens: parsePuzzle(text), format: text.startsWith(':') ? 'HoDoKu' : 'Text grid' }
}
