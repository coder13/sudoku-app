import type { SizedConstraintRule } from './engine.ts'
import { isGridText, matchesRectangularRegions, MINI_GRID, sixGridFromRegions } from './grid.ts'
import { isSizedRuleList } from './sized-rule-game.ts'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boardCell(value: unknown, size: number, offset = 0) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(coord =>
    typeof coord !== 'number' || !Number.isInteger(coord - offset) || coord < offset || coord >= size + offset)) {
    throw new Error('This SudokuPad puzzle has a clue outside its grid.')
  }
  return (value[0] - offset) * size + value[1] - offset
}

function readPath(value: unknown, size: number) {
  if (!Array.isArray(value) || value.length < 2 || value.length > size) {
    throw new Error('This SudokuPad export has an invalid line path.')
  }
  const waypoints = value.map(point => boardCell(point, size, 0.5))
  const path = [waypoints[0]]
  for (let index = 1; index < waypoints.length; index++) {
    const from = waypoints[index - 1]
    const to = waypoints[index]
    const rows = Math.floor(to / size) - Math.floor(from / size)
    const columns = to % size - from % size
    const distance = Math.max(Math.abs(rows), Math.abs(columns))
    if (!distance || (rows && columns && Math.abs(rows) !== Math.abs(columns))) {
      throw new Error('This SudokuPad export has an ambiguous line segment.')
    }
    const stride = size * Math.sign(rows) + Math.sign(columns)
    for (let step = 1; step <= distance; step++) path.push(from + stride * step)
  }
  return path
}

export function readSizedRuleSudokuPad(data: Record<string, unknown>) {
  const fields = ['id', 'metadata', 'cages', 'cells', 'regions', 'lines', 'underlays']
  const { cells, metadata, regions, cages, lines, underlays } = data
  if (Object.keys(data).some(key => !fields.includes(key)) ||
    !record(metadata) || typeof metadata.rules !== 'string' ||
    Object.keys(metadata).some(key => !['source', 'title', 'author', 'rules', 'solution'].includes(key)) ||
    (cages !== undefined && (!Array.isArray(cages) || cages.length))) {
    throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (!Array.isArray(cells) || (cells.length !== 4 && cells.length !== 6) ||
    cells.some(row => !Array.isArray(row) || row.length !== cells.length)) {
    throw new Error('This SudokuPad export has an invalid grid.')
  }
  const size = cells.length
  const givens = cells.flat().map(cell => {
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      (cell.value !== undefined && !(Number.isInteger(cell.value) && Number(cell.value) >= 1 && Number(cell.value) <= size))) {
      throw new Error('This SudokuPad export has an unsupported cell clue.')
    }
    return String(cell.value ?? 0)
  }).join('')
  if (!Array.isArray(regions) || regions.length !== size || regions.some(box => !Array.isArray(box) || box.length !== size)) {
    throw new Error('This SudokuPad puzzle needs rectangular boxes.')
  }
  const labels: number[] = Array(size ** 2).fill(-1)
  for (const [index, box] of regions.entries()) {
    for (const coordinates of box) {
      const cell = boardCell(coordinates, size)
      if (labels[cell] !== -1) throw new Error('Two SudokuPad boxes share a cell.')
      labels[cell] = index
    }
  }
  const grid = size === 6 ? sixGridFromRegions(labels) : matchesRectangularRegions(MINI_GRID, labels) ? MINI_GRID : undefined
  if (!grid) throw new Error('This SudokuPad puzzle needs rectangular boxes.')

  // SudokuPad's generic lines and circles are drawing primitives. The rules
  // text identifies what they mean, and the bulb determines direction.
  const rulesText = metadata.rules.trim().split(/\n\s*\n/).map(part => part.replace(/\s+/g, ' '))
  const base = /^Normal (\d+)[x×](\d+) sudoku rules apply\. Place the digits 1(?:\s+to\s+|\s*[–-]\s*)(\d+) in every row, column and (\d+)[x×](\d+) box\.$/i.exec(rulesText[0])
  const compactBase = /^SUDOKU - Fill the grid with the digits 1[-–](\d+) so that no digit repeats in a row, column, or box\.$/i.exec(rulesText[0])
  const clauses = rulesText.slice(1)
  const thermometer = /^Digits along a thermometer strictly increase from bulb to tip\.$/i
  const compactThermometer = /^THERMOMETER - Digits increase in value along a thermometer, starting from the bulb end\.(?: They don't have to be adjacent, for example 1-3-4 or 2-4 would be just fine\.)?$/i
  const renban = /^Digits along a pink line form a set of non-repeating consecutive digits in any order\.$/i
  const compactRenban = /^RENBAN - Digits on a purple Renban line must be a set of consecutive, non-repeating digits \(in any order\)\.(?: For example, a length 3 line could have -3-1-2-, but not -1-2-4- or -1-3-1-\.)?$/i
  const isRenban = (clause: string) => renban.test(clause) || compactRenban.test(clause)
  const isThermometer = (clause: string) => thermometer.test(clause) || compactThermometer.test(clause)
  const authoredThermometers = clauses.some(isThermometer)
  const compactBulbs = clauses.some(clause => compactThermometer.test(clause))
  const authoredRenban = clauses.some(isRenban)
  const validBase = base ? base.slice(1, 4).every(part => Number(part) === size) &&
    Number(base[4]) === grid.boxRows && Number(base[5]) === grid.boxColumns : Number(compactBase?.[1]) === size
  if (!validBase || clauses.some(clause => !isThermometer(clause) && !isRenban(clause))) {
    throw new Error('This SudokuPad puzzle has authored rules this importer cannot verify.')
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
    if (!record(bulb) || Object.keys(bulb).some(key => !['center', 'width', 'height', 'rounded', 'backgroundColor', 'stroke'].includes(key)) ||
      (bulb.stroke !== undefined && (!compactBulbs || bulb.stroke !== 'none')) || bulb.rounded !== true || typeof bulb.width !== 'number' || bulb.width !== bulb.height || bulb.width <= 0 || bulb.width > 1 ||
      typeof bulb.backgroundColor !== 'string') {
      throw new Error('This SudokuPad export has an unsupported thermometer bulb.')
    }
    return { cell: boardCell(bulb.center, size, 0.5), color: bulb.backgroundColor }
  })
  for (const line of lines ?? []) {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      throw new Error('This SudokuPad export has an unsupported line.')
    }
    const path = readPath(line.wayPoints, size)
    // This compact export convention uses a darker, unbordered bulb.
    const compactShaft = compactBulbs && /^#(?:ccc|cccccc(?:ff)?)$/i.test(line.color)
    const matching = bulbs.flatMap((bulb, index) => {
      const matchesColor = bulb.color === line.color || (compactShaft && /^#(?:999|999999(?:ff)?)$/i.test(bulb.color))
      return matchesColor && (bulb.cell === path[0] || bulb.cell === path.at(-1)) ? [index] : []
    })
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
    authoredRenban !== rules.some(rule => rule.type === 'renban') || !isSizedRuleList(rules, size) ||
    (size === 4 && !rules.length)) {
    throw new Error('This SudokuPad export has incomplete or invalid lines.')
  }
  const { title, author, solution } = metadata
  if (solution !== undefined && (!isGridText(solution, grid) || solution.includes('0'))) {
    throw new Error('This SudokuPad export has an invalid authored solution.')
  }
  return {
    grid, givens, sizedRules: rules,
    title: typeof title === 'string' ? title.trim().slice(0, 72) || undefined : undefined,
    sizedAuthor: typeof author === 'string' ? author.trim().slice(0, 72) || undefined : undefined,
    authoredSolution: solution,
  }
}
