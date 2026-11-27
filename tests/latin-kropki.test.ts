import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileLatinKropki, type LatinKropki, type LatinKropkiLayer } from '../src/latin/kropki.ts'
import { bit } from '../src/latin/engine.ts'

test('precomputed Latin Kropki support matches every digit pair for sizes 3 through 9', () => {
  for (let size = 3; size <= 9; size++) {
    for (const relation of ['consecutive', 'ratioTwo'] as const) {
      for (const allowed of [true, false]) {
        const value = allowed
          ? { [relation]: { pairs: [[0, 1] as [number, number]] } }
          : { [relation]: { pairs: [], negative: true } }
        const rule = compileLatinKropki(value, size).find(candidate => candidate.cells[0] === 0 && candidate.cells[1] === 1)
        assert.ok(rule, `${relation} ${allowed ? 'positive' : 'negative'} edge exists at size ${size}`)
        for (let left = 1; left <= size; left++) {
          for (let right = 1; right <= size; right++) {
            const domains = Array<number>(size ** 2).fill((1 << size) - 1)
            domains[0] = bit(left)
            domains[1] = bit(right)
            const supported = rule.support(domains)
            const matches = relation === 'consecutive'
              ? Math.abs(left - right) === 1
              : Math.max(left, right) === 2 * Math.min(left, right)
            assert.equal(supported !== null, matches === allowed,
              `${relation} ${allowed ? 'positive' : 'negative'} ${left}/${right} at size ${size}`)
            if (supported) assert.deepEqual(supported, [bit(left), bit(right)])
          }
        }
      }
    }
  }
})

test('numbered Difference and Ratio support matches every amount and digit pair from sizes 3 through 9', () => {
  for (let size = 3; size <= 9; size++) {
    for (const relation of ['difference', 'ratio'] as const) {
      const minimum = relation === 'difference' ? 1 : 2
      const maximum = relation === 'difference' ? size - 1 : size
      for (let amount = minimum; amount <= maximum; amount++) {
        const matching = (left: number, right: number) => relation === 'difference'
          ? Math.abs(left - right) === amount
          : Math.max(left, right) === amount * Math.min(left, right)
        const matchesNegativeDefault = (left: number, right: number) => relation === 'difference'
          ? Math.abs(left - right) === 1
          : Math.max(left, right) === 2 * Math.min(left, right)
        const positive = compileLatinKropki({ [relation]: { pairs: [{ cells: [0, 1], value: amount }] } }, size)
          .find(rule => rule.cells[0] === 0 && rule.cells[1] === 1)
        const negative = compileLatinKropki({ [relation]: { pairs: [{ cells: [0, 1], value: amount }], negative: true } }, size)
          .find(rule => rule.cells[0] === 1 && rule.cells[1] === 2)
        assert.ok(positive, `${relation} ${amount} positive edge exists at size ${size}`)
        assert.ok(negative, `${relation} ${amount} negative edge exists at size ${size}`)
        for (let left = 1; left <= size; left++) {
          for (let right = 1; right <= size; right++) {
            const domains = Array<number>(size ** 2).fill((1 << size) - 1)
            domains[0] = bit(left)
            domains[1] = bit(right)
            assert.equal(positive.support(domains) !== null, matching(left, right),
              `${relation} ${amount} positive ${left}/${right} at size ${size}`)
            domains[1] = bit(left)
            domains[2] = bit(right)
            assert.equal(negative.support(domains) !== null, !matchesNegativeDefault(left, right),
              `${relation} ${amount} negative ${left}/${right} at size ${size}`)
          }
        }
      }
    }
  }
})

