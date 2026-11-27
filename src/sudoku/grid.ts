import type { House, SizedClassicPosition, SizedConstraintRule, VariantRule } from './engine.ts'
import { digitValueOffset, positionDigit, validPositionDigits, type DigitNotation } from './digit-symbols.ts'

export const CLASSIC_GRID = { size: 9, boxRows: 3, boxColumns: 3 } as const
export const MINI_GRID = { size: 4, boxRows: 2, boxColumns: 2 } as const
export const FIVE_BOXLESS_GRID = { size: 5, noRegions: true } as const
const RECTANGULAR_LAYOUTS = {
  6: [{ size: 6, boxRows: 2, boxColumns: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }],
  8: [{ size: 8, boxRows: 2, boxColumns: 4 }, { size: 8, boxRows: 4, boxColumns: 2 }],
  10: [{ size: 10, boxRows: 2, boxColumns: 5 }, { size: 10, boxRows: 5, boxColumns: 2 }],
} as const

export type RectangularSize = keyof typeof RECTANGULAR_LAYOUTS
type RectangularLayout = typeof RECTANGULAR_LAYOUTS[RectangularSize][number]
export type RectangularGrid = RectangularLayout | (RectangularLayout & { notation: 'zero-based' })
export type RectangularBoxRows = RectangularGrid['boxRows']
export const isRectangularSize = (size: unknown): size is RectangularSize => size === 6 || size === 8 || size === 10

export function rectangularLayouts(size: RectangularSize): readonly RectangularGrid[] {
  return RECTANGULAR_LAYOUTS[size]
}

export function rectangularGridForBoxRows(size: RectangularSize, boxRows?: RectangularBoxRows, notation?: DigitNotation): RectangularGrid {
  const layouts = rectangularLayouts(size)
  const layout = layouts.find(layout => layout.boxRows === boxRows) ?? layouts[0]
  return notation === 'zero-based' ? { ...layout, notation } : layout
}

export function sixGridForBoxRows(boxRows?: 2 | 3) {
  return RECTANGULAR_LAYOUTS[6][boxRows === 3 ? 1 : 0]
}

export type MiniGrid = typeof MINI_GRID
export type JigsawSize = 3 | 4 | 5 | 6 | 7
export const isJigsawSize = (size: unknown): size is JigsawSize => size === 3 || size === 4 || size === 5 || size === 6 || size === 7
export type JigsawGrid<Size extends JigsawSize = JigsawSize> = {
  size: Size
  regions: readonly (readonly number[])[]
  /** Regions connect across opposite edges of both axes. */
  wrapAround?: true
}
export const SEVEN_BOXLESS_GRID = { size: 7, noRegions: true } as const
export const NINE_BOXLESS_GRID = { size: 9, noRegions: true } as const
export const SIX_BOXLESS_GRID = { size: 6, noRegions: true } as const
export type BoxlessGrid = typeof FIVE_BOXLESS_GRID | typeof SIX_BOXLESS_GRID | typeof SEVEN_BOXLESS_GRID | typeof NINE_BOXLESS_GRID
export type SizedGrid = typeof CLASSIC_GRID | MiniGrid | RectangularGrid | JigsawGrid | BoxlessGrid
const sevenJigsawLayouts: readonly JigsawGrid<7>[] = [
  ['0111122', '0012223', '0113223', '0003333', '4555556', '4445656', '4446666'],
  ['0001112', '0311112', '0333332', '0444432', '0444522', '6655552', '6666655'],
  ['0011111', '0211334', '0222334', '0223334', '0255644', '0556664', '5556664'],
  ['0111111', '0223314', '0233334', '0222344', '0255664', '0556664', '0555664'],
].map(rows => ({
  size: 7,
  regions: regionsFromMembership(Array.from(rows.join(''), Number), 7),
}))

const fiveJigsawLayouts: readonly JigsawGrid<5>[] = [
  ['00001', '02231', '22331', '24331', '44441'],
  ['00111', '00112', '03222', '33424', '33444'],
  ['01111', '00001', '23333', '23444', '22244'],
  ['01111', '02213', '02223', '00333', '44444'],
  ['01112', '01312', '03322', '03424', '03444'],
  ['01123', '01223', '01123', '00423', '44443'],
].map(rows => ({ size: 5, regions: regionsFromMembership(Array.from(rows.join(''), Number), 5) }))

export function regionsFromMembership(membership: readonly number[], size: number): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => [])
  membership.forEach((region, cell) => regions[region].push(cell))
  return regions
}

