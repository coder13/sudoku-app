import { closedRegionSumCells } from './region-sum.ts'
import { readCornerKropki } from './corner-kropki.ts'
import type { SizedConstraintRule, SizedLinkedDoubleArrow, SizedSumEnd } from './engine.ts'
import { FIVE_BOXLESS_GRID, gridRegionIndex, isGridText, isJigsawGrid, isJigsawSize, isMiniGrid, isRectangularSize, matchesRectangularRegions, MINI_GRID, rectangularGridFromRegions, regionsFromMembership } from './grid.ts'
import { isSizedRuleList } from './sized-rule-game.ts'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const JIGSAW_BASE = /^Place the digits (1)[-–](\d+) once each into every row, column,? and region\.$/i

export function hasDeclaredSudokuPadJigsaw(rules: unknown) {
  return typeof rules === 'string' && JIGSAW_BASE.test(rules.trim().split(/\r?\n/)[0])
}

function boardCell(value: unknown, size: number, offset = 0) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(coord =>
    typeof coord !== 'number' || !Number.isInteger(coord - offset) || coord < offset || coord >= size + offset)) {
    throw new Error('This SudokuPad puzzle has a clue outside its grid.')
  }
  return (value[0] - offset) * size + value[1] - offset
}

export function readPath(value: unknown, size: number, maxPoints = size) {
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

function readLayeredZipper(lines: unknown, overlays: unknown, underlays: unknown, size: number, letter: string) {
  const fail = (): never => { throw new Error('The Zipper paths need matching strokes and center markers.') }
  if (!Array.isArray(lines) || !lines.length || lines.length > 128 ||
    !Array.isArray(overlays) || overlays.length !== lines.length ||
    !Array.isArray(underlays) || underlays.length !== 2) return fail()
  const strokes = lines.map(line => {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || !/^#[\da-f]{3,8}$/i.test(line.color) ||
      typeof line.thickness !== 'number' || line.thickness <= 0) return fail()
    return { cells: readPath(line.wayPoints, size, size ** 2), color: line.color, width: line.thickness }
  })
  const widths = [...new Set(strokes.map(stroke => stroke.width))].sort((a, b) => a - b)
  if (widths.length !== 2) return fail()
  const outlines = strokes.filter(stroke => stroke.width === widths[1])
  const interiors = strokes.filter(stroke => stroke.width === widths[0])
  if (outlines.length !== interiors.length) return fail()

  const textKeys = ['center', 'width', 'height', 'stroke', 'text', 'fontSize', 'color', 'angle', 'rounded', 'font-weight']
  const letterAt = (mark: unknown, row: number, col: number) => record(mark) && mark.text === letter &&
    mark.width === 0 && mark.angle === 0 && mark.rounded === true && Array.isArray(mark.center) &&
    mark.center[0] === row && mark.center[1] === col && typeof mark.color === 'string' &&
    Object.keys(mark).every(key => textKeys.includes(key))
  const paletteFrame = (mark: unknown) => record(mark) && Array.isArray(mark.center) && mark.center.length === 2 &&
    mark.center.every(coord => coord === size / 2) && typeof mark.width === 'number' &&
    mark.width === mark.height && mark.width >= size && mark.width <= size + .05 && mark.angle === 0 &&
    typeof mark.backgroundColor === 'string' && Object.keys(mark).every(key =>
      ['center', 'width', 'height', 'thickness', 'angle', 'backgroundColor', 'borderColor'].includes(key))
  if (underlays.filter(paletteFrame).length !== 1 || underlays.filter(mark => letterAt(mark, .5, .5)).length !== 1) return fail()

  const usedOverlays = new Set<number>(), usedInteriors = new Set<number>()
  return outlines.map(({ cells, color }) => {
    if (cells.length < 3 || new Set(cells).size !== cells.length) return fail()
    const interior = interiors.findIndex((stroke, index) => !usedInteriors.has(index) && stroke.cells.length === cells.length &&
      (cells.every((cell, at) => cell === stroke.cells[at]) || cells.every((cell, at) => cell === stroke.cells[cells.length - 1 - at])))
    if (interior < 0) return fail()
    usedInteriors.add(interior)
    const a = cells[Math.floor((cells.length - 1) / 2)], b = cells[Math.floor(cells.length / 2)]
    const row = (Math.floor(a / size) + Math.floor(b / size) + 1) / 2
    const col = (a % size + b % size + 1) / 2
    const ring = overlays.findIndex((mark, index) => !usedOverlays.has(index) && record(mark) &&
      Array.isArray(mark.center) && mark.center[0] === row && mark.center[1] === col &&
      mark.rounded === true && mark.angle === 0 && typeof mark.width === 'number' && mark.width > 0 &&
      mark.width <= .5 && mark.width === mark.height && mark.borderColor === color &&
      mark.backgroundColor === interiors[interior].color && Object.keys(mark).every(key =>
        ['center', 'width', 'height', 'thickness', 'angle', 'rounded', 'backgroundColor', 'borderColor'].includes(key)))
    const text = overlays.findIndex((mark, index) => !usedOverlays.has(index) && letterAt(mark, row, col))
    if (ring < 0 || text < 0) return fail()
    usedOverlays.add(ring)
    usedOverlays.add(text)
    return { type: 'zipper', cells } as const
  })
}

function sudokuPadRuleClauses(text: string) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.some(line => /^-{3,}/.test(line))) {
    return text.trim().split(/\n\s*\n|(?<=\.)\s+(?=(?:Double Arrows|Arrows|Thermometer|Killer cages|Kropki(?: pairs)?|Anti-King|Entropic lines|Both lines are Entropic lines|Between Lines|Cells separated by):)/i)
      .flatMap(part => part.startsWith('Normal ') ? part.split(/(?<=\.)\s+(?=There are black and white dots in the grid\.)/i) : [part])
      .map(part => part.replace(/\s+/g, ' '))
  }
  const clauses: string[] = []
  let current = ''
  for (const line of lines) {
    const section = /^-{3,}\s*(.*)$/.exec(line)
    if (section) {
      if (current.trim()) clauses.push(current.trim().replace(/\s+/g, ' '))
      current = section[1]
    } else current += `${current ? ' ' : ''}${line.trim()}`
  }
  if (current.trim()) clauses.push(current.trim().replace(/\s+/g, ' '))
  return clauses
}

