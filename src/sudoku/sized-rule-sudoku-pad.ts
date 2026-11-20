import { closedRegionSumCells } from './region-sum.ts'
import type { SizedConstraintRule, SizedLinkedDoubleArrow } from './engine.ts'
import { gridRegionIndex, isGridText, matchesRectangularRegions, MINI_GRID, sixGridFromRegions } from './grid.ts'
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

function readPath(value: unknown, size: number, maxPoints = size) {
  if (!Array.isArray(value) || value.length < 2 || value.length > maxPoints) {
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

function readKropkiDots(overlays: unknown, size: number): SizedConstraintRule {
  if (!Array.isArray(overlays) || !overlays.length || overlays.length > 4 * size * (size - 1)) {
    throw new Error('This SudokuPad export has invalid Kropki dots.')
  }
  const consecutive: [number, number][] = [], ratioTwo: [number, number][] = []
  for (const overlay of overlays) {
    if (!record(overlay) || Object.keys(overlay).some(key =>
      !['stroke', 'center', 'width', 'height', 'rounded', 'text', 'color', 'backgroundColor', 'borderColor', 'thickness'].includes(key)) ||
      overlay.rounded !== true || typeof overlay.width !== 'number' || overlay.width !== overlay.height ||
      overlay.width <= 0 || overlay.width > .5 || overlay.text !== undefined && overlay.text !== '' ||
      overlay.stroke !== undefined && overlay.stroke !== 'none' || !Array.isArray(overlay.center) ||
      overlay.center.length !== 2 || !overlay.center.every(point => typeof point === 'number')) {
      throw new Error('This SudokuPad export has an unsupported dot.')
    }
    const color = typeof overlay.backgroundColor === 'string' ? overlay.backgroundColor.toLowerCase() : ''
    const pairs = ['#fff', '#ffffff', '#ffffffff'].includes(color) ? consecutive
      : ['#000', '#000000', '#000000ff'].includes(color) ? ratioTwo : undefined
    if (!pairs) throw new Error('A Kropki dot must be white or black.')
    const [row, col] = overlay.center
    if (Number.isInteger(row) && Number.isInteger(col - .5)) {
      pairs.push([boardCell([row - .5, col], size, .5), boardCell([row + .5, col], size, .5)])
    } else if (Number.isInteger(row - .5) && Number.isInteger(col)) {
      pairs.push([boardCell([row, col - .5], size, .5), boardCell([row, col + .5], size, .5)])
    } else throw new Error('A Kropki dot must lie between two neighboring cells.')
  }
  return { type: 'kropki', ...(consecutive.length && { consecutive: { pairs: consecutive } }),
    ...(ratioTwo.length && { ratioTwo: { pairs: ratioTwo } }) }
}

const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))

