import type { AdjacentClues } from './adjacent-clues.ts'
import { arrowRule, arrowRuleNote, arrowTechnique } from './arrow.ts'
import { bit, cellLabel, type LatinHint, type LatinRule } from './engine.ts'
import { extraRegionTechnique } from './extra-regions.ts'
import { betweenRuleNote, betweenTechnique, endpointLineRule, lockoutRuleNote, lockoutTechnique } from './endpoint-lines.ts'
import { renbanRule, renbanRuleNote, renbanTechnique } from './renban.ts'
import type { WhisperLine } from './whispers.ts'
import { maxPathCells, maxPathClueTokenLength } from '../number-puzzles/import-token-limits.ts'

const pathClueKinds = { palindrome: 'p', consecutive: 'c', thermometer: 't', arrow: 'a', renban: 'r', lockout: 'k', between: 'b' } as const

type LatinPathClueType = keyof typeof pathClueKinds
const pathClueTypes = new Map<string, LatinPathClueType>(Object.entries(pathClueKinds).map(([type, code]) => [code, type as LatinPathClueType]))

export type LatinPathClue = {
  type: LatinPathClueType
  cells: readonly number[]
  segments?: readonly (readonly number[])[]
}

export type LatinClues = {
  adjacentClues?: AdjacentClues
  whispers?: readonly WhisperLine[]
  pathClues?: readonly LatinPathClue[]
  extraRegions?: readonly (readonly number[])[]
}

export const pathClueNames = { palindrome: 'Palindrome Line', consecutive: 'Consecutive Line', thermometer: 'Thermometer', arrow: arrowTechnique, renban: renbanTechnique, lockout: lockoutTechnique, between: betweenTechnique } as const

export function latinClueTechnique(kind: LatinRule['kind']) {
  if (kind === 'extra-region') return extraRegionTechnique
  if (kind && Object.hasOwn(pathClueNames, kind)) return pathClueNames[kind as LatinPathClueType]
}

export function supportingLatinClueTechniques(rules: LatinHint['rules']) {
  let techniques: Set<string> | undefined
  for (const { kind } of rules) {
    const technique = latinClueTechnique(kind)
    if (technique) (techniques ??= new Set()).add(technique)
  }
  return techniques && [...techniques]
}

export const pathClueNotes = {
  palindrome: 'Read a gray Palindrome Line from either end. The sequence of digits must be the same.',
  consecutive: 'Digits on a dashed green Consecutive Line go up by one at each step or down by one at each step.',
  thermometer: 'Digits strictly increase from the bulb to the tip of each Thermometer.',
  arrow: arrowRuleNote,
  renban: renbanRuleNote,
  lockout: lockoutRuleNote,
  between: betweenRuleNote,
} as const

export function latinPathRules(size: number, clues: readonly LatinPathClue[] = []): LatinRule[] {
  let count = 0
  return clues.flatMap(({ type, cells, segments }) => {
    const endpointLine = type === 'between' || type === 'lockout'
    const drawing = segments ?? [cells]
    count += cells.length + (segments?.reduce((total, path) => total + path.length, 0) ?? 0)
    const members = new Set(cells)
    if (count > maxPathCells || !Object.hasOwn(pathClueNames, type) || !cells.length ||
      members.size !== cells.length || cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2) ||
      !drawing.length || drawing.some(path => !path.length || path.some((cell, index) => !members.has(cell) || cell === path[index - 1])) ||
      (type === 'arrow' && (cells.length < 2 || cells.length > size + 1)) ||
      (endpointLine && cells.length < (type === 'between' ? 3 : 2)) ||
      segments && (type === 'thermometer' || type === 'arrow' || endpointLine || new Set(segments.flat()).size !== cells.length)) {
      throw new Error('This puzzle has invalid line clues.')
    }
    if (type === 'arrow') return [arrowRule(size, cells)]
    if (endpointLine) return [endpointLineRule(size, cells, type)]
    if (type === 'thermometer') return [thermometerRule(size, cells)]
    if (type === 'renban') return cells.length > 1 ? [renbanRule(size, cells)] : []
    if (type === 'palindrome') {
      return cells.slice(0, Math.floor(cells.length / 2)).map((a, index): LatinRule => {
        const b = cells[cells.length - index - 1]
        return {
          kind: type, cells: [a, b],
          label: `The Palindrome Line pairs ${cellLabel(a, size)} with ${cellLabel(b, size)}. They need the same digit.`,
          support(domains) {
            const common = domains[a] & domains[b]
            return common ? [common, common] : null
          },
        }
      })
    }
    if (cells.length < 2) return []
    // Coach requires distinct digits per connected component and a unit step
    // along each original segment. Their graph must fit on one number line.
    const run = segments ? orderedRun(cells, segments) : cells
    const options = run && run.length <= size ? consecutiveOptions(size, run.length) : []
    return [{
      kind: type, cells: run ?? cells,
      label: `The Consecutive Line from ${cellLabel(run?.[0] ?? cells[0], size)} to ${cellLabel(run?.at(-1) ?? cells.at(-1)!, size)} must go up or down by one at every step.`,
      support(domains) {
        if (!run) return null
        const supported = Array<number>(run.length).fill(0)
        for (const option of options) {
          if (run.every((cell, index) => domains[cell] & option[index])) {
            option.forEach((digit, index) => { supported[index] |= digit })
          }
        }
        return supported[0] ? supported : null
      },
    }]
  })
}

