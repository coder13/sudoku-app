import type { VariantRule } from '../engine.ts'
import { WINDOKU_REGIONS } from '../variants.ts'
import { readKropkiDots, readPath } from '../sized-rule-sudoku-pad.ts'
import { makeImportedPuzzle, record } from './shared.ts'

const FIELDS = new Set(['id', 'metadata', 'cells', 'regions', 'cages', 'overlays', 'underlays', 'lines', 'arrows',
  'windoku', 'diagonal+', 'diagonal-'])
const METADATA = new Set(['source', 'title', 'author', 'rules', 'solution', 'msgcorrect', 'antiking', 'antiknight', 'nextpuzzle', 't'])

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

function readThermometers(lines: unknown, underlays: unknown): VariantRule[] {
  if (!Array.isArray(lines) || !lines.length || lines.length > 128 || !Array.isArray(underlays) ||
    !underlays.length || underlays.length > 128) {
    return reject('This SudokuPad thermometer is missing its line or bulb.')
  }
  const bulbs = underlays.map(mark => {
    if (!record(mark) || Object.keys(mark).some(key => !['center', 'width', 'height', 'rounded', 'backgroundColor', 'stroke'].includes(key)) ||
      !Array.isArray(mark.center) || mark.center.length !== 2 ||
      mark.center.some(coordinate => typeof coordinate !== 'number' || !Number.isInteger(coordinate - .5)) ||
      mark.rounded !== true || typeof mark.width !== 'number' || mark.width <= 0 || mark.width > 1 || mark.width !== mark.height ||
      typeof mark.backgroundColor !== 'string' || mark.stroke !== undefined && mark.stroke !== 'none') {
      return reject('This SudokuPad export has an unsupported thermometer bulb.')
    }
    return { cell: cellIndex([mark.center[0] - .5, mark.center[1] - .5]), color: mark.backgroundColor.toLowerCase() }
  })
  if (new Set(bulbs.map(bulb => bulb.cell)).size !== bulbs.length) return reject('Two SudokuPad thermometer bulbs overlap.')
  const rules = lines.map(line => {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      return reject('This SudokuPad export has an unsupported thermometer line.')
    }
    const path = readPath(line.wayPoints, 9)
    if (path.length < 2 || new Set(path).size !== path.length) return reject('This SudokuPad thermometer has an invalid path.')
    const color = line.color.toLowerCase()
    const ends = [path[0], path[path.length - 1]]
    const matching = bulbs.flatMap((bulb, index) => bulb.color === color && ends.includes(bulb.cell) ? [index] : [])
    if (matching.length !== 1) return reject('Each SudokuPad thermometer needs one matching bulb at an end of its line.')
    const [bulbIndex] = matching
    const [bulb] = bulbs.splice(bulbIndex, 1)
    return { type: 'thermometer' as const, cells: bulb.cell === path[0] ? path : path.reverse() }
  })
  if (bulbs.length) return reject('A SudokuPad thermometer bulb is missing its line.')
  return rules
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
  const markFields = ['center', 'width', 'height', 'rounded', 'text', 'backgroundColor', 'borderColor', 'borderSize', 'thickness', 'color', 'stroke']
  const centered = (mark: Record<string, unknown>): mark is Record<string, unknown> & { center: [number, number] } =>
    Array.isArray(mark.center) && mark.center.length === 2 && mark.center.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))
  const topLeft = (center: readonly number[]) => {
    const [row, column] = center
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 1 || row > 8 || column < 1 || column > 8) {
      return reject('A SudokuPad Quadruple clue must sit between four cells.')
    }
    return (row - 1) * 9 + column - 1
  }
  const circles: Record<string, unknown>[] = []
  const numbers: Record<string, unknown>[] = []
  const direct: { topLeft: number; digits: number[] }[] = []
  for (const mark of overlays) {
    if (!record(mark) || Object.keys(mark).some(key => !markFields.includes(key)) || !centered(mark)) {
      return reject('This SudokuPad export has an unsupported Quadruple clue.')
    }
    if (typeof mark.text === 'number' && Number.isInteger(mark.text) && mark.text >= 1 && mark.text <= 9 &&
      mark.width === 0.1 && mark.height === 0.1) {
      numbers.push(mark)
    } else if (mark.text === '' && mark.rounded === true && mark.width === 0.62 && mark.height === 0.62 &&
      typeof mark.backgroundColor === 'string' && mark.backgroundColor.toLowerCase() === '#ffffff' &&
      typeof mark.borderColor === 'string' && mark.borderColor.toLowerCase() === '#000000') {
      circles.push(mark)
    } else if (typeof mark.text === 'string' && /^[1-9]{1,4}$/.test(mark.text)) {
      direct.push({ topLeft: topLeft(mark.center), digits: [...mark.text].map(Number) })
    } else return reject('This SudokuPad export has an unsupported Quadruple clue.')
  }
  if (direct.length && (circles.length || numbers.length) || !direct.length && (!circles.length || !numbers.length)) {
    return reject('This SudokuPad export has an unsupported Quadruple clue.')
  }
  if (direct.length) return direct.map(rule => ({ type: 'quadruple', ...rule } as const))

  const assigned = new Map<Record<string, unknown>, number[]>()
  for (const circle of circles) assigned.set(circle, [])
  for (const mark of numbers) {
    const [row, column] = mark.center as number[]
    const matches = circles.map(circle => {
      const [circleRow, circleColumn] = circle.center as number[]
      return { circle, distance: Math.hypot(row - circleRow, column - circleColumn) }
    }).filter(({ distance }) => distance <= 0.2).sort((left, right) => left.distance - right.distance)
    if (!matches.length || matches[1]?.distance === matches[0].distance) {
      return reject('This SudokuPad export has a number that does not belong to one Quadruple circle.')
    }
    assigned.get(matches[0].circle)?.push(mark.text as number)
  }
  return circles.map(circle => {
    const digits = assigned.get(circle) ?? []
    if (!digits.length || digits.length > 4) return reject('This SudokuPad export has an invalid Quadruple circle.')
    return { type: 'quadruple' as const, topLeft: topLeft(circle.center as number[]), digits }
  })
}

