import type { VariantPuzzle, VariantRule } from './engine.ts'
import { regionIndex } from './region-sum.ts'

type Arrow = Extract<VariantRule, { type: 'arrow' }>
type RegionSum = Extract<VariantRule, { type: 'region-sum' }>

/** Enumerate arrows on a completion, including long shafts with small digits. */
export function arrowSumPaths(digits: readonly number[], neighbors: readonly (readonly number[])[]): Arrow[] {
  const clues: Arrow[] = []
  const path: number[] = []

  function arrow(remaining: number) {
    for (const cell of neighbors[path.at(-1)!]) {
      if (path.includes(cell) || digits[cell] > remaining) continue
      const left = remaining - digits[cell]
      if (left === 0 && path.length >= 2) {
        const circle = path[0]
        const shaft = [...path.slice(1), cell]
        clues.push({ type: 'arrow', circle, cells: shaft })
      } else if (left > 0 && path.length < 6) {
        path.push(cell)
        arrow(left)
        path.pop()
      }
    }
  }

  for (const [cell, digit] of digits.entries()) {
    if (digit < 2) continue
    path.push(cell)
    arrow(digit)
    path.pop()
  }
  return clues
}

/** Enumerate equal sums across region boundaries. */
export function regionSumPaths(digits: readonly number[], neighbors: readonly (readonly number[])[],
  regions?: VariantPuzzle['regions']): RegionSum[] {
  const clues: RegionSum[] = []
  const path: number[] = []
  const regionOf = digits.map((_, cell) => regionIndex(cell, regions))

  function regionSum(target: number, total: number, segments: number) {
    const previous = path.at(-1)!
    for (const cell of neighbors[previous]) {
      if (path.includes(cell)) continue
      const same = regionOf[cell] === regionOf[previous]
      if (!same && (segments === 3 || target && total !== target)) continue
      const shared = target || (same ? 0 : total)
      const sum = (same ? total : 0) + digits[cell]
      if (shared && sum > shared) continue
      const segmentCount = segments + Number(!same)
      if (segmentCount > 1 && sum === shared && path.length >= 2 && path[0] < cell) {
        clues.push({ type: 'region-sum', cells: [...path, cell] })
      }
      // Prefer short segments with a small common sum, so the printed line gives
      // a solver useful bounds as soon as they see its region crossings.
      if (path.length < 5 && sum <= 9) {
        path.push(cell)
        regionSum(shared, sum, segmentCount)
        path.pop()
      }
    }
  }

  for (const [cell, digit] of digits.entries()) {
    path.push(cell)
    regionSum(0, digit, 1)
    path.pop()
  }
  return clues
}
