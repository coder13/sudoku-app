import { bit, cellLabel, latinPairSupport, type LatinRule } from './engine.ts'
import { maxAdjacentClueTokenLength } from '../number-puzzles/import-token-limits.ts'

const kinds = ['difference', 'ratio', 'sum'] as const
export type AdjacentClue = {
  type: typeof kinds[number]
  value: number
  cells: readonly [number, number]
}
export type AdjacentClues = {
  marks: readonly AdjacentClue[]
  negativeDifference?: true
  negativeRatio?: true
}

export const adjacentClueTechnique = 'Adjacent clues'

function relation({ type, value }: AdjacentClue, x: number, y: number) {
  if (type === 'difference') return Math.abs(x - y) === value
  if (type === 'ratio') return Math.max(x, y) === value * Math.min(x, y)
  return x + y === value
}

export function adjacentClueLabel({ type, value, cells }: AdjacentClue, size: number) {
  const [a, b] = cells
  const pair = `${cellLabel(Math.min(a, b), size)} and ${cellLabel(Math.max(a, b), size)}`
  if (type === 'difference') return `${pair} differ by ${value}`
  if (type === 'ratio') return `${pair} have a 1:${value} ratio`
  return `${pair} add up to ${value}`
}

export function adjacentClueNotes({ marks, negativeDifference, negativeRatio }: AdjacentClues) {
  const notes: string[] = []
  if (marks.some(mark => mark.type === 'difference')) notes.push('A white dot gives the difference between two digits. An unnumbered white dot means a difference of 1.')
  if (marks.some(mark => mark.type === 'ratio')) notes.push('A black dot gives the ratio between two digits. An unnumbered black dot means a 1:2 ratio.')
  if (marks.some(mark => mark.type === 'sum')) notes.push('A Roman numeral gives the total of two digits. For example, III means 3.')
  if (negativeDifference) notes.push('Digits across an edge without a white dot cannot differ by 1.')
  if (negativeRatio) notes.push('Digits across an edge without a black dot cannot have a 1:2 ratio.')
  return notes
}

export function adjacentClueRules(size: number, { marks, negativeDifference, negativeRatio }: AdjacentClues): LatinRule[] {
  const edges = new Map<number, AdjacentClue[]>()
  for (const mark of marks) {
    const { type, value } = mark
    const [first, second] = mark.cells
    const a = Math.min(first, second), b = Math.max(first, second)
    const minimum = type === 'sum' ? 3 : type === 'ratio' ? 2 : 1
    const maximum = type === 'sum' ? 2 * size - 1 : type === 'ratio' ? size : size - 1
    if (!kinds.includes(type) || !Number.isInteger(value) || value < minimum || value > maximum ||
      !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= size ** 2 ||
      (b - a !== size && (b - a !== 1 || b % size === 0))) {
      throw new Error('This puzzle has an invalid adjacent clue.')
    }
    const key = a * size ** 2 + b
    const clues = edges.get(key) ?? []
    if (clues.some(clue => clue.type === type)) throw new Error('Use one clue of each type per cell edge.')
    clues.push(mark)
    edges.set(key, clues)
  }

  const tables = new Map<string, number[]>()
  const rules: LatinRule[] = []
  function addRule(a: number, b: number, clues: readonly AdjacentClue[]) {
    const forbidsDifference = negativeDifference && !clues.some(clue => clue.type === 'difference')
    const forbidsRatio = negativeRatio && !clues.some(clue => clue.type === 'ratio')
    if (!clues.length && !forbidsDifference && !forbidsRatio) return
    const key = JSON.stringify([clues.map(({ type, value }) => [type, value]), forbidsDifference, forbidsRatio])
    let table = tables.get(key)
    if (!table) {
      table = Array<number>(size + 1).fill(0)
      for (let x = 1; x <= size; x++) {
        for (let y = x + 1; y <= size; y++) {
          if ((forbidsDifference && y - x === 1) || (forbidsRatio && y === 2 * x) ||
            !clues.every(clue => relation(clue, x, y))) continue
          table[x] |= bit(y)
          table[y] |= bit(x)
        }
      }
      tables.set(key, table)
    }
    const allowed = table
    const labels = clues.map(clue => adjacentClueLabel(clue, size) + '.')
    const pair = `${cellLabel(a, size)} and ${cellLabel(b, size)}`
    if (forbidsDifference) labels.push(`${pair} share an edge without a white dot, so their digits cannot differ by 1.`)
    if (forbidsRatio) labels.push(`${pair} share an edge without a black dot, so their digits cannot have a 1:2 ratio.`)
    rules.push({
      kind: 'adjacent-clue',
      label: labels.join(' '),
      cells: [a, b],
      support: domains => latinPairSupport(domains[a], domains[b], allowed),
    })
  }
  if (negativeDifference || negativeRatio) {
    for (let a = 0; a < size ** 2; a++) {
      if (a % size < size - 1) addRule(a, a + 1, edges.get(a * size ** 2 + a + 1) ?? [])
      if (a < size * (size - 1)) addRule(a, a + size, edges.get(a * size ** 2 + a + size) ?? [])
    }
  } else {
    for (const [key, clues] of edges) addRule(Math.floor(key / size ** 2), key % size ** 2, clues)
  }
  return rules
}

export function encodeAdjacentClues(clues?: AdjacentClues) {
  if (!clues || !clues.marks.length && !clues.negativeDifference && !clues.negativeRatio) return ''
  const flags = (clues.negativeDifference ? 1 : 0) | (clues.negativeRatio ? 2 : 0)
  const marks = clues.marks.map(({ type, value, cells: [a, b] }) => {
    const indices = [Math.min(a, b), Math.max(a, b)].map(cell => cell.toString(36).padStart(2, '0')).join('')
    return kinds.indexOf(type) + value.toString(36) + indices
  })
  return '.d' + flags + marks.sort().join('')
}

export function readAdjacentClues(encoded: string): AdjacentClues {
  if (encoded.length > maxAdjacentClueTokenLength || !/^[0-3](?:[0-2][0-9a-z]{5})*$/.test(encoded)) {
    throw new Error('This puzzle link has invalid adjacent clues.')
  }
  const flags = Number(encoded[0])
  const marks: AdjacentClue[] = []
  for (let offset = 1; offset < encoded.length; offset += 6) {
    marks.push({
      type: kinds[Number(encoded[offset])],
      value: Number.parseInt(encoded[offset + 1], 36),
      cells: [
        Number.parseInt(encoded.slice(offset + 2, offset + 4), 36),
        Number.parseInt(encoded.slice(offset + 4, offset + 6), 36),
      ],
    })
  }
  return { marks, ...(flags & 1 && { negativeDifference: true }), ...(flags & 2 && { negativeRatio: true }) }
}
