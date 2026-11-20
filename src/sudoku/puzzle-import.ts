import lzString from 'lz-string'
import type { CollectionReference } from './collection-reference.ts'
import type { SizedConstraintRule, SizedDifferenceRule, SizedLabeledDotsRule, VariantPuzzle, VariantRule } from './engine.ts'
import { parsePuzzle, textGridCells } from './formats.ts'
import { gridRegionIndex, isGridText, isMiniGrid, isJigsawGrid, isJigsawSize, MINI_GRID, regionsFromMembership, SEVEN_BOXLESS_GRID, sixGridFromRegions, type SizedGrid } from './grid.ts'
import { EMPTY } from './game.ts'
import { downloadSharedPuzzle, isSharedPuzzleId } from './puzzle-sharing.ts'
import { coachConnectedLines } from './coach-lines.ts'
import { closedRegionSumCells, regionIndex } from './region-sum.ts'
import { decodeSizedSudokuPad, decodeSudokuPadEnvelope } from './sized-sudoku-pad.ts'
import { isAlgebraicCageList } from './algebraic-cages.ts'
import { readLinkedDoubleArrowSudokuPad, readSizedRuleSudokuPad } from './sized-rule-sudoku-pad.ts'
import { isSizedRuleList, type SizedRuleGame } from './sized-rule-game.ts'
import type { AlgebraicDefinition } from './algebraic-game.ts'
import { cellsShareEdge, isPlayablePuzzle, isPuzzleVariantId, variantIdForPuzzle, type VariantGame } from './variants.ts'

export const MAX_IMPORT_LENGTH = 20_000
const MAX_DECODED_LENGTH = 128_000
const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'
const DIGIT_RUNS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'
const COACH_CODE = /^SCv([0-9]+)_([0-9]+)_/i
const FP_CODE = /^fpuz(?:zles)?/i
const COACH_FIELDS = new Set([
  'gridSize', 'givenDigits', 'regions', 'givenConstraints', 'meta', 'metaSolver', 'colours',
  'constructorPreviewDigits', 'constructorConstructionParameters', 'quickDrawLineSegments', 'quickDrawSymbols', 'acid', 'givenColours',
])
const FPUZZLES_BASE_FIELDS = ['size', 'grid', 'title', 'author', 'ruleset', 'solution', 'successMessage']
const FPUZZLES_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'killercage', 'clone', 'diagonal+', 'diagonal-'])
const FPUZZLES_JIGSAW_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'thermometer', 'difference', 'ratio', 'negative', 'xv', 'cage', 'highlightConflicts', 'rectangle'])
const PLAIN_RULES = /^\s*(?:(?:normal|standard) (?:classic )?sudoku rules apply[.!]?)?\s*$/i
const FP_JIGSAW_BASE = /^(?:normal|standard) irregular(?: ([57])\s*[×x]\s*\1)? sudoku rules apply(?:\.|: fill each row, column and region with the digits 1[-–]([57])\.)$/i
const FP_JIGSAW_THERMOMETER = /^(?:Digits along a thermometer must strictly increase from the bulb to the end|Thermometers: Digits along a thermometer must increase starting at the bulb)\.$/i
const FP_ANTI_SUM = /^Anti-Sum(?: \((\d{1,2})\))?: Digits in orthogonally (?:adjacent|connected) cells may not sum to (\d{1,2})\.$/i
const FP_JIGSAW_DOTS = /^A white dot with a number in it implies the difference between two cells\. A black dot with a number in it implies the ratio relationship between two cells\.$/i
const FP_ROW_COLUMN_SUM = /^Diamond-Sum: Digits in cells horizontally connected by a diamond sum to their row index\. Digits in cells vertically connected by a diamond sum to their column index\.(?: (Not all diamonds are given\.))?$/i
const PLAIN_MINI_RULES = /^\s*(?:normal|standard) 4\s*[×x]\s*4 sudoku rules apply[.!]?\s*$/i

export type ImportFormat = 'Sudoku Coach' | 'Sudoku Exchange' | 'SudokuPad' | 'f-puzzles' | 'Puzzle link' | 'HoDoKu' | 'Text grid'
export type ImportedPuzzle = {
  givens: string
  format: ImportFormat
  variant?: Pick<VariantGame, 'id' | 'puzzle'>
  grid?: SizedGrid
  sizedRules?: SizedRuleGame['rules']
  sizedAuthor?: string
  authoredSolution?: string
  algebraic?: AlgebraicDefinition
  title?: string
  sharedPuzzleId?: string
  collection?: CollectionReference
}

