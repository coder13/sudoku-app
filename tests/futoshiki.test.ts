import assert from 'node:assert/strict'
import { test } from 'node:test'
import { futoshikiCatalog } from '../src/futoshiki/catalog.ts'
import { createFutoshiki, type FutoshikiPuzzle } from '../src/futoshiki/engine.ts'
import { bit, checkLatin, findLatinHint, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { xWingRule } from '../src/latin/x-wing.ts'
import { seededIndex } from '../src/number-puzzles/generation-random.ts'

function independentCount({ size, givens, inequalities }: FutoshikiPuzzle) {
  const values = givens.slice()
  const candidates = Array.from({ length: size }, (_, i) => i + 1)
  const neighbors = values.map((_, cell) => inequalities.filter(({ less, greater }) => less === cell || greater === cell))
  function search(): number {
    let index = -1
    let domain: number[] = []
    for (let i = 0; i < values.length; i++) {
      if (values[i]) continue
      const row = i - i % size
      const column = i % size
      const possible = candidates.filter(digit => !values.slice(row, row + size).includes(digit) &&
        values.every((value, cell) => cell % size !== column || value !== digit) &&
        neighbors[i].every(({ less, greater }) => i === less
          ? digit < (values[greater] || size)
          : (values[less] || 1) < digit))
      if (possible.length === 0) return 0
      if (index === -1 || domain.length > possible.length) {
        index = i
        domain = possible
      }
    }
    if (index === -1) return 1
    let count = 0
    for (const digit of domain) {
      values[index] = digit
      count += search()
      if (count >= 2) break
    }
    values[index] = 0
    return Math.min(count, 2)
  }
  return search()
}

test('every Futoshiki puzzle is uniquely solvable and depends on its inequalities', () => {
  for (const { id, puzzle } of futoshikiCatalog) {
    assert.equal(independentCount(puzzle), 1, id)
    assert.equal(independentCount({ ...puzzle, inequalities: [] }), 2, id)
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique', id)
    assert.equal(exact.nodes, 1, id)
    assert.ok(exact.solution)
    const values = [...puzzle.givens]
    const placements = findLatinHints(puzzle, values)
    assert.deepEqual(placements[0], findLatinHint(puzzle, values), id)
    assert.equal(new Set(placements.map(hint => hint.cell)).size, placements.length, id)
    for (const hint of placements) {
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, exact.solution[hint.cell], id)
    }
    let steps = values.filter(digit => digit === 0).length
    while (steps--) {
      const hint = findLatinHint(puzzle, values)
      assert.ok(hint, id)
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, exact.solution[hint.cell], id)
      values[hint.cell] = hint.value
    }
    assert.equal(checkLatin(puzzle, values).complete, true, id)
    assert.ok(puzzle.inequalities.every(({ less, greater }) => values[less] < values[greater]), id)
  }
})

test('exact search applies pending basic rules before the next advanced rule', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-5')!
  let xWingChecks = 0
  const rules = puzzle.rules.map(rule => rule.kind === 'x-wing' ? {
    ...rule,
    support(domains: readonly number[]) {
      xWingChecks++
      return rule.support(domains)
    },
  } : rule)

  // A simpler deduction and the basic rules can finish this puzzle.
  assert.equal(solveLatin({ ...puzzle, rules }, [], 1).status, 'unique')
  assert.equal(xWingChecks, 0)
})

test('candidate support keeps the order of horizontal and vertical signs', () => {
  const puzzle = createFutoshiki(4, Array(16).fill(0), [
    { less: 1, greater: 0 },
    { less: 5, greater: 1 },
  ])
  const values = Array(16).fill(0)
  values[1] = 2
  values[0] = 1
  values[5] = 4
  const bad = checkLatin(puzzle, values)
  assert.ok(bad.conflicts.some(rule => rule.label === 'R1C2 is less than R1C1'))
  assert.ok(bad.conflicts.some(rule => rule.label === 'R2C2 is less than R1C2'))
  assert.equal(solveLatin(puzzle, values).status, 'unsolvable')
  assert.equal(solveLatin(puzzle).status, 'multiple')
})

test('the model rejects wrapping, diagonal, or duplicated inequality edges', () => {
  const givens = Array(16).fill(0)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 3, greater: 4 }]), /adjacent cells/)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 3, greater: 6 }]), /adjacent cells/)
  assert.throws(() => createFutoshiki(4, givens, [{ less: 0, greater: 1 }, { less: 1, greater: 0 }]), /one inequality/)
})

