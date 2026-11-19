import { bit, cellLabel, createLatinPuzzle, type LatinPuzzle } from '../latin/engine.ts'

export const operatorSymbol = { equal: '', add: '+', multiply: '×', subtract: '−', divide: '÷' } as const
export type CageOperator = keyof typeof operatorSymbol
export type Cage = { target: number; operator: CageOperator; cells: readonly number[] }

export type CalcudokuPuzzle = LatinPuzzle & { cages: readonly Cage[] }

function cageTuples(size: number, cage: Cage): Uint16Array {
  const { cells, operator, target } = cage
  const peers = cells.map((cell, i) => cells.slice(0, i).flatMap((peer, p) =>
    peer % size === cell % size || Math.floor(peer / size) === Math.floor(cell / size) ? [p] : []))
  const tuple = new Uint16Array(cells.length)
  const result: number[] = []

  function build(index: number, total: number) {
    if (index === cells.length) {
      if (total === target) result.push(...tuple)
      return
    }

    for (let digit = 1; digit <= size; digit++) {
      const mask = bit(digit)
      if (peers[index].some(peer => tuple[peer] === mask)) continue
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
  return Uint16Array.from(result)
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

export function createCalcudoku(size: number, cages: readonly Cage[]): CalcudokuPuzzle {
  if (!Number.isInteger(size) || size < 3 || size > 9) throw new Error('Invalid Calcudoku size.')
  checkCages(size, cages)
  const givens = Array<number>(size * size).fill(0)
  const rules = cages.map(cage => {
    const { cells, operator, target } = cage
    const tuples = cageTuples(size, cage)
    if (!tuples.length) throw new Error('A Calcudoku cage has no valid arithmetic combinations.')
    if (operator === 'equal') givens[cells[0]] = target
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
  return { ...createLatinPuzzle(size, givens, rules), cages }
}
