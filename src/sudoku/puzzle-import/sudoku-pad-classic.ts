import type { VariantRule } from '../engine.ts'
import { makeImportedPuzzle, record } from './shared.ts'

const FIELDS = new Set(['id', 'metadata', 'cells', 'regions', 'cages', 'overlays', 'underlays', 'lines', 'arrows'])
const METADATA = new Set(['source', 'title', 'author', 'rules', 'solution', 'msgcorrect'])

function reject(message: string): never {
  throw new Error(message)
}

function cellIndex(value: unknown) {
  if (!Array.isArray(value) || value.length !== 2 ||
    value.some(coordinate => !Number.isInteger(coordinate) || coordinate < 0 || coordinate > 8)) {
    return reject('This SudokuPad puzzle has an invalid cell reference.')
  }
  return Number(value[0]) * 9 + Number(value[1])
}

function readGivens(cells: unknown) {
  if (!Array.isArray(cells) || cells.length !== 9 || cells.some(row => !Array.isArray(row) || row.length !== 9)) {
    return reject('This SudokuPad export requires a 9 × 9 grid.')
  }
  return cells.flat().map(cell => {
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      cell.value !== undefined && !(Number.isInteger(cell.value) && Number(cell.value) >= 1 && Number(cell.value) <= 9)) {
      return reject('This SudokuPad puzzle contains an unsupported cell clue.')
    }
    return String(cell.value ?? 0)
  }).join('')
}

function readRegions(regions: unknown) {
  if (!Array.isArray(regions) || regions.length !== 9) return reject('This SudokuPad puzzle requires nine 3 × 3 boxes.')
  const seen = new Set<number>()
  for (const region of regions) {
    if (!Array.isArray(region) || region.length !== 9) return reject('This SudokuPad puzzle requires nine 3 × 3 boxes.')
    const cells = region.map(cellIndex)
    const first = cells[0]
    const box = Math.floor(Math.floor(first / 9) / 3) * 3 + Math.floor((first % 9) / 3)
    if (cells.some(cell => Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3) !== box) ||
      cells.some(cell => seen.has(cell))) return reject('This SudokuPad puzzle has invalid 3 × 3 boxes.')
    cells.forEach(cell => seen.add(cell))
  }
  if (seen.size !== 81) return reject('This SudokuPad puzzle has invalid 3 × 3 boxes.')
}

function readCages(cages: unknown) {
  if (!Array.isArray(cages) || !cages.length || cages.length > 81) return reject('This SudokuPad puzzle has an invalid list of Killer cages.')
  const used = new Set<number>()
  const result = cages.map(cage => {
    if (!record(cage) || Object.keys(cage).some(key => !['cells', 'value', 'unique'].includes(key)) ||
      !Array.isArray(cage.cells) || typeof cage.value !== 'number' || !Number.isInteger(cage.value) ||
      cage.value < 1 || cage.value > 45 || cage.unique !== true) {
      return reject('This SudokuPad export has an unsupported Killer cage.')
    }
    const cells = cage.cells.map(cellIndex)
    if (!cells.length || new Set(cells).size !== cells.length || cells.some(cell => used.has(cell))) {
      return reject('This SudokuPad export has overlapping or invalid Killer cages.')
    }
    cells.forEach(cell => used.add(cell))
    return { cells, sum: Number(cage.value) }
  })
  return { type: 'killer-cages', cages: result } as const
}

function readQuadruples(overlays: unknown) {
  if (!Array.isArray(overlays) || !overlays.length || overlays.length > 256) {
    return reject('This SudokuPad puzzle has invalid Quadruple clues.')
  }
  return overlays.map(mark => {
    if (!record(mark) || Object.keys(mark).some(key => ![
      'center', 'width', 'height', 'rounded', 'text', 'backgroundColor', 'borderColor', 'borderSize', 'thickness', 'color', 'stroke',
    ].includes(key)) || !Array.isArray(mark.center) || mark.center.length !== 2 ||
      !mark.center.every(coordinate => Number.isInteger(coordinate)) ||
      typeof mark.text !== 'string' || !/^[1-9]{1,4}$/.test(mark.text)) {
      return reject('This SudokuPad export has an unsupported Quadruple clue.')
    }
    const [row, column] = mark.center as number[]
    if (row < 1 || row > 8 || column < 1 || column > 8) return reject('A SudokuPad Quadruple clue must sit between four cells.')
    const digits = [...mark.text].map(Number)
    return { type: 'quadruple', topLeft: (row - 1) * 9 + column - 1, digits } as const
  })
}

