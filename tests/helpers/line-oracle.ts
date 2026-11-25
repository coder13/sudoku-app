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
  const regionParts: number[][][] = []
  const diagonalSums: { cells: readonly number[]; sum: number }[] = []
  const skyscrapers: { cells: readonly number[]; count: number }[] = []
  const xSums: { cells: readonly number[]; total: number }[] = []
  const sandwiches: { cells: readonly number[]; total: number }[] = []
  const betweenTriples: (readonly [number, number, number])[] = []
  const xv = (puzzle.rules ?? []).filter(rule => rule.type === 'xv')
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'global-entropy') {
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const cell = row * 9 + col
        entropyAreas.push([cell, cell + 1, cell + 9, cell + 10])
      }
    }
    else if (rule.type === 'clone') for (const group of rule.groups) {
      for (const cell of group.slice(1)) edges.push([group[0], cell, (a, b) => a === b])
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
    else if (rule.type === 'region-sum') {
      const parts: number[][] = [], ids: number[] = []
      for (const cell of rule.cells) {
        const id = regions.findIndex(region => region.includes(cell))
        if (rule.groupByRegion) {
          let index = ids.indexOf(id)
          if (index < 0) { index = ids.length; ids.push(id); parts.push([]) }
          parts[index].push(cell)
        } else {
          if (ids.at(-1) !== id) { ids.push(id); parts.push([]) }
          parts.at(-1)!.push(cell)
        }
      }
      regionParts.push(parts)
    }
    else if (rule.type === 'little-killer') diagonalSums.push({ cells: rule.cells, sum: rule.sum })
    else if (rule.type === 'skyscrapers') skyscrapers.push({ cells: rule.cells, count: rule.count })
    else if (rule.type === 'x-sum') xSums.push({ cells: rule.cells, total: rule.sum })
    else if (rule.type === 'sandwich') sandwiches.push({ cells: rule.cells, total: rule.sum })
    else if (rule.type === 'between') rule.cells.slice(1, -1).forEach(cell =>
      betweenTriples.push([rule.cells[0], cell, rule.cells[rule.cells.length - 1]]))
    else if (rule.type === 'whispers') rule.cells.slice(1).forEach((cell, i) => edges.push([rule.cells[i], cell, (a, b) => Math.abs(a - b) >= rule.minDifference]))
    else if (rule.type === 'consecutive-run') rule.cells.slice(1).forEach((cell, i) =>
      edges.push([rule.cells[i], cell, (a, b) => Math.abs(a - b) === 1]))
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
  // Break equally sized domain ties with the cells involved in more clue relations.
  // This changes search order only; all support comes from direct digit enumeration.
  const involvement = Array<number>(81).fill(0)
  if (diagonalSums.length) {
    const scopes = [
      ...sets.map(clue => clue.cells), ...diagonalSums.map(clue => clue.cells),
      ...sandwiches.map(clue => clue.cells), ...regionParts.flat(), ...betweenTriples,
      ...entropyAreas, ...quadruples.map(clue => clue.cells), ...edges.map(([a, b]) => [a, b]),
    ]
    for (const scope of scopes) for (const cell of scope) involvement[cell] += Math.max(1, scope.length - 1)
  }
  diagonalSums.sort((a, b) => a.cells.length - b.cells.length)
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
      // Independent ternary relations. Every interior cell shares the two
      // endpoint variables, without introducing distinctness among interiors.
      for (const triple of betweenTriples) {
        const supported = supportFor(triple, triple, domains, () => {
          const result = triple.map(() => new Set<number>())
          for (const a of domains[triple[0]]) for (const b of domains[triple[1]]) for (const c of domains[triple[2]]) {
            if (a < b && b < c || c < b && b < a) {
              result[0].add(a); result[1].add(b); result[2].add(c)
            }
          }
          return result
        })
        triple.forEach((cell, i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        })
      }
      for (const clue of diagonalSums) {
        const supported = supportFor(clue, clue.cells, domains, () => {
          const result = clue.cells.map(() => new Set<number>()), assigned = clue.cells.map(() => 0)
          const order = clue.cells.map((_, i) => i)
            .sort((a, b) => domains[clue.cells[a]].length - domains[clue.cells[b]].length)
          function enumerate(depth: number, sum: number) {
            if (depth === order.length) {
              if (sum === clue.sum) assigned.forEach((digit, i) => result[i].add(digit))
              return
            }
            const options = order.slice(depth).map(i => domains[clue.cells[i]].filter(digit =>
              !assigned.some((other, j) => other === digit && houses.some(house =>
                house.includes(clue.cells[i]) && house.includes(clue.cells[j])))))
            if (options.some(values => !values.length) ||
              sum + options.reduce((total, values) => total + Math.min(...values), 0) > clue.sum ||
              sum + options.reduce((total, values) => total + Math.max(...values), 0) < clue.sum) return
            const i = order[depth]
            for (const digit of options[0]) {
              assigned[i] = digit; enumerate(depth + 1, sum + digit); assigned[i] = 0
            }
          }
          enumerate(0, 0)
          return result
        })
        clue.cells.forEach((cell, i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        })
      }
      for (const clue of skyscrapers) {
        const supported = supportFor(clue, clue.cells, domains, () => {
          const result = clue.cells.map(() => new Set<number>()), values: number[] = []
          function enumerate(index: number, used: Set<number>, maximum: number, visible: number) {
            if (visible > clue.count || visible + 9 - maximum < clue.count) return
            if (index === clue.cells.length) {
              if (visible === clue.count) values.forEach((digit,i) => result[i].add(digit))
              return
            }
            for (const digit of domains[clue.cells[index]]) if (!used.has(digit)) {
              used.add(digit); values.push(digit)
              enumerate(index+1,used,Math.max(maximum,digit),visible + (digit > maximum ? 1 : 0))
              values.pop();used.delete(digit)
            }
          }
          enumerate(0,new Set<number>(),0,0)
          return result
        })
        clue.cells.forEach((cell,i) => {
          const keep = domains[cell].filter(digit => supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length;domains[cell]=keep
        })
      }
      for (const clue of xSums) {
        const supported = supportFor(clue, clue.cells, domains, () => {
          const result = clue.cells.map(() => new Set<number>()), values = clue.cells.map(() => 0)
          const order = [0, ...clue.cells.map((_, i) => i).slice(1).sort((a,b) => domains[clue.cells[a]].length - domains[clue.cells[b]].length)]
          function enumerate(depth: number, used: Set<number>) {
            const length = values[0]
            if (length) {
              let minimum = 0, maximum = 0
              for (let i = 0; i < length; i++) {
                if (values[i]) { minimum += values[i]; maximum += values[i] }
                else {
                  const options = domains[clue.cells[i]].filter(digit => !used.has(digit))
                  if (!options.length) return
                  minimum += Math.min(...options); maximum += Math.max(...options)
                }
              }
              if (minimum > clue.total || maximum < clue.total) return
            }
            if (depth === order.length) {
              if (values.slice(0,length).reduce((sum,digit)=>sum+digit,0) === clue.total) values.forEach((digit,i)=>result[i].add(digit))
              return
            }
            const index=order[depth]
            for(const digit of domains[clue.cells[index]]) if(!used.has(digit)) {
              values[index]=digit;used.add(digit);enumerate(depth+1,used);used.delete(digit);values[index]=0
            }
          }
          enumerate(0,new Set<number>())
          return result
        })
        clue.cells.forEach((cell,i)=>{
          const keep=domains[cell].filter(digit=>supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length;domains[cell]=keep
        })
      }
      for (const clue of sandwiches) {
        const supported = supportFor(clue, clue.cells, domains, () => {
          const result = clue.cells.map(() => new Set<number>()), values = clue.cells.map(() => 0)
          const order = clue.cells.map((_, i) => i).sort((a,b) => domains[clue.cells[a]].length - domains[clue.cells[b]].length)
          function enumerate(depth: number, used: Set<number>) {
            const first = values.indexOf(1), last = values.indexOf(9)
            if (first >= 0 && last >= 0) {
              const lo = Math.min(first,last), hi = Math.max(first,last)
              let minimum = 0, maximum = 0
              for (let i = lo+1; i < hi; i++) {
                if (values[i]) { minimum += values[i]; maximum += values[i] }
                else {
                  const options = domains[clue.cells[i]].filter(digit => !used.has(digit))
                  if (!options.length) return
                  minimum += Math.min(...options); maximum += Math.max(...options)
                }
              }
              if (minimum > clue.total || maximum < clue.total) return
            }
            if (depth === order.length) {
              const lo = Math.min(first,last), hi = Math.max(first,last)
              if (values.slice(lo+1,hi).reduce((sum,digit)=>sum+digit,0) === clue.total) values.forEach((digit,i)=>result[i].add(digit))
              return
            }
            const index=order[depth]
            for(const digit of domains[clue.cells[index]]) if(!used.has(digit)) {
              values[index]=digit;used.add(digit);enumerate(depth+1,used);used.delete(digit);values[index]=0
            }
          }
          enumerate(0,new Set<number>())
          return result
        })
        clue.cells.forEach((cell,i)=>{
          const keep=domains[cell].filter(digit=>supported[i].has(digit))
          changed ||= keep.length !== domains[cell].length;domains[cell]=keep
        })
      }
      for (const parts of regionParts) {
        // Enumerate numeric assignments in each region part. Every part belongs
        // to one Sudoku region, so its digits must also be distinct.
        const possibilities = parts.map(cells => {
          const totals = new Map<number, Set<number>[]>()
          const chosen: number[] = []
          function enumerate(index: number, sum: number) {
            if (index === cells.length) {
              const supports = totals.get(sum) ?? cells.map(() => new Set<number>())
              chosen.forEach((digit, i) => supports[i].add(digit))
              totals.set(sum, supports); return
            }
            for (const digit of domains[cells[index]]) if (!chosen.includes(digit)) {
              chosen.push(digit); enumerate(index + 1, sum + digit); chosen.pop()
            }
          }
          enumerate(0, 0)
          return totals
        })
        const common = [...possibilities[0].keys()].filter(total => possibilities.every(map => map.has(total)))
        if (!common.length) return
        parts.forEach((cells, part) => cells.forEach((cell, offset) => {
          const keep = domains[cell].filter(digit => common.some(total => possibilities[part].get(total)![offset].has(digit)))
          changed ||= keep.length !== domains[cell].length; domains[cell] = keep
        }))
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
    domains.forEach((digits, i) => { if (digits.length > 1 && (cell < 0 || digits.length < domains[cell].length || digits.length === domains[cell].length && involvement[i] > involvement[cell])) cell = i })
    if (cell < 0) { const result = domains.map(digits => digits[0]).join(''); solution ??= result; solutions.push(result); count++; return }
    for (const digit of domains[cell]) {
      const next = [...domains]; next[cell] = [digit]; search(next)
      if (count === 2) return
    }
  }
  search([...puzzle.givens].map(digit => digit === '0' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [Number(digit)]))
  return { count, solution, solutions, nodes }
}