const BASE_RULE = /^(?:standard|normal)(?: 9\s*[x×]\s*9)? sudoku rules apply\.?$/i
const NONCONSECUTIVE_RULE = /^Nonconsecutive: Any two orthogonally adjacent cells cannot contain consecutive digits\.?$/i
const QUADRUPLE_RULE = /^Quadruples: Digits in white circles must be present at least once in the cells the clue touches\. If a digit appears more than once in a circle, it must be present at least that many times in the cells the clue touches\.?$/i
const KILLER_RULES = [
  /^Killer Cages: Digits in a cage may not repeat and must sum to the number in the top left corner of that cage\.?$/i,
  /^Killer cages: digits in a killer cage must sum to the number in the top left corner and cannot repeat\.?$/i,
]
const WINDOKU_RULE = /^Windoku: there are 4 indicated additional 3x3 regions\.?$/i
const X_SUDOKU_RULE = /^X-sudoku: digits cannot repeat along major diagonals\.?$/i

function readWindokuUnderlays(underlays: unknown) {
  if (!Array.isArray(underlays) || underlays.length !== WINDOKU_REGIONS.length) {
    return reject('This SudokuPad Windoku has incomplete region markings.')
  }
  const centers = WINDOKU_REGIONS.map(cells => [
    cells.reduce((sum, cell) => sum + Math.floor(cell / 9), 0) / cells.length + .5,
    cells.reduce((sum, cell) => sum + cell % 9, 0) / cells.length + .5,
  ])
  const found = new Set<string>()
  for (const mark of underlays) {
    if (!record(mark) || Object.keys(mark).some(key => !['center', 'width', 'height', 'backgroundColor'].includes(key)) ||
      !Array.isArray(mark.center) || mark.center.length !== 2 || mark.width !== 3 || mark.height !== 3 ||
      typeof mark.backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(mark.backgroundColor)) {
      return reject('This SudokuPad Windoku has unsupported region markings.')
    }
    const coordinates = mark.center as number[]
    const center = centers.find(([row, column]) => row === coordinates[0] && column === coordinates[1])
    if (!center) return reject('This SudokuPad Windoku has unsupported region markings.')
    found.add(center.join(','))
  }
  if (found.size !== centers.length) return reject('This SudokuPad Windoku has overlapping region markings.')
}