function readXvAndSandwichOverlays(overlays: unknown, size: number, authoredXv: boolean, authoredSandwich: boolean) {
  if (overlays !== undefined && (!Array.isArray(overlays) || overlays.length > 4 * size * (size - 1) + 4 * size)) {
    throw new Error('This SudokuPad export has invalid outside or XV clues.')
  }
  const five: [number, number][] = [], ten: [number, number][] = [], sandwiches: SizedConstraintRule[] = []
  const unused: unknown[] = []
  const shapeKeys = ['stroke', 'center', 'width', 'height', 'rounded', 'text', 'color', 'backgroundColor', 'borderColor', 'thickness', 'fs']
  for (const overlay of overlays ?? []) {
    if (!record(overlay) || overlay.text !== 'X' && overlay.text !== 'x' && overlay.text !== 'V' && overlay.text !== 'v' && !Number.isInteger(overlay.text)) {
      unused.push(overlay)
      continue
    }
    if (!record(overlay) || Object.keys(overlay).some(key => !shapeKeys.includes(key)) ||
      typeof overlay.width !== 'number' || overlay.width <= 0 || typeof overlay.height !== 'number' ||
      overlay.width !== overlay.height || overlay.rounded !== true || !isPoint(overlay.center)) {
      throw new Error('This SudokuPad export has an unsupported clue marking.')
    }
    if (overlay.text === 'X' || overlay.text === 'x' || overlay.text === 'V' || overlay.text === 'v') {
      if (!authoredXv || overlay.width > .5 || overlay.stroke !== undefined && !/^#(?:000|000000|000000ff)$/i.test(String(overlay.stroke)) ||
        overlay.backgroundColor !== undefined && !/^#(?:fff|ffffff|ffffffff)$/i.test(String(overlay.backgroundColor))) {
        throw new Error('This SudokuPad export has an unsupported XV marker.')
      }
      const [row, column] = overlay.center
      let cells: [number, number]
      if (Number.isInteger(row - .5) && Number.isInteger(column)) {
        cells = [boardCell([row, column - .5], size, .5), boardCell([row, column + .5], size, .5)]
      } else if (Number.isInteger(row) && Number.isInteger(column - .5)) {
        cells = [boardCell([row - .5, column], size, .5), boardCell([row + .5, column], size, .5)]
      } else throw new Error('An XV marker must lie between two neighboring cells.')
      const marks = (overlay.text.toUpperCase() === 'V' ? five : ten)
      if (marks.some(([a, b]) => a === cells[0] && b === cells[1] || a === cells[1] && b === cells[0])) {
        throw new Error('This SudokuPad export repeats an XV marker.')
      }
      marks.push(cells)
      continue
    }
    if (Number.isInteger(overlay.text)) {
      if (!authoredSandwich || overlay.width !== 1 || overlay.stroke !== undefined && overlay.stroke !== 'none') {
        throw new Error('This SudokuPad export has an unsupported sandwich clue.')
      }
      const [row, column] = overlay.center
      let direction: 'north' | 'east' | 'south' | 'west'
      let cells: number[]
      if (row === -.5 && Number.isInteger(column - .5)) {
        direction = 'south'
        const start = boardCell([.5, column], size, .5)
        cells = Array.from({ length: size }, (_, index) => start + index * size)
      } else if (row === size + .5 && Number.isInteger(column - .5)) {
        direction = 'north'
        const start = boardCell([size - .5, column], size, .5)
        cells = Array.from({ length: size }, (_, index) => start - index * size)
      } else if (column === -.5 && Number.isInteger(row - .5)) {
        direction = 'east'
        const start = boardCell([row, .5], size, .5)
        cells = Array.from({ length: size }, (_, index) => start + index)
      } else if (column === size + .5 && Number.isInteger(row - .5)) {
        direction = 'west'
        const start = boardCell([row, size - .5], size, .5)
        cells = Array.from({ length: size }, (_, index) => start - index)
      } else throw new Error('A sandwich clue must sit on the edge of a row or column.')
      sandwiches.push({ type: 'sandwich', direction, cells, sum: Number(overlay.text) })
      continue
    }
    throw new Error('This SudokuPad export has an unsupported clue marking.')
  }
  if (authoredXv && !five.length && !ten.length) throw new Error('The SudokuPad XV markers are missing.')
  if (authoredSandwich && !sandwiches.length) throw new Error('The SudokuPad sandwich clue is missing.')
  return {
    rules: [
      ...(five.length || ten.length ? [{ type: 'xv', ...(five.length && { five: { pairs: five } }), ...(ten.length && { ten: { pairs: ten } }) } as SizedConstraintRule] : []),
      ...sandwiches,
    ],
    unused: unused.length ? unused : undefined,
  }
}

