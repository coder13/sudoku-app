import { bit, cellLabel, type LatinRule } from './engine.ts'

const MAX_LATIN_KROPKI_LAYERS = 512

export type LatinMarkedPairs = {
  pairs?: readonly (readonly [number, number])[]
  negative?: boolean
}

export type LatinNumberedPairs = {
  pairs?: readonly { cells: readonly [number, number]; value: number }[]
  negative?: boolean
}

export type LatinKropkiLayer =
  | { relation: 'consecutive'; pairs?: readonly (readonly [number, number])[]; negative?: boolean }
  | { relation: 'ratioTwo'; pairs?: readonly (readonly [number, number])[]; negative?: boolean }
  | { relation: 'difference'; pairs?: readonly { cells: readonly [number, number]; value: number }[]; negative?: boolean }
  | { relation: 'ratio'; pairs?: readonly { cells: readonly [number, number]; value: number }[]; negative?: boolean }

export type LatinKropki = {
  consecutive?: LatinMarkedPairs
  ratioTwo?: LatinMarkedPairs
  difference?: LatinNumberedPairs
  ratio?: LatinNumberedPairs
  layers?: readonly LatinKropkiLayer[]
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validMarks(value: unknown, size: number, numbered = false, minimum = 1, maximum = size): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const marks = value as Record<string, unknown>
  if (Object.keys(marks).some(key => key !== 'pairs' && key !== 'negative') ||
    marks.negative !== undefined && typeof marks.negative !== 'boolean' ||
    marks.pairs !== undefined && !Array.isArray(marks.pairs)) return false
  if (!Array.isArray(marks.pairs)) return true
  if (marks.pairs.length > 2 * size * (size - 1)) return false
  const seen = new Set<string>()
  return marks.pairs.every((pair: unknown) => {
    const cells = numbered && record(pair) && Array.isArray(pair.cells) ? pair.cells : !numbered && Array.isArray(pair) ? pair : undefined
    if (!cells || cells.length !== 2) return false
    if (numbered && (!record(pair) || Object.keys(pair).some(key => key !== 'cells' && key !== 'value') ||
        !Number.isInteger(pair.value) || Number(pair.value) < minimum || Number(pair.value) > maximum) ||
      !numbered && (!Array.isArray(pair) || Object.keys(pair).some(key => key !== '0' && key !== '1'))) return false
    if (!cells.every((cell: unknown) => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) < size ** 2)) return false
    const [a, b] = cells as [number, number]
    if (a === b || Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) !== 1) return false
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function validLatinKropki(value: unknown, size: number): value is LatinKropki {
  if (!Number.isInteger(size) || size < 3 || size > 9 || !value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['consecutive', 'ratioTwo', 'difference', 'ratio', 'layers'].includes(key))) return false
  const marks = value as Record<string, unknown>
  return (marks.consecutive === undefined || validMarks(marks.consecutive, size)) &&
    (marks.ratioTwo === undefined || validMarks(marks.ratioTwo, size)) &&
    (marks.difference === undefined || validMarks(marks.difference, size, true, 1, size - 1)) &&
    (marks.ratio === undefined || validMarks(marks.ratio, size, true, 2, size)) &&
    (marks.layers === undefined || Array.isArray(marks.layers) && marks.layers.length <= MAX_LATIN_KROPKI_LAYERS && marks.layers.every(layer => {
      if (!record(layer) || Object.keys(layer).some(key => !['relation', 'pairs', 'negative'].includes(key)) ||
        !['consecutive', 'ratioTwo', 'difference', 'ratio'].includes(String(layer.relation)) ||
        layer.negative !== undefined && typeof layer.negative !== 'boolean') return false
      const relation = layer.relation as LatinKropkiLayer['relation']
      return validMarks({ pairs: layer.pairs, negative: layer.negative }, size,
        relation === 'difference' || relation === 'ratio', relation === 'ratio' ? 2 : 1,
        relation === 'difference' ? size - 1 : size)
    }))
}

function matches(a: number, b: number, relation: 'consecutive' | 'ratioTwo' | 'difference' | 'ratio', amount: number) {
  if (relation === 'consecutive' || relation === 'difference') return Math.abs(a - b) === amount
  return Math.max(a, b) === amount * Math.min(a, b)
}

type RelationSupportMasks = { digits: Uint16Array; domains: Uint16Array }
const compatibilityMasks = new Map<string, RelationSupportMasks>()

function relationMasks(size: number, relation: 'consecutive' | 'ratioTwo' | 'difference' | 'ratio', amount: number, allowed: boolean) {
  const key = `${size}:${relation}:${amount}:${allowed}`
  const cached = compatibilityMasks.get(key)
  if (cached) return cached
  const digits = new Uint16Array(size + 1)
  for (let digit = 1; digit <= size; digit++) {
    for (let other = 1; other <= size; other++) {
      if (matches(digit, other, relation, amount) === allowed) digits[digit] |= bit(other)
    }
  }
  const domains = new Uint16Array(1 << size)
  for (let domain = 0; domain < domains.length; domain++) {
    for (let digit = 1; digit <= size; digit++) {
      if (digits[digit] & domain) domains[domain] |= bit(digit)
    }
  }
  const supportMasks = { digits, domains }
  compatibilityMasks.set(key, supportMasks)
  return supportMasks
}