test('layered negative Kropki compiles one exclusion per edge with intersected mark exemptions', () => {
  const cases = [
    { relation: 'consecutive', amount: 1, left: 1, right: 2 },
    { relation: 'ratioTwo', amount: 2, left: 1, right: 2 },
    { relation: 'difference', amount: 3, left: 1, right: 4 },
    { relation: 'ratio', amount: 3, left: 1, right: 3 },
  ] as const
  for (const { relation, amount, left, right } of cases) {
    const pairs = relation === 'difference' || relation === 'ratio'
      ? [
        [{ cells: [0, 1] as [number, number], value: amount }, { cells: [1, 2] as [number, number], value: amount }],
        [{ cells: [1, 0] as [number, number], value: amount }, { cells: [2, 3] as [number, number], value: amount }],
      ]
      : [
        [[0, 1] as [number, number], [1, 2] as [number, number]],
        [[1, 0] as [number, number], [2, 3] as [number, number]],
      ]
    const puzzle = { layers: pairs.map(layerPairs => ({ relation, pairs: layerPairs, negative: true })) }
    const rules = compileLatinKropki(puzzle, 4)
    assert.equal(rules.length, 26, `${relation} deduplicates repeated negative edge checks`)

    const supportsEdge = (a: number, b: number, edgeLeft: number, edgeRight: number) => {
      const domains = Array<number>(16).fill((1 << 4) - 1)
      domains[a] = bit(edgeLeft)
      domains[b] = bit(edgeRight)
      return rules.filter(rule => rule.cells.includes(a) && rule.cells.includes(b))
        .every(rule => rule.support(domains) !== null)
    }
    assert.equal(supportsEdge(0, 1, left, right), true, `${relation} mark shared by every negative layer is exempt`)
    assert.equal(supportsEdge(1, 2, 1, 2), false,
      `${relation} mark in only one negative layer remains subject to the other layer's negative rule`)
    if (relation === 'difference' || relation === 'ratio') {
      assert.equal(supportsEdge(1, 2, left, right), true,
        `${relation} numbered mark remains valid when it does not match the negative default`)
    }
  }
})

test('coalesced negative layers match independent source semantics on every edge and digit pair', () => {
  const size = 4
  const edges: [number, number][] = []
  for (let cell = 0; cell < size ** 2; cell++) {
    for (const other of [cell + 1, cell + size]) {
      if (other < size ** 2 && !(other === cell + 1 && cell % size === size - 1)) edges.push([cell, other])
    }
  }
  for (const relation of ['consecutive', 'ratioTwo', 'difference', 'ratio'] as const) {
    const numbered = relation === 'difference' || relation === 'ratio'
    const layers: LatinKropkiLayer[] = Array.from({ length: 3 }, (_, layerIndex) => {
      const marked = edges.filter((_, edgeIndex) => (edgeIndex + layerIndex) % 3 === 0)
      const pairs = numbered
        ? marked.map(([a, b], markIndex) => ({ cells: [a, b] as [number, number], value: relation === 'difference'
          ? markIndex % (size - 1) + 1 : markIndex % (size - 1) + 2 }))
        : marked
      return { relation, pairs, negative: layerIndex !== 1 }
    })
    const rules = compileLatinKropki({ layers }, size)
    const defaultAmount = relation === 'consecutive' || relation === 'difference' ? 1 : 2
    const matches = (left: number, right: number, amount: number) =>
      relation === 'consecutive' || relation === 'difference'
        ? Math.abs(left - right) === amount
        : Math.max(left, right) === amount * Math.min(left, right)
    for (const [a, b] of edges) {
      const edgeKey = `${a}:${b}`
      const pairRules = rules.filter(rule => Math.min(...rule.cells) === a && Math.max(...rule.cells) === b)
      assert.ok(pairRules.length, `${relation} constraints cover edge ${edgeKey}`)
      for (let left = 1; left <= size; left++) {
        for (let right = 1; right <= size; right++) {
          const expected = layers.every(layer => {
            const mark = (layer.pairs ?? []).find(pair => {
              const cells = 'cells' in pair ? pair.cells : pair
              return `${Math.min(...cells)}:${Math.max(...cells)}` === edgeKey
            })
            if (mark) {
              const amount = 'cells' in mark ? mark.value : defaultAmount
              return matches(left, right, amount)
            }
            return !layer.negative || !matches(left, right, defaultAmount)
          })
          const domains = Array<number>(size ** 2).fill((1 << size) - 1)
          domains[a] = bit(left)
          domains[b] = bit(right)
          const actual = pairRules.every(rule => rule.support(domains) !== null)
          assert.equal(actual, expected, `${relation} ${a}:${b} with digits ${left}/${right}`)
        }
      }
    }
  }
})