test('two signs on the same line require distinct neighbors', () => {
  const givens = Array(16).fill(0)
  const puzzle = createFutoshiki(4, givens, [
    { less: 0, greater: 1 }, { less: 2, greater: 1 },
    { less: 9, greater: 5 }, { less: 9, greater: 13 },
  ])
  for (const [cells, smaller] of [[[0, 1, 2], true], [[5, 9, 13], false]] as const) {
    const rule = puzzle.rules.find(rule => rule.cells.length === 3 && rule.cells[1] === cells[1])
    assert.ok(rule)
    assert.deepEqual(rule.cells, cells)
    const domains = givens.slice()
    const digits = [1, 2, 4, 8]
    for (let a = 0; a < 16; a++) {
      for (let middle = 0; middle < 16; middle++) {
        for (let b = 0; b < 16; b++) {
          domains[cells[0]] = a
          domains[cells[1]] = middle
          domains[cells[2]] = b
          const expected = [0, 0, 0]
          for (const first of digits.filter(digit => digit & a)) {
            for (const bound of digits.filter(digit => digit & middle)) {
              for (const last of digits.filter(digit => digit & b)) {
                if (first === last || !(smaller ? first < bound && last < bound : first > bound && last > bound)) continue
                expected[0] |= first
                expected[1] |= bound
                expected[2] |= last
              }
            }
          }
          assert.deepEqual(rule.support(domains), expected[1] ? expected : null)
        }
      }
    }
  }
})

test('Hard 4 gets a hint from two signs after the individual rules stall', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-4')!
  const individualRules = { ...puzzle, rules: puzzle.rules.filter(rule => rule.cells.length !== 3 && rule.kind !== 'inequality-line') }
  const values = [...puzzle.givens]
  for (const hint of findLatinHints(individualRules, values)) values[hint.cell] = hint.value
  assert.equal(findLatinHint(individualRules, values), null)
  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 3)
  assert.equal(hint.value, 3)
  assert.match(hint.rules[0].label, /^R1C3 and R1C5 share a row/)
})

test('Hard 5 and Hard 6 need naked subsets and name the cells in the hint', () => {
  const cases = [
    {
      id: 'hard-5', kind: 'naked-pair', cell: 25, value: 2, witness: [33, 35],
      reason: 'Only 1 and 2 can go in R6C4 and R6C6. Those digits cannot go elsewhere in row 6.',
    },
    {
      id: 'hard-6', kind: 'naked-triple', cell: 19, value: 1, witness: [8, 9, 11],
      reason: 'Only 1, 2, and 3 can go in R2C3, R2C4, and R2C6. Those digits cannot go elsewhere in row 2.',
    },
  ]
  for (const { id, kind, cell, value, witness, reason } of cases) {
    const { puzzle } = futoshikiCatalog.find(entry => entry.id === id)!
    const simpler = { ...puzzle, rules: puzzle.rules.filter(rule =>
      rule.kind !== 'inequality-line' && (kind === 'naked-pair' ? !rule.afterBasic : rule.kind !== kind)) }
    const values = [...simpler.givens]
    for (const hint of findLatinHints(simpler, values)) values[hint.cell] = hint.value
    assert.equal(checkLatin(simpler, values).complete, false, id)
    assert.equal(findLatinHint(simpler, values), null, id)
    assert.equal(solveLatin(simpler, values, 1).status, 'search-limit', id)

    const hint = findLatinHint(puzzle, values)
    assert.ok(hint, id)
    assert.equal(hint.cell, cell, id)
    assert.equal(hint.value, value, id)
    const proof = hint.rules.find(rule => rule.kind === kind)
    assert.equal(proof?.label, reason, id)
    assert.deepEqual(proof.cells, witness, id)
  }
})

