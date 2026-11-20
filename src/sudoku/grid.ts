import type { House, SixGrid, SizedClassicPosition, SizedConstraintRule } from './engine.ts'

export const CLASSIC_GRID = { size: 9, boxRows: 3, boxColumns: 3 } as const
export const MINI_GRID = { size: 4, boxRows: 2, boxColumns: 2 } as const
const SIX_GRIDS = [
  { size: 6, boxRows: 2, boxColumns: 3 },
  { size: 6, boxRows: 3, boxColumns: 2 },
] as const

export function sixGridForBoxRows(boxRows?: SixGrid['boxRows']): SixGrid {
  return SIX_GRIDS[boxRows === 3 ? 1 : 0]
}

export type MiniGrid = typeof MINI_GRID
export type SevenJigsawGrid = { size: 7; regions: readonly (readonly number[])[] }
export type SizedGrid = MiniGrid | SixGrid | SevenJigsawGrid
const sevenJigsawLayouts: readonly SevenJigsawGrid[] = [
  ['0111122', '0012223', '0113223', '0003333', '4555556', '4445656', '4446666'],
  ['0001112', '0311112', '0333332', '0444432', '0444522', '6655552', '6666655'],
  ['0011111', '0211334', '0222334', '0223334', '0255644', '0556664', '5556664'],
  ['0111111', '0223314', '0233334', '0222344', '0255664', '0556664', '0555664'],
].map(rows => ({
  size: 7,
  regions: regionsFromMembership(Array.from(rows.join(''), Number), 7),
}))

export function regionsFromMembership(membership: readonly number[], size: number): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => [])
  membership.forEach((region, cell) => regions[region].push(cell))
  return regions
}

export function sevenJigsawForSeed(seed = 0): SevenJigsawGrid {
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
  if (isMiniGrid(value) || isSevenJigsawGrid(value)) return true
  if (value === null || typeof value !== 'object') return false
  const grid = value as Partial<SixGrid>
  return Object.keys(grid).length === 3 && grid.size === 6 &&
    ((grid.boxRows === 2 && grid.boxColumns === 3) || (grid.boxRows === 3 && grid.boxColumns === 2))
}

export function isSevenJigsawGrid(value: unknown): value is SevenJigsawGrid {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return false
  const grid = value as Partial<SevenJigsawGrid>
  if (grid.size !== 7 || !Array.isArray(grid.regions) || grid.regions.length !== grid.size) return false
  const { size, regions } = grid
  const seen = new Set<number>()
  for (const part of regions) {
    if (!Array.isArray(part) || part.length !== size) return false
    for (const cell of part) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || seen.has(cell)) return false
      seen.add(cell)
    }
    const connected = new Set([part[0]])
    for (const cell of connected) {
      for (const next of part) if (gridCellsShareEdge(cell, next, size)) connected.add(next)
    }
    if (connected.size !== part.length) return false
  }
  return true
}

const jigsawMemberships = new WeakMap<SevenJigsawGrid, readonly number[]>()

export function jigsawMembership(grid: SevenJigsawGrid) {
  const cached = jigsawMemberships.get(grid)
  if (cached) return cached
  const regions = Array<number>(grid.size ** 2)
  for (const [region, cells] of grid.regions.entries()) for (const cell of cells) regions[cell] = region
  jigsawMemberships.set(grid, regions)
  return regions
}

export function gridRegionIndex(grid: PlayGrid, cell: number) {
  if ('regions' in grid) return jigsawMembership(grid)[cell]
  const { size, boxRows, boxColumns } = grid
  return Math.floor(cell / size / boxRows) * (size / boxColumns) + Math.floor(cell % size / boxColumns)
}

