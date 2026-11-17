import lzString from 'lz-string'
import type { VariantPuzzle, VariantRule } from './engine.ts'
import { parsePuzzle } from './formats.ts'
import { EMPTY } from './game.ts'
import { isPlayablePuzzle, isPuzzleVariantId, variantIdForPuzzle, type VariantGame } from './variants.ts'

export const MAX_IMPORT_LENGTH = 20_000
const MAX_DECODED_LENGTH = 128_000
const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'
const DIGIT_RUNS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'
const COACH_CODE = /^SCv([0-9]+)_([0-9]+)_/i
const FP_CODE = /^fpuz(?:zles)?/i
const COACH_FIELDS = new Set([
  'gridSize', 'givenDigits', 'regions', 'givenConstraints', 'meta', 'metaSolver', 'colours',
  'constructorPreviewDigits', 'constructorConstructionParameters', 'quickDrawLineSegments', 'quickDrawSymbols', 'acid',
])
const FPUZZLES_FIELDS = new Set(['size', 'grid', 'title', 'author', 'ruleset', 'solution', 'successMessage', 'killercage', 'diagonal+', 'diagonal-'])
const PLAIN_RULES = /^\s*(?:(?:normal|standard) (?:classic )?sudoku rules apply[.!]?)?\s*$/i

