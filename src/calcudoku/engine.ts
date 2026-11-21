import { latinAntiKingRules, latinAntiKnightRules } from '../latin/chess-rules.ts'
import { adjacentClueRules } from '../latin/adjacent-clues.ts'
import { inequalityRules, type Inequality } from '../futoshiki/inequality-rules.ts'
import { bit, cellLabel, createLatinPuzzle, type LatinPuzzle, type LatinRule } from '../latin/engine.ts'
import { latinExtraRegionRules, latinUnnumberedCageRules } from '../latin/extra-regions.ts'
import { latinGlobalEntropyRules } from '../latin/global-entropy.ts'
import { lineSubsetRules } from '../latin/line-subsets.ts'
import { latinPathRules, type LatinClues } from '../latin/path-clues.ts'
import { latinQuadrupleRules } from '../latin/quadruples.ts'
import { latinParityRules } from '../latin/parity.ts'
import { tupleSupport } from '../latin/tuple-support.ts'
import { whispersRules } from '../latin/whispers.ts'
import { xWingRule } from '../latin/x-wing.ts'
import { cageLineRules } from './cage-line.ts'

export const operatorSymbol = { equal: '', add: '+', multiply: '×', subtract: '−', divide: '÷' } as const
export type CageOperator = keyof typeof operatorSymbol
export type Cage = { target: number; operator: CageOperator; cells: readonly number[]; distinct?: true }

export type CalcudokuPuzzle = LatinPuzzle & LatinClues & { cages: readonly Cage[]; inequalities: readonly Inequality[] }

const tupleTables = new Map<string, Uint16Array>()

function cageTuples(size: number, cage: Cage): Uint16Array {
  const { cells, operator, target } = cage
  // Four bits per cell identify earlier cage positions in the same row or column.
  let layout = 0
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i]
    for (let p = 0; p < i; p++) {
      const peer = cells[p]
      if (cage.distinct || cell % size === peer % size || Math.floor(cell / size) === Math.floor(peer / size)) {
        layout |= 1 << (4 * i + p)
      }
    }
  }
  const key = `${size}|${operator}|${target}|${cells.length}|${layout}`
  const cached = tupleTables.get(key)
  if (cached) return cached

  const tuple = new Uint16Array(cells.length)
  const result: number[] = []

  function build(index: number, total: number) {
    if (index === cells.length) {
      if (total === target) result.push(...tuple)
      return
    }

    let used = 0
    for (let peers = (layout >>> (4 * index)) & 15; peers; peers &= peers - 1) {
      used |= tuple[31 - Math.clz32(peers & -peers)]
    }
    for (let digit = 1; digit <= size; digit++) {
      const mask = bit(digit)
      if (used & mask) continue
      let next = digit
      if (operator === 'add') next = total + digit
      if (operator === 'multiply') next = total * digit
      if (operator === 'subtract' && index === 1) next = Math.abs(total - digit)
      if (operator === 'divide' && index === 1) next = Math.max(total, digit) / Math.min(total, digit)
      if (operator === 'add' && next + cells.length - index - 1 > target) break
      if (operator === 'multiply' && target % next !== 0) continue
      tuple[index] = mask
      build(index + 1, next)
    }
  }

  // A 9 × 9 alphabet needs nine bits per value.
  build(0, operator === 'multiply' ? 1 : 0)
  const tuples = Uint16Array.from(result)
  // Keep small tables for other cages with these rules.
  if (tuples.byteLength <= 16 * 1024) {
    if (tupleTables.size === 256) tupleTables.delete(tupleTables.keys().next().value!)
    tupleTables.set(key, tuples)
  }
  return tuples
}

function checkCages(size: number, cages: readonly Cage[]) {
  const covered = new Set<number>()
  for (const { operator, target, cells, distinct } of cages) {
    const minimum = operator === 'equal' || (operator === 'add' && distinct) ? 1 : 2
    const maximum = operator === 'equal' ? 1 : operator === 'add' || operator === 'multiply' ? 5 : 2
    if (!Object.hasOwn(operatorSymbol, operator) || !Number.isSafeInteger(target) || target <= 0 ||
      cells.length < minimum || cells.length > maximum) throw new Error('Invalid Calcudoku cage.')
    for (const cell of cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= size * size || covered.has(cell)) {
        throw new Error('Every Calcudoku cell needs exactly one cage.')
      }
      covered.add(cell)
    }
    const reached = new Set([cells[0]])
    for (const cell of reached) {
      for (const other of cells) {
        const distance = Math.abs(cell % size - other % size) +
          Math.abs(Math.floor(cell / size) - Math.floor(other / size))
        if (distance === 1) reached.add(other)
      }
    }
    if (reached.size !== cells.length) throw new Error('A Calcudoku cage must connect along cell edges.')
  }
  return covered.size === size * size
}

function fixedCageSum({ cells, operator, target }: Cage, tuples: Uint16Array) {
  if (operator === 'equal' || operator === 'add') return target
  let expected = 0
  for (let offset = 0; offset < tuples.length; offset += cells.length) {
    let sum = 0
    for (let i = 0; i < cells.length; i++) sum += 32 - Math.clz32(tuples[offset + i])
    if (offset === 0) expected = sum
    else if (sum !== expected) return undefined
  }
  return expected
}