function thermometerRule(size: number, cells: readonly number[]): LatinRule {
  return {
    kind: 'thermometer', cells,
    label: `Digits must strictly increase from ${cellLabel(cells[0], size)} to ${cellLabel(cells.at(-1)!, size)} along the Thermometer.`,
    support(domains) {
      const supported = new Array<number>(cells.length)
      let upper = (1 << size) - 1
      // The largest possible digit at each step leaves the most room for its predecessors.
      for (let index = cells.length - 1; index >= 0; index--) {
        const mask = domains[cells[index]] & upper
        if (!mask) return null
        supported[index] = mask
        const highest = 1 << (31 - Math.clz32(mask))
        upper = highest - 1
      }
      let lower = -1
      // The smallest possible digit at each step leaves the most room for its successors.
      for (let index = 0; index < cells.length; index++) {
        const mask = supported[index] & lower
        if (!mask) return null
        supported[index] = mask
        const lowest = mask & -mask
        lower = ~(2 * lowest - 1)
      }
      return supported
    },
  }
}

function orderedRun(cells: readonly number[], segments: readonly (readonly number[])[]) {
  const neighbors = new Map(cells.map(cell => [cell, new Set<number>()]))
  for (const path of segments) for (let index = 1; index < path.length; index++) {
    neighbors.get(path[index - 1])!.add(path[index])
    neighbors.get(path[index])!.add(path[index - 1])
  }
  if ([...neighbors.values()].some(next => next.size > 2)) return
  let cell = cells.find(value => neighbors.get(value)!.size === 1)
  let previous: number | undefined
  const run: number[] = []
  while (cell !== undefined && run.length < cells.length) {
    run.push(cell)
    const next: number | undefined = [...neighbors.get(cell)!].find(value => value !== previous)
    previous = cell
    cell = next
  }
  if (cell === undefined && run.length === cells.length) return run
}

const optionsBySize = new Map<number, number[][]>()
function consecutiveOptions(size: number, length: number) {
  const key = size * 10 + length
  const cached = optionsBySize.get(key)
  if (cached) return cached
  const options: number[][] = []
  for (let first = 1; first <= size - length + 1; first++) {
    const up = Array.from({ length }, (_, offset) => bit(first + offset))
    options.push(up, up.slice().reverse())
  }
  optionsBySize.set(key, options)
  return options
}

function encodePath(cells: readonly number[]) {
  const pair = (value: number) => value.toString(36).padStart(2, '0')
  return pair(cells.length) + cells.map(pair).join('')
}

export function encodeLatinPathClues(clues?: readonly LatinPathClue[]) {
  if (!clues?.length) return ''
  return '.l' + clues.map(({ type, cells, segments }) => {
    const paths = segments ?? []
    const kind = pathClueKinds[type]
    return kind + paths.length.toString(36).padStart(2, '0') + encodePath(cells) + paths.map(encodePath).join('')
  }).join('')
}

export function readLatinPathClues(encoded: string): LatinPathClue[] {
  const invalid = () => new Error('This puzzle link has invalid line clues.')
  if (encoded.length > maxPathClueTokenLength || !/^[0-9a-z]+$/.test(encoded)) throw invalid()
  let offset = 0
  const readPair = () => {
    if (offset + 2 > encoded.length) throw invalid()
    const pair = Number.parseInt(encoded.slice(offset, offset + 2), 36)
    offset += 2
    return pair
  }
  const readPath = () => {
    const length = readPair()
    if (!length || offset + length * 2 > encoded.length) throw invalid()
    return Array.from({ length }, readPair)
  }
  const clues: LatinPathClue[] = []
  while (offset < encoded.length) {
    const type = pathClueTypes.get(encoded[offset++])
    if (!type) throw invalid()
    const count = readPair()
    const cells = readPath()
    const segments = count ? Array.from({ length: count }, readPath) : undefined
    clues.push({ type, cells, ...(segments && { segments }) })
  }
  return clues
}
