import { bit, cellLabel, createLatinPuzzle, type LatinPuzzle } from '../latin/engine.ts'
import { latinParityRules, type LatinParity } from '../latin/parity.ts'

export const operatorSymbol = { equal: '', add: '+', multiply: '×', subtract: '−', divide: '÷' } as const
export type CageOperator = keyof typeof operatorSymbol
export type Cage = { target: number; operator: CageOperator; cells: readonly number[]; distinct?: true }

export type CalcudokuPuzzle = LatinPuzzle & { cages: readonly Cage[]; parity: readonly LatinParity[] }

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
  for (const { operator, target, cells } of cages) {
    const minimum = operator === 'equal' ? 1 : 2
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
  if (covered.size !== size * size) throw new Error('Every Calcudoku cell needs exactly one cage.')
}

export function createCalcudoku(size: number, cages: readonly Cage[], options: { givens?: readonly number[]; parity?: readonly LatinParity[] } = {}): CalcudokuPuzzle {
  if (!Number.isInteger(size) || size < 3 || size > 9) throw new Error('Invalid Calcudoku size.')
  const parity = options.parity ?? []
  const givens = options.givens ? [...options.givens] : Array<number>(size * size).fill(0)
  if (givens.length !== size * size || givens.some(value => !Number.isInteger(value) || value < 0 || value > size)) {
    throw new Error('Invalid Calcudoku givens.')
  }
  checkCages(size, cages)
  const rules = cages.map(cage => {
    const { cells, operator, target } = cage
    const tuples = cageTuples(size, cage)
    if (!tuples.length) throw new Error('A Calcudoku cage has no valid arithmetic combinations.')
    if (operator === 'equal') {
      if (givens[cells[0]] && givens[cells[0]] !== target) throw new Error('A Calcudoku given conflicts with its cage.')
      givens[cells[0]] = target
    }
    const length = cells.length
    const cache = new Map<number, readonly number[] | null>()
    return {
      label: `${target}${operatorSymbol[operator]} cage at ${cellLabel(Math.min(...cells), size)}`,
      cells,
      support(domains: readonly number[]) {
        const masks = cells.map(cell => domains[cell])
        // A digit mask uses nine bits. Five masks fit in an exact JS number.
        const key = masks.reduce((encoded, mask) => encoded * 512 + mask, 0)
        const cached = cache.get(key)
        if (cached !== undefined) return cached

        const supported = masks.map(() => 0)
        tuple: for (let offset = 0; offset < tuples.length; offset += length) {
          for (let i = 0; i < length; i++) {
            if (!(masks[i] & tuples[offset + i])) continue tuple
          }
          for (let i = 0; i < length; i++) supported[i] |= tuples[offset + i]
          if (supported.every((mask, i) => mask === masks[i])) break
        }
        const result = supported[0] ? supported : null
        if (cache.size >= 128) cache.clear()
        cache.set(key, result)
        return result
      },
    }
  })
  return { ...createLatinPuzzle(size, givens, [...rules, ...latinParityRules(size, parity)]), cages, parity }
}