test('combined line support matches an independent check of all digit permutations', () => {
  const puzzle = createFutoshiki(4, Array(16).fill(0), [
    { less: 0, greater: 1 }, { less: 3, greater: 2 },
    { less: 4, greater: 0 }, { less: 8, greater: 12 },
  ])
  const rules = puzzle.rules.filter(rule => rule.kind === 'inequality-line')
  assert.deepEqual(rules.map(rule => rule.cells), [[0, 1, 2, 3], [0, 4, 8, 12]])
  const pick = seededIndex(8571)
  for (const rule of rules) {
    const signs = puzzle.inequalities.filter(({ less, greater }) =>
      rule.cells.includes(less) && rule.cells.includes(greater))
    for (let trial = 0; trial < 128; trial++) {
      const domains = puzzle.givens.map(() => trial ? pick(16) : 15)
      const expected = [0, 0, 0, 0]
      for (const a of [1, 2, 4, 8]) {
        for (const b of [1, 2, 4, 8]) {
          for (const c of [1, 2, 4, 8]) {
            const d = 15 & ~(a | b | c)
            const values = [a, b, c, d]
            if (new Set([a, b, c]).size !== 3 || !values.every((digit, i) => digit & domains[rule.cells[i]])) continue
            if (signs.some(({ less, greater }) => values[rule.cells.indexOf(less)] >= values[rule.cells.indexOf(greater)])) continue
            values.forEach((digit, i) => { expected[i] |= digit })
          }
        }
      }
      assert.deepEqual(rule.support(domains), expected[0] ? expected : null)
    }
  }
})

test('Hard 7 combines separate signs in row 5 after the other techniques stall', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-7')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'inequality-line') }
  const values = [...puzzle.givens]
  for (const hint of findLatinHints(simpler, values)) values[hint.cell] = hint.value
  assert.equal(findLatinHint(simpler, values), null)
  assert.equal(solveLatin(simpler, values, 1).status, 'search-limit')
  assert.equal(solveLatin(puzzle, values, 1).status, 'unique')

  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 28)
  assert.equal(hint.value, 4)
  const reason = hint.rules.find(rule => rule.kind === 'inequality-line')
  assert.deepEqual(reason?.cells, [24, 25, 26, 27, 28, 29])
  assert.equal(reason.label, 'Row 5 uses each digit once. R5C3 is less than R5C2. R5C5 is less than R5C4.')
})

test('inequality chains with a shared upper or lower bound need different endpoints', () => {
  const edges = [[5, 0], [0, 1], [7, 6], [6, 1]]
  for (const below of [true, false]) {
    const givens = Array(25).fill(0)
    givens[16] = below ? 4 : 2
    const inequalities = edges.map(([a, b]) => below ? { less: a, greater: b } : { less: b, greater: a })
    const puzzle = createFutoshiki(5, givens, inequalities)
    const simpler = { ...puzzle, rules: puzzle.rules.filter(rule =>
      rule.kind !== 'inequality-bound' && rule.kind !== 'line-digit-bound' && rule.kind !== 'inequality-line-matching') }
    assert.equal(findLatinHint(simpler, givens), null)

    const hint = findLatinHint(puzzle, givens)
    assert.equal(hint?.cell, 1)
    assert.equal(hint.value, below ? 5 : 1)
    const proof = hint.rules.find(rule => rule.kind === 'inequality-bound')
    assert.deepEqual(proof?.cells, [1, 0, 5, 6, 7])
    const signs = below ? 'R2C1 < R1C1 < R1C2 and R2C3 < R2C2 < R1C2' : 'R1C2 < R1C1 < R2C1 and R1C2 < R2C2 < R2C3'
    assert.equal(proof.label, `R2C1 and R2C3 need different digits in row 2. The signs give ${signs}. ` +
      `If R1C2 is 3, both endpoints must be ${below ? 1 : 5}.`)
  }
})

test('support for shared bounds matches an independent check of paths with unequal lengths', () => {
  const size = 5
  const transpose = (cell: number) => (cell % size) * size + Math.floor(cell / size)
  const pick = seededIndex(31361)
  for (const below of [true, false]) {
    const inequalities = [[5, 0], [0, 1], [6, 1]].map(([a, b]) =>
      below ? { less: transpose(a), greater: transpose(b) } : { less: transpose(b), greater: transpose(a) })
    const puzzle = createFutoshiki(size, Array(25).fill(0), inequalities)
    const rule = puzzle.rules.find(rule => rule.kind === 'inequality-bound')
    assert.deepEqual(rule?.cells, [1, 5, 6])
    for (let trial = 0; trial < 256; trial++) {
      const domains = puzzle.givens.map(() => pick(1 << size))
      const expected = [0, 0, 0]
      for (let first = 1; first <= size; first++) {
        for (let bound = 1; bound <= size; bound++) {
          for (let second = 1; second <= size; second++) {
            const direction = below ? 1 : -1
            if (first === second || direction * (bound - first) < 2 || direction * (bound - second) < 1) continue
            const bits = [first, bound, second].map(digit => 1 << (digit - 1))
            if (bits.every((bit, i) => (bit & domains[rule.cells[i]]) !== 0)) {
              bits.forEach((bit, i) => { expected[i] |= bit })
            }
          }
        }
      }
      assert.deepEqual(rule.support(domains), expected[1] ? expected : null)
    }
  }
})