function pairRule(pair: readonly [number, number], relation: 'consecutive' | 'ratioTwo' | 'difference' | 'ratio', amount: number, size: number, allowed: boolean): LatinRule {
  const [a, b] = pair
  const compatible = relationMasks(size, relation, amount, allowed)
  const relationName = relation === 'consecutive' ? 'consecutive'
    : relation === 'ratioTwo' ? 'in a 1:2 ratio'
      : relation === 'difference' ? `separated by exactly ${amount}` : `in a 1:${amount} ratio`
  const relationship = allowed ? `requires the digits to be ${relationName}` : `does not allow digits that are ${relationName}`
  const label = allowed
    ? `The ${relation === 'consecutive' ? 'white' : relation === 'ratioTwo' ? 'black' : `numbered ${relation === 'difference' ? 'Difference' : 'Ratio'}`} mark between ${cellLabel(a, size)} and ${cellLabel(b, size)} ${relationship}.`
    : `The unmarked edge between ${cellLabel(a, size)} and ${cellLabel(b, size)} ${relationship}.`
  return {
    kind: relation === 'difference' || relation === 'ratio' ? 'labeled-dots' : 'kropki',
    cells: pair,
    label,
    support(domains) {
      const left = domains[a]
      const right = domains[b]
      if (!left || !right) return null
      const supportedLeft = left & compatible.domains[right]
      const supportedRight = right & compatible.domains[left]
      return supportedLeft && supportedRight ? [supportedLeft, supportedRight] : null
    },
  }
}

function commonNegativeExemptions<T>(
  configurations: readonly { marks: { pairs?: readonly T[]; negative?: boolean } }[],
  keyFor: (pair: T) => string,
) {
  const negative = configurations.filter(({ marks }) => marks.negative)
  if (!negative.length) return
  // An edge is exempt only when every negative layer marks it.
  const exempt = new Set((negative[0].marks.pairs ?? []).map(keyFor))
  for (const { marks } of negative.slice(1)) {
    const named = new Set((marks.pairs ?? []).map(keyFor))
    for (const edge of exempt) if (!named.has(edge)) exempt.delete(edge)
  }
  return exempt
}

export function compileLatinKropki(value: LatinKropki, size: number): LatinRule[] {
  if (!validLatinKropki(value, size)) throw new Error('This Latin puzzle has invalid Kropki clues.')
  const rules: LatinRule[] = []
  type MarkedConfig = { relation: 'consecutive' | 'ratioTwo'; marks: LatinMarkedPairs }
  type NumberedConfig = { relation: 'difference' | 'ratio'; marks: LatinNumberedPairs }
  const marked: MarkedConfig[] = [
    ...(value.consecutive ? [{ relation: 'consecutive' as const, marks: value.consecutive }] : []),
    ...(value.ratioTwo ? [{ relation: 'ratioTwo' as const, marks: value.ratioTwo }] : []),
  ]
  const numbered: NumberedConfig[] = [
    ...(value.difference ? [{ relation: 'difference' as const, marks: value.difference }] : []),
    ...(value.ratio ? [{ relation: 'ratio' as const, marks: value.ratio }] : []),
  ]
  for (const layer of value.layers ?? []) {
    if (layer.relation === 'consecutive' || layer.relation === 'ratioTwo') marked.push({ relation: layer.relation, marks: layer })
    else numbered.push({ relation: layer.relation, marks: layer })
  }
  const allEdges = function* () {
    for (let cell = 0; cell < size ** 2; cell++) {
      for (const other of [cell + 1, cell + size]) {
        if (other >= size ** 2 || other === cell + 1 && cell % size === size - 1) continue
        yield [cell, other] as const
      }
    }
  }
  const pairKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`
  for (const relation of ['consecutive', 'ratioTwo'] as const) {
    const configurations = marked.filter(entry => entry.relation === relation)
    const amount = relation === 'consecutive' ? 1 : 2
    const positivePairs = new Set<string>()
    for (const { marks } of configurations) {
      for (const pair of marks.pairs ?? []) {
        const key = pairKey(pair[0], pair[1])
        if (positivePairs.has(key)) continue
        positivePairs.add(key)
        rules.push(pairRule(pair, relation, amount, size, true))
      }
    }
    const exempt = commonNegativeExemptions(configurations, ([a, b]) => pairKey(a, b))
    if (exempt) {
      for (const [a, b] of allEdges()) {
        if (!exempt.has(pairKey(a, b))) rules.push(pairRule([a, b], relation, amount, size, false))
      }
    }
  }
  for (const relation of ['difference', 'ratio'] as const) {
    const configurations = numbered.filter(entry => entry.relation === relation)
    const positivePairs = new Set<string>()
    for (const { marks } of configurations) {
      for (const { cells, value: amount } of marks.pairs ?? []) {
        const key = `${pairKey(cells[0], cells[1])}:${amount}`
        if (positivePairs.has(key)) continue
        positivePairs.add(key)
        rules.push(pairRule(cells, relation, amount, size, true))
      }
    }
    const exempt = commonNegativeExemptions(configurations, ({ cells: [a, b] }) => pairKey(a, b))
    if (exempt) {
      const negativeAmount = relation === 'difference' ? 1 : 2
      for (const [a, b] of allEdges()) {
        if (!exempt.has(pairKey(a, b))) rules.push(pairRule([a, b], relation, negativeAmount, size, false))
      }
    }
  }
  return rules
}