function readArrowCircles(overlays: unknown[]) {
  return overlays.flatMap((overlay, index) => {
    if (!record(overlay) || Object.keys(overlay).some(key =>
      !['center', 'width', 'height', 'thickness', 'angle', 'rounded', 'backgroundColor', 'borderColor'].includes(key)) ||
      !isPoint(overlay.center) || !overlay.center.every(coordinate => Number.isInteger(coordinate - .5)) ||
      overlay.rounded !== true || typeof overlay.width !== 'number' || overlay.width !== overlay.height ||
      overlay.width <= 0 || overlay.width > 1 || typeof overlay.borderColor !== 'string' ||
      typeof overlay.backgroundColor !== 'string' || !/^#(?:fff|ffffff|ffffffff)$/i.test(overlay.backgroundColor)) return []
    return [{ center: overlay.center, radius: overlay.width / 2, color: overlay.borderColor.toLowerCase(), index }]
  })
}

function readArrows(arrows: unknown, overlays: unknown[], size: number) {
  if (!Array.isArray(arrows) || arrows.length === 0 || arrows.length > 128) {
    throw new Error('This SudokuPad export has invalid arrows.')
  }
  const bulbs = readArrowCircles(overlays)
  const used = new Set<number>()
  const rules = arrows.map((arrow: unknown): SizedConstraintRule => {
    if (!record(arrow) || Object.keys(arrow).some(key => !['wayPoints', 'headLength', 'color', 'thickness'].includes(key)) ||
      !Array.isArray(arrow.wayPoints) || arrow.wayPoints.length < 2 || !arrow.wayPoints.every(isPoint) ||
      typeof arrow.color !== 'string' || typeof arrow.thickness !== 'number' || arrow.thickness <= 0 ||
      typeof arrow.headLength !== 'number' || arrow.headLength <= 0) {
      throw new Error('This SudokuPad export has an unsupported arrow.')
    }
    const [start, ...shaft] = arrow.wayPoints
    const color = arrow.color.toLowerCase()
    const matching = bulbs.filter(bulb => bulb.color === color &&
      Math.hypot(start[0] - bulb.center[0], start[1] - bulb.center[1]) <= bulb.radius + .035)
    if (matching.length !== 1) throw new Error('Each SudokuPad arrow must start in exactly one matching bulb.')
    const [bulb] = matching
    const row = shaft[0][0] - bulb.center[0], column = shaft[0][1] - bulb.center[1]
    const length = Math.hypot(row, column)
    const startRow = start[0] - bulb.center[0], startColumn = start[1] - bulb.center[1]
    const along = (startRow * row + startColumn * column) / length
    const across = (startRow * column - startColumn * row) / length
    if (!length || along < -.035 || along > length || Math.abs(across) > .035) {
      throw new Error('A SudokuPad arrow shaft does not align with its bulb.')
    }
    used.add(bulb.index)
    const [circle, ...cells] = readPath([bulb.center, ...shaft], size, size + 1)
    return { type: 'arrow', circle, cells }
  })
  return { rules, unused: overlays.filter((_, index) => !used.has(index)) }
}

export function readSizedRuleSudokuPad(data: Record<string, unknown>) {
  const fields = ['id', 'metadata', 'cages', 'cells', 'regions', 'lines', 'underlays', 'overlays', 'arrows']
  const { cells, metadata, regions, cages, lines, underlays, overlays, arrows } = data
  if (Object.keys(data).some(key => !fields.includes(key)) ||
    !record(metadata) || typeof metadata.rules !== 'string' ||
    Object.keys(metadata).some(key => !['source', 'title', 'author', 'rules', 'solution', 'msgcorrect'].includes(key)) ||
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
  const rulesText = metadata.rules.trim().split(/\n\s*\n|(?<=\.)\s+(?=Double Arrows:)/i).map(part => part.replace(/\s+/g, ' '))
  const base = /^Normal (\d+)[x×](\d+) sudoku rules apply[.:] Place the digits 1(?:\s+to\s+|\s*[–-]\s*)(\d+)(?: once each)? in every row, column,? and (\d+)[x×](\d+) box\.?$/i.exec(rulesText[0])
  const shortBase = /^Normal (\d+)[x×](\d+) sudoku rules apply\.$/i.exec(rulesText[0])
  const compactBase = /^SUDOKU - Fill the grid with the digits 1[-–](\d+) so that no digit repeats in a row, column, or box\.$/i.exec(rulesText[0])
  const clauses = rulesText.slice(1)
  const thermometer = /^Digits along a thermometer strictly increase from bulb to tip\.$/i
  const compactThermometer = /^THERMOMETER - Digits increase in value along a thermometer, starting from the bulb end\.(?: They don't have to be adjacent, for example 1-3-4 or 2-4 would be just fine\.)?$/i
  const renban = /^Digits along a pink line form a set of non-repeating consecutive digits in any order\.$/i
  const compactRenban = /^RENBAN - Digits on a purple Renban line must be a set of consecutive, non-repeating digits \(in any order\)\.(?: For example, a length 3 line could have -3-1-2-, but not -1-2-4- or -1-3-1-\.)?$/i
  const isRenban = (clause: string) => renban.test(clause) || compactRenban.test(clause)
  const isThermometer = (clause: string) => thermometer.test(clause) || compactThermometer.test(clause)
  const kropki = /^Digits separated by a white dot are consecutive\. Digits separated by a black dot have a 1:2 ratio\. Not all dots are given\.$/i
  const compactKropki = /^PARTIAL KROPKI - A white dot between two cells requires that the value in one cell is exactly 1 greater than the value of the other cell\. - A black dot between two cells requires that the value in one cell is exactly double the value of the other cell\.$/i
  const isKropki = (clause: string) => kropki.test(clause) || compactKropki.test(clause)
  const arrow = /^Digits along an arrow sum to the digit in a bulb\. Digits may repeat if allowed by other rules\.$/i
  const doubleArrow = /^Double Arrows: (?:Digits along a grey line have the same sum as the sum of the two connected circles|the sum of the digits along a line (?:is|are) equal to the sum of the digits in the circles at either end of that line)\.?$/i
  const authoredArrows = clauses.some(clause => arrow.test(clause))
  const authoredDoubleArrows = clauses.some(clause => doubleArrow.test(clause))
  const authoredKropki = clauses.some(isKropki)
  const authoredThermometers = clauses.some(isThermometer)
  const compactBulbs = clauses.some(clause => compactThermometer.test(clause))
  const authoredRenban = clauses.some(isRenban)
  const regionSum = /^Box borders split region sum lines into segments with the same sum\. Different lines can have different segment sums\.$/i
  const authoredRegionSum = clauses.some(clause => regionSum.test(clause))
  const validBase = base ? base.slice(1, 4).every(part => Number(part) === size) &&
    (Number(base[4]) === grid.boxRows && Number(base[5]) === grid.boxColumns ||
      authoredDoubleArrows && Number(base[4]) === grid.boxColumns && Number(base[5]) === grid.boxRows)
    : Number(compactBase?.[1]) === size || authoredDoubleArrows && Number(shortBase?.[1]) === size && Number(shortBase?.[2]) === size
  if (!validBase || clauses.some(clause => !isThermometer(clause) && !isRenban(clause) && !isKropki(clause) &&
    !arrow.test(clause) && !doubleArrow.test(clause) && !regionSum.test(clause))) {
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
  let remainingOverlays = overlays
  let singleArrows: SizedConstraintRule[] = []
  if (authoredArrows) {
    if (!Array.isArray(overlays) || overlays.length > 256) throw new Error('This SudokuPad export has invalid arrow bulbs.')
    const parsed = readArrows(arrows, overlays, size)
    singleArrows = parsed.rules
    remainingOverlays = parsed.unused.length ? parsed.unused : undefined
  } else if (arrows !== undefined) throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  const doubleCircles = new Map<string, number>()
  const usedDoubleCircles = new Set<number>()
  if (authoredDoubleArrows && Array.isArray(remainingOverlays) && remainingOverlays.length <= 256) {
    for (const { center, color, index, radius } of readArrowCircles(remainingOverlays)) {
      if (radius <= .25) continue
      const key = `${color}:${boardCell(center, size, .5)}`
      if (doubleCircles.has(key)) throw new Error('Two Double Arrow circles share a cell and color.')
      doubleCircles.set(key, index)
    }
  }
  for (const line of lines ?? []) {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      throw new Error('This SudokuPad export has an unsupported line.')
    }
    const mayBeRegionSum = authoredRegionSum &&
      ((!authoredThermometers && !authoredRenban && !authoredDoubleArrows) || /^#2ecbff(?:ff)?$/i.test(line.color))
    const mayBeRenban = authoredRenban &&
      ((!authoredThermometers && !authoredRegionSum && !authoredDoubleArrows) || /^#f067f0(?:ff)?$/i.test(line.color))
    const path = readPath(line.wayPoints, size, mayBeRegionSum || authoredDoubleArrows ? size ** 2 + 1 : size)
    if (doubleCircles.size) {
      const color = line.color.toLowerCase()
      const circle = (cell: number) => doubleCircles.get(`${color}:${cell}`)
      const first = circle(path[0])
      if (first !== undefined && circle(path[path.length - 1]) !== undefined) {
        let start = 0
        usedDoubleCircles.add(first)
        for (let index = 1; index < path.length; index++) {
          const endpoint = circle(path[index])
          if (endpoint === undefined) continue
          usedDoubleCircles.add(endpoint)
          rules.push({ type: 'double-arrow', ends: [path[start], path[index]], cells: path.slice(start + 1, index) })
          start = index
        }
        continue
      }
    }
    // This compact export convention uses a darker, unbordered bulb.
    const compactShaft = compactBulbs && /^#(?:ccc|cccccc(?:ff)?)$/i.test(line.color)
    const matching = bulbs.flatMap((bulb, index) => {
      const matchesColor = bulb.color === line.color || (compactShaft && /^#(?:999|999999(?:ff)?)$/i.test(bulb.color))
      return matchesColor && (bulb.cell === path[0] || bulb.cell === path.at(-1)) ? [index] : []
    })
    if (matching.length === 1) {
      const [bulb] = bulbs.splice(matching[0], 1)
      rules.push({ type: 'thermometer', cells: bulb.cell === path[0] ? path : path.reverse() })
    } else if (matching.length === 0 && mayBeRegionSum) {
      const unique = [...new Set(path)]
      const cells = closedRegionSumCells(unique, [path], cell => gridRegionIndex(grid, cell))
      rules.push({ type: 'region-sum', cells, ...(unique.length !== path.length || cells !== unique ? { segments: [path] } : {}) })
    } else if (matching.length === 0 && mayBeRenban) {
      rules.push({ type: 'renban', cells: path })
    } else {
      throw new Error(authoredThermometers ? 'A thermometer bulb must identify exactly one end of its path.'
        : 'This SudokuPad puzzle has markings without supported rules.')
    }
  }
  rules.push(...singleArrows)
  if (usedDoubleCircles.size && Array.isArray(remainingOverlays)) {
    const unused = remainingOverlays.filter((_, index) => !usedDoubleCircles.has(index))
    remainingOverlays = unused.length ? unused : undefined
  }
  if (authoredKropki) rules.push(readKropkiDots(remainingOverlays, size))
  else if (remainingOverlays !== undefined) throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  if (bulbs.length || authoredThermometers !== rules.some(rule => rule.type === 'thermometer') ||
    authoredRenban !== rules.some(rule => rule.type === 'renban') ||
    authoredDoubleArrows !== rules.some(rule => rule.type === 'double-arrow') ||
    authoredRegionSum !== rules.some(rule => rule.type === 'region-sum') || !isSizedRuleList(rules, grid) ||
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

type OutsideEnd = { direction: 'north' | 'east' | 'south' | 'west'; index: number }

/** Read the padded Penpa drawing of a Double Arrow with X-Sum end circles. */
export function readLinkedDoubleArrowSudokuPad(data: Record<string, unknown>) {
  const { cells, regions, metadata, overlays, underlays, lines, cages } = data
  if (Object.keys(data).some(key => !['id', 'cells', 'regions', 'metadata', 'overlays', 'underlays', 'lines', 'cages'].includes(key)) ||
    !record(metadata) || Object.keys(metadata).some(key => !['title', 'author', 'rules', 'solution', 'source'].includes(key)) ||
    typeof metadata.rules !== 'string' ||
    cages !== undefined && (!Array.isArray(cages) || cages.length !== 0)) {
    throw new Error('This SudokuPad export has unsupported rules or markings.')
  }
  if (!Array.isArray(regions) || ![4, 6].includes(regions.length)) {
    throw new Error('The outside circles need a supported rectangular Sudoku grid.')
  }
  const size = regions.length
  const canvas = size + 2
  const rulesText = metadata.rules.trim().split(/\n\s*\n/).map(clause => clause.replace(/\s+/g, ' '))
  if (rulesText.length !== 3 || rulesText[0].toLowerCase() !== `normal ${size}x${size} sudoku rules apply.` ||
    !/^The sum of the digits along a line is equal to the sum of the numbers in the circles at either end of the line\.$/i.test(rulesText[1]) ||
    !/^A clue outside the grid is the sum of the first X cells in the corresponding direction, where X is the digit in the cell next to the clue\.$/i.test(rulesText[2])) {
    throw new Error('This SudokuPad export has unsupported outside-clue rules.')
  }

  const insideCell = (canvasCell: number) => {
    const row = Math.floor(canvasCell / canvas)
    const column = canvasCell % canvas
    return row >= 1 && row <= size && column >= 1 && column <= size ? (row - 1) * size + column - 1 : undefined
  }
  if (!Array.isArray(cells) || cells.length !== canvas || cells.some(row => !Array.isArray(row) || row.length !== canvas)) {
    throw new Error('The outside-clue canvas does not match its grid.')
  }
  const givens = cells.flat().flatMap((cell, index) => {
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      cell.value !== undefined && (insideCell(index) === undefined || !Number.isInteger(cell.value) || Number(cell.value) < 1 || Number(cell.value) > size)) {
      throw new Error('The outside-clue canvas has an unsupported cell marking.')
    }
    return insideCell(index) === undefined ? [] : String(cell.value ?? 0)
  }).join('')

  const membership = Array<number>(size ** 2).fill(-1)
  for (const [index, region] of regions.entries()) {
    if (!Array.isArray(region) || region.length !== size) throw new Error('An authored region has the wrong size.')
    for (const point of region) {
      const cell = insideCell(boardCell(point, canvas))
      if (cell === undefined || membership[cell] !== -1) throw new Error('An authored region overlaps or lies outside the grid.')
      membership[cell] = index
    }
  }
  const grid = size === 6 ? sixGridFromRegions(membership) : matchesRectangularRegions(MINI_GRID, membership) ? MINI_GRID : undefined
  if (!grid) throw new Error('The outside circles need a supported rectangular Sudoku grid.')

  if (underlays !== undefined && (!Array.isArray(underlays) || underlays.length > 1 ||
    underlays.some(mark => !record(mark) || mark.class !== 'board-position' || mark.backgroundColor !== '#FFFFFF00' ||
      mark.width !== canvas || mark.height !== canvas || boardCell(mark.center, canvas) !== canvas * (canvas / 2) + canvas / 2))) {
    throw new Error('The outside-clue canvas has an unsupported underlay.')
  }
  if (!Array.isArray(overlays) || !overlays.length || overlays.length > 4 * size ||
    !Array.isArray(lines) || !lines.length || lines.length > 128) {
    throw new Error('The outside Double Arrow circles or paths are missing.')
  }

  const circles = new Map<number, { end: OutsideEnd; color: string }>()
  for (const mark of overlays) {
    if (!record(mark) || Object.keys(mark).some(key => !['borderSize', 'borderColor', 'backgroundColor', 'rounded', 'center', 'width', 'height'].includes(key)) ||
      typeof mark.borderSize !== 'number' || mark.borderSize <= 0 || typeof mark.borderColor !== 'string' ||
      typeof mark.backgroundColor !== 'string' || !/^#(?:fff|ffffff)$/i.test(mark.backgroundColor) ||
      mark.rounded !== 1 || typeof mark.width !== 'number' || mark.width <= .5 || mark.width > 1 || mark.width !== mark.height) {
      throw new Error('An outside Double Arrow circle has an unsupported marking.')
    }
    const cell = boardCell(mark.center, canvas, .5)
    const row = Math.floor(cell / canvas), column = cell % canvas
    const corner = (row === 0 || row === canvas - 1) && (column === 0 || column === canvas - 1)
    const end: OutsideEnd | undefined = insideCell(cell) !== undefined || corner
      ? undefined : row === 0 ? { direction: 'south', index: column - 1 }
        : row === canvas - 1 ? { direction: 'north', index: column - 1 }
          : column === 0 ? { direction: 'east', index: row - 1 }
            : { direction: 'west', index: row - 1 }
    if (!end || circles.has(cell)) throw new Error('An outside Double Arrow circle has an invalid position.')
    circles.set(cell, { end, color: mark.borderColor.toLowerCase() })
  }

  const rules: SizedLinkedDoubleArrow[] = []
  const used = new Set<number>()
  for (const line of lines) {
    if (!record(line) || Object.keys(line).some(key => !['target', 'color', 'thickness', 'wayPoints'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      throw new Error('The outside-clue canvas has an unsupported line.')
    }
    const { wayPoints } = line
    if (line.target === 'cell-grids' && /^#(?:ffffff|000000)$/i.test(line.color) && Array.isArray(wayPoints) &&
      wayPoints.length >= 2 && wayPoints.every(isPoint) && wayPoints.slice(1).every(([row, column], index) => {
        const [previousRow, previousColumn] = wayPoints[index]
        return row === previousRow && Number.isInteger(row) || column === previousColumn && Number.isInteger(column)
      })) continue
    if (line.target !== 'overlay') throw new Error('The outside-clue canvas has an unsupported drawing.')
    const path = readPath(wayPoints, canvas, canvas ** 2 + 1)
    let start = circles.get(path[0])
    const color = line.color.toLowerCase()
    if (start?.color !== color) throw new Error('A Double Arrow path must start at a matching outside circle.')
    used.add(path[0])
    let interior: number[] = []
    for (const position of path.slice(1)) {
      const cell = insideCell(position)
      if (cell !== undefined) {
        interior.push(cell)
        continue
      }
      const finish = circles.get(position)
      if (finish?.color !== color || finish === start || !interior.length || new Set(interior).size !== interior.length) {
        throw new Error('A Double Arrow path must connect two different outside circles through valid grid cells.')
      }
      rules.push({ type: 'linked-double-arrow', ends: [start.end, finish.end], cells: interior })
      used.add(position)
      start = finish
      interior = []
    }
    if (interior.length) throw new Error('A Double Arrow path must end at an outside circle.')
  }
  if (!rules.length || rules.length > 128 || used.size !== circles.size) throw new Error('An outside circle is missing a Double Arrow path.')

  let authoredSolution: string | undefined
  if (metadata.solution !== undefined) {
    if (typeof metadata.solution !== 'string') throw new Error('The outside-clue canvas has an invalid authored solution.')
    authoredSolution = [...metadata.solution].filter((_, index) => insideCell(index) !== undefined).join('')
    if (metadata.solution.length !== canvas ** 2 || [...metadata.solution].some((digit, index) => insideCell(index) === undefined && digit !== '?') ||
      !isGridText(authoredSolution, grid) || authoredSolution.includes('0')) {
      throw new Error('The outside-clue canvas has an invalid authored solution.')
    }
  }
  const title = typeof metadata.title === 'string' ? metadata.title.trim().slice(0, 72) || undefined : undefined
  const sizedAuthor = typeof metadata.author === 'string' ? metadata.author.trim().slice(0, 72) || undefined : undefined
  return { grid, givens, sizedRules: rules, title, sizedAuthor, authoredSolution }
}