export async function importSharedPuzzle(id: string, signal?: AbortSignal): Promise<ImportedPuzzle> {
  const { givens, variant, collection, title, grid, algebraic, sizedRules, sizedAuthor } = await downloadSharedPuzzle(id, signal)
  const sizing = algebraic && 'sudokuPad' in algebraic ? decodeSizedSudokuPad(algebraic.sudokuPad) : undefined
  if (sizing && sizing.givens !== givens) throw new Error('The SudokuPad definition does not match the shared givens.')
  const cages = sizing ? { rules: sizing.rules, source: sizing.source } : algebraic && 'rules' in algebraic ? algebraic : undefined
  return { givens, variant, collection, title, grid, sizedRules, sizedAuthor, ...(cages && { algebraic: cages }), sharedPuzzleId: id.toLowerCase(), format: 'Puzzle link' }
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

function makeImportedPuzzle(format: ImportFormat, givens: string, rules: VariantRule[], regions: VariantPuzzle['regions']): ImportedPuzzle {
  const puzzle: VariantPuzzle = { version: 1, givens, ...(regions && { regions }), ...(rules.length && { rules }) }
  // Validate the complete rule list before using it to choose a display name.
  if (!rules.length && !regions) return { givens, format }
  if (!isPlayablePuzzle('mixed', puzzle)) throw new Error('This puzzle has unsupported or invalid rules.')
  const id = variantIdForPuzzle(puzzle)
  if (id === 'classic') return { givens, format }
  return { givens, format, variant: { id, puzzle } }
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

async function inflate(bytes: Uint8Array<ArrayBuffer>) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_DECODED_LENGTH) throw new Error('This Sudoku Coach puzzle is too large.')
      chunks.push(decoder.decode(value, { stream: true }))
    }
    return chunks.join('') + decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function parseJSON(text: string, format: ImportFormat): unknown {
  try {
    if (text && text.length <= MAX_DECODED_LENGTH) return JSON.parse(text)
  } catch { /* Show a format-specific error below. */ }
  throw new Error(`This ${format} puzzle is unreadable. Copy it again and try once more.`)
}

async function decodeCoach(code: string): Promise<Record<string, unknown>> {
  if (code.length > MAX_IMPORT_LENGTH) throw new Error('Paste one puzzle at a time.')
  const prefix = COACH_CODE.exec(code)
  if (!prefix || prefix[1] !== '7' || prefix[2] !== '32') {
    throw new Error('This Sudoku Coach code uses an unsupported format. Copy the puzzle from Sudoku Coach and try again.')
  }
  const bytes = decodeBase32Hex(code.slice(prefix[0].length))
  let text: string
  try {
    text = await inflate(bytes)
  } catch {
    throw new Error('This Sudoku Coach code could not be opened. Copy the full puzzle code and try again.')
  }
  const data = parseJSON(text, 'Sudoku Coach')
  if (!record(data)) throw new Error('This Sudoku Coach puzzle is unreadable.')
  for (const [key, value] of Object.entries(data)) {
    if (!COACH_FIELDS.has(key) && !key.startsWith('user') && hasData(value)) {
      throw new Error(`This Sudoku Coach puzzle uses an unsupported field (${key}).`)
    }
  }
  return data
}

