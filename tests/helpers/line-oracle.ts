import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Direct digit-set search, independent of the engine's domains and support code. */
export function countLineSolutions(puzzle: VariantPuzzle, budget = 200_000) {
  const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions :
    Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, i) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
  const houses: (readonly number[])[] = [
    ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => 9 * r + c)),
    ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => 9 * r + c)), ...regions,
  ]
  const edges: [number, number, (a: number, b: number) => boolean][] = []
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'whispers') rule.cells.slice(1).forEach((cell, i) => edges.push([rule.cells[i], cell, (a, b) => Math.abs(a - b) >= rule.minDifference]))
    else if (rule.type === 'palindrome') rule.cells.slice(0, Math.floor(rule.cells.length / 2)).forEach((cell, i) =>
      edges.push([cell, rule.cells[rule.cells.length - 1 - i], (a, b) => a === b]))
    else if (rule.type === 'anti-knight' || rule.type === 'anti-king') {
      for (let a = 0; a < 81; a++) for (let b = a + 1; b < 81; b++) {
        const dr = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), dc = Math.abs(a % 9 - b % 9)
        if (rule.type === 'anti-knight' ? dr * dc === 2 : dr === 1 && dc === 1) edges.push([a, b, (a, b) => a !== b])
      }
    }
    else if (rule.type === 'extra-house') houses.push(rule.cells)
    else if (rule.type === 'diagonal') houses.push(Array.from({ length: 9 }, (_, i) => rule.diagonal === 'main' ? i * 10 : i * 8 + 8))
    else throw new Error(`Independent line counter does not implement ${rule.type}`)
  }
  let count = 0, nodes = 0, solution: string | undefined
  const solutions: string[] = []
  function search(input: number[][]) {
    if (++nodes > budget) throw new Error('Independent line counter exhausted its budget')
    const domains = input.map(digits => [...digits])
    let changed: boolean
    do {
      changed = false
      for (const house of houses) {
        const fixed = house.filter(cell => domains[cell].length === 1).map(cell => domains[cell][0])
        if (new Set(fixed).size !== fixed.length) return
        for (const cell of house) if (domains[cell].length > 1) {
          const keep = domains[cell].filter(digit => !fixed.includes(digit))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        }
        for (let digit = 1; digit <= 9; digit++) {
          const sites = house.filter(cell => domains[cell].includes(digit))
          if (!sites.length) return
          if (sites.length === 1 && domains[sites[0]].length > 1) { domains[sites[0]] = [digit]; changed = true }
        }
      }
      for (const [a, b, permits] of edges) for (const [from, to] of [[a, b], [b, a]]) {
        const keep = domains[from].filter(digit => domains[to].some(other => permits(digit, other)))
        changed ||= keep.length !== domains[from].length; domains[from] = keep
      }
      if (domains.some(digits => digits.length === 0)) return
    } while (changed)
    let cell = -1
    domains.forEach((digits, i) => { if (digits.length > 1 && (cell < 0 || digits.length < domains[cell].length)) cell = i })
    if (cell < 0) { const result = domains.map(digits => digits[0]).join(''); solution ??= result; solutions.push(result); count++; return }
    for (const digit of domains[cell]) {
      const next = [...domains]; next[cell] = [digit]; search(next)
      if (count === 2) return
    }
  }
  search([...puzzle.givens].map(digit => digit === '0' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [Number(digit)]))
  return { count, solution, solutions, nodes }
}
