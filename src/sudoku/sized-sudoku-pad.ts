import lzString from 'lz-string'
import { parseAlgebraicTotal } from './algebraic-cages.ts'
import { MINI_GRID, isGridText } from './grid.ts'
import type { SizedVariantPosition } from './engine.ts'

type ObjectValue = Record<string, unknown>
type Cage = SizedVariantPosition['rules'][number]

export type SizedSudokuPadImport = {
  givens: string
  grid: typeof MINI_GRID
  rules: Cage[]
  source: { id: string; code: string; title: string; author: string; rulesText: string; solution?: string; format?: string }
}

const MAX_CODE = 10_000
const MAX_DECODED = 128_000
const FIELDS = ['id', 'metadata', 'cells', 'regions', 'cages']
const METADATA = ['source', 'title', 'author', 'rules', 'solution']

function record(value: unknown): value is ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function reject(message: string): never {
  throw new Error(message)
}

function cellIndex(coordinates: unknown) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2 ||
    coordinates.some(value => !Number.isInteger(value) || value < 0 || value >= MINI_GRID.size)) {
    return reject('This SudokuPad puzzle has an invalid cell reference.')
  }
  return coordinates[0] * MINI_GRID.size + coordinates[1]
}

function boxAt(cell: number) {
  return Math.floor(cell / 8) * 2 + Math.floor(cell % 4 / 2)
}

function readRule(cage: unknown): Cage {
  if (!record(cage) || Object.keys(cage).some(key => key !== 'cells' && key !== 'value') ||
    !Array.isArray(cage.cells) || cage.cells.length < 1 || cage.cells.length > 4) {
    return reject('This SudokuPad puzzle has an unsupported cage.')
  }
  const cells = cage.cells.map(cellIndex)
  if (new Set(cells).size !== cells.length) return reject('A SudokuPad cage lists the same cell twice.')
  const label = typeof cage.value === 'number' || typeof cage.value === 'string' ? String(cage.value) : ''
  const total = parseAlgebraicTotal(label)
  if (!total) return reject('This SudokuPad cage has an unsupported total expression.')
  return { type: 'algebraic-cage', cells, label, total }
}

/** Decode the plain-JSON SCL envelope used by the supported 4×4 arithmetic export. */
export function decodeSizedSudokuPad(code: string): SizedSudokuPadImport {
  if (!/^(?:scl|ctc)[A-Za-z0-9+/=]+$/i.test(code) || code.length > MAX_CODE) {
    return reject('This SudokuPad code is damaged or too large.')
  }
  const decoded = lzString.decompressFromBase64(code.slice(3))
  if (!decoded || decoded.length > MAX_DECODED) return reject('This SudokuPad code is empty or too large.')
  let data: unknown
  try {
    data = JSON.parse(decoded)
  } catch {
    return reject('This SudokuPad code does not contain a supported puzzle export.')
  }
  if (!record(data) || Object.keys(data).some(key => !FIELDS.includes(key)) ||
    typeof data.id !== 'string' || !data.id || !record(data.metadata) ||
    Object.keys(data.metadata).some(key => !METADATA.includes(key))) {
    return reject('This SudokuPad export contains unsupported puzzle fields.')
  }

  if (!Array.isArray(data.cells) || data.cells.length !== 4 || data.cells.some(row => !Array.isArray(row) || row.length !== 4)) {
    return reject('This SudokuPad export requires a 4 × 4 grid.')
  }
  const givens = data.cells.flat().map(cell => {
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      cell.value !== undefined && !(Number.isInteger(cell.value) && Number(cell.value) >= 1 && Number(cell.value) <= 4)) {
      return reject('This SudokuPad puzzle contains an unsupported cell clue.')
    }
    return String(cell.value ?? 0)
  }).join('')

  if (!Array.isArray(data.regions) || data.regions.length !== 4 ||
    !data.regions.every(region => Array.isArray(region) && region.length === 4)) {
    return reject('This SudokuPad puzzle requires four 2 × 2 boxes.')
  }
  const boxes = data.regions.map(region => region.map(cellIndex))
  if (new Set(boxes.flat()).size !== 16 || boxes.some(box => !box.every((cell: number) => boxAt(cell) === boxAt(box[0])))) {
    return reject('This SudokuPad puzzle requires four 2 × 2 boxes.')
  }
  if (!Array.isArray(data.cages) || data.cages.length < 1 || data.cages.length > 16) {
    return reject('This SudokuPad export has an invalid list of cages.')
  }

  const { author, title, rules: rulesText, solution, source: format } = data.metadata
  const rules = data.cages.map(readRule)
  const cageCells = rules.flatMap(rule => rule.cells)
  if (new Set(cageCells).size !== cageCells.length) {
    return reject('This SudokuPad export has overlapping cages.')
  }
  if (typeof author !== 'string' || typeof title !== 'string' || typeof rulesText !== 'string' ||
    (format !== undefined && typeof format !== 'string') || (solution !== undefined && (!isGridText(solution, MINI_GRID) || solution.includes('0')))) {
    return reject('This SudokuPad puzzle has invalid author or rule information.')
  }
  const supportedRules = /^\* Normal 4\s*[x×]\s*4 Sudoku rules apply: Place the digits 1-4 in each row, column, and region\.\s*\* Algebraic Killer Cages: Digits in a cage must not repeat and must sum to the total in the top-left corner of the cage\. "([A-Za-z][A-Za-z0-9_]*)" is a positive integer to be determined by the solver\.$/i
  const variable = supportedRules.exec(rulesText)?.[1]
  const names = new Set(rules.flatMap(rule => rule.total.type === 'variable' ? [rule.total.name] : []))
  if (!variable || names.size !== 1 || !names.has(variable)) {
    return reject('The authored SudokuPad rules include text this importer cannot verify.')
  }
  return { givens, grid: MINI_GRID, rules, source: { id: data.id, code, title, author, rulesText, solution, format } }
}