async function fromCoach(code: string, published = false): Promise<ImportedPuzzle> {
  const data = await decodeCoach(code)
  if (published && data.gridSize === 9) throw new Error('Open this short link in Sudoku Coach, then use Copy → Puzzle.')
  if (data.gridSize === 4 || data.gridSize === 6 || isJigsawSize(data.gridSize)) {
    const { givens, grid, rules } = readCoachSized(data)
    return { givens, grid, ...(grid.size !== 4 || rules.length ? { sizedRules: rules } : {}), format: 'Sudoku Coach' }
  }
  if (data.gridSize !== 9) {
    throw new Error('Import supports 4 × 4, 5 × 5 Jigsaw, 6 × 6, 7 × 7 Jigsaw, and 9 × 9 Sudoku Coach grids.')
  }
  const givens = data.givenDigits === undefined ? EMPTY : data.givenDigits
  if (typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const constraints = data.givenConstraints ?? []
  const regions = readRegions(data.regions)
  return makeImportedPuzzle('Sudoku Coach', givens, readCoachRules(constraints, regions), regions)
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

function readCoachRules(constraints: unknown, regions?: VariantPuzzle['regions'], grid?: SizedGrid): VariantRule[] {
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const rules: VariantRule[] = []
  for (const constraint of constraints) {
    if (!record(constraint) || !Array.isArray(constraint.segments) || typeof constraint.type !== 'string') {
      throw new Error('This Sudoku Coach puzzle has invalid rules.')
    }
    if (!['region', 'difference', 'ratio', 'odd', 'even', 'whisper', 'thermometer', 'betweenLine', 'regionSumLine', 'palindromeLine', 'renban', 'entropicLine', 'modularLine', 'sandwich', 'littleKiller'].includes(constraint.type) && hasData(constraint.settings)) throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
    if (constraint.type === 'odd' || constraint.type === 'even') {
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
        const direction = side === 'top' ? 'south' : side === 'bottom' ? 'north' : side === 'left' ? 'east' : 'west'
        const cells = Array.from({ length: 9 }, (_, i) => side === 'top' ? i * 9 + Number(index) : side === 'bottom' ? (8 - i) * 9 + Number(index)
          : side === 'left' ? Number(index) * 9 + i : Number(index) * 9 + 8 - i)
        rules.push({ type: 'sandwich', direction, cells, sum: Number(value) })
      }
    } else if (constraint.type === 'quadruple') {
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'digits') ||
          typeof segment.parameters.digits !== 'string' || !/^[1-9]{1,4}$/.test(segment.parameters.digits)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Quadruple clue.')
        }
        rules.push({ type: 'quadruple', topLeft: segment.cells[0], digits: [...segment.parameters.digits].map(Number) })
      }
    } else if (constraint.type === 'cage') {
      const cages = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !record(segment.parameters) ||
          Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.sum !== 'number') {
          throw new Error('This Sudoku Coach puzzle has an invalid Killer cage.')
        }
        return { cells: segment.cells, sum: segment.parameters.sum }
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
      const expected = kind === 'difference' ? 1 : 2
      if (markers.some(({ amount }) => amount !== expected)) {
        throw new Error(`This Sudoku Coach ${kind} marker is not supported yet.`)
      }
      const marks = { pairs: markers.map(({ cells }) => cells), negative }
      rules.push(kind === 'difference'
        ? { type: 'kropki', consecutive: marks }
        : { type: 'kropki', ratioTwo: marks })
    } else if (constraint.type === 'region') {
      if (unsupportedClueStyling(constraint.settings)) {
        throw new Error('This Sudoku Coach extra region uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no extra regions.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid extra region.')
        }
        rules.push({ type: 'extra-house', cells: segment.cells })
      }
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
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
        !LINE_STYLING.has(key) && key !== 'bulbSize' && key !== 'bulbBorderThickness'))) {
        throw new Error('This Sudoku Coach Between line uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Between lines.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 3 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Between line.')
        }
        rules.push({ type: 'between', cells: segment.cells })
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
    } else if (constraint.type === 'thermometer' || constraint.type === 'arrow') {
      if (constraint.type === 'thermometer' && hasData(constraint.settings) && (!record(constraint.settings) ||
        Object.keys(constraint.settings).some(key => !LINE_STYLING.has(key)))) {
        throw new Error('This Sudoku Coach thermometer uses unsupported settings.')
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
    : size === 6 ? labels && sixGridFromRegions(labels)
      : regions === undefined || hasMiniBoxes(regions) ? MINI_GRID : undefined
  if (!grid) throw new Error(size === 4 ? 'Mini Sudoku import requires four 2 × 2 boxes.'
    : isJigsawSize(size) ? jigsawLayoutError(size)
      : 'Import requires six rectangular boxes of 2 × 3 or 3 × 2 cells.')
  const givenDigits = grid.size === 6 ? data.givenDigits ?? undefined : data.givenDigits
  const givens = givenDigits === undefined ? '0'.repeat(grid.size ** 2) : givenDigits
  if (!isGridText(givens, grid)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  if (['quickDrawLineSegments', 'quickDrawSymbols', 'givenColours', 'colours'].some(key => hasData(data[key]))) {
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
    if (!record(constraint) || constraint.type !== 'difference' && constraint.type !== 'ratio') return readCoachRules([constraint], undefined, grid)
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
  if (!record(data) || data.size !== 4 && !isJigsawSize(data.size) && data.size !== 9 || !Array.isArray(data.grid) || data.grid.length !== data.size) {
    throw new Error('Import supports 4 × 4, 5 × 5 Jigsaw, 7 × 7 Jigsaw, and 9 × 9 f-puzzles grids.')
  }
  const size = data.size
  const mini = size === MINI_GRID.size
  const jigsaw = isJigsawSize(size)
  const fields = jigsaw ? FPUZZLES_JIGSAW_FIELDS : FPUZZLES_FIELDS
  for (const [key, value] of Object.entries(data)) {
    if (!fields.has(key) && hasData(value)) throw new Error(`This f-puzzles rule is not supported yet (${key}).`)
  }
  if (hasData(data.ruleset) && (typeof data.ruleset !== 'string' ||
    !PLAIN_RULES.test(data.ruleset) && !(mini && PLAIN_MINI_RULES.test(data.ruleset)) &&
    !(jigsaw && knownJigsawRuleset(data.ruleset, size)))) {
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
        : mini ? Math.floor(index / 8) * 2 + Math.floor(index % 4 / 2) : standardRegion(index)
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
      return { cells: cage.cells.map(cell => fpCellIndex(cell)), sum: Number(cage.value) }
    }) })
  }
  return makeImportedPuzzle(format, digits.join(''), rules, readRegions(labels))
}