export type ImportFormat = 'Sudoku Coach' | 'Sudoku Exchange' | 'SudokuPad' | 'f-puzzles' | 'Puzzle link' | 'HoDoKu' | 'Text grid'
export type ImportedPuzzle = {
  givens: string
  format: ImportFormat
  variant?: Pick<VariantGame, 'id' | 'puzzle'>
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

async function fromCoach(code: string): Promise<ImportedPuzzle> {
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
  if (!record(data) || data.gridSize !== 9) throw new Error('Import supports 9 × 9 Sudoku Coach puzzles.')
  for (const [key, value] of Object.entries(data)) {
    if (!COACH_FIELDS.has(key) && !key.startsWith('user') && hasData(value)) {
      throw new Error(`This Sudoku Coach puzzle uses an unsupported field (${key}).`)
    }
  }
  const givens = data.givenDigits === undefined ? EMPTY : data.givenDigits
  if (typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const constraints = data.givenConstraints ?? []
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const rules: VariantRule[] = []
  for (const constraint of constraints) {
    if (!record(constraint) || !Array.isArray(constraint.segments) || typeof constraint.type !== 'string') {
      throw new Error('This Sudoku Coach puzzle has invalid rules.')
    }
    if (!['region', 'difference', 'ratio', 'odd', 'even'].includes(constraint.type) && hasData(constraint.settings)) throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
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
    } else if (constraint.type === 'diagonalPositive' || constraint.type === 'diagonalNegative' || constraint.type === 'antiKnight' || constraint.type === 'antiKing') {
      if (constraint.segments.length) throw new Error(`This Sudoku Coach puzzle uses unsupported cells for ${constraint.type}.`)
      if (constraint.type === 'antiKnight') rules.push({ type: 'anti-knight' })
      else if (constraint.type === 'antiKing') rules.push({ type: 'anti-king' })
      else rules.push({ type: 'diagonal', diagonal: constraint.type === 'diagonalNegative' ? 'main' : 'anti' })
    } else if (constraint.type === 'difference' || constraint.type === 'ratio') {
      const kind = constraint.type
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) ||
        Object.keys(settings).some(key => key !== 'negativeConstraint') ||
        settings.negativeConstraint !== undefined && typeof settings.negativeConstraint !== 'boolean')) {
        throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
      }
      const pairs = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== kind)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${constraint.type} marker.`)
        }
        const expected = constraint.type === 'difference' ? 1 : 2
        if (segment.parameters[kind] !== undefined && segment.parameters[kind] !== expected) {
          throw new Error(`This Sudoku Coach ${constraint.type} marker is not supported yet.`)
        }
        return segment.cells as [number, number]
      })
      const marks = { pairs, negative: record(settings) && settings.negativeConstraint === true }
      rules.push(constraint.type === 'difference'
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
    } else if (constraint.type === 'thermometer' || constraint.type === 'arrow') {
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
  return makeImportedPuzzle('Sudoku Coach', givens, rules, readRegions(data.regions))
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

function fpCellIndex(value: unknown) {
  const match = typeof value === 'string' ? /^R([1-9])C([1-9])$/i.exec(value) : null
  if (!match) throw new Error('This f-puzzles export contains an invalid cell reference.')
  return (Number(match[1]) - 1) * 9 + Number(match[2]) - 1
}

function fromFPuzzles(input: string, format: 'f-puzzles' | 'SudokuPad'): ImportedPuzzle {
  const code = input.replaceAll(' ', '+')
  // f-puzzles uses LZ-String Base64. Limit compressed input before decoding it.
  const data = parseJSON(input.startsWith('{') ? input :
    /^[A-Za-z0-9+/=]{1,10000}$/.test(code) ? lzString.decompressFromBase64(code) : '', format)
  if (!record(data) || data.size !== 9 || !Array.isArray(data.grid) || data.grid.length !== 9) {
    throw new Error('Import supports 9 × 9 f-puzzles grids.')
  }
  for (const [key, value] of Object.entries(data)) {
    if (!FPUZZLES_FIELDS.has(key) && hasData(value)) throw new Error(`This f-puzzles rule is not supported yet (${key}).`)
  }
  if (hasData(data.ruleset) && (typeof data.ruleset !== 'string' || !PLAIN_RULES.test(data.ruleset))) {
    throw new Error('This f-puzzles export contains custom rules text. Import requires rules the app can read from the board.')
  }
  const labels: unknown[] = []
  const digits: string[] = []
  for (const row of data.grid) {
    if (!Array.isArray(row) || row.length !== 9) throw new Error('This f-puzzles export has an invalid grid.')
    for (const cell of row) {
      if (!record(cell) || (cell.given && !/^[1-9]$/.test(String(cell.value)))) {
        throw new Error('This f-puzzles export has invalid givens.')
      }
      for (const [key, value] of Object.entries(cell)) {
        if (!['value', 'given', 'region', 'centerPencilMarks', 'cornerPencilMarks'].includes(key) && hasData(value)) {
          throw new Error(`This f-puzzles cell clue is not supported yet (${key}).`)
        }
      }
      labels.push(cell.region === undefined ? standardRegion(digits.length) : cell.region)
      digits.push(cell.given ? String(cell.value) : '0')
    }
  }
  const rules: VariantRule[] = []
  for (const key of ['diagonal+', 'diagonal-']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error('This f-puzzles export has an invalid diagonal.')
  }
  if (data['diagonal+'] === true) rules.push({ type: 'diagonal', diagonal: 'anti' })
  if (data['diagonal-'] === true) rules.push({ type: 'diagonal', diagonal: 'main' })
  if (hasData(data.killercage)) {
    if (!Array.isArray(data.killercage)) throw new Error('This f-puzzles export has invalid Killer cages.')
    rules.push({ type: 'killer-cages', cages: data.killercage.map((cage: unknown) => {
      if (!record(cage) || !Array.isArray(cage.cells) || !/^[0-9]{1,2}$/.test(String(cage.value))) {
        throw new Error('This f-puzzles export has a Killer cage without a valid sum.')
      }
      return { cells: cage.cells.map(fpCellIndex), sum: Number(cage.value) }
    }) })
  }
  return makeImportedPuzzle(format, digits.join(''), rules, readRegions(labels))
}

function fromSudokuPad(code: string): ImportedPuzzle {
  if (/^scf/i.test(code)) return digitRuns(code.slice(3), 'SudokuPad')
  if (FP_CODE.test(code)) return fromFPuzzles(code.replace(FP_CODE, ''), 'SudokuPad')
  if (/^(scl|ctc)/i.test(code)) throw new Error('This SudokuPad link uses a format the app cannot import yet. For Classic puzzles, copy the 81 givens.')
  throw new Error('This SudokuPad link does not contain the puzzle data. For Classic puzzles, copy the 81 givens.')
}

export async function detectPuzzle(input: string): Promise<ImportedPuzzle> {
  const text = input.trim().replace(/^```(?:text)?\s*([\s\S]*?)\s*```$/i, '$1')
  if (text.length > MAX_IMPORT_LENGTH) throw new Error('Paste one puzzle at a time.')
  const link = /^(?:www\.)?(?:sudoku\.coach|sudokuexchange\.com|(?:beta\.)?sudokupad\.app|f-puzzles\.com)\//i.test(text)
    ? `https://${text}` : text
  const base = 'https://sudoku.invalid'
  const url = /^(https?:\/\/|#(?:puzzle|variant)=)/i.test(link) && URL.canParse(link, base) ? new URL(link, base) : null
  if (url) {
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
      if (/^\/(?:[a-z]{2}\/)?s\//i.test(url.pathname)) throw new Error('Open this short link in Sudoku Coach, then use Copy → Puzzle.')
      const code = url.pathname.match(/^\/(?:[a-z]{2}\/)?(?:play|solver|construct)\/([^/]+)\/?$/i)?.[1] ?? ''
      if (code.toLowerCase().startsWith('scv')) return fromCoach(decodeURIComponent(code))
      if (/^[0-9.]{81}$/.test(code)) return { givens: parsePuzzle(code), format: 'Sudoku Coach' }
      throw new Error('This Sudoku Coach link does not contain a puzzle code. Open it and use Copy → Puzzle.')
    }
    if (host === 'sudokuexchange.com' && /^\/play\/?$/.test(url.pathname)) return digitRuns(url.searchParams.get('s') ?? '', 'Sudoku Exchange')
    if (host === 'f-puzzles.com') return fromFPuzzles(url.searchParams.get('load') ?? '', 'f-puzzles')
    if (['sudokupad.app', 'beta.sudokupad.app', 'sudokupad.svencodes.com', 'app.crackingthecryptic.com'].includes(host)) {
      return fromSudokuPad(decodeURIComponent(url.pathname.slice(1)).replace(/\/$/, ''))
    }
    throw new Error('This link format is not supported. Try pasting the puzzle code or its 81 givens.')
  }
  if (text.toLowerCase().startsWith('scv')) return fromCoach(text)
  if (/^(scf|scl|ctc)/i.test(text)) return fromSudokuPad(text)
  if (FP_CODE.test(text)) return fromFPuzzles(text.replace(FP_CODE, ''), 'f-puzzles')
  if (text.startsWith('{') || /^N4[A-Za-z0-9+/=]+$/.test(text)) return fromFPuzzles(text, 'f-puzzles')
  return { givens: parsePuzzle(text), format: text.startsWith(':') ? 'HoDoKu' : 'Text grid' }
}