test('layered Kropki definitions preserve the compact portable schema semantics', () => {
  for (const relation of ['consecutive', 'ratioTwo', 'difference', 'ratio'] as const) {
    for (let size = 3; size <= 9; size++) {
      let legacy: LatinKropki
      let layer: LatinKropkiLayer
      if (relation === 'consecutive' || relation === 'ratioTwo') {
        legacy = relation === 'consecutive'
          ? { consecutive: { pairs: [[0, 1], [2, 1]], negative: true } }
          : { ratioTwo: { pairs: [[0, 1], [2, 1]], negative: true } }
        layer = { relation, pairs: [[0, 1], [2, 1]], negative: true }
      } else {
        const pairs = [
          { cells: [0, 1] as [number, number], value: relation === 'difference' ? size - 1 : size },
          { cells: [2, 1] as [number, number], value: relation === 'difference' ? size - 2 : Math.max(2, size - 1) },
        ]
        legacy = relation === 'difference' ? { difference: { pairs, negative: true } } : { ratio: { pairs, negative: true } }
        layer = { relation, pairs, negative: true }
      }
      const summarize = (rules: ReturnType<typeof compileLatinKropki>) => rules
        .map(rule => `${relation}:${Math.min(...rule.cells)}:${Math.max(...rule.cells)}:${rule.label}`).sort()
      assert.deepEqual(summarize(compileLatinKropki(legacy, size)), summarize(compileLatinKropki({ layers: [layer] }, size)),
        `${relation} compact and layered schemas compile equivalently at size ${size}`)
    }
  }
})

test('large Coach layer collections stay valid while negative checks collapse by relation', () => {
  const layers: LatinKropkiLayer[] = Array.from({ length: 128 }, () => ({
    relation: 'consecutive', pairs: [], negative: true,
  }))
  const rules = compileLatinKropki({ layers }, 9)
  assert.equal(rules.length, 144)
  assert.ok(rules.every(rule => rule.label.startsWith('The unmarked edge')))
})

test('cached pair support matches all domain pairs for small Latin grids', () => {
  for (let size = 3; size <= 5; size++) {
    const cases: { relation: 'consecutive' | 'ratioTwo' | 'difference' | 'ratio'; amount: number; allowed: boolean }[] = []
    for (const relation of ['consecutive', 'ratioTwo'] as const) {
      const amount = relation === 'consecutive' ? 1 : 2
      cases.push({ relation, amount, allowed: true }, { relation, amount, allowed: false })
    }
    for (const relation of ['difference', 'ratio'] as const) {
      const minimum = relation === 'difference' ? 1 : 2
      const maximum = relation === 'difference' ? size - 1 : size
      for (let amount = minimum; amount <= maximum; amount++) cases.push({ relation, amount, allowed: true })
      cases.push({ relation, amount: relation === 'difference' ? 1 : 2, allowed: false })
    }

    for (const { relation, amount, allowed } of cases) {
      const numbered = relation === 'difference' || relation === 'ratio'
      const puzzle = numbered
        ? allowed ? { [relation]: { pairs: [{ cells: [0, 1] as [number, number], value: amount }] } }
          : { [relation]: { pairs: [], negative: true } }
        : allowed ? { [relation]: { pairs: [[0, 1] as [number, number]] } }
          : { [relation]: { pairs: [], negative: true } }
      const rule = compileLatinKropki(puzzle, size).find(candidate => candidate.cells[0] === 0 && candidate.cells[1] === 1)
      assert.ok(rule, `${relation} ${amount} ${allowed ? 'positive' : 'negative'} edge exists at size ${size}`)
      const digitMatches = (left: number, right: number) => relation === 'consecutive' || relation === 'difference'
        ? Math.abs(left - right) === amount
        : Math.max(left, right) === amount * Math.min(left, right)

      for (let left = 0; left < 1 << size; left++) {
        for (let right = 0; right < 1 << size; right++) {
          let supportedLeft = 0, supportedRight = 0
          for (let a = 1; a <= size; a++) {
            if (!(left & bit(a))) continue
            for (let b = 1; b <= size; b++) {
              if (right & bit(b) && digitMatches(a, b) === allowed) {
                supportedLeft |= bit(a)
                supportedRight |= bit(b)
              }
            }
          }
          const expected = supportedLeft && supportedRight ? [supportedLeft, supportedRight] : null
          const domains = Array<number>(size ** 2).fill((1 << size) - 1)
          domains[0] = left
          domains[1] = right
          assert.deepEqual(rule.support(domains), expected,
            `${relation} ${amount} ${allowed ? 'positive' : 'negative'} domains ${left}/${right} at size ${size}`)
        }
      }
    }
  }
})