function lineTotalRules(puzzle: LatinPuzzle, sums: readonly (readonly [Cage, number])[]): LatinRule[] {
  if (!sums.some(([cage]) => cage.cells.length > 1)) return []
  const { size } = puzzle
  const total = size * (size + 1) / 2
  const rules: LatinRule[] = []
  for (const line of puzzle.rules) {
    if (line.kind !== 'line') continue
    const contained = sums.filter(([cage]) => cage.cells.every(cell => line.cells.includes(cell)))
    if (!contained.some(([cage]) => cage.cells.length > 1)) continue
    const covered = new Set(contained.flatMap(([cage]) => cage.cells))
    const remaining = line.cells.filter(cell => !covered.has(cell))
    const accounted = contained.reduce((sum, [, cageSum]) => sum + cageSum, 0)
    if (!remaining.length) {
      if (accounted !== total) rules.push({
        kind: 'line-total',
        label: `${line.label} must total ${total}. Its cages add up to ${accounted}.`,
        cells: line.cells,
        support: () => null,
      })
      continue
    }
    // In a 3 × 3 grid, each two-digit sum already identifies its only pair.
    // Keep each remainder small so the sum table stays cheap to build and scan.
    if (size === 3 || remaining.length > 4) continue
    const target = total - accounted
    const support = tupleSupport(remaining, cageTuples(size, { cells: remaining, target, operator: 'add' }))
    const accountedNames = line.cells.filter(cell => covered.has(cell)).map(cell => cellLabel(cell, size)).join(', ')
    const names = remaining.map(cell => cellLabel(cell, size)).join(', ')
    const placement = remaining.length === 1 ? `${names} must be ${target}.` : `${names} must add up to ${target}.`
    rules.push({
      kind: 'line-total',
      label: `${line.label} totals ${total}. ${accountedNames} add up to ${accounted}. ${placement}`,
      cells: line.cells,
      support(domains) {
        const result = support(domains)
        return result && line.cells.map(cell => {
          const index = remaining.indexOf(cell)
          return index === -1 ? domains[cell] : result[index]
        })
      },
    })
  }
  return rules
}

export function createCalcudoku(
  size: number, cages: readonly Cage[], fixed?: readonly number[],
  {
    allowUncaged = false, inequalities = [], adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing,
  }: LatinClues & { allowUncaged?: boolean; inequalities?: readonly Inequality[] } = {},
): CalcudokuPuzzle {
  if (!Number.isInteger(size) || size < 3 || size > 9) throw new Error('Invalid Calcudoku size.')
  const coversGrid = checkCages(size, cages)
  if (!coversGrid && !allowUncaged) throw new Error('Every Calcudoku cell needs exactly one cage.')
  const givens = fixed ? [...fixed] : Array<number>(size * size).fill(0)
  const sums: [Cage, number][] = []
  const locks: LatinRule[] = []
  const cageRules = cages.map(cage => {
    const { cells, operator, target } = cage
    const tuples = cageTuples(size, cage)
    if (!tuples.length) throw new Error('A Calcudoku cage has no valid arithmetic combinations.')
    if (operator === 'equal') {
      if (givens[cells[0]] && givens[cells[0]] !== target) throw new Error('A Calcudoku given conflicts with its cage.')
      givens[cells[0]] = target
    }
    const sum = fixedCageSum(cage, tuples)
    if (sum !== undefined) sums.push([cage, sum])
    const rule = {
      label: `${target}${operatorSymbol[operator]} cage at ${cellLabel(Math.min(...cells), size)}${cage.distinct ? ' with no repeats' : ''}`,
      cells,
      support: tupleSupport(cells, tuples),
    }
    locks.push(...cageLineRules(size, rule, tuples))
    return rule
  })
  const rules = [...latinParityRules(size, parity), ...(antiKnight ? latinAntiKnightRules(size) : []), ...(antiKing ? latinAntiKingRules(size) : []), ...cageRules]
  const comparisons = inequalities.length ? inequalityRules(size, inequalities) : undefined
  if (comparisons) rules.push(...comparisons.basic)
  if (adjacentClues) rules.push(...adjacentClueRules(size, adjacentClues))
  const lines = whispers?.length ? whispersRules(size, whispers) : undefined
  if (lines) rules.push(...lines.basic)
  rules.push(
    ...latinPathRules(size, pathClues), ...latinExtraRegionRules(size, extraRegions), ...latinUnnumberedCageRules(size, unnumberedCages),
    ...latinGlobalEntropyRules(size, globalEntropy), ...latinQuadrupleRules(size, quadruples, extraRegions, unnumberedCages),
  )
  const puzzle = createLatinPuzzle(size, givens, rules)
  // The rows and the cages each partition the grid into known totals.
  if (coversGrid && sums.length === cages.length) {
    const accounted = sums.reduce((total, [, sum]) => total + sum, 0)
    const total = size * size * (size + 1) / 2
    if (accounted !== total) {
      const conflict: LatinRule = {
        kind: 'line-total',
        label: `The grid must total ${total}. Its cages add up to ${accounted}.`,
        cells: givens.map((_, cell) => cell),
        support: () => null,
      }
      return { ...puzzle, rules: [...puzzle.rules, conflict], cages, inequalities, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing }
    }
  }
  const derived = [...(lines?.advanced ?? []), ...lineTotalRules(puzzle, sums), ...lineSubsetRules(size), ...locks]
  if (comparisons) derived.push(...comparisons.sharedBounds, ...comparisons.lineRules)
  if (size >= 4) derived.push(xWingRule(size))
  if (comparisons) derived.push(...comparisons.lineMatching)
  return { ...puzzle, rules: [...puzzle.rules, ...derived], cages, inequalities, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing }
}