export function fiveJigsawForSeed(seed = 0): JigsawGrid<5> {
  return fiveJigsawLayouts[seed % fiveJigsawLayouts.length]
}

export function sevenJigsawForSeed(seed = 0): JigsawGrid<7> {
  return sevenJigsawLayouts[seed % sevenJigsawLayouts.length]
}

export type PlayGrid = typeof CLASSIC_GRID | SizedGrid

export function isMiniGrid(value: unknown): value is MiniGrid {
  if (value === null || typeof value !== 'object') return false
  const grid = value as Partial<MiniGrid>
  return Object.keys(grid).length === 3 && grid.size === MINI_GRID.size &&
    grid.boxRows === MINI_GRID.boxRows && grid.boxColumns === MINI_GRID.boxColumns
}

export function isSizedGrid(value: unknown): value is SizedGrid {
  if (value === null || typeof value !== 'object') return false
  if (Object.keys(value).length === 3 && 'size' in value && value.size === CLASSIC_GRID.size &&
    'boxRows' in value && value.boxRows === CLASSIC_GRID.boxRows && 'boxColumns' in value &&
    value.boxColumns === CLASSIC_GRID.boxColumns) return true
  if (isMiniGrid(value) || isJigsawGrid(value, true)) return true
  if ('noRegions' in value) return Object.keys(value).length === 2 && 'size' in value && (value.size === 5 || value.size === 6 || value.size === 7 || value.size === 9) && value.noRegions === true
  const grid = value as Partial<RectangularGrid> & { notation?: unknown }
  const layout = isRectangularSize(grid.size) && rectangularLayouts(grid.size).some(item =>
    item.boxRows === grid.boxRows && item.boxColumns === grid.boxColumns)
  if (!layout) return false
  if (grid.notation === 'zero-based') return Object.keys(grid).every(key =>
    ['size', 'boxRows', 'boxColumns', 'notation'].includes(key)) && Object.keys(grid).length === 4
  return grid.size !== 10 && Object.keys(grid).every(key => ['size', 'boxRows', 'boxColumns'].includes(key)) && Object.keys(grid).length === 3
}

export function isJigsawGrid(value: unknown, allowDisconnected = false): value is JigsawGrid {
  if (!value || typeof value !== 'object') return false
  const grid = value as Partial<JigsawGrid>
  if (Object.keys(grid).length !== (grid.wrapAround === true ? 3 : 2) || grid.wrapAround !== undefined && grid.wrapAround !== true) return false
  if (!isJigsawSize(grid.size) || !Array.isArray(grid.regions) || grid.regions.length !== grid.size) return false
  const { size, regions } = grid
  const seen = new Set<number>()
  for (const part of regions) {
    if (!Array.isArray(part) || part.length !== size) return false
    for (const cell of part) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || seen.has(cell)) return false
      seen.add(cell)
    }
    if (grid.wrapAround === true ? !connectedGridCells(part, size, true)
      : !allowDisconnected && !connectedGridCells(part, size)) return false
  }
  return true
}

const jigsawMemberships = new WeakMap<JigsawGrid, readonly number[]>()

export function jigsawMembership(grid: JigsawGrid) {
  const cached = jigsawMemberships.get(grid)
  if (cached) return cached
  const regions = Array<number>(grid.size ** 2)
  for (const [region, cells] of grid.regions.entries()) for (const cell of cells) regions[cell] = region
  jigsawMemberships.set(grid, regions)
  return regions
}

export function jigsawRegionColors(membership: readonly number[], size: number, wrapAround = false) {
  const cellsByRegion = regionsFromMembership(membership, size)
  const regions = [...new Set(membership)].filter(region => region !== undefined)
  const colors: number[] = []
  if (regions.some(region => !connectedGridCells(cellsByRegion[region], size, wrapAround))) {
    // A detached piece must have a color unique to its region.
    regions.forEach((region, index) => { colors[region] = index + 1 })
    return colors
  }
  const neighbors = new Map(regions.map(region => [region, new Set<number>()]))
  membership.forEach((region, cell) => {
    const edges = [cell % size < size - 1 ? membership[cell + 1] : undefined, membership[cell + size]]
    if (wrapAround && cell % size === 0) edges.push(membership[cell + size - 1])
    if (wrapAround && Math.floor(cell / size) === 0) edges.push(membership[cell + size * (size - 1)])
    for (const other of edges) {
      if (other === undefined || other === region) continue
      neighbors.get(region)!.add(other)
      neighbors.get(other)!.add(region)
    }
  })

  // Connected regions form a planar graph, so four colors suffice.
  function assign(index: number): boolean {
    if (index === regions.length) return true
    const region = regions[index]
    const used = new Set([...neighbors.get(region)!].map(other => colors[other]))
    for (let color = 1; color <= 4; color++) {
      if (used.has(color)) continue
      colors[region] = color
      if (assign(index + 1)) return true
      delete colors[region]
    }
    return false
  }
  assign(0)
  return colors
}