export function readKropkiDots(overlays: unknown, size: number): SizedConstraintRule {
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

function sudokuPadWhispersMinimum(color: string) {
  const normalized = color.toLowerCase()
  if (/^#ffa600(?:ff)?$/.test(normalized)) return 2
  if (/^#67f067(?:ff)?$/.test(normalized)) return 3
  return undefined
}

function readArrowCircles(overlays: unknown[]) {
  return overlays.flatMap((overlay, index) => {
    const backgroundColor = record(overlay) && typeof overlay.backgroundColor === 'string'
      ? overlay.backgroundColor.toLowerCase() : ''
    const isVisibleWhite = /^#(?:fff|ffffff|ffffffff)$/.test(backgroundColor) ||
      /^#fff[0-9a-f]$/.test(backgroundColor) && !backgroundColor.endsWith('0') ||
      /^#ffffff[0-9a-f]{2}$/.test(backgroundColor) && !backgroundColor.endsWith('00')
    if (!record(overlay) || Object.keys(overlay).some(key =>
      !['center', 'width', 'height', 'thickness', 'angle', 'rounded', 'backgroundColor', 'borderColor'].includes(key)) ||
      !isPoint(overlay.center) || !overlay.center.every(coordinate => Number.isInteger(coordinate - .5)) ||
      overlay.rounded !== true || typeof overlay.width !== 'number' || overlay.width !== overlay.height ||
      overlay.width <= 0 || overlay.width > 1 || typeof overlay.borderColor !== 'string' ||
      !isVisibleWhite) return []
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

/** Import the reviewed padded Penpa export for the 4×4 X-Sum Twins puzzle. */
export function readSudokuPadXSumDots(data: Record<string, unknown>) {
  const fields = ['id', 'settings', 'cellSize', 'cells', 'regions', 'lines', 'underlays', 'overlays', 'metadata', 'cages']
  const { id, settings, cellSize, cells, regions, lines, underlays, overlays, metadata, cages } = data
  if (Object.keys(data).some(key => !fields.includes(key)) || typeof id !== 'string' || !id ||
    !record(settings) || Object.keys(settings).length !== 0 ||
    cellSize !== undefined && (typeof cellSize !== 'number' || !Number.isFinite(cellSize) || cellSize <= 0) ||
    !record(metadata) || Object.keys(metadata).some(key => !['title', 'author', 'rules', 'solution'].includes(key)) ||
    !Array.isArray(cages)) {
    throw new Error('This SudokuPad X-Sum export contains unsupported fields.')
  }
  const sourceMetadata: Record<string, unknown> = { ...metadata }
  for (const cage of cages) {
    if (!record(cage) || Object.keys(cage).some(key => key !== 'value') || typeof cage.value !== 'string') {
      throw new Error('This SudokuPad X-Sum export contains an unsupported cage.')
    }
    const match = /^(title|author|rules|solution): ([\s\S]*)$/.exec(cage.value)
    if (!match || sourceMetadata[match[1]] !== undefined && sourceMetadata[match[1]] !== match[2]) {
      throw new Error('This SudokuPad X-Sum export contains unsupported metadata.')
    }
    sourceMetadata[match[1]] = match[2]
  }
  const rulesText = typeof sourceMetadata.rules === 'string'
    ? sourceMetadata.rules.trim().split(/\n\s*\n/).map(clause => clause.replace(/\s+/g, ' ')) : []
  if (rulesText.length !== 3 ||
    !/^Normal 4\s*[x×]\s*4 sudoku rules apply: in the 4\s*[x×]\s*4 grid, place the digits 1-4 once each in every row, column, and box\.$/i.test(rulesText[0]) ||
    !/^X-Sums: numbers outside the grid indicate the sum of the first N digits in that row or column seen from the direction of the clue, where N is the first digit seen by the clue\.$/i.test(rulesText[1]) ||
    !/^Numbers separated by a white dot are consecutive\. Not all possible dots are necessarily given\.$/i.test(rulesText[2])) {
    throw new Error('This SudokuPad X-Sum export has unsupported or incomplete rules.')
  }
  if (!Array.isArray(cells) || cells.length !== 5 || cells.some(row => !Array.isArray(row) || row.length !== 5)) {
    throw new Error('This SudokuPad X-Sum export needs its blank padded 5 × 5 grid.')
  }
  const givens: string[] = []
  for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
    const cell = cells[row][column]
    if (!record(cell) || Object.keys(cell).some(key => key !== 'value') ||
      cell.value !== undefined && (!Number.isInteger(cell.value) || Number(cell.value) < 1 || Number(cell.value) > 4) ||
      (row === 0 || column === 0) && cell.value !== undefined) {
      throw new Error('This SudokuPad X-Sum export must keep its outside cells blank.')
    }
    if (row > 0 && column > 0) givens.push(String(cell.value ?? 0))
  }
  if (!Array.isArray(regions) || regions.length !== 4 || regions.some(region => !Array.isArray(region) || region.length !== 4)) {
    throw new Error('This SudokuPad X-Sum export needs four 2 × 2 boxes inside its padded grid.')
  }
  const boxes = (regions as unknown[][]).map(region => region.map((coordinates: unknown) => boardCell(coordinates, 4, 1)))
  const expectedBoxes: number[][] = Array.from({ length: 4 }, (_, box) => {
    const row = Math.floor(box / 2) * 2 + 1, column = box % 2 * 2 + 1
    return [row * 4 + column - 5, row * 4 + column - 4, (row + 1) * 4 + column - 5, (row + 1) * 4 + column - 4]
  })
  if (boxes.some((box, index) => box.slice().sort((a, b) => a - b).join(',') !== expectedBoxes[index].sort((a, b) => a - b).join(','))) {
    throw new Error('This SudokuPad X-Sum export has unsupported 2 × 2 box geometry.')
  }

  const point = (value: unknown): value is [number, number] =>
    Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))
  const samePoint = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1]
  const midpoint = (a: readonly number[], b: readonly number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const clueMarkers: { end: Exclude<SizedSumEnd, number>; center: [number, number]; firstCell: number; firstCenter: [number, number] }[] = []
  const decorative: { target: string; color: string; thickness: number; wayPoints: [number, number][] }[] = []
  if (!Array.isArray(lines) || lines.length !== 11) throw new Error('This SudokuPad X-Sum export has incomplete clue lines.')
  for (const line of lines) {
    if (!record(line) || Object.keys(line).some(key => !['target', 'wayPoints', 'color', 'thickness'].includes(key)) ||
      !Array.isArray(line.wayPoints) || !line.wayPoints.every(point) || typeof line.target !== 'string' ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || !Number.isFinite(line.thickness) || line.thickness <= 0) {
      throw new Error('This SudokuPad X-Sum export has an unsupported line marking.')
    }
    const points = line.wayPoints as [number, number][]
    if (line.target === 'overlay' && line.color.toLowerCase() === '#000000' && line.thickness === 1.7 && points.length === 2) {
      const [[r0, c0], [r1, c1]] = points
      if (r0 === 0 && r1 === 1 && c0 === c1 && c0 >= 2 && c0 <= 4) {
        const index = c0 - 1
        clueMarkers.push({ end: { direction: 'south', index }, center: [0.5, c0 + 0.5],
          firstCell: index, firstCenter: [1.5, c0 + 0.5] })
        continue
      }
      if (c0 === 0 && c1 === 1 && r0 === r1 && r0 >= 2 && r0 <= 4) {
        const index = r0 - 1
        clueMarkers.push({ end: { direction: 'east', index }, center: [r0 + 0.5, 0.5],
          firstCell: index * 4, firstCenter: [r0 + 0.5, 1.5] })
        continue
      }
    }
    decorative.push({ target: line.target, color: line.color, thickness: line.thickness, wayPoints: points })
  }
  const markerKeys = clueMarkers.map(({ end }) => `${end.direction}:${end.index}`)
  const expectedMarkers = ['south:1', 'south:2', 'south:3', 'east:1', 'east:2', 'east:3']
  if (markerKeys.length !== 6 || markerKeys.slice().sort().join(',') !== expectedMarkers.sort().join(',')) {
    throw new Error('This SudokuPad X-Sum export has missing or duplicated outside clues.')
  }
  // Only recognize the five non-rule lines present in this published drawing.
  if (decorative.length !== 5 || decorative.filter(line => line.target === 'overlay' && line.color.toLowerCase() === '#000000' &&
    line.thickness === 1.7 && line.wayPoints.length === 7).length !== 1 ||
    decorative.filter(line => line.target === 'cell-grids' && line.color.toLowerCase() === '#ffffff' && line.thickness === 4).length !== 1 ||
    decorative.filter(line => line.target === 'cell-grids' && line.color.toLowerCase() === '#000000' && line.thickness === 7.2).length !== 3) {
    throw new Error('This SudokuPad X-Sum export has unsupported line artwork.')
  }
  if (!Array.isArray(underlays) || underlays.length !== 1 || !record(underlays[0]) ||
    Object.keys(underlays[0]).some(key => !['class', 'backgroundColor', 'center', 'width', 'height'].includes(key)) ||
    underlays[0].class !== 'board-position' || underlays[0].backgroundColor !== '#FFFFFF00' ||
    !samePoint(underlays[0].center as number[], [2.5, 2.5]) || underlays[0].width !== 5 || underlays[0].height !== 5) {
    throw new Error('This SudokuPad X-Sum export has unsupported board artwork.')
  }
  if (!Array.isArray(overlays) || overlays.length !== 2) throw new Error('This SudokuPad X-Sum export needs both white dots.')
  const dots = overlays.map(overlay => {
    if (!record(overlay) || Object.keys(overlay).some(key => !['borderSize', 'borderColor', 'backgroundColor', 'rounded', 'center', 'width', 'height'].includes(key)) ||
      overlay.borderSize !== 1.7 || overlay.borderColor !== '#000000' || overlay.backgroundColor !== '#FFFFFF' || overlay.rounded !== 1 ||
      overlay.width !== 0.286 || overlay.height !== 0.286 || !point(overlay.center)) {
      throw new Error('This SudokuPad X-Sum export has an unsupported dot.')
    }
    return overlay.center
  })
  const rules: SizedConstraintRule[] = []
  for (const dot of dots) {
    const possibilities: [SizedSumEnd, SizedSumEnd][] = []
    for (let left = 0; left < clueMarkers.length; left++) for (let right = left + 1; right < clueMarkers.length; right++) {
      const a = clueMarkers[left], b = clueMarkers[right]
      if (a.end.direction === b.end.direction && Math.abs(a.end.index - b.end.index) === 1 &&
        samePoint(midpoint(a.center, b.center), dot)) possibilities.push([a.end, b.end])
    }
    for (const clue of clueMarkers) if (samePoint(midpoint(clue.center, clue.firstCenter), dot)) {
      possibilities.push([clue.end, clue.firstCell])
    }
    if (possibilities.length !== 1) throw new Error('A SudokuPad white dot does not identify exactly one X-Sum relation.')
    rules.push({ type: 'x-sum-dot', ends: possibilities[0], relation: 'consecutive' })
  }
  const solutionText = sourceMetadata.solution
  if (typeof sourceMetadata.title !== 'string' || typeof sourceMetadata.author !== 'string' || typeof solutionText !== 'string' || solutionText.length !== 25) {
    throw new Error('This SudokuPad X-Sum export has invalid source metadata.')
  }
  const solution = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => solutionText[(row + 1) * 5 + column + 1]).join('')).join('')
  if (!isGridText(solution, MINI_GRID) || solution.includes('0') ||
    Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => solutionText[row * 5 + column]))
      .some((line, row) => line.some((digit, column) => (row === 0 || column === 0) && digit !== '.'))) {
    throw new Error('This SudokuPad X-Sum export has an invalid padded solution.')
  }
  if (!isSizedRuleList(rules, MINI_GRID)) throw new Error('This SudokuPad X-Sum export has invalid dot constraints.')
  return { givens: givens.join(''), grid: MINI_GRID, sizedRules: rules,
    title: sourceMetadata.title.trim().slice(0, 72), sizedAuthor: sourceMetadata.author.trim().slice(0, 72),
    authoredSolution: solution, authoredSolutionOnly: true as const }
}

