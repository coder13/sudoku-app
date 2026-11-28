import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Check completed digits directly from rule definitions, optionally relaxing one builder rule. */
export function assertVariantCompletion(puzzle: VariantPuzzle, completion: string, omittedRule?: string) {
  assert.match(completion, /^[1-9]{81}$/)
  const digits = [...completion].map(Number)
  const distinct = (cells: readonly number[]) => new Set(cells.map(cell => digits[cell])).size === cells.length
  for (let cell = 0; cell < 81; cell++) if (puzzle.givens[cell] !== '0') assert.equal(completion[cell], puzzle.givens[cell])
  const houses = [
    ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)),
    ...Array.from({ length: 9 }, (_, col) => Array.from({ length: 9 }, (_, row) => row * 9 + col)),
    ...(puzzle.regions && puzzle.regions.type !== 'boxes' ? puzzle.regions.regions : Array.from({ length: 9 }, (_, box) =>
      Array.from({ length: 9 }, (_, i) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))),
  ]
  const enforcedHouses = omittedRule === 'jigsaw' ? houses.slice(0, 18) : houses
  for (const house of enforcedHouses) assert.ok(distinct(house), 'Every house needs nine distinct digits')
  const adjacent = Array.from({ length: 81 }, (_, cell) => [
    ...(cell % 9 < 8 ? [[cell, cell + 1]] : []), ...(cell < 72 ? [[cell, cell + 9]] : []),
  ]).flat()
  const marked = (pairs: readonly (readonly [number, number])[] | undefined, a: number, b: number) =>
    pairs?.some(([c, d]) => c === a && d === b || c === b && d === a) ?? false
  for (const rule of puzzle.rules ?? []) {
    if (omittedRule === rule.type ||
        rule.type === 'diagonal' && omittedRule === 'diagonal-' + rule.diagonal ||
        rule.type === 'whispers' && (rule.minDifference === 4 && omittedRule === 'dutch-whispers' ||
          rule.minDifference === 5 && omittedRule === 'german-whispers')) continue
    switch (rule.type) {
      case 'skyscrapers': {
        let maximum = 0, visible = 0
        for (const cell of rule.cells) if (digits[cell] > maximum) { maximum = digits[cell]; visible++ }
        assert.equal(visible, rule.count)
        break
      }
      case 'x-sum': {
        const row = rule.cells.map(cell => digits[cell])
        assert.equal(row.slice(0, row[0]).reduce((sum, digit) => sum + digit, 0), rule.sum)
        break
      }
      case 'little-killer':
        assert.equal(rule.cells.reduce((sum, cell) => sum + digits[cell], 0), rule.sum)
        break
      case 'sandwich': {
        const row = rule.cells.map(cell => digits[cell]), one = row.indexOf(1), nine = row.indexOf(9)
        assert.ok(one >= 0 && nine >= 0)
        assert.equal(row.slice(Math.min(one, nine) + 1, Math.max(one, nine)).reduce((sum, digit) => sum + digit, 0), rule.sum)
        break
      }
      case 'terrain-sandwich': {
        const values = rule.cells.map((cell, index) => digits[cell] * rule.transforms[index].multiplier + rule.transforms[index].offset)
        const possible = values.flatMap((first, start) => values.flatMap((last, end) =>
          first === 1 && last === 9 && start !== end
            ? [values.slice(Math.min(start, end) + 1, Math.max(start, end)).reduce((sum, value) => sum + value, 0)]
            : []))
        assert.ok(possible.length)
        assert.equal(Math.max(...possible), rule.maximum)
        break
      }
      case 'clone':
        for (const group of rule.groups) for (const cell of group) assert.equal(digits[cell], digits[group[0]])
        break
      case 'non-consecutive':
        for (const [a, b] of adjacent) if (!marked(rule.except, a, b)) assert.notEqual(Math.abs(digits[a] - digits[b]), 1)
        break
      case 'anti-king': case 'anti-knight':
        for (let a = 0; a < 81; a++) for (let b = a + 1; b < 81; b++) {
          const dr = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), dc = Math.abs(a % 9 - b % 9)
          if (rule.type === 'anti-king' ? dr === 1 && dc === 1 : dr * dc === 2) {
            assert.notEqual(digits[a], digits[b], `${rule.type}: ${a}, ${b}`)
          }
        }
        break
      case 'diagonal':
        assert.ok(distinct(Array.from({ length: 9 }, (_, i) => rule.diagonal === 'main' ? i * 10 : 8 + i * 8)))
        break
      case 'extra-house': case 'distinct-cells': assert.ok(distinct(rule.cells)); break
      case 'inside-grid': {
        const set = new Set(rule.rows[0].map(cell => digits[cell]))
        assert.equal(set.size, rule.rows.length)
        const columns = rule.rows[0].map((_, column) => rule.rows.map(row => row[column]))
        for (const cells of [...rule.rows, ...columns]) {
          assert.ok(distinct(cells) && cells.every(cell => set.has(digits[cell])))
        }
        break
      }
      case 'consecutive-run': {
        const first = digits[rule.cells[0]]
        const step = digits[rule.cells[1]] - first
        assert.equal(rule.fromBulb ? step : Math.abs(step), 1)
        rule.cells.forEach((cell, i) => assert.equal(digits[cell], first + i * step))
        break
      }
      case 'killer-cages':
        for (const cage of rule.cages) {
          assert.ok(distinct(cage.cells))
          assert.equal(cage.cells.reduce((sum, cell) => sum + digits[cell], 0), cage.sum)
        }
        if (rule.coverGrid) assert.equal(new Set(rule.cages.flatMap(cage => cage.cells)).size, 81)
        break
      case 'whispers':
        rule.cells.slice(1).forEach((cell, i) => assert.ok(Math.abs(digits[rule.cells[i]] - digits[cell]) >= rule.minDifference))
        break
      case 'palindrome':
        rule.cells.forEach((cell, i) => assert.equal(digits[cell], digits[rule.cells[rule.cells.length - 1 - i]]))
        break
      case 'global-entropy': {
        const groups = rule.groups?.length ? rule.groups : [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
        for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
          const first = row * 9 + col
          const area = [first, first + 1, first + 9, first + 10].map(cell => digits[cell])
          assert.ok(groups.every(group => area.some(digit => group.includes(digit))))
        }
        break
      }
      case 'entropic': case 'modular': {
        for (let i = 0; i < rule.cells.length; i++) for (let j = i + 1; j < Math.min(i + 3, rule.cells.length); j++) {
          const group = (digit: number) => rule.type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
          assert.notEqual(group(digits[rule.cells[i]]), group(digits[rule.cells[j]]))
        }
        break
      }
      case 'renban': {
        const values = rule.cells.map(cell => digits[cell])
        assert.ok(distinct(rule.cells))
        assert.equal(Math.max(...values) - Math.min(...values), values.length - 1)
        break
      }
      case 'minimum': case 'maximum': {
        const marked = new Set(rule.cells)
        for (const cell of rule.cells) for (let other = 0; other < 81; other++) {
          const distance = Math.abs(Math.floor(cell / 9) - Math.floor(other / 9)) + Math.abs(cell % 9 - other % 9)
          if (distance !== 1 || rule.ignoreMarkedNeighbors && marked.has(other)) continue
          assert.ok(rule.type === 'minimum' ? digits[cell] < digits[other] : digits[cell] > digits[other])
        }
        break
      }
      case 'inequality': assert.ok(digits[rule.less] < digits[rule.greater]); break
      case 'between': {
        const first = digits[rule.cells[0]], last = digits[rule.cells[rule.cells.length - 1]]
        for (const cell of rule.cells.slice(1, -1)) assert.ok(
          first < digits[cell] && digits[cell] < last || last < digits[cell] && digits[cell] < first)
        break
      }
      case 'region-sum': {
        const regions = houses.slice(18, 27)
        const totals = new Map<number, number>()
        let previous = -1, visit = -1
        for (const cell of rule.cells) {
          const region = regions.findIndex(cells => cells.includes(cell))
          if (region !== previous) visit++
          previous = region
          const part = rule.groupByRegion ? region : visit
          totals.set(part, (totals.get(part) ?? 0) + digits[cell])
        }
        assert.ok(totals.size >= 1)
        assert.equal(new Set(totals.values()).size, 1)
        break
      }
      case 'thermometer':
        rule.cells.slice(1).forEach((cell, i) => assert.ok(digits[rule.cells[i]] < digits[cell]))
        break
      case 'arrow': assert.equal(rule.cells.reduce((sum, cell) => sum + digits[cell], 0), digits[rule.circle]); break
      case 'pill-arrow': {
        const [tens, ones] = rule.pill.map(cell => digits[cell])
        assert.equal(rule.cells.reduce((sum, cell) => sum + digits[cell], 0), 10 * tens + ones)
        break
      }
      case 'lockout': {
        const [low, high] = [digits[rule.cells[0]], digits[rule.cells.at(-1)!]].sort((a, b) => a - b)
        assert.ok(high - low >= 4)
        for (const cell of rule.cells.slice(1, -1)) assert.ok(digits[cell] < low || digits[cell] > high)
        break
      }
      case 'parity':
        for (const cell of rule.cells) assert.equal(digits[cell] % 2, rule.parity === 'odd' ? 1 : 0)
        break
      case 'quadruple': case 'quadruple-sum': {
        const cells = [rule.topLeft, rule.topLeft + 1, rule.topLeft + 9, rule.topLeft + 10]
        for (let digit = 1; digit <= 9; digit++) assert.ok(
          cells.filter(cell => digits[cell] === digit).length >= rule.digits.filter(printed => printed === digit).length)
        if (rule.type === 'quadruple-sum') {
          const values = cells.map(cell => digits[cell]).sort((a, b) => a - b)
          assert.equal(values[0] + values[1] + values[2], values[3])
        }
        break
      }
      case 'adjacent-total': assert.equal(digits[rule.cells[0]] + digits[rule.cells[1]], rule.sum); break
      case 'entropy-window-group': {
        const groups = rule.cells.map(cell => Math.floor((digits[cell] - 1) / 3))
        const repeated = rule.group === 'low' ? 0 : rule.group === 'middle' ? 1 : 2
        assert.ok([0, 1, 2].every(group => groups.includes(group)))
        assert.equal(groups.filter(group => group === repeated).length, 2)
        break
      }
      case 'digit-order': {
        const orderedDigits = rule.cells.map(cell => digits[cell]).filter(digit => rule.digits.includes(digit))
        assert.deepEqual(orderedDigits, rule.digits)
        break
      }
      case 'forbidden-entropic-connection': {
        const groups = rule.cells.map(cell => Math.floor((digits[cell] - 1) / 3))
        const firstIsEntropic = new Set(groups.slice(0, 3)).size === 3
        const secondIsEntropic = new Set(groups.slice(1)).size === 3
        assert.equal(firstIsEntropic && secondIsEntropic, false)
        break
      }
      case 'neighbor-match':
        for (const { cell, digit } of rule.clues) {
          const row = Math.floor(cell / 9), column = cell % 9
          const neighbors = [row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1,
            column > 0 ? cell - 1 : -1, column < 8 ? cell + 1 : -1].filter(neighbor => neighbor >= 0)
          assert.ok(neighbors.some(neighbor => digits[neighbor] === digit), `Clue ${digit} at ${cell} needs a matching orthogonal neighbor`)
        }
        break
      case 'magic-square': {
        const lines = [
          [0, 1, 2], [3, 4, 5], [6, 7, 8],
          [0, 3, 6], [1, 4, 7], [2, 5, 8],
          [0, 4, 8], [2, 4, 6],
        ]
        for (const line of lines) assert.equal(line.reduce((sum, index) => sum + digits[rule.cells[index]], 0), 15)
        break
      }
      case 'unknown-cage-sums': {
        const totals = rule.cages.map(cage => {
          assert.ok(distinct(cage), 'Digits cannot repeat inside an unknown-sum cage')
          return cage.reduce((sum, cell) => sum + digits[cell], 0)
        })
        assert.equal(new Set(totals).size, rule.cages.length, 'Unknown cage totals must not repeat')
        const ordered = [...totals].sort((a, b) => a - b)
        ordered.forEach((total, index) => assert.equal(total, ordered[0] + index, 'Unknown cage totals must be consecutive'))
        for (const [first, second] of rule.consecutivePairs) {
          assert.equal(Math.abs(totals[first] - totals[second]), 1, 'A C-linked pair of cage totals must differ by one')
        }
        break
      }
      case 'distant-neighbors': {
        const box = (cell: number) => Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3)
        const markedCell = Array.from({ length: 9 }, (_, index) => rule.markedCells.find(cell => box(cell) === index)!)
        for (let index = 0; index < markedCell.length; index++) {
          const cell = markedCell[index], row = Math.floor(cell / 9), column = cell % 9
          for (const neighbor of [row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1,
            column > 0 ? cell - 1 : -1, column < 8 ? cell + 1 : -1].filter(neighbor => neighbor >= 0)) {
            assert.notEqual(Math.abs(digits[cell] - digits[neighbor]), 1, 'A marked cell and its orthogonal neighbors cannot be consecutive')
          }
        }
        for (let boxRow = 0; boxRow < 3; boxRow++) for (let boxColumn = 0; boxColumn < 3; boxColumn++) {
          const index = boxRow * 3 + boxColumn
          if (boxColumn < 2) {
            const next = index + 1
            assert.notEqual(Math.abs(digits[markedCell[index]] - digits[markedCell[next]]), 1, 'Edge-sharing box identities cannot be consecutive')
            for (let offset = 0; offset < 3; offset++) {
              const left = boxRow * 27 + boxColumn * 3 + offset * 9 + 2
              const right = left + 1
              assert.ok(Math.abs(digits[left] - digits[markedCell[next]]) > 1, 'The left facing border cannot neighbor its identity or a consecutive digit')
              assert.ok(Math.abs(digits[right] - digits[markedCell[index]]) > 1, 'The right facing border cannot neighbor its identity or a consecutive digit')
            }
          }
          if (boxRow < 2) {
            const next = index + 3
            assert.notEqual(Math.abs(digits[markedCell[index]] - digits[markedCell[next]]), 1, 'Edge-sharing box identities cannot be consecutive')
            for (let offset = 0; offset < 3; offset++) {
              const top = boxRow * 27 + boxColumn * 3 + 18 + offset
              const bottom = top + 9
              assert.ok(Math.abs(digits[top] - digits[markedCell[next]]) > 1, 'The upper facing border cannot neighbor its identity or a consecutive digit')
              assert.ok(Math.abs(digits[bottom] - digits[markedCell[index]]) > 1, 'The lower facing border cannot neighbor its identity or a consecutive digit')
            }
          }
        }
        break
      }
      case 'labeled-dots': {
        const matches = (a: number, b: number, value: number) => {
          const x = digits[a], y = digits[b]
          return rule.relation === 'ratio' ? Math.max(x, y) === value * Math.min(x, y) : Math.abs(x - y) === value
        }
        for (const { cells: [a, b], value } of rule.marks) assert.ok(matches(a, b, value))
        if (rule.negative) for (let a = 0; a < 81; a++) {
          const edges = [...(a % 9 < 8 ? [a + 1] : []), ...(a < 72 ? [a + 9] : [])]
          for (const b of edges) {
            const marked = puzzle.rules?.some(other => other.type === 'labeled-dots' && other.relation === rule.relation &&
              other.marks.some(({ cells }) => cells.includes(a) && cells.includes(b)))
            if (!marked) assert.equal(matches(a, b, rule.relation === 'ratio' ? 2 : 1), false)
          }
        }
        break
      }
      case 'xv':
      case 'kropki': {
        const layers = rule.type === 'xv'
          ? [['xv-five', rule.five], ['xv-ten', rule.ten]] as const
          : [['kropki-white', rule.consecutive], ['kropki-black', rule.ratioTwo]] as const
        for (const [kind, [id, marks]] of layers.entries()) {
          // The disappearing layer's printed dots still exempt their edges
          // from the surviving negative rule in the relaxation.
          if (id === omittedRule) continue
          const matches = (a: number, b: number) => rule.type === 'xv' ? digits[a] + digits[b] === (kind === 0 ? 5 : 10) : kind === 0 ? Math.abs(digits[a] - digits[b]) === 1 :
            digits[a] === digits[b] * 2 || digits[b] === digits[a] * 2
          for (const [a, b] of marks?.pairs ?? []) assert.ok(matches(a, b))
          if (marks?.negative) {
            const pairs = puzzle.rules!.flatMap(other => {
              if (rule.type === 'kropki') return other.type === 'kropki'
                ? [...other.consecutive?.pairs ?? [], ...other.ratioTwo?.pairs ?? []] : []
              if (other.type === 'xv') return [...other.five?.pairs ?? [], ...other.ten?.pairs ?? []]
              return other.type === 'adjacent-total' && (other.sum === 5 || other.sum === 10) ? [other.cells] : []
            })
            for (const [a, b] of adjacent) if (!marked(pairs, a, b)) assert.ok(!matches(a, b))
          }
        }
        break
      }
      default: {
        const unsupported: never = rule
        throw new Error(`Independent completion check does not support ${JSON.stringify(unsupported)}`)
      }
    }
  }
}
