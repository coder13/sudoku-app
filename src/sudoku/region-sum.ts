import { gridRegionIndex, gridValueOffset, type PlayGrid } from './grid.ts'
import type { SizedConstraintRule, VariantPuzzle, VariantRule } from './engine.ts'
import { positionDigit } from './digit-symbols.ts'

type RegionSum = Extract<VariantRule, { type: 'region-sum' }>

export function regionIndex(cell: number, regions?: VariantPuzzle['regions']) {
  return regions && regions.type !== 'boxes' ? regions.regions.findIndex(cells => cells.includes(cell))
    : Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
}

/** Divide logical cells using the actual region layout and declared reentry rule. */
export function regionSumParts(rule: RegionSum, regions?: VariantPuzzle['regions']) {
  return partitionRegionSum(rule, cell => regionIndex(cell, regions))
}

export function sizedRegionSumParts(rule: RegionSum, grid: PlayGrid) {
  return partitionRegionSum(rule, cell => gridRegionIndex(grid, cell))
}

function partitionRegionSum(rule: RegionSum, regionOf: (cell: number) => number) {
  const parts: number[][] = [], ids: number[] = []
  for (const cell of rule.cells) {
    const region = regionOf(cell)
    if (rule.groupByRegion) {
      let index = ids.indexOf(region)
      if (index < 0) { index = ids.length; ids.push(region); parts.push([]) }
      parts[index].push(cell)
    } else {
      if (ids.at(-1) !== region) { ids.push(region); parts.push([]) }
      parts.at(-1)!.push(cell)
    }
  }
  return parts
}

/** Start a closed path at a box boundary so a single visit stays together. */
export function closedRegionSumCells(cells: readonly number[], paths: readonly (readonly number[])[], regionOf: (cell: number) => number) {
  const first = cells[0], last = cells.at(-1)!
  const closed = cells.length > 2 && paths.some(path => path.some((cell, i) => i > 0 &&
    (cell === first && path[i - 1] === last || cell === last && path[i - 1] === first)))
  if (closed) {
    const boundary = cells.findIndex((cell, i) => i > 0 && regionOf(cell) !== regionOf(cells[i - 1]))
    if (boundary >= 0 && regionOf(first) === regionOf(last)) return [...cells.slice(boundary), ...cells.slice(0, boundary)]
  }
  return cells
}

/** Restrictions from placed digits only; houses and candidate deductions stay separate. */
export function regionSumState(puzzle: VariantPuzzle | undefined, values: string) {
  return regionSumPlacedState(puzzle?.rules, values, 9, line => regionSumParts(line, puzzle?.regions))
}

export function sizedRegionSumState(rules: readonly (SizedConstraintRule | VariantRule)[] | undefined, values: string, grid: PlayGrid) {
  return regionSumPlacedState(rules, values, grid.size, line => sizedRegionSumParts(line, grid), gridValueOffset(grid))
}

function regionSumPlacedState(rules: readonly (SizedConstraintRule | VariantRule)[] | undefined, values: string, size: number,
  split: (rule: RegionSum) => number[][], valueOffset = 0) {
  const lines = rules?.filter((rule): rule is RegionSum => rule.type === 'region-sum')
  if (!lines?.length) return
  const allowed = Array<number>(size ** 2).fill((1 << size) - 1), conflicts = new Set<number>()
  for (const line of lines) {
    const parts = split(line)
    const ranges = parts.map(cells => cells.reduce(([low, high], cell) => {
      const digit = positionDigit(values[cell])
      return [low + (digit ? digit - valueOffset : 1 - valueOffset), high + (digit ? digit - valueOffset : size - valueOffset)]
    }, [0, 0]))
    const low = Math.max(...ranges.map(range => range[0])), high = Math.min(...ranges.map(range => range[1]))
    for (const [index, cells] of parts.entries()) for (const cell of cells) {
      const placed = positionDigit(values[cell])
      let mask = 0
      if (low <= high) for (let digit = 1; digit <= size; digit++) {
        if (placed && placed !== digit) continue
        const currentMinimum = placed ? placed - valueOffset : 1 - valueOffset
        const currentMaximum = placed ? placed - valueOffset : size - valueOffset
        const minimum = ranges[index][0] - currentMinimum + digit - valueOffset
        const maximum = ranges[index][1] - currentMaximum + digit - valueOffset
        if (minimum <= high && maximum >= low) mask |= 1 << (digit - 1)
      }
      allowed[cell] &= mask
      if (low > high && placed) conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