function readDiagonalLines(lines: unknown) {
  if (!Array.isArray(lines) || lines.length !== 2) return reject('This SudokuPad X-Sudoku has incomplete diagonal markings.')
  const diagonals = new Set<string>()
  for (const line of lines) {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0 ||
      !Array.isArray(line.wayPoints) || line.wayPoints.length !== 2 ||
      line.wayPoints.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== 'number'))) {
      return reject('This SudokuPad X-Sudoku has unsupported diagonal markings.')
    }
    const points = line.wayPoints as number[][]
    const key = points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 9 && points[1][1] === 9 ||
      points[1][0] === 0 && points[1][1] === 0 && points[0][0] === 9 && points[0][1] === 9 ? 'main'
      : points[0][0] === 0 && points[0][1] === 9 && points[1][0] === 9 && points[1][1] === 0 ||
        points[1][0] === 0 && points[1][1] === 9 && points[0][0] === 9 && points[0][1] === 0 ? 'anti' : undefined
    if (!key || diagonals.has(key)) return reject('This SudokuPad X-Sudoku has unsupported diagonal markings.')
    diagonals.add(key)
  }
  if (!diagonals.has('main') || !diagonals.has('anti')) return reject('This SudokuPad X-Sudoku has incomplete diagonal markings.')
}