export function sizedGridIdentity(grid: SizedGrid) {
  if ('regions' in grid) {
    const regions = grid.regions.map(cells => [...cells].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
    return `jigsaw:${grid.size}:${JSON.stringify(regions)}`
  }
  return grid.size === 6 ? `six:${grid.boxRows}` : `sized:${grid.size}:${grid.boxRows}:${grid.boxColumns}`
}

export function sixGridFromRegions(regions: readonly number[]): SixGrid | undefined {
  return SIX_GRIDS.find(grid => matchesRectangularRegions(grid, regions))
}

export function matchesRectangularRegions({ size, boxRows, boxColumns }: MiniGrid | SixGrid, regions: readonly number[]) {
  return regions.length === size ** 2 && new Set(regions).size === size && regions.every((label, cell) => {
    const firstRow = Math.floor(cell / size / boxRows) * boxRows
    const firstColumn = Math.floor(cell % size / boxColumns) * boxColumns
    return label === regions[firstRow * size + firstColumn]
  })
}

// Saved play grids use one decimal digit per cell.
const gridTextPatterns = Array.from({ length: 10 }, (_, size) => new RegExp(`^[0-${size}]+$`))

export function isGridText(text: unknown, grid: PlayGrid): text is string {
  return typeof text === 'string' && text.length === grid.size ** 2 && gridTextPatterns[grid.size].test(text)
}

export function sizedClassicPosition(grid: SizedGrid, values: string): SizedClassicPosition {
  return { version: 2, grid, digits: Array.from(values, Number) }
}

export function gridDiagonalCells(size: number, diagonal: 'main' | 'anti') {
  return Array.from({ length: size }, (_, row) => row * size + (diagonal === 'main' ? row : size - row - 1))
}

export function gridCellsShareEdge(first: number, second: number, size: number) {
  return Math.abs(Math.floor(first / size) - Math.floor(second / size)) + Math.abs(first % size - second % size) === 1
}

export function kropkiDigitExclusions(rules: readonly SizedConstraintRule[], cell: number, other: number, digit: number, size: number) {
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
          if (ratio ? Math.max(digit, other) !== mark.value * Math.min(digit, other) : Math.abs(digit - other) !== mark.value) {
            excluded |= 1 << (other - 1)
          }
        }
      }
    }
  }
  if (white || black || negativeWhite || negativeBlack) for (let candidate = 1; candidate <= size; candidate++) {
    const consecutive = Math.abs(digit - candidate) === 1
    const ratioTwo = digit === 2 * candidate || candidate === 2 * digit
    if (white && !consecutive || black && !ratioTwo ||
      !white && !black && (negativeWhite && consecutive || negativeBlack && ratioTwo)) excluded |= 1 << (candidate - 1)
  }
  const unmarkedNegative = labeledNegative & ~labeledEdges
  if (unmarkedNegative & 1) excluded |= (digit > 1 ? 1 << (digit - 2) : 0) | (digit < size ? 1 << digit : 0)
  if (unmarkedNegative & 2) excluded |= (2 * digit <= size ? 1 << (2 * digit - 1) : 0) | (digit % 2 === 0 ? 1 << (digit / 2 - 1) : 0)
  return excluded
}

export function sizedDigitExclusions(rules: readonly SizedConstraintRule[] | undefined, cell: number, other: number, digit: number, size: number) {
  if (!rules) return 0
  let excluded = kropkiDigitExclusions(rules, cell, other, digit, size)
  for (const rule of rules) {
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

export function sizedArrowState(rules: readonly SizedConstraintRule[] | undefined, values: string, size: number) {
  const arrows = rules?.filter(rule => rule.type === 'arrow')
  if (!arrows?.length) return
  const allowed = Array<number>(values.length).fill((1 << size) - 1)
  const conflicts = new Set<number>()
  const interval = (low: number, high: number) => {
    const first = Math.max(1, low), last = Math.min(size, high)
    return first <= last ? (1 << last) - (1 << (first - 1)) : 0
  }
  for (const { circle, cells } of arrows) {
    const bulb = Number(values[circle])
    let sum = 0, empty = 0
    for (const cell of cells) {
      const digit = Number(values[cell])
      sum += digit
      empty += Number(digit === 0)
    }
    const low = sum + empty, high = sum + empty * size
    if (low > (bulb || size) || bulb > high) {
      for (const cell of [circle, ...cells]) if (values[cell] !== '0') conflicts.add(cell)
      continue
    }
    if (!bulb) allowed[circle] &= interval(low, high)
    if (empty) {
      const min = bulb ? bulb - sum - (empty - 1) * size : 1
      const max = (bulb || size) - sum - (empty - 1)
      for (const cell of cells) if (values[cell] === '0') allowed[cell] &= interval(min, max)
    }
  }
  return { allowed, conflicts }
}

export function gridHouseCells(house: House, grid: PlayGrid = CLASSIC_GRID) {
  const { size } = grid
  if ('row' in house) return Array.from({ length: size }, (_, index) => house.row * size + index)
  if ('column' in house) return Array.from({ length: size }, (_, index) => index * size + house.column)
  if ('regions' in grid) return [...(grid.regions[house.box] ?? [])]
  const { boxRows, boxColumns } = grid
  return Array.from({ length: size }, (_, index) => {
    const boxesAcross = size / boxColumns
    const row = Math.floor(house.box / boxesAcross) * boxRows + Math.floor(index / boxColumns)
    const column = house.box % boxesAcross * boxColumns + index % boxColumns
    return row * size + column
  })
}
