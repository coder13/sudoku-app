import type { SizedConstraintRule } from './engine.ts'
import { isGridText, sixGridFromRegions } from './grid.ts'
import { isSixRuleList } from './six-game.ts'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boardCell(value: unknown, offset = 0) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(coord =>
    typeof coord !== 'number' || !Number.isInteger(coord - offset) || coord < offset || coord >= 6 + offset)) {
    throw new Error('This SudokuPad puzzle has a clue outside its 6 × 6 grid.')
  }
  return (value[0] - offset) * 6 + value[1] - offset
}

function readPath(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new Error('This SudokuPad export has an invalid line path.')
  }
  const waypoints = value.map(point => boardCell(point, 0.5))
  const path = [waypoints[0]]
  for (let index = 1; index < waypoints.length; index++) {
    const from = waypoints[index - 1]
    const to = waypoints[index]
    const rows = Math.floor(to / 6) - Math.floor(from / 6)
    const columns = to % 6 - from % 6
    const distance = Math.max(Math.abs(rows), Math.abs(columns))
    if (!distance || (rows && columns && Math.abs(rows) !== Math.abs(columns))) {
      throw new Error('This SudokuPad export has an ambiguous line segment.')
    }
    const stride = 6 * Math.sign(rows) + Math.sign(columns)
    for (let step = 1; step <= distance; step++) path.push(from + stride * step)
  }
  return path
}

export function readSixSudokuPad(data: Record<string, unknown>) {
  const fields = ['id', 'metadata', 'cages', 'cells', 'regions', 'lines', 'underlays']
  const { cells, metadata, regions, cages, lines, underlays } = data
  if (Object.keys(data).some(key => !fields.includes(key)) ||
    !record(metadata) || typeof metadata.rules !== 'string' ||
    Object.keys(metadata).some(key => !['source', 'title', 'author', 'rules', 'solution'].includes(key)) ||
    (cages !== undefined && (!Array.isArray(cages) || cages.length))) {
    throw new Error('This 6 × 6 SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (!Array.isArray(cells) || cells.length !== 6 || cells.some(row => !Array.isArray(row) || row.length !== 6)) {
    throw new Error('This SudokuPad export has an invalid 6 × 6 grid.')
  }
  const givens = cells.flat().map(cell => {
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      (cell.value !== undefined && !(Number.isInteger(cell.value) && Number(cell.value) >= 1 && Number(cell.value) <= 6))) {
      throw new Error('This SudokuPad export has an unsupported cell clue.')
    }
    return String(cell.value ?? 0)
  }).join('')
  if (!Array.isArray(regions) || regions.length !== 6 || regions.some(box => !Array.isArray(box) || box.length !== 6)) {
    throw new Error('This 6 × 6 puzzle needs six rectangular boxes.')
  }
  const labels: number[] = Array(36).fill(-1)
  for (const [index, box] of regions.entries()) {
    for (const coordinates of box) {
      const cell = boardCell(coordinates)
      if (labels[cell] !== -1) throw new Error('Two SudokuPad boxes share a cell.')
      labels[cell] = index
    }
  }
  const grid = sixGridFromRegions(labels)
  if (!grid) throw new Error('This 6 × 6 puzzle needs six rectangular boxes.')

  // SudokuPad's generic lines and circles are drawing primitives. The rules
  // text identifies what they mean, and the bulb determines direction.
  const rulesText = metadata.rules.trim().split(/\n\s*\n/).map(part => part.replace(/\s+/g, ' '))
  const base = /^Normal 6[x×]6 sudoku rules apply\. Place the digits 1(?:\s+to\s+|\s*[–-]\s*)6 in every row, column and ([23])[x×]([23]) box\.$/i.exec(rulesText[0])
  const clauses = rulesText.slice(1)
  const thermometer = /^Digits along a thermometer strictly increase from bulb to tip\.$/i
  const renban = /^Digits along a pink line form a set of non-repeating consecutive digits in any order\.$/i
  const authoredThermometers = clauses.some(clause => thermometer.test(clause))
  const authoredRenban = clauses.some(clause => renban.test(clause))
  if (!base || Number(base[1]) !== grid.boxRows || Number(base[2]) !== grid.boxColumns ||
    clauses.some(clause => !thermometer.test(clause) && !renban.test(clause))) {
    throw new Error('This 6 × 6 SudokuPad puzzle has authored rules this importer cannot verify.')
  }
  const rules: SizedConstraintRule[] = []
  if (lines !== undefined && (!Array.isArray(lines) || lines.length > 128)) {
    throw new Error('This SudokuPad export has unsupported lines.')
  }
  if (underlays !== undefined && (!Array.isArray(underlays) || underlays.length > 128 ||
    (!authoredThermometers && underlays.length > 0))) {
    throw new Error('This SudokuPad export has unsupported underlays.')
  }
  const bulbs = (underlays ?? []).map(bulb => {
    if (!record(bulb) || Object.keys(bulb).some(key => !['center', 'width', 'height', 'rounded', 'backgroundColor'].includes(key)) ||
      bulb.rounded !== true || typeof bulb.width !== 'number' || bulb.width !== bulb.height || bulb.width <= 0 || bulb.width > 1 ||
      typeof bulb.backgroundColor !== 'string') {
      throw new Error('This SudokuPad export has an unsupported thermometer bulb.')
    }
    return { cell: boardCell(bulb.center, 0.5), color: bulb.backgroundColor }
  })
  for (const line of lines ?? []) {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      throw new Error('This SudokuPad export has an unsupported line.')
    }
    const path = readPath(line.wayPoints)
    const matching = bulbs.flatMap((bulb, index) =>
      bulb.color === line.color && (bulb.cell === path[0] || bulb.cell === path.at(-1)) ? [index] : [])
    if (matching.length === 1) {
      const [bulb] = bulbs.splice(matching[0], 1)
      rules.push({ type: 'thermometer', cells: bulb.cell === path[0] ? path : path.reverse() })
    } else if (matching.length === 0 && authoredRenban && (!authoredThermometers || /^#f067f0(?:ff)?$/i.test(line.color))) {
      rules.push({ type: 'renban', cells: path })
    } else {
      throw new Error(authoredThermometers ? 'A thermometer bulb must identify exactly one end of its path.'
        : 'This SudokuPad puzzle has markings without supported rules.')
    }
  }
  if (bulbs.length || authoredThermometers !== rules.some(rule => rule.type === 'thermometer') ||
    authoredRenban !== rules.some(rule => rule.type === 'renban') || !isSixRuleList(rules)) {
    throw new Error('This SudokuPad export has incomplete or invalid lines.')
  }
  const { title, author, solution } = metadata
  if (solution !== undefined && (!isGridText(solution, grid) || solution.includes('0'))) {
    throw new Error('This SudokuPad export has an invalid authored solution.')
  }
  return {
    grid, givens, sixRules: rules,
    title: typeof title === 'string' ? title.trim().slice(0, 72) || undefined : undefined,
    sixAuthor: typeof author === 'string' ? author.trim().slice(0, 72) || undefined : undefined,
    authoredSolution: solution,
  }
}