const BASE_RULE = /^(?:standard|normal) 9\s*[x×]\s*9 sudoku rules apply\.?$/i
const NONCONSECUTIVE_RULE = /^Nonconsecutive: Any two orthogonally adjacent cells cannot contain consecutive digits\.?$/i
const QUADRUPLE_RULE = /^Quadruples: Digits in white circles must be present at least once in the cells the clue touches\. If a digit appears more than once in a circle, it must be present at least that many times in the cells the clue touches\.?$/i
const KILLER_RULES = [
  /^Killer Cages: Digits in a cage may not repeat and must sum to the number in the top left corner of that cage\.?$/i,
  /^Killer cages: digits in a killer cage must sum to the number in the top left corner and cannot repeat\.?$/i,
]

export function readClassicSudokuPad(data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !FIELDS.has(key)) || data.id !== undefined && typeof data.id !== 'string' || !record(data.metadata) ||
    Object.keys(data.metadata).some(key => !METADATA.has(key)) || typeof data.metadata.rules !== 'string') {
    return reject('This SudokuPad export contains unsupported puzzle fields.')
  }
  const givens = readGivens(data.cells)
  readRegions(data.regions)
  const clauses = data.metadata.rules.trim().split(/\n+/).map(clause => clause.replace(/\s+/g, ' ')).filter(Boolean)
  if (!clauses.length || !BASE_RULE.test(clauses[0])) return reject('This SudokuPad puzzle has authored rules this importer cannot verify.')
  const rules: VariantRule[] = []
  let hasNonconsecutive = false
  let hasQuadruples = false
  let hasKillerCages = false
  for (const clause of clauses.slice(1)) {
    if (NONCONSECUTIVE_RULE.test(clause) && !hasNonconsecutive) {
      hasNonconsecutive = true
      rules.push({ type: 'non-consecutive' })
    } else if (QUADRUPLE_RULE.test(clause) && !hasQuadruples) {
      hasQuadruples = true
    } else if (KILLER_RULES.some(pattern => pattern.test(clause)) && !hasKillerCages) {
      hasKillerCages = true
    } else return reject('This SudokuPad puzzle has authored rules this importer cannot verify.')
  }
  if (hasQuadruples) rules.push(...readQuadruples(data.overlays))
  else if (data.overlays !== undefined && (!Array.isArray(data.overlays) || data.overlays.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (data.underlays !== undefined && (!Array.isArray(data.underlays) || data.underlays.length) ||
    data.lines !== undefined && (!Array.isArray(data.lines) || data.lines.length) ||
    data.arrows !== undefined && (!Array.isArray(data.arrows) || data.arrows.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (hasKillerCages) rules.push(readCages(data.cages))
  else if (data.cages !== undefined && (!Array.isArray(data.cages) || data.cages.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  const imported = makeImportedPuzzle(givens, rules, undefined)
  if (data.metadata.title !== undefined && typeof data.metadata.title !== 'string' ||
    data.metadata.author !== undefined && typeof data.metadata.author !== 'string') {
    return reject('This SudokuPad puzzle has invalid author or title information.')
  }
  const rawSolution = data.metadata.solution
  if (rawSolution !== undefined && (typeof rawSolution !== 'string' || !/^[0-9]{81}$/.test(rawSolution) || rawSolution.includes('0'))) {
    return reject('This SudokuPad puzzle has an invalid solution.')
  }
  const title = typeof data.metadata.title === 'string' ? data.metadata.title : undefined
  const author = typeof data.metadata.author === 'string' ? data.metadata.author : undefined
  const solution = rawSolution
  return {
    ...imported,
    ...(typeof title === 'string' && title && { title }),
    ...(typeof author === 'string' && author && { sizedAuthor: author }),
    ...(solution && { authoredSolution: solution }),
  }
}