function fromSudokuPad(code: string, format: ImportFormat = 'SudokuPad'): ImportedPuzzle {
  if (/^scf/i.test(code)) return digitRuns(code.slice(3), 'SudokuPad')
  if (FP_CODE.test(code)) return fromFPuzzles(code.replace(FP_CODE, ''), 'SudokuPad')
  if (/^(scl|ctc)/i.test(code)) {
    const data = decodeSudokuPadEnvelope(code)
    if (record(data) && Array.isArray(data.cells) && Array.isArray(data.regions) &&
      (data.regions.length === 4 || data.regions.length === 6) && data.cells.length === data.regions.length + 2) {
      return { ...readLinkedDoubleArrowSudokuPad(data), format }
    }
    if (record(data) && Array.isArray(data.cells) && (data.cells.length === 6 ||
      data.cells.length === 4 && ['lines', 'underlays', 'overlays', 'arrows'].some(field => Object.hasOwn(data, field)))) {
      return { ...readSizedRuleSudokuPad(data), format }
    }
    const { givens, grid, rules, source } = decodeSizedSudokuPad(code, data)
    return { givens, grid, algebraic: { rules, source }, format }
  }
  throw new Error('This SudokuPad link does not contain the puzzle data. For Classic puzzles, copy the 81 givens.')
}

async function publishedPuzzleCode(source: 'sudoku-coach' | 'sudokupad', id: string) {
  const response = await fetch(`/api/v1/import/${source}/${id}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(typeof error === 'string' ? error : 'Could not open this published puzzle.')
  }
  const { code } = await response.json()
  if (typeof code !== 'string' || code.length > MAX_IMPORT_LENGTH) throw new Error('This link does not contain a supported puzzle export.')
  return code
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
      if (!record(shared) || !isPuzzleVariantId(shared.id) || shared.id === 'classic' || !isPlayablePuzzle(shared.id, shared.puzzle)) {
        throw new Error('This link is missing a valid Sudoku variant.')
      }
      const variant: NonNullable<ImportedPuzzle['variant']> = { id: shared.id, puzzle: shared.puzzle }
      return { givens: variant.puzzle.givens, format: 'Puzzle link', variant }
    }
    if (url.hash.startsWith('#puzzle=')) return { givens: parsePuzzle(url.href), format: 'Puzzle link' }
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'sudoku.coach') {
      const id = url.pathname.match(/^\/(?:[a-z]{2}\/)?s\/([A-Za-z0-9]{1,16})\/?$/i)?.[1]
      if (id) return fromCoach(await publishedPuzzleCode('sudoku-coach', id), true)
      const code = url.pathname.match(/^\/(?:[a-z]{2}\/)?(?:play|solver|construct)\/([^/]+)\/?$/i)?.[1] ?? ''
      if (code.toLowerCase().startsWith('scv')) return fromCoach(decodeURIComponent(code))
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
        !/^(?:scl|ctc|scf|fpuz)/i.test(code)) return fromSudokuPad(await publishedPuzzleCode('sudokupad', code))
      return fromSudokuPad(code)
    }
    throw new Error('This link format is not supported. Try pasting the puzzle code or its 81 givens.')
  }
  if (text.toLowerCase().startsWith('scv')) return fromCoach(text)
  if (/^(scf|scl|ctc)/i.test(text)) return fromSudokuPad(text)
  if (FP_CODE.test(text)) return fromFPuzzles(text.replace(FP_CODE, ''), 'f-puzzles')
  if (text.startsWith('{') || /^N4[A-Za-z0-9+/=]+$/.test(text)) return fromFPuzzles(text, 'f-puzzles')
  const mini = textGridCells(text).replaceAll('.', '0')
  if (isGridText(mini, MINI_GRID)) return { givens: mini, format: 'Text grid', grid: MINI_GRID }
  return { givens: parsePuzzle(text), format: text.startsWith(':') ? 'HoDoKu' : 'Text grid' }
}