test('Hard 8 uses a shared inequality bound in the solution steps', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-8')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule =>
    rule.kind !== 'inequality-bound' && rule.kind !== 'line-digit-bound' && rule.kind !== 'inequality-line-matching') }
  const values = [...puzzle.givens]
  for (const hint of findLatinHints(simpler, values)) values[hint.cell] = hint.value
  assert.equal(findLatinHint(simpler, values), null)
  assert.equal(solveLatin(simpler, values, 1).status, 'search-limit')

  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 7)
  assert.equal(hint.value, 5)
  const proof = hint.rules.find(rule => rule.kind === 'inequality-bound')
  assert.deepEqual(proof?.cells, [7, 6, 12, 13, 14])
  assert.equal(proof.label, 'R3C1 and R3C3 need different digits in row 3. ' +
    'The signs give R3C1 < R2C1 < R2C2 and R3C3 < R3C2 < R2C2. If R2C2 is 3, both endpoints must be 1.')

  const walkthrough = findLatinSolutionHints(puzzle, [])
  assert.equal(walkthrough.length, 33)
  assert.ok(walkthrough.some(step => step.cell === hint.cell && step.rules.some(rule => rule.label === proof.label)))
  const final = [...puzzle.givens]
  for (const step of walkthrough) final[step.cell] = step.value
  assert.equal(checkLatin(puzzle, final).complete, true)
})

test('line support combines an outside chain with the other signs in its line', () => {
  const size = 6
  const digitMasks = [1, 2, 4, 8, 16, 32]
  function permutations(remaining: number[]): number[][] {
    if (!remaining.length) return [[]]
    return remaining.flatMap(digit => permutations(remaining.filter(other => other !== digit))
      .map(rest => [digit, ...rest]))
  }
  const ordered = permutations(digitMasks).filter(digits => digits[3] < digits[4])
  const pick = seededIndex(25919)
  for (const transpose of [false, true]) {
    const at = (cell: number) => transpose ? cell % size * size + Math.floor(cell / size) : cell
    const inequalities = [[0, 1], [0, 6], [6, 7], [7, 1], [3, 4]]
      .map(([less, greater]) => ({ less: at(less), greater: at(greater) }))
    const puzzle = createFutoshiki(size, Array(36).fill(0), inequalities)
    const rule = puzzle.rules.find(rule => rule.kind === 'inequality-chain-line')
    assert.ok(rule)
    assert.deepEqual(rule.cells, [0, 1, 2, 3, 4, 5, 6, 7].map(at))
    for (let trial = 0; trial < 80; trial++) {
      const masks = trial ? rule.cells.map(() => 63 & ~digitMasks[pick(6)] & ~digitMasks[pick(6)])
        : [3, 24, 18, 4, 32, 25, 6, 12]
      const domains = puzzle.givens.map(() => 63)
      rule.cells.forEach((cell, i) => { domains[cell] = masks[i] })
      const expected = Array<number>(6).fill(0)
      for (const digits of ordered) {
        if (!digits.every((digit, i) => digit & masks[i])) continue
        for (const first of digitMasks) for (const second of digitMasks) {
          if (!(first & masks[6]) || !(second & masks[7]) ||
            !(digits[0] < first && first < second && second < digits[1])) continue
          digits.forEach((digit, i) => { expected[i] |= digit })
        }
      }
      assert.deepEqual(rule.support(domains), expected[0] ? [...expected, masks[6], masks[7]] : null)
    }
  }
})

test('Hard 9 uses an inequality chain that leaves row 1 and returns', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-9')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'inequality-chain-line') }
  const values = [...puzzle.givens]
  for (const hint of findLatinHints(simpler, values)) values[hint.cell] = hint.value
  assert.equal(findLatinHint(simpler, values), null)
  assert.equal(solveLatin(simpler, values, 1).status, 'search-limit')

  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 0)
  assert.equal(hint.value, 1)
  const proof = hint.rules.find(rule => rule.kind === 'inequality-chain-line')
  assert.ok(proof)
  assert.deepEqual(proof.cells, [0, 1, 2, 3, 4, 5, 6, 7])
  const reason = 'Row 1 uses each digit once. The signs give R1C1 < R2C1 < R2C2 < R1C2. ' +
    'If R1C1 is 2, the chain forces R1C2 to be 5. Then R1C3 has no candidate.'
  assert.equal(proof.label, reason)

  const walkthrough = findLatinSolutionHints(puzzle, [])
  assert.equal(walkthrough.length, 28)
  assert.ok(walkthrough.some(step => step.cell === hint.cell && step.rules.some(rule => rule.label === reason)))
  const final = puzzle.givens.slice()
  for (const step of walkthrough) final[step.cell] = step.value
  assert.equal(checkLatin(puzzle, final).complete, true)
})

