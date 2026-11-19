import type { VariantPuzzle, VariantRule } from './engine.ts'

type RegionSum = Extract<VariantRule, { type: 'region-sum' }>

export function regionIndex(cell: number, regions?: VariantPuzzle['regions']) {
  return regions?.type === 'jigsaw' ? regions.regions.findIndex(cells => cells.includes(cell))
    : Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
}

/** Divide logical cells using the actual region layout and declared reentry rule. */
export function regionSumParts(rule: RegionSum, regions?: VariantPuzzle['regions']) {
  const parts: number[][] = [], ids: number[] = []
  for (const cell of rule.cells) {
    const region = regionIndex(cell, regions)
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

/** Restrictions from placed digits only; houses and candidate deductions stay separate. */
export function regionSumState(puzzle: VariantPuzzle | undefined, values: string) {
  const lines = puzzle?.rules?.flatMap(rule => rule.type === 'region-sum' ? [rule] : [])
  if (!lines?.length) return
  const allowed = Array<number>(81).fill(511), conflicts = new Set<number>()
  for (const line of lines) {
    const parts = regionSumParts(line, puzzle?.regions)
    const ranges = parts.map(cells => cells.reduce(([low, high], cell) => {
      const digit = Number(values[cell])
      return [low + (digit || 1), high + (digit || 9)]
    }, [0, 0]))
    const low = Math.max(...ranges.map(range => range[0])), high = Math.min(...ranges.map(range => range[1]))
    for (const [index, cells] of parts.entries()) for (const cell of cells) {
      const placed = Number(values[cell])
      let mask = 0
      if (low <= high) for (let digit = 1; digit <= 9; digit++) {
        if (placed && placed !== digit) continue
        const minimum = ranges[index][0] - (placed || 1) + digit
        const maximum = ranges[index][1] - (placed || 9) + digit
        if (minimum <= high && maximum >= low) mask |= 1 << (digit - 1)
      }
      allowed[cell] &= mask
      if (low > high && placed) conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
