import { bit, cellLabel, latinPairSupport, type LatinRule } from './engine.ts'
import { maxWhisperCells, maxWhisperTokenLength } from '../number-puzzles/import-token-limits.ts'

export type WhisperLine = { cells: readonly number[]; minDifference: number }

export const whispersTechnique = 'Whispers'
export const whispersRuleNote = 'Two digits next to each other along a green line must differ by at least the number on the line.'

export function whispersRules(size: number, lines: readonly WhisperLine[]) {
  if (lines.reduce((total, line) => total + line.cells.length, 0) > maxWhisperCells) {
    throw new Error('This puzzle has too many Whispers line cells.')
  }
  const tables = new Map<number, readonly number[]>()
  const edges = new Map<number, { cells: [number, number]; minDifference: number }>()
  for (const { cells, minDifference } of lines) {
    if (cells.length < 2 || cells.length > size ** 2 + 1 || !Number.isInteger(minDifference) ||
      minDifference < 1 || minDifference >= size ||
      cells.some((cell, index) => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || cell === cells[index - 1])) {
      throw new Error('This puzzle has an invalid Whispers line.')
    }
    if (!tables.has(minDifference)) {
      const masks = Array<number>(size + 1).fill(0)
      for (let x = 1; x <= size; x++) for (let y = x + minDifference; y <= size; y++) {
        masks[x] |= bit(y)
        masks[y] |= bit(x)
      }
      tables.set(minDifference, masks)
    }
    for (let index = 1; index < cells.length; index++) {
      const a = Math.min(cells[index - 1], cells[index])
      const b = Math.max(cells[index - 1], cells[index])
      const key = a * size ** 2 + b
      if ((edges.get(key)?.minDifference ?? 0) < minDifference) edges.set(key, { cells: [a, b], minDifference })
    }
  }
  const basic: LatinRule[] = Array.from(edges.values(), ({ cells: [a, b], minDifference }) => {
    const allowed = tables.get(minDifference)!
    return {
      kind: 'whispers',
      cells: [a, b],
      label: `On the Whispers line, ${cellLabel(a, size)} and ${cellLabel(b, size)} must differ by at least ${minDifference}.`,
      support: domains => latinPairSupport(domains[a], domains[b], allowed),
    }
  })

  const links: Map<number, readonly number[]>[] = Array.from({ length: size ** 2 }, () => new Map())
  for (const { cells: [a, b], minDifference } of edges.values()) {
    const allowed = tables.get(minDifference)!
    links[a].set(b, allowed)
    links[b].set(a, allowed)
  }
  const sharedEnds: LatinRule[] = []
  for (const [center, neighbors] of links.entries()) {
    const neighborsOnLine = new Map<string, number[]>()
    for (const cell of neighbors.keys()) {
      for (const line of [`row ${Math.floor(cell / size) + 1}`, `column ${cell % size + 1}`]) {
        const cells = neighborsOnLine.get(line) ?? []
        cells.push(cell)
        neighborsOnLine.set(line, cells)
      }
    }
    for (const [line, cells] of neighborsOnLine) for (const [index, a] of cells.entries()) {
      for (const b of cells.slice(index + 1)) {
        const left = neighbors.get(a)!, right = neighbors.get(b)!
        const label = `${cellLabel(a, size)} and ${cellLabel(b, size)} need different digits in ${line}. Both connect to ${cellLabel(center, size)} on Whispers lines.`
        sharedEnds.push({
          kind: 'whispers',
          label,
          cells: [a, center, b],
          afterBasic: true,
          support(domains, explain) {
            let first = 0, middle = 0, last = 0, excluded = 0
            for (let digits = domains[center]; digits; digits &= digits - 1) {
              const digit = digits & -digits
              const value = 32 - Math.clz32(digit)
              const x = domains[a] & left[value], y = domains[b] & right[value]
              const supportX = y & (y - 1) ? x : x & ~y
              const supportY = x & (x - 1) ? y : y & ~x
              if (!supportX || !supportY) {
                excluded ||= x && x === y ? value : 0
                continue
              }
              middle |= digit
              first |= supportX
              last |= supportY
            }
            if (!middle) return null
            if (explain && excluded) {
              const same = domains[a] & left[excluded]
              explain({
                cells: [a, center, b],
                label: `${label} If ${cellLabel(center, size)} is ${excluded}, both ends must be ${32 - Math.clz32(same)}.`,
              })
            }
            return [first, middle, last]
          },
        })
      }
    }
  }
  return { basic, advanced: sharedEnds }
}

export function encodeWhispers(lines?: readonly WhisperLine[]) {
  if (!lines?.length) return ''
  return '.w' + lines.map(({ cells, minDifference }) => minDifference.toString(36) +
    cells.length.toString(36).padStart(2, '0') +
    cells.map(cell => cell.toString(36).padStart(2, '0')).join('')).join('')
}

export function readWhispers(encoded: string): WhisperLine[] {
  const invalid = () => new Error('This puzzle link has invalid Whispers lines.')
  if (encoded.length > maxWhisperTokenLength || !/^[0-9a-z]+$/.test(encoded)) throw invalid()
  const lines: WhisperLine[] = []
  for (let offset = 0; offset < encoded.length;) {
    const minDifference = Number.parseInt(encoded[offset], 36)
    const length = Number.parseInt(encoded.slice(offset + 1, offset + 3), 36)
    const start = offset + 3, end = start + 2 * length
    if (!(length >= 2) || end > encoded.length) throw invalid()
    const cells: number[] = []
    for (let index = start; index < end; index += 2) cells.push(Number.parseInt(encoded.slice(index, index + 2), 36))
    lines.push({ cells, minDifference })
    offset = end
  }
  return lines
}
