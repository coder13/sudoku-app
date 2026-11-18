import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

export type OracleRelation = readonly [number, number, (a: number, b: number) => boolean]

/** Direct digit-set search, independent of the engine's domains and support code. */
export function countLineSolutions(puzzle: VariantPuzzle, budget = 200_000, extraRelations: readonly OracleRelation[] = []) {
  const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions :
    Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, i) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
  const houses: (readonly number[])[] = [
    ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => 9 * r + c)),
    ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => 9 * r + c)), ...regions,
  ]
  const edges: OracleRelation[] = [...extraRelations]
  const sets: { cells: readonly number[]; sum?: number }[] = []
  const entropyAreas: number[][] = []
  const quadruples: { cells: number[]; digits: readonly number[] }[] = []
  const xv = (puzzle.rules ?? []).filter(rule => rule.type === 'xv')
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'global-entropy') {
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const cell = row * 9 + col
        entropyAreas.push([cell, cell + 1, cell + 9, cell + 10])
      }
    }
    else if (rule.type === 'renban') sets.push({ cells: rule.cells })
    else if (rule.type === 'killer-cages') sets.push(...rule.cages)
    else if (rule.type === 'parity') rule.cells.forEach(cell => edges.push([cell, cell, (a,b) => a === b && a % 2 === (rule.parity === 'odd' ? 1 : 0)]))
    else if (rule.type === 'entropic' || rule.type === 'modular') {
      for (let i = 0; i < rule.cells.length; i++) for (let j = i + 1; j < Math.min(i + 3, rule.cells.length); j++) {
        edges.push([rule.cells[i], rule.cells[j], (a, b) => rule.type === 'entropic'
          ? Math.floor((a - 1) / 3) !== Math.floor((b - 1) / 3) : a % 3 !== b % 3])
      }
    }
    else if (rule.type === 'whispers') rule.cells.slice(1).forEach((cell, i) => edges.push([rule.cells[i], cell, (a, b) => Math.abs(a - b) >= rule.minDifference]))
    else if (rule.type === 'palindrome') rule.cells.slice(0, Math.floor(rule.cells.length / 2)).forEach((cell, i) =>
      edges.push([cell, rule.cells[rule.cells.length - 1 - i], (a, b) => a === b]))
    else if (rule.type === 'inequality') edges.push([rule.less, rule.greater, (a, b) => a < b])
    else if (rule.type === 'thermometer') rule.cells.slice(1).forEach((cell, i) => edges.push([rule.cells[i], cell, (a, b) => a < b]))
    else if (rule.type === 'adjacent-total') edges.push([rule.cells[0], rule.cells[1], (a, b) => a + b === rule.sum])
    else if (rule.type === 'quadruple') quadruples.push({ cells: [rule.topLeft, rule.topLeft + 1, rule.topLeft + 9, rule.topLeft + 10], digits: rule.digits })
    else if (rule.type === 'xv') {
      for (const [sum, marks] of [[5, rule.five], [10, rule.ten]] as const) {
        for (const [a, b] of marks?.pairs ?? []) edges.push([a, b, (a, b) => a + b === sum])
      }
    }
    else if (rule.type === 'kropki') {
      if (rule.consecutive?.negative || rule.ratioTwo?.negative) throw new Error('Independent line counter does not implement negative Kropki markers')
      for (const [a, b] of rule.consecutive?.pairs ?? []) edges.push([a, b, (a, b) => Math.abs(a - b) === 1])
      for (const [a, b] of rule.ratioTwo?.pairs ?? []) edges.push([a, b, (a, b) => a === b * 2 || b === a * 2])
    }
    else if (rule.type === 'non-consecutive') {
      for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
        if (b >= 0 && !(rule.except ?? []).some(([x, y]) => x === a && y === b || x === b && y === a)) {
          edges.push([a, b, (a, b) => Math.abs(a - b) !== 1])
        }
      }
    }
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
  for (const [sum, layers] of [[5, xv.map(rule => rule.five)], [10, xv.map(rule => rule.ten)]] as const) {
    if (!layers.some(marks => marks?.negative)) continue
    const marked = [...layers.flatMap(marks => marks?.pairs ?? []), ...(puzzle.rules ?? []).flatMap(rule =>
      rule.type === 'adjacent-total' && (rule.sum === 5 || rule.sum === 10) ? [rule.cells] : [])]
    for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
      if (b >= 0 && !marked.some(([x, y]) => x === a && y === b || x === b && y === a)) edges.push([a, b, (a, b) => a + b !== sum])
    }
  }
  // One cache entry per fixed clue. A changed domain always reruns the
  // independent digit enumeration. No engine support or membership tables are used.
  const lastSupport = new Map<object, { key: string; supported: Set<number>[] }>()
  function supportFor(scope: object, cells: readonly number[], domains: number[][], enumerate: () => Set<number>[]) {
    const key = cells.map(cell => domains[cell].join('')).join('/')
    const previous = lastSupport.get(scope)
    if (previous?.key === key) return previous.supported
    const supported = enumerate()
    lastSupport.set(scope, { key, supported })
    return supported
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
        const keep = domains[from].filter(digit => a === b ? permits(digit, digit) :
          domains[to].some(other => from === a ? permits(digit, other) : permits(other, digit)))
        changed ||= keep.length !== domains[from].length; domains[from] = keep
      }
      for (const clue of sets) {
        const supported = clue.cells.map(() => new Set<number>())
        const assigned: number[] = []
        function enumerate(index: number, sum: number) {
          if (index === clue.cells.length) {
            if (clue.sum === undefined ? Math.max(...assigned) - Math.min(...assigned) !== assigned.length - 1 : sum !== clue.sum) return
            assigned.forEach((digit, i) => supported[i].add(digit))
            return
          }
          for (const digit of domains[clue.cells[index]]) {
            if (assigned.includes(digit)) continue
            assigned.push(digit)
            const possible = clue.sum === undefined ? Math.max(...assigned) - Math.min(...assigned) < clue.cells.length : sum + digit <= clue.sum
            if (possible) enumerate(index + 1, sum + digit)
            assigned.pop()
          }
        }
        enumerate(0, 0)
        clue.cells.forEach((cell, i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        })
      }
      for (const area of entropyAreas) {
        const supported = supportFor(area, area, domains, () => {
          const supported = area.map(() => new Set<number>())
          const assigned: number[] = []
          function enumerate(index: number) {
            if (index === 4) {
              if (!assigned.some(digit => digit <= 3) || !assigned.some(digit => digit >= 4 && digit <= 6)
                || !assigned.some(digit => digit >= 7)) return
              assigned.forEach((digit, i) => supported[i].add(digit))
              return
            }
            for (const digit of domains[area[index]]) {
              if (assigned.some((value, i) => value === digit && houses.some(house => house.includes(area[index]) && house.includes(area[i])))) continue
              assigned[index] = digit
              enumerate(index + 1)
              assigned.length = index
            }
          }
          enumerate(0)
          return supported
        })
        area.forEach((cell, i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length
          domains[cell] = keep
        })
      }
      for (const clue of quadruples) {
        const supported = supportFor(clue, clue.cells, domains, () => {
          const supported = clue.cells.map(() => new Set<number>())
          const assigned: number[] = []
          function enumerate(index: number) {
            if (index === 4) {
              for (let digit = 1; digit <= 9; digit++) {
                if (assigned.filter(value => value === digit).length < clue.digits.filter(value => value === digit).length) return
              }
              assigned.forEach((digit, i) => supported[i].add(digit))
              return
            }
            for (const digit of domains[clue.cells[index]]) {
              if (assigned.some((value, i) => value === digit && houses.some(house => house.includes(clue.cells[index]) && house.includes(clue.cells[i])))) continue
              assigned[index] = digit; enumerate(index + 1); assigned.length = index
            }
          }
          enumerate(0)
          return supported
        })
        clue.cells.forEach((cell, i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        })
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
