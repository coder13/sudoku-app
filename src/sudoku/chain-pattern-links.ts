import { candidateCount, hasCandidate, marksOf, peer } from './game.ts'

export type PatternLinkSource =
  | { kind: 'firework'; pivot: number; digit: number }
  | { kind: 'rectangle'; corners: readonly number[]; digits: readonly [number, number] }

type Visit = (a: readonly number[], b: readonly number[], source: PatternLinkSource) => void

const rowOf = (cell: number) => Math.floor(cell / 9)
const columnOf = (cell: number) => cell % 9
const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(columnOf(cell) / 3)

export function visitFireworkLinks(masks: readonly number[], visit: Visit) {
  for (let pivot = 0; pivot < masks.length; pivot++) {
    const row = rowOf(pivot)
    const column = columnOf(pivot)
    const box = boxOf(pivot)
    const across = Array.from({ length: 9 }, (_, col) => row * 9 + col)
    const down = Array.from({ length: 9 }, (_, r) => r * 9 + column)
    for (let digit = 1; digit <= 9; digit++) {
      const present = (cell: number) => hasCandidate(masks[cell], digit)
      const armInBox = (cell: number) => cell !== pivot && boxOf(cell) === box && present(cell)
      if (!across.some(armInBox) || !down.some(armInBox)) continue
      const outside = (line: readonly number[]) => line
        .filter(cell => boxOf(cell) !== box && present(cell)).map(cell => cell * 9 + digit - 1)
      const rowEnd = outside(across)
      const columnEnd = outside(down)
      if (!rowEnd.length || !columnEnd.length) continue
      const source = { kind: 'firework', pivot, digit } as const
      const center = hasCandidate(masks[pivot], digit) ? [pivot * 9 + digit - 1] : []
      // If the pivot and both outside arms are false, both lines must place
      // the digit elsewhere in the pivot box, which cannot contain two copies.
      if (center.length) {
        visit(center, [...rowEnd, ...columnEnd], source)
        visit(columnEnd, [...center, ...rowEnd], source)
      }
      visit(rowEnd, [...center, ...columnEnd], source)
    }
  }
}

const rectangles: number[][] = []
for (let r = 0; r < 9; r++) for (let s = r + 1; s < 9; s++) {
  const sameBand = Math.floor(r / 3) === Math.floor(s / 3)
  for (let c = 0; c < 9; c++) for (let d = c + 1; d < 9; d++) {
    const sameStack = Math.floor(c / 3) === Math.floor(d / 3)
    if (sameBand !== sameStack) rectangles.push([r * 9 + c, r * 9 + d, s * 9 + c, s * 9 + d])
  }
}

export function visitRectangleLinks(masks: readonly number[], visit: Visit) {
  const exclusions = new Map<number, number[]>()
  function witnesses(guardian: number) {
    let result = exclusions.get(guardian)
    if (result) return result
    result = []
    const cell = Math.floor(guardian / 9)
    const digit = guardian % 9 + 1
    for (const other of marksOf(masks[cell])) {
      if (other !== digit) result.push(cell * 9 + other - 1)
    }
    for (let other = 0; other < masks.length; other++) {
      if (other !== cell && hasCandidate(masks[other], digit) && peer(cell, other)) {
        result.push(other * 9 + digit - 1)
      }
    }
    exclusions.set(guardian, result)
    return result
  }

  for (const corners of rectangles) {
    const common = marksOf(corners.reduce((mask, cell) => mask & masks[cell], 0x1ff))
    if (common.length < 2) continue
    const extraCounts = corners.map(cell => candidateCount(masks[cell]) - 2)
    const count = extraCounts.reduce((sum, extra) => sum + extra, 0)
    // A witness can exclude all guardians in its own cell and at most one
    // guardian per other corner. Discard partitions two witnesses cannot cover.
    if (count < 2 || count > 2 * (Math.max(...extraCounts) + 3)) continue

    for (const [index, first] of common.entries()) for (const second of common.slice(index + 1)) {
      const guardians = corners.flatMap(cell => marksOf(masks[cell])
        .filter(digit => digit !== first && digit !== second).map(digit => cell * 9 + digit - 1))
      const coverage = new Map<number, number>()
      for (const [i, guardian] of guardians.entries()) for (const witness of witnesses(guardian)) {
        coverage.set(witness, (coverage.get(witness) ?? 0) | (1 << i))
      }
      const partitions = new Set<number>()
      const unique = [...new Set(coverage.values())]
      const all = (1 << guardians.length) - 1
      const source = { kind: 'rectangle', corners, digits: [first, second] } as const
      for (const left of unique) {
        if (!(left & 1)) continue
        for (const right of unique) {
          if ((left | right) !== all) continue
          const required = (all ^ right) | 1
          const shared = left & right & ~1
          let flexible = shared
          for (;;) {
            const partition = required | flexible
            if (partition !== all && !partitions.has(partition)) {
              partitions.add(partition)
              visit(guardians.filter((_, i) => partition & (1 << i)),
                guardians.filter((_, i) => !(partition & (1 << i))), source)
            }
            if (!flexible) break
            flexible = (flexible - 1) & shared
          }
        }
      }
    }
  }
}