test('a digit confined to two cells limits their shared bound by the shorter path', () => {
  const size = 5
  const edges = [[5, 0], [0, 1], [6, 1]]
  for (const below of [true, false]) {
    const inequalities = edges.map(([a, b]) => below ? { less: a, greater: b } : { less: b, greater: a })
    const puzzle = createFutoshiki(size, Array(size * size).fill(0), inequalities)
    const rule = puzzle.rules.find(rule => rule.kind === 'line-digit-bound' && rule.cells.join(',') === '5,6,7,8,9,1')
    assert.ok(rule)
    const domains = puzzle.givens.map(() => 0b11111)
    for (const cell of [7, 8, 9]) domains[cell] &= ~0b00100
    const expected = [...domains.slice(5, 10), below ? 0b11000 : 0b00011]
    assert.deepEqual(rule.support(domains, proof => {
      assert.match(proof.label, /^Row 2 needs a 3\. It can only go in R2C1 or R2C2\./)
      assert.ok(proof.label.endsWith(below ? 'R1C2 must be at least 4.' : 'R1C2 must be at most 2.'))
      assert.deepEqual(proof.cells, [5, 6, 7, 8, 9, 1, 0])
    }), expected)

    domains[9] |= 0b00100
    assert.deepEqual(rule.support(domains), [...domains.slice(5, 10), domains[1]])
  }
})

test('Hard 10 uses a confined digit to raise an inequality bound before any other placement', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-10')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule =>
    rule.kind !== 'line-digit-bound' && rule.kind !== 'inequality-line-matching') }
  assert.equal(findLatinHint(simpler, []), null)
  assert.equal(solveLatin(simpler, [], 1).status, 'search-limit')
  assert.equal(solveLatin(puzzle, [], 1).status, 'unique')

  const hint = findLatinHint(puzzle, [])
  assert.equal(hint?.cell, 1)
  assert.equal(hint.value, 6)
  const proof = hint.rules.find(rule => rule.kind === 'line-digit-bound')
  assert.deepEqual(proof?.cells, [6, 7, 8, 9, 10, 11, 1, 0])
  assert.equal(proof.label, 'Row 2 needs a 4. It can only go in R2C1 or R2C3. ' +
    'The signs give R2C1 < R1C1 < R1C2 and R2C3 < R2C2 < R1C2. So R1C2 must be at least 6.')
  const steps = findLatinSolutionHints(puzzle, [])
  assert.deepEqual(steps[0], hint)
  const values = [...puzzle.givens]
  for (const step of steps) values[step.cell] = step.value
  assert.equal(checkLatin(puzzle, values).complete, true)
})

test('three inequality paths can leave a row or column with too few distinct digits', () => {
  const size = 5
  const transpose = (cell: number) => (cell % size) * size + Math.floor(cell / size)
  for (const smaller of [true, false]) {
    const cellAt = smaller ? (cell: number) => cell : transpose
    const edges = [[5, 0], [0, 1], [6, 1], [7, 2], [2, 1]]
    const inequalities = edges.map(([a, b]) =>
      smaller ? { less: cellAt(a), greater: cellAt(b) } : { less: cellAt(b), greater: cellAt(a) })
    const puzzle = createFutoshiki(size, Array(size * size).fill(0), inequalities)
    const line = [5, 6, 7, 8, 9, 1].map(cellAt)
    const rule = puzzle.rules.find(rule =>
      rule.kind === 'inequality-line-matching' && rule.cells.every((cell, index) => cell === line[index]))
    assert.ok(rule)
    const domains = Array(size * size).fill(0b11111)
    domains[cellAt(1)] = smaller ? bit(4) | bit(5) : bit(1) | bit(2)
    domains[cellAt(6)] &= ~bit(3)
    const expected = [...line.slice(0, -1).map(cell => domains[cell]), bit(smaller ? 5 : 1)]
    let evidence
    assert.deepEqual(rule.support(domains, proof => { evidence = proof.label }), expected)
    assert.match(evidence ?? '', /need 3 different digits/)
    assert.ok(evidence?.endsWith(smaller ? 'Their only candidates are 1 and 2.' : 'Their only candidates are 4 and 5.'))

    domains[cellAt(6)] |= bit(3)
    assert.deepEqual(rule.support(domains), line.map(cell => domains[cell]))
  }
})