export function readSizedRuleSudokuPad(data: Record<string, unknown>) {
  const fields = ['id', 'metadata', 'cages', 'cellSize', 'cells', 'regions', 'lines', 'underlays', 'overlays', 'arrows']
  const { cells, metadata, regions, cages, lines, underlays, overlays, arrows } = data
  if (Object.keys(data).some(key => !fields.includes(key)) ||
    data.cellSize !== undefined && (typeof data.cellSize !== 'number' || !Number.isFinite(data.cellSize) || data.cellSize <= 0) ||
    !record(metadata) || typeof metadata.rules !== 'string' ||
    Object.keys(metadata).some(key => !['source', 'title', 'author', 'rules', 'solution', 'msgcorrect', 'antiking'].includes(key)) ||
    metadata.antiking !== undefined && typeof metadata.antiking !== 'boolean') {
    throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (!Array.isArray(cells) || (cells.length !== 4 && cells.length !== 5 && !isRectangularSize(cells.length)) ||
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
  const rulesText = sudokuPadRuleClauses(metadata.rules)
  const jigsawBase = JIGSAW_BASE.exec(rulesText[0])
  const jigsaw = jigsawBase && isJigsawSize(size) && Number(jigsawBase[2]) === size && labels.every(label => label >= 0)
    ? { size, regions: regionsFromMembership(labels, size) } : undefined
  const rowRegions = size === 5 && new Set(labels).size === size &&
    labels.every((region, cell) => region === labels[Math.floor(cell / size) * size])
  const grid = jigsaw && isJigsawGrid(jigsaw) ? jigsaw
    : rowRegions ? FIVE_BOXLESS_GRID
      : isRectangularSize(size) ? rectangularGridFromRegions(size, labels) : matchesRectangularRegions(MINI_GRID, labels) ? MINI_GRID : undefined
  if (!grid) throw new Error('This SudokuPad puzzle needs rectangular boxes.')

  // SudokuPad's generic lines and circles are drawing primitives. The rules
  // text identifies what they mean, and the bulb determines direction.
  const base = /^Normal (\d+)[x×](\d+) sudoku rules apply[.:] Place the digits 1(?:\s+to\s+|\s*[–-]\s*)(\d+)(?: once each)? in every row, column,? and (\d+)[x×](\d+) box\.?$/i.exec(rulesText[0])
  const rowColumnBase = /^Normal (\d+)[x×](\d+) sudoku rules apply[.:] Place the digits 1\s*[–-]\s*(\d+)(?: once each)? in every row and column\.?$/i.exec(rulesText[0])
  const shortBase = /^(?:Normal|Standard) (\d+)[x×](\d+) sudoku rules apply\.$/i.exec(rulesText[0])
  const boxFirstBase = /^Normal (\d+)[x×](\d+) sudoku rules apply: every row, column and (\d+)[x×](\d+) box contains the digits 1[-–](\d+) exactly once each\.$/i.exec(rulesText[0])
  const compactBase = /^SUDOKU - Fill the grid with the digits 1[-–](\d+) so that no digit repeats in a row, column, or box\.$/i.exec(rulesText[0])
  const authoredSizedBase = /^Normal (\d+)[x×](\d+) sudoku rules apply: In every row, column and (?:in )?(?:(\d+)[x×](\d+) )?every box the digits from 1 to (\d+) have to appear at ?least once\.$/i.exec(rulesText[0])
  const clauses = rulesText.slice(1)
  const thermometer = /^(?:Digits along a thermometer strictly increase from bulb to tip|Thermometer: digits on a thermometer must strictly increase from the bulb to the tip|Thermometers: digits along a thermometer increase from bulb to tip|Thermometers: Digits on a thermometer strictly increase from the bulb to the tip)\.$/i
  const compactThermometer = /^THERMOMETER - Digits increase in value along a thermometer, starting from the bulb end\.(?: They don't have to be adjacent, for example 1-3-4 or 2-4 would be just fine\.)?$/i
  const slowThermometer = /^Slow thermometers?: Digits on a slow thermo increase or stay the same but never decrease\.$/i
  const renban = /^Digits along a pink line form a set of non-repeating consecutive digits in any order\.$/i
  const compactRenban = /^RENBAN - Digits on a purple Renban line must be a set of consecutive, non-repeating digits \(in any order\)\.(?: For example, a length 3 line could have -3-1-2-, but not -1-2-4- or -1-3-1-\.)?$/i
  const isRenban = (clause: string) => renban.test(clause) || compactRenban.test(clause)
  const isThermometer = (clause: string) => thermometer.test(clause) || compactThermometer.test(clause)
  const kropki = /^(?:Digits separated by a white dot are consecutive\. Digits separated by a black dot have a 1:2 ratio\. Not all dots are given|Kropki: digits separated by a black dot are in an 1:2 ratio \(i\.e\. one digit is double the other\); digits separated by a white dot are consecutive)\.$/i
  const whiteKropki = /^(?:Kropki pairs: digits separated by a white dot are consecutive\.|Cells separated by a white Kropki Dot are consecutive\. May be read in either order\. Eg: \d+-\d+)$/i
  const blackKropki = /^Cells separated by a black Kropki Dot have a ratio of 1:2\. May be read in either order\. Eg: \d+-\d+$/i
  const compactKropki = /^PARTIAL KROPKI - A white dot between two cells requires that the value in one cell is exactly 1 greater than the value of the other cell\. - A black dot between two cells requires that the value in one cell is exactly double the value of the other cell\.$/i
  const isKropki = (clause: string) => kropki.test(clause) || compactKropki.test(clause) || whiteKropki.test(clause) || blackKropki.test(clause)
  const cornerKropki = /^There are black and white dots in the grid\. For each dot, consider each pair of diagonally opposite digits surrounding that dot\. For black dots, each diagonal pair have a 1:2 ratio, meaning one is exactly double the other\. For white dots, each diagonal pair is consecutive\.$/i
  const arrow = /^(?:Digits along an arrow sum to the digit in a bulb\. Digits may repeat if allowed by other rules|Arrows: the digits along the arrow must sum to the number in the circled cells)\.$/i
  const killer = /^Killer cages: digits in (?:a )?(?:killer )?cage (?:must )?sum to the (?:number|total) (?:in|given in) the top left corner(?: and cannot repeat)?\.$/i
  const authoredKiller = clauses.some(clause => killer.test(clause))
  const doubleArrow = /^Double Arrows: (?:Digits along a grey line have the same sum as the sum of the two connected circles|the sum of the digits along a line (?:is|are) equal to the sum of the digits in the circles at either end of that line)\.?$/i
  const authoredArrows = clauses.some(clause => arrow.test(clause))
  const authoredDoubleArrows = clauses.some(clause => doubleArrow.test(clause))
  const antiKing = /^Anti[- ]King:?\s+(?:No two identical digits can be orthogonally or diagonally adjacent to each other|Cells separated by a chess king['’]s move cannot contain the same digit)\.?$/i
  const printedAntiKing = clauses.some(clause => antiKing.test(clause))
  const authoredAntiKing = metadata.antiking === true || printedAntiKing
  const entropicLineRule = /^Entropic lines: every 3 consecutive digits along a peach line must contain a low digit \(([\d, ]+)\), a middle digit \(([\d, ]+)\) and a high digit \(([\d, ]+)\)\.$/i
  const namedEntropicRule = /^Both lines are Entropic lines\. Along the lines, they must contain a low \(([\d, ]+)\) middle \(([\d, ]+)\) and high \(([\d, ]+)\) digit in any 3 consecutive cells\. Eg: \d+(?:-\d+)+$/i
  const parseEntropicGroups = (clause: string) => {
    const match = entropicLineRule.exec(clause) ?? namedEntropicRule.exec(clause)
    return match?.slice(1).map(group => group.split(',').map(digit => Number(digit.trim())))
  }
  const entropicClauses = clauses.filter(clause => parseEntropicGroups(clause))
  const entropicGroups = entropicClauses.length === 1 ? parseEntropicGroups(entropicClauses[0]) : undefined
  const authoredEntropic = !!entropicGroups && entropicGroups.length === 3 && entropicGroups.every(group => group.length > 0 && group.every(digit => digit >= 1 && digit <= size)) &&
    entropicGroups.flat().length === size && new Set(entropicGroups.flat()).size === size
  if (entropicClauses.length && !authoredEntropic) throw new Error('This SudokuPad export has invalid Entropic digit groups.')
  const authoredKropki = clauses.some(isKropki)
  const authoredCornerKropki = clauses.some(clause => cornerKropki.test(clause))
  const authoredThermometers = clauses.some(isThermometer)
  const authoredSlowThermometers = clauses.some(clause => slowThermometer.test(clause))
  const compactBulbs = clauses.some(clause => compactThermometer.test(clause)) || authoredThermometers || authoredSlowThermometers
  const authoredRenban = clauses.some(isRenban)
  const regionSum = /^Box borders split region sum lines into segments with the same sum\. Different lines can have different segment sums\.$/i
  const evenZipper = /^Zipper(?: Lines)?: Digits an equal distance to the circled center of a line sum to the same total\.$/i
  const squareDigitRule = /^S: The top-left corner contains a square digit \(1 or 4\)\.$/i
  const regionSumCompanion = /^Region Sum Lines: Box borders divide lines into segments with equal sums\.$/i
  const authoredRegionSum = clauses.some(clause => regionSum.test(clause) || regionSumCompanion.test(clause))
  const dualZipper = size === 6 && clauses.some(clause => evenZipper.test(clause)) &&
    clauses.some(clause => squareDigitRule.test(clause)) && clauses.some(clause => regionSumCompanion.test(clause))
  const authoredZipper = dualZipper || clauses.some(clause => evenZipper.test(clause))
  const whisperStatement = (clause: string) => {
    const german = /^(?:German whisper lines: )?Two cells connected by a German whisper line must have a difference of at least (\d+)\.$/i.exec(clause)
    const dutch = /^(?:Dutch whisper lines: )?Two cells connected by a Dutch whisper line must have a difference of at least (\d+)\.$/i.exec(clause)
    const match = german ?? dutch
    return match ? { family: german ? 'German' : 'Dutch', minimum: Number(match[1]) } : undefined
  }
  const whisperStatements = clauses.flatMap(clause => {
    const statement = whisperStatement(clause)
    return statement ? [statement] : []
  })
  const whispersClauses = whisperStatements.map(({ minimum }) => minimum)
  const whisperMinimums = new Map<string, Set<number>>()
  for (const { family, minimum } of whisperStatements) {
    const minimums = whisperMinimums.get(family) ?? new Set<number>()
    minimums.add(minimum)
    whisperMinimums.set(family, minimums)
  }
  const conflictingWhisperMinimums = [...whisperMinimums.values()].some(minimums => minimums.size > 1)
  const whisperDifference = (clause: string) => whisperStatement(clause)?.minimum
  const authoredWhispers = whispersClauses.length > 0
  const xv = /^XV-Pairs: Cells joined by an X or V must sum to 10\(X\) or 5\(V\)\.$/i
  const authoredXv = clauses.some(clause => xv.test(clause))
  const sandwich = /^Sandwich sum: (?:Digits between 1 and (\d+) in the indicated row or column must sum to the indicated value|Clues on the edge of the grid show the sum of the digits sandwiched between the 1 and the (\d+) in that row or column)\.$/i
  const authoredSandwich = clauses.some(clause => {
    const match = sandwich.exec(clause)
    return !!match && Number(match[1] ?? match[2]) === size
  })
  const betweenLine = /^Between Lines: Digits along a grey line must be strictly between the digits in two connected circles\.?$/i
  const authoredBetween = clauses.some(clause => betweenLine.test(clause))
  const isSandwich = (clause: string) => {
    const match = sandwich.exec(clause)
    return !!match && Number(match[1] ?? match[2]) === size
  }
  const authoredAnyThermometers = authoredThermometers || authoredSlowThermometers
  const boxRows = 'boxRows' in grid ? grid.boxRows : undefined
  const boxColumns = 'boxColumns' in grid ? grid.boxColumns : undefined
  const matchesBoxDimensions = (width: string, height: string) =>
    Number(width) === boxColumns && Number(height) === boxRows ||
    Number(width) === boxRows && Number(height) === boxColumns
  const validBase = jigsawBase ? Number(jigsawBase[2]) === size : rowColumnBase
    ? rowColumnBase.slice(1, 4).every(part => Number(part) === size)
    : boxFirstBase
    ? [boxFirstBase[1], boxFirstBase[2], boxFirstBase[5]].every(value => Number(value) === size) &&
      matchesBoxDimensions(boxFirstBase[3], boxFirstBase[4])
    : base
    ? base.slice(1, 4).every(part => Number(part) === size) &&
      matchesBoxDimensions(base[4], base[5])
    : Number(compactBase?.[1]) === size || Number(shortBase?.[1]) === size && Number(shortBase?.[2]) === size ||
      Number(authoredSizedBase?.[1]) === size && Number(authoredSizedBase?.[2]) === size && Number(authoredSizedBase?.[5]) === size &&
      (!authoredSizedBase?.[3] || matchesBoxDimensions(authoredSizedBase[3], authoredSizedBase[4]))
  if (!validBase || authoredThermometers && authoredSlowThermometers ||
    conflictingWhisperMinimums || whispersClauses.some(difference => difference < 1 || difference >= size) ||
    clauses.some(clause => !isThermometer(clause) && !slowThermometer.test(clause) && !isRenban(clause) && !isKropki(clause) &&
      !arrow.test(clause) && !doubleArrow.test(clause) && !regionSum.test(clause) && !killer.test(clause) &&
      !xv.test(clause) && !isSandwich(clause) && !betweenLine.test(clause) && !cornerKropki.test(clause) && !antiKing.test(clause) &&
      !parseEntropicGroups(clause) && whisperDifference(clause) === undefined &&
      !(dualZipper && (evenZipper.test(clause) || squareDigitRule.test(clause) || regionSumCompanion.test(clause)))) || metadata.antiking === false && printedAntiKing) {
    throw new Error('This SudokuPad puzzle has authored rules this importer cannot verify.')
  }
  const rules: SizedConstraintRule[] = []
  if (authoredAntiKing) rules.push({ type: 'anti-king' })
  if (dualZipper) {
    for (const zipper of readLayeredZipper(lines, overlays, underlays, size, 'S')) {
      rules.push(zipper, { type: 'region-sum', cells: zipper.cells })
    }
    rules.push({ type: 'digit-restriction', cells: [0], digits: [1, 4], shape: 'square' })
  }
  if (authoredKiller) {
    if (!Array.isArray(cages) || !cages.length || cages.length > size ** 2) throw new Error('The SudokuPad Killer cages are missing.')
    rules.push({ type: 'killer-cages', cages: cages.map(cage => {
      if (!record(cage) || Object.keys(cage).length !== 3 || !Array.isArray(cage.cells) ||
        typeof cage.value !== 'number' || cage.unique !== true) throw new Error('This SudokuPad export has an unsupported Killer cage.')
      return { cells: cage.cells.map(cell => boardCell(cell, size)), sum: cage.value }
    }) })
  } else if (cages !== undefined && (!Array.isArray(cages) || cages.length)) {
    throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  }
  if (lines !== undefined && (!Array.isArray(lines) || lines.length > 128)) {
    throw new Error('This SudokuPad export has unsupported lines.')
  }
  if (underlays !== undefined && (!Array.isArray(underlays) || underlays.length > 128 ||
    (!authoredAnyThermometers && !dualZipper && underlays.length > 0))) {
    throw new Error('This SudokuPad export has unsupported underlays.')
  }
  const bulbs = (dualZipper ? [] : underlays ?? []).map(bulb => {
    if (!record(bulb) || Object.keys(bulb).some(key => !['center', 'width', 'height', 'rounded', 'backgroundColor', 'stroke'].includes(key)) ||
      (bulb.stroke !== undefined && (!compactBulbs || bulb.stroke !== 'none')) || bulb.rounded !== true || typeof bulb.width !== 'number' || bulb.width !== bulb.height || bulb.width <= 0 || bulb.width > 1 ||
      typeof bulb.backgroundColor !== 'string') {
      throw new Error('This SudokuPad export has an unsupported thermometer bulb.')
    }
    return { cell: boardCell(bulb.center, size, 0.5), color: bulb.backgroundColor }
  })
  let remainingOverlays = dualZipper ? undefined : overlays
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
  const betweenCircles = authoredBetween && Array.isArray(remainingOverlays) ? readArrowCircles(remainingOverlays) : []
  const usedBetweenCircles = new Set<number>()
  for (const line of dualZipper ? [] : lines ?? []) {
    if (!record(line) || Object.keys(line).some(key => !['wayPoints', 'color', 'thickness'].includes(key)) ||
      typeof line.color !== 'string' || typeof line.thickness !== 'number' || line.thickness <= 0) {
      throw new Error('This SudokuPad export has an unsupported line.')
    }
    const mayBeRegionSum = authoredRegionSum &&
      ((!authoredAnyThermometers && !authoredRenban && !authoredDoubleArrows && !authoredWhispers) || /^#2ecbff(?:ff)?$/i.test(line.color))
    const mayBeRenban = authoredRenban &&
      ((!authoredAnyThermometers && !authoredRegionSum && !authoredDoubleArrows && !authoredWhispers) || /^#f067f0(?:ff)?$/i.test(line.color))
    const whisperMin = sudokuPadWhispersMinimum(line.color)
    const mayBeWhispers = authoredWhispers && whisperMin !== undefined && whispersClauses.includes(whisperMin)
    const path = readPath(line.wayPoints, size, mayBeRegionSum || authoredDoubleArrows || authoredEntropic || authoredBetween ? size ** 2 + 1 : size)
    if (authoredBetween) {
      const color = line.color.toLowerCase()
      const circleByCell = new Map<number, number>()
      for (const circle of betweenCircles) {
        if (circle.color !== color) continue
        const cell = boardCell(circle.center, size, .5)
        if (circleByCell.has(cell)) throw new Error('Two Between line circles share a cell and color.')
        circleByCell.set(cell, circle.index)
      }
      const closed = path.length > 2 && path[0] === path.at(-1)
      const cells = closed ? path.slice(0, -1) : path
      if (new Set(cells).size !== cells.length) throw new Error('A Between line path repeats a cell.')
      const markers = cells.flatMap((cell, index) => {
        const circle = circleByCell.get(cell)
        return circle === undefined ? [] : [{ index, circle }]
      })
      if (!markers.length) {
        // Other authored line families may share the same export with Between.
        // Only paths that actually meet a matching circle use this rule.
      } else {
        if (markers.length < (closed ? 3 : 2) || !closed && (markers[0].index !== 0 || markers.at(-1)!.index !== cells.length - 1)) {
          throw new Error('Every Between line segment must connect two marked circles.')
        }
        for (let index = 0; index < markers.length - (closed ? 0 : 1); index++) {
          const start = markers[index].index
          const end = markers[(index + 1) % markers.length].index
          const segment = [cells[start]]
          let cursor = start
          while (cursor !== end) {
            cursor = (cursor + 1) % cells.length
            segment.push(cells[cursor])
            if (segment.length > cells.length) throw new Error('A Between line path has invalid circle order.')
          }
          if (segment.length < 3) throw new Error('Each Between line segment needs an interior cell.')
          rules.push({ type: 'between', cells: segment })
          usedBetweenCircles.add(markers[index].circle)
          usedBetweenCircles.add(markers[(index + 1) % markers.length].circle)
        }
        continue
      }
    }
    if (authoredEntropic && /^#(?:fcaf|fcafff?)$/i.test(line.color)) {
      if (path.length < 3) throw new Error('An Entropic Line must contain at least three cells.')
      rules.push({ type: 'entropic', cells: path, groups: entropicGroups! })
      continue
    }
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
      rules.push({ type: authoredSlowThermometers ? 'slow-thermometer' : 'thermometer', cells: bulb.cell === path[0] ? path : path.reverse() })
    } else if (matching.length === 0 && mayBeRegionSum) {
      const unique = [...new Set(path)]
      const cells = closedRegionSumCells(unique, [path], cell => gridRegionIndex(grid, cell))
      rules.push({ type: 'region-sum', cells, ...(unique.length !== path.length || cells !== unique ? { segments: [path] } : {}) })
    } else if (matching.length === 0 && mayBeRenban) {
      rules.push({ type: 'renban', cells: path })
    } else if (matching.length === 0 && mayBeWhispers) {
      rules.push({ type: 'whispers', cells: path, minDifference: whisperMin! })
    } else {
      throw new Error(authoredAnyThermometers ? 'A thermometer bulb must identify exactly one end of its path.'
        : 'This SudokuPad puzzle has markings without supported rules.')
    }
  }
  rules.push(...singleArrows)
  if (authoredBetween) {
    const unused = betweenCircles.filter(circle => !usedBetweenCircles.has(circle.index))
    if (unused.length) throw new Error('A Between line circle is not connected to a line.')
    const unusedOverlays = Array.isArray(remainingOverlays)
      ? remainingOverlays.filter((_: unknown, index: number) => !usedBetweenCircles.has(index)) : []
    remainingOverlays = unusedOverlays.length ? unusedOverlays : undefined
    if (!rules.some(rule => rule.type === 'between')) throw new Error('The SudokuPad Between lines are missing.')
  }
  if (usedDoubleCircles.size && Array.isArray(remainingOverlays)) {
    const unused = remainingOverlays.filter((_, index) => !usedDoubleCircles.has(index))
    remainingOverlays = unused.length ? unused : undefined
  }
  if (authoredXv || authoredSandwich) {
    const parsed = readXvAndSandwichOverlays(remainingOverlays, size, authoredXv, authoredSandwich)
    rules.push(...parsed.rules)
    remainingOverlays = parsed.unused
  }
  if (authoredCornerKropki) {
    if (!Array.isArray(remainingOverlays)) throw new Error('The SudokuPad Quadruple Kropki dots are missing.')
    const parsed = readCornerKropki(remainingOverlays, size)
    rules.push(parsed.rule)
    remainingOverlays = parsed.unused.length ? parsed.unused : undefined
  }
  if (authoredKropki) rules.push(readKropkiDots(remainingOverlays, size))
  else if (remainingOverlays !== undefined) throw new Error('This SudokuPad puzzle contains unsupported rules or markings.')
  if (bulbs.length || authoredThermometers !== rules.some(rule => rule.type === 'thermometer') ||
    authoredSlowThermometers !== rules.some(rule => rule.type === 'slow-thermometer') ||
    authoredWhispers !== rules.some(rule => rule.type === 'whispers') ||
    authoredXv !== rules.some(rule => rule.type === 'xv') || authoredSandwich !== rules.some(rule => rule.type === 'sandwich') ||
    authoredCornerKropki !== rules.some(rule => rule.type === 'corner-kropki') ||
    authoredRenban !== rules.some(rule => rule.type === 'renban') ||
    authoredDoubleArrows !== rules.some(rule => rule.type === 'double-arrow') ||
    authoredBetween !== rules.some(rule => rule.type === 'between') ||
    authoredAntiKing !== rules.some(rule => rule.type === 'anti-king') ||
    authoredEntropic !== rules.some(rule => rule.type === 'entropic') ||
    clauses.some(clause => namedEntropicRule.test(clause)) && rules.filter(rule => rule.type === 'entropic').length !== 2 ||
    authoredRegionSum !== rules.some(rule => rule.type === 'region-sum') ||
    authoredZipper !== rules.some(rule => rule.type === 'zipper') || !isSizedRuleList(rules, grid) ||
    (isMiniGrid(grid) && !rules.length)) {
    throw new Error('This SudokuPad export has incomplete or invalid lines.')
  }
  const { title, author, solution } = metadata
  if (solution !== undefined && (!isGridText(solution, grid) || solution.includes('0'))) {
    throw new Error('This SudokuPad export has an invalid authored solution.')
  }
  // Validate the published completion against every imported rule; avoid an
  // expensive uniqueness search when a sparse authored puzzle includes it.
  return {
    grid, givens, sizedRules: rules,
    title: typeof title === 'string' ? title.trim().slice(0, 72) || undefined : undefined,
    sizedAuthor: typeof author === 'string' ? author.trim().slice(0, 72) || undefined : undefined,
    authoredSolution: solution,
    ...(solution !== undefined && { authoredSolutionOnly: true as const }),
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
  if (!Array.isArray(regions) || regions.length !== 4 && !isRectangularSize(regions.length)) {
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
  const grid = isRectangularSize(size) ? rectangularGridFromRegions(size, membership) : matchesRectangularRegions(MINI_GRID, membership) ? MINI_GRID : undefined
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