export function gridRegionIndex(grid: PlayGrid, cell: number) {
  if ('noRegions' in grid) return -1
  if ('regions' in grid) return jigsawMembership(grid)[cell]
  const { size, boxRows, boxColumns } = grid
  return Math.floor(cell / size / boxRows) * (size / boxColumns) + Math.floor(cell % size / boxColumns)
}

export function sizedGridIdentity(grid: SizedGrid) {
  if ('noRegions' in grid) return `boxless:${grid.size}`
  if ('regions' in grid) {
    const regions = grid.regions.map(cells => [...cells].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
    return `jigsaw:${grid.size}:${grid.wrapAround ? 'wrap:' : ''}${JSON.stringify(regions)}`
  }
  if ('notation' in grid) return `sized:${grid.size}:${grid.boxRows}:${grid.boxColumns}:${grid.notation}`
  return grid.size === 6 ? `six:${grid.boxRows}` : `sized:${grid.size}:${grid.boxRows}:${grid.boxColumns}`
}

export function rectangularGridFromRegions(size: RectangularSize, regions: readonly number[], notation?: DigitNotation) {
  const layout = rectangularLayouts(size).find(grid => matchesRectangularRegions(grid, regions))
  return layout && (notation === 'zero-based' ? { ...layout, notation } : layout)
}

export function matchesRectangularRegions({ size, boxRows, boxColumns }: MiniGrid | RectangularGrid, regions: readonly number[]) {
  return regions.length === size ** 2 && new Set(regions).size === size && regions.every((label, cell) => {
    const firstRow = Math.floor(cell / size / boxRows) * boxRows
    const firstColumn = Math.floor(cell % size / boxColumns) * boxColumns
    return label === regions[firstRow * size + firstColumn]
  })
}

export function isGridText(text: unknown, grid: PlayGrid): text is string {
  return typeof text === 'string' && text.length === grid.size ** 2 && validPositionDigits(text, grid.size)
}

export function sizedClassicPosition(grid: SizedGrid, values: string): SizedClassicPosition {
  const layout = 'notation' in grid ? { size: grid.size, boxRows: grid.boxRows, boxColumns: grid.boxColumns } : grid
  return { version: 2, grid: layout, digits: Array.from(values, positionDigit) }
}

export function gridValueOffset(grid?: PlayGrid) {
  return grid && 'notation' in grid ? digitValueOffset(grid.notation) : 0
}

export function gridDiagonalCells(size: number, diagonal: 'main' | 'anti') {
  return Array.from({ length: size }, (_, row) => row * size + (diagonal === 'main' ? row : size - row - 1))
}

export function gridCellsShareEdge(first: number, second: number, size: number) {
  return Math.abs(Math.floor(first / size) - Math.floor(second / size)) + Math.abs(first % size - second % size) === 1
}

export function connectedGridCells(cells: readonly number[], size: number, wrapAround = false) {
  if (cells.length < 2) return cells.length === 1
  const members = new Set(cells)
  const reached = new Set([cells[0]])
  for (const cell of reached) {
    const row = Math.floor(cell / size), column = cell % size
    const neighbors = [
      row > 0 ? cell - size : wrapAround ? cell + size * (size - 1) : -1,
      row < size - 1 ? cell + size : wrapAround ? cell - size * (size - 1) : -1,
      column > 0 ? cell - 1 : wrapAround ? cell + size - 1 : -1,
      column < size - 1 ? cell + 1 : wrapAround ? cell - size + 1 : -1,
    ]
    for (const neighbor of neighbors) if (members.has(neighbor)) reached.add(neighbor)
  }
  return reached.size === cells.length
}

export function rowColumnSumTotal([first, second]: readonly [number, number], size: number) {
  const row = Math.floor(first / size)
  return (row === Math.floor(second / size) ? row : first % size) + 1
}

export function kropkiDigitExclusions(rules: readonly (SizedConstraintRule | VariantRule)[], cell: number, other: number, digit: number, size: number, valueOffset = 0) {
  if (!gridCellsShareEdge(cell, other, size)) return 0
  let white = false, black = false, negativeWhite = false, negativeBlack = false
  const matches = ([a, b]: readonly [number, number]) => a === cell && b === other || a === other && b === cell
  let excluded = 0, labeledEdges = 0, labeledNegative = 0
  for (const rule of rules) {
    if (rule.type === 'kropki') {
      white ||= rule.consecutive?.pairs?.some(matches) === true
      black ||= rule.ratioTwo?.pairs?.some(matches) === true
      negativeWhite ||= rule.consecutive?.negative === true
      negativeBlack ||= rule.ratioTwo?.negative === true
    } else if (rule.type === 'labeled-dots') {
      const ratio = rule.relation === 'ratio'
      const bit = ratio ? 2 : 1
      if (rule.negative) labeledNegative |= bit
      for (const mark of rule.marks) {
        if (!matches(mark.cells)) continue
        labeledEdges |= bit
        for (let other = 1; other <= size; other++) {
          const [left, right] = [digit, other].map(value => value - valueOffset)
          if (ratio ? Math.min(left, right) === 0 || Math.max(left, right) !== mark.value * Math.min(left, right) : Math.abs(digit - other) !== mark.value) {
            excluded |= 1 << (other - 1)
          }
        }
      }
    }
  }
  if (white || black || negativeWhite || negativeBlack) for (let candidate = 1; candidate <= size; candidate++) {
    const consecutive = Math.abs(digit - candidate) === 1
    const left = digit - valueOffset, right = candidate - valueOffset
    const ratioTwo = Math.min(left, right) > 0 && Math.max(left, right) === 2 * Math.min(left, right)
    if (white && !consecutive || black && !ratioTwo ||
      !white && !black && (negativeWhite && consecutive || negativeBlack && ratioTwo)) excluded |= 1 << (candidate - 1)
  }
  const unmarkedNegative = labeledNegative & ~labeledEdges
  if (unmarkedNegative & 1) excluded |= (digit > 1 ? 1 << (digit - 2) : 0) | (digit < size ? 1 << digit : 0)
  const value = digit - valueOffset
  if (unmarkedNegative & 2 && value > 0) {
    const double = 2 * value + valueOffset, half = value / 2 + valueOffset
    excluded |= (double <= size ? 1 << (double - 1) : 0) | (value % 2 === 0 ? 1 << (half - 1) : 0)
  }
  return excluded
}

export function sizedDigitExclusions(rules: readonly SizedConstraintRule[] | undefined, cell: number, other: number, digit: number, size: number, valueOffset = 0) {
  if (!rules) return 0
  let excluded = kropkiDigitExclusions(rules, cell, other, digit, size, valueOffset)
  const rowDistance = Math.abs(Math.floor(cell / size) - Math.floor(other / size))
  const columnDistance = Math.abs(cell % size - other % size)
  for (const rule of rules) {
    if (
      (rule.type === 'anti-knight' && rowDistance * columnDistance === 2) ||
      (rule.type === 'anti-king' && rowDistance === 1 && columnDistance === 1)
    ) {
      excluded |= 1 << (digit - 1)
    }
    if (rule.type === 'adjacent-total' &&
      (rule.cells[0] === cell && rule.cells[1] === other || rule.cells[1] === cell && rule.cells[0] === other)) {
      const partner = rule.sum + 2 * valueOffset - digit
      const allowed = partner >= 1 && partner <= size ? 1 << (partner - 1) : 0
      excluded |= ((1 << size) - 1) & ~allowed
    }
    if (rule.type === 'non-consecutive' && gridCellsShareEdge(cell, other, size) &&
      !rule.except?.some(([a, b]) => a === cell && b === other || a === other && b === cell)) {
      excluded |= (digit > 1 ? 1 << (digit - 2) : 0) | (digit < size ? 1 << digit : 0)
    }
    if (rule.type === 'inequality') {
      if (rule.less === cell && rule.greater === other) excluded |= (1 << digit) - 1
      if (rule.greater === cell && rule.less === other) excluded |= ((1 << size) - 1) & ~((1 << (digit - 1)) - 1)
    }
    if (rule.type === 'anti-sum' && gridCellsShareEdge(cell, other, size)) {
      const forbidden = rule.sum + 2 * valueOffset - digit
      if (forbidden >= 1 && forbidden <= size) excluded |= 1 << (forbidden - 1)
    }
    if (rule.type === 'row-column-sum' && rule.pairs.some(([a, b]) => a === cell && b === other || a === other && b === cell)) {
      const partner = rowColumnSumTotal([cell, other], size) + 2 * valueOffset - digit
      const allowed = partner >= 1 && partner <= size ? 1 << (partner - 1) : 0
      excluded |= ((1 << size) - 1) & ~allowed
    }
    if (rule.type === 'renban' && cell !== other && rule.cells.includes(cell) && rule.cells.includes(other)) {
      for (let candidate = 1; candidate <= size; candidate++) {
        if (candidate === digit || Math.abs(candidate - digit) >= rule.cells.length) excluded |= 1 << (candidate - 1)
      }
    }
    if (rule.type === 'difference' && (rule.cells[0] === cell && rule.cells[1] === other ||
      rule.cells[1] === cell && rule.cells[0] === other)) {
      const lower = digit - rule.difference, upper = digit + rule.difference
      const allowed = (lower >= 1 ? 1 << (lower - 1) : 0) | (upper <= size ? 1 << (upper - 1) : 0)
      excluded |= ((1 << size) - 1) & ~allowed
    }
    if (rule.type !== 'thermometer') continue
    const offset = rule.cells.indexOf(cell)
    const otherOffset = rule.cells.indexOf(other)
    if (offset === -1 || otherOffset === -1 || offset === otherOffset) continue
    const bound = digit + otherOffset - offset
    if (otherOffset > offset) excluded |= (1 << Math.min(size, bound - 1)) - 1
    else excluded |= ((1 << size) - 1) & ~((1 << Math.max(0, bound)) - 1)
  }
  return excluded
}

export function sizedArrowState(rules: readonly (SizedConstraintRule | VariantRule)[] | undefined, values: string, size: number, valueOffset = 0) {
  const arrows = rules?.filter(rule => rule.type === 'arrow' || rule.type === 'double-arrow')
  if (!arrows?.length) return
  const allowed = Array<number>(values.length).fill((1 << size) - 1)
  const conflicts = new Set<number>()
  const interval = (low: number, high: number) => {
    const first = Math.max(1, low + valueOffset), last = Math.min(size, high + valueOffset)
    return first <= last ? (1 << last) - (1 << (first - 1)) : 0
  }
  const minValue = 1 - valueOffset, maxValue = size - valueOffset
  const bounds = (cells: readonly number[]) => {
    let low = 0, high = 0
    for (const cell of cells) {
      const digit = Number(values[cell])
      low += digit ? digit - valueOffset : minValue
      high += digit ? digit - valueOffset : maxValue
    }
    return [low, high] as const
  }
  const restrict = (cells: readonly number[], low: number, high: number) => {
    const mask = interval(low, high)
    for (const cell of cells) if (values[cell] === '0') allowed[cell] &= mask
  }
  for (const rule of arrows) {
    const ends = rule.type === 'arrow' ? [rule.circle] : rule.ends
    const [endLow, endHigh] = bounds(ends)
    const [lineLow, lineHigh] = bounds(rule.cells)
    if (lineLow > endHigh || endLow > lineHigh) {
      for (const cell of [...ends, ...rule.cells]) if (values[cell] !== '0') conflicts.add(cell)
      continue
    }
    restrict(ends, lineLow - (endHigh - maxValue), lineHigh - (endLow - minValue))
    restrict(rule.cells, endLow - (lineHigh - maxValue), endHigh - (lineLow - minValue))
  }
  return { allowed, conflicts }
}

export function gridHouseCells(house: House, grid: PlayGrid = CLASSIC_GRID) {
  const { size } = grid
  if ('row' in house) return Array.from({ length: size }, (_, index) => house.row * size + index)
  if ('column' in house) return Array.from({ length: size }, (_, index) => index * size + house.column)
  if ('noRegions' in grid) return []
  if ('regions' in grid) return [...(grid.regions[house.box] ?? [])]
  const { boxRows, boxColumns } = grid
  return Array.from({ length: size }, (_, index) => {
    const boxesAcross = size / boxColumns
    const row = Math.floor(house.box / boxesAcross) * boxRows + Math.floor(index / boxColumns)
    const column = house.box % boxesAcross * boxColumns + index % boxColumns
    return row * size + column
  })
}