test('Hard 12 needs inequality line matching for a full logical solution', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-12')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'inequality-line-matching') }
  assert.equal(solveLatin(simpler, [], 1).status, 'search-limit')
  const values = [...puzzle.givens]
  for (const { cell, value } of findLatinHints(simpler, [])) values[cell] = value
  assert.equal(findLatinHint(simpler, values), null)
  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 21)
  assert.equal(hint.value, 1)
  const proof = hint.rules.find(rule => rule.kind === 'inequality-line-matching')
  assert.deepEqual(proof?.cells, [21, 14, 20, 26, 15])
  assert.equal(proof.label,
    'Column 3 needs different digits in every cell. If R4C4 is 2, R3C3, R4C3, and R5C3 need 3 different digits. ' +
    'Their only candidates are 5 and 6.')
  const walkthrough = findLatinSolutionHints(puzzle, [])
  assert.equal(walkthrough.length, 31)
  assert.equal(walkthrough[2].cell, 21)
  assert.ok(walkthrough[2].rules.some(rule => rule.label === proof.label))
  assert.equal(solveLatin(puzzle, [], 1).status, 'unique')
})


test('X-wing removes a candidate outside its two rows or columns', () => {
  const size = 6
  const candidate = bit(4)
  const all = (1 << size) - 1
  const rule = xWingRule(size)
  for (const columnWing of [false, true]) {
    const cell = (line: number, offset: number) => columnWing ? offset * size + line : line * size + offset
    const bases = [1, 3]
    const covers = [0, 4]
    const domains = Array(size * size).fill(all)
    for (const line of bases) for (let offset = 0; offset < size; offset++) {
      if (!covers.includes(offset)) domains[cell(line, offset)] &= ~candidate
    }
    const expected = domains.slice()
    for (const line of [0, 2, 4, 5]) for (const offset of covers) expected[cell(line, offset)] &= ~candidate
    assert.deepEqual(rule.support(domains, proof => {
      assert.deepEqual(proof.cells, bases.flatMap(line => covers.map(offset => cell(line, offset))))
      assert.match(proof.label, columnWing ? /In columns 2 and 4/ : /In rows 2 and 4/)
    }), expected)

    const extra = domains.slice()
    extra[cell(3, 2)] |= candidate
    assert.deepEqual(rule.support(extra), extra)
    domains[cell(0, 0)] = candidate
    assert.equal(rule.support(domains), null)
  }
})

test('Hard 11 uses an X-wing to place a 6 after the first move', () => {
  const { puzzle } = futoshikiCatalog.find(entry => entry.id === 'hard-11')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'x-wing') }
  const original = findLatinHints(simpler, [])
  assert.deepEqual(original.map(({ cell, value }) => [cell, value]), [[27, 6]])
  const values = puzzle.givens.slice()
  values[27] = 6
  assert.equal(findLatinHint(simpler, values), null)
  assert.equal(solveLatin(simpler, values, 1).status, 'search-limit')

  const hint = findLatinHint(puzzle, values)
  assert.equal(hint?.cell, 32)
  assert.equal(hint.value, 6)
  const proof = hint.rules.find(rule => rule.kind === 'x-wing')
  assert.deepEqual(proof?.cells, [0, 4, 6, 10])
  assert.deepEqual(proof.sourceCells, Array.from({ length: 12 }, (_, cell) => cell))
  assert.match(proof.label, /^In rows 1 and 2, 6 can only go in columns 1 and 5\./)

  const steps = findLatinSolutionHints(puzzle, [])
  assert.equal(steps.length, 33)
  assert.equal(steps[1].cell, hint.cell)
  assert.equal(steps[1].value, hint.value)
  assert.ok(steps[1].rules.some(rule => rule.kind === 'x-wing'))
  for (const step of steps) values[step.cell] = step.value
  assert.equal(checkLatin(puzzle, values).complete, true)
  const wrong = puzzle.givens.slice()
  wrong[34] = 6
  assert.equal(independentCount({ ...puzzle, givens: wrong }), 0)
})
