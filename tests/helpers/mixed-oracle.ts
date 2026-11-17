import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** A small exhaustive reference counter for the authored mixed-rule fixtures.
 * It uses digit sets for cage totals and tests row/column/region assignments.
 * It shares no candidate, propagation, exact-search, or codec code with the engine.
 */
export function countMixedSolutions(puzzle: VariantPuzzle, maxNodes = 1_000_000) {
  const grid = Array.from(puzzle.givens, Number)
  const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions :
    Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, offset) =>
      Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(offset / 3) * 9 + offset % 3))
  const houses: (readonly number[])[] = [
    ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)),
    ...Array.from({ length: 9 }, (_, col) => Array.from({ length: 9 }, (_, row) => row * 9 + col)),
    ...regions.map(cells => [...cells]),
  ]
  const cages: { cells: readonly number[]; sum: number }[] = []
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'diagonal') houses.push(Array.from({ length: 9 }, (_, row) =>
      rule.diagonal === 'main' ? row * 10 : row * 8 + 8))
    else if (rule.type === 'extra-house') houses.push([...rule.cells])
    else if (rule.type === 'killer-cages') cages.push(...rule.cages)
    else throw new Error(`The mixed-fixture oracle does not implement ${rule.type}.`)
  }
  const memberships = Array.from({ length: 81 }, (_, cell) => houses.flatMap((cells, i) => cells.includes(cell) ? [i] : []))
  const cageMemberships = Array.from({ length: 81 }, (_, cell) => cages.flatMap((cage, i) => cage.cells.includes(cell) ? [i] : []))
  const houseUsed = houses.map(() => 0)
  const cageUsed = cages.map(() => 0)
  const totals = cages.map(({ cells, sum }) => Array.from({ length: 511 }, (_, i) => i + 1).filter(mask => {
    const digits = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => mask & 1 << (digit - 1))
    return digits.length === cells.length && digits.reduce((a, b) => a + b, 0) === sum
  }))
  for (let cell = 0; cell < 81; cell++) {
    if (!grid[cell]) continue
    const bit = 1 << (grid[cell] - 1)
    if (memberships[cell].some(i => houseUsed[i] & bit) || cageMemberships[cell].some(i => cageUsed[i] & bit)) {
      return { count: 0, nodes: 0, solution: undefined }
    }
    for (const i of memberships[cell]) houseUsed[i] |= bit
    for (const i of cageMemberships[cell]) cageUsed[i] |= bit
  }
  let count = 0
  let nodes = 0
  let solution: string | undefined
  function search() {
    if (++nodes > maxNodes) throw new Error('The independent fixture counter reached its node limit.')
    let chosen = -1
    let choices = 0
    let fewest = 10
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell]) continue
      let allowed = 511
      for (const house of memberships[cell]) allowed &= ~houseUsed[house]
      for (const cage of cageMemberships[cell]) {
        const used = cageUsed[cage]
        const remaining = totals[cage].filter(mask => (mask & used) === used).reduce((mask, set) => mask | (set & ~used), 0)
        allowed &= remaining
      }
      if (!allowed) return
      let size = 0
      for (let mask = allowed; mask; mask &= mask - 1) size++
      if (size < fewest) {
        chosen = cell
        choices = allowed
        fewest = size
        if (size === 1) break
      }
    }
    if (chosen === -1) {
      if (cages.some((cage, i) => !totals[i].includes(cageUsed[i]))) return
      count++
      solution ??= grid.join('')
      return
    }
    for (let digit = 1; digit <= 9 && count < 2; digit++) {
      const bit = 1 << (digit - 1)
      if (!(choices & bit)) continue
      grid[chosen] = digit
      for (const i of memberships[chosen]) houseUsed[i] |= bit
      for (const i of cageMemberships[chosen]) cageUsed[i] |= bit
      search()
      for (const i of memberships[chosen]) houseUsed[i] ^= bit
      for (const i of cageMemberships[chosen]) cageUsed[i] ^= bit
      grid[chosen] = 0
    }
  }
  search()
  return { count, nodes, solution }
}