export function readClassicSudokuPad(data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !FIELDS.has(key)) || data.id !== undefined && typeof data.id !== 'string' || !record(data.metadata) ||
    Object.keys(data.metadata).some(key => !METADATA.has(key)) ||
    typeof data.metadata.rules !== 'string' && (!Array.isArray(data.metadata.rules) || data.metadata.rules.some(rule => typeof rule !== 'string')) ||
    ['title', 't', 'author', 'nextpuzzle', 'solution'].some(key => (data.metadata as Record<string, unknown>)[key] !== undefined && typeof (data.metadata as Record<string, unknown>)[key] !== 'string') ||
    data.metadata.antiking !== undefined && typeof data.metadata.antiking !== 'boolean' ||
    data.metadata.antiknight !== undefined && typeof data.metadata.antiknight !== 'boolean' ||
    ['windoku', 'diagonal+', 'diagonal-'].some(key => data[key] !== undefined && typeof data[key] !== 'boolean')) {
    return reject('This SudokuPad export contains unsupported puzzle fields.')
  }
  const givens = readGivens(data.cells)
  readRegions(data.regions)
  const rulesText = Array.isArray(data.metadata.rules) ? data.metadata.rules.join('\n') : data.metadata.rules as string
  const clauses = rulesText.trim().split(/\n+/).map(clause => clause.replace(/\s+/g, ' ')).filter(Boolean)
  if (!clauses.length || !BASE_RULE.test(clauses[0])) return reject('This SudokuPad puzzle has authored rules this importer cannot verify.')
  const rules: VariantRule[] = []
  let hasNonconsecutive = false
  let hasQuadruples = false
  let hasKillerCages = false
  let hasChessRules = false
  let hasKropki = false
  let hasThermometers = false
  let hasWindoku = false
  let hasXSudoku = false
  for (const clause of clauses.slice(1)) {
    if (NONCONSECUTIVE_RULE.test(clause) && !hasNonconsecutive) {
      hasNonconsecutive = true
      rules.push({ type: 'non-consecutive' })
    } else if (/^Digits a knights move and kings move away from each other cannot be the same\.?$/i.test(clause) && !hasChessRules) {
      hasChessRules = true
    } else if (/^Digits separated by a white dot are consecutive\. All dots are given\.?$/i.test(clause) && !hasKropki) {
      hasKropki = true
    } else if (/^Digits on a thermometer must increase from the bulb to the end\.?$/i.test(clause) && !hasThermometers) {
      hasThermometers = true
    } else if (QUADRUPLE_RULE.test(clause) && !hasQuadruples) {
      hasQuadruples = true
    } else if (KILLER_RULES.some(pattern => pattern.test(clause)) && !hasKillerCages) {
      hasKillerCages = true
    } else if (WINDOKU_RULE.test(clause) && !hasWindoku) {
      hasWindoku = true
    } else if (X_SUDOKU_RULE.test(clause) && !hasXSudoku) {
      hasXSudoku = true
    } else return reject('This SudokuPad puzzle has authored rules this importer cannot verify.')
  }
  if (hasWindoku !== (data.windoku === true) || hasXSudoku !== (data['diagonal+'] === true && data['diagonal-'] === true) ||
    (data['diagonal+'] === true) !== (data['diagonal-'] === true)) {
    return reject('This SudokuPad export has inconsistent Windoku or X-Sudoku rules.')
  }
  if (hasChessRules !== (data.metadata.antiking === true && data.metadata.antiknight === true) ||
    data.metadata.antiking === true && !hasChessRules || data.metadata.antiknight === true && !hasChessRules) {
    return reject('This SudokuPad puzzle has inconsistent Anti-King or Anti-Knight rules.')
  }
  if (hasChessRules) rules.push({ type: 'anti-king' }, { type: 'anti-knight' })
  if (hasWindoku) rules.push(...WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })))
  if (data['diagonal+'] === true) rules.push({ type: 'diagonal', diagonal: 'anti' }, { type: 'diagonal', diagonal: 'main' })
  if (hasKropki) {
    const dots = readKropkiDots(data.overlays, 9)
    if (dots.type !== 'kropki' || !dots.consecutive?.pairs?.length || dots.ratioTwo?.pairs?.length) {
      return reject('This SudokuPad puzzle has unsupported Kropki dots.')
    }
    rules.push(dots)
  }
  if (hasThermometers) rules.push(...readThermometers(data.lines, data.underlays))
  else {
    if (hasWindoku && Array.isArray(data.underlays) && data.underlays.length) readWindokuUnderlays(data.underlays)
    else if (data.underlays !== undefined && (!Array.isArray(data.underlays) || data.underlays.length)) {
      return reject('This SudokuPad puzzle contains unsupported rules or markings.')
    }
    if (hasXSudoku && Array.isArray(data.lines) && data.lines.length) readDiagonalLines(data.lines)
    else if (data.lines !== undefined && (!Array.isArray(data.lines) || data.lines.length)) {
      return reject('This SudokuPad puzzle contains unsupported rules or markings.')
    }
  }
  if (hasQuadruples) rules.push(...readQuadruples(data.overlays))
  else if (!hasKropki && data.overlays !== undefined && (!Array.isArray(data.overlays) || data.overlays.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (data.arrows !== undefined && (!Array.isArray(data.arrows) || data.arrows.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (hasKillerCages) rules.push(readCages(data.cages))
  else if (data.cages !== undefined && (!Array.isArray(data.cages) || data.cages.length)) {
    return reject('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  const imported = makeImportedPuzzle(givens, rules, undefined)
  const rawSolution = data.metadata.solution
  if (rawSolution !== undefined && (typeof rawSolution !== 'string' || !/^[0-9]{81}$/.test(rawSolution) || rawSolution.includes('0'))) {
    return reject('This SudokuPad puzzle has an invalid solution.')
  }
  const title = typeof data.metadata.title === 'string' ? data.metadata.title
    : typeof data.metadata.t === 'string' ? data.metadata.t : undefined
  const author = typeof data.metadata.author === 'string' ? data.metadata.author : undefined
  const solution = rawSolution
  return {
    ...imported,
    ...(typeof title === 'string' && title && { title }),
    ...(typeof author === 'string' && author && { sizedAuthor: author }),
    ...(solution && { authoredSolution: solution }),
  }
}
