import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Independent four-cell enumeration plus exhaustive row/column/region search. */
export function countQuadrupleSolutions(puzzle: VariantPuzzle, budget = 100_000) {
  const grid = [...puzzle.givens].map(Number)
  const houses = [
    ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row * 9 + column)),
    ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, row) => row * 9 + column)),
    ...(puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions : Array.from({ length: 9 }, (_, box) =>
      Array.from({ length: 9 }, (_, i) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))),
  ]
  const clues = (puzzle.rules ?? []).map(rule => {
    if (rule.type !== 'quadruple') throw new Error(`Unsupported independent rule ${rule.type}`)
    return { cells: [rule.topLeft, rule.topLeft + 1, rule.topLeft + 9, rule.topLeft + 10], digits: rule.digits }
  })
  const peers = Array.from({ length: 81 }, (_, cell) => new Set(houses.filter(house => house.includes(cell)).flat().filter(peer => peer !== cell)))
  let nodes = 0
  let count = 0
  let solution: string | undefined
  function search(values: number[]) {
    if (++nodes > budget) throw new Error('Independent Quadruple counter exhausted its search budget')
    for (const house of houses) {
      const placed = house.map(cell => values[cell]).filter(Boolean)
      if (new Set(placed).size !== placed.length) return
    }
    const domains = values.map((digit, cell) => digit ? [digit] :
      Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => ![...peers[cell]].some(peer => values[peer] === digit)))
    let changed: boolean
    do {
      changed = false
      for (const clue of clues) {
        const support = clue.cells.map(() => new Set<number>())
        const assignment: number[] = []
        function enumerate(index: number) {
          if (index === 4) {
            for (let digit = 1; digit <= 9; digit++) {
              if (assignment.filter(value => value === digit).length < clue.digits.filter(value => value === digit).length) return
            }
            assignment.forEach((digit, i) => support[i].add(digit))
            return
          }
          for (const digit of domains[clue.cells[index]]) {
            if (assignment.some((placed, i) => digit === placed && peers[clue.cells[index]].has(clue.cells[i]))) continue
            assignment[index] = digit
            enumerate(index + 1)
            assignment.length = index
          }
        }
        enumerate(0)
        clue.cells.forEach((cell, i) => {
          const allowed = domains[cell].filter(digit => support[i].has(digit))
          changed ||= allowed.length !== domains[cell].length
          domains[cell] = allowed
        })
      }
      if (domains.some(domain => domain.length === 0)) return
    } while (changed)
    let cell = -1
    for (let i = 0; i < 81; i++) if (!values[i] && (cell === -1 || domains[i].length < domains[cell].length)) cell = i
    if (cell === -1) {
      solution ??= values.join('')
      count++
      return
    }
    for (const digit of domains[cell]) {
      const next = [...values]
      next[cell] = digit
      search(next)
      if (count === 2) return
    }
  }
  search(grid)
  return { count, solution, nodes }
}
