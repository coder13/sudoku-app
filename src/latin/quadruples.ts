import { maxQuadrupleClues, maxQuadrupleTokenLength } from '../number-puzzles/import-token-limits.ts'
import { quadrupleCells, validQuadruple, type Quadruple } from '../sudoku/quadruple.ts'
import { bit, cellLabel, type LatinRule } from './engine.ts'
import { tupleSupport } from './tuple-support.ts'

export function latinQuadrupleRules(
  size: number, clues: readonly Quadruple[] = [], extraRegions: readonly (readonly number[])[] = [],
  unnumberedCages: readonly (readonly number[])[] = [],
): LatinRule[] {
  if (clues.length > maxQuadrupleClues || clues.some(clue => !validQuadruple(clue, size))) {
    throw new Error('This puzzle has invalid Quadruple clues.')
  }
  return clues.map(({ topLeft, digits }) => {
    const cells = quadrupleCells(topLeft, size)
    const shares = (groups: readonly (readonly number[])[], a: number, b: number) =>
      groups.some(group => group.includes(a) && group.includes(b))
    const mainRegion = shares(extraRegions, cells[0], cells[3])
    const otherRegion = shares(extraRegions, cells[1], cells[2])
    const mainCage = shares(unnumberedCages, cells[0], cells[3])
    const otherCage = shares(unnumberedCages, cells[1], cells[2])
    const label = `The Quadruple touching ${cellLabel(cells[0], size)} through ${cellLabel(cells[3], size)} needs ${digits.join(', ')}.`
    const regionNote = mainRegion || otherRegion ? ' Cells in the same extra region cannot share a digit.' : ''
    const cageNote = mainCage || otherCage ? ' Cells in the same unnumbered cage cannot share a digit.' : ''
    let support: LatinRule['support'] | undefined
    return {
      kind: 'quadruple',
      cells,
      label: label + regionNote + cageNote,
      support(domains) {
        support ??= tupleSupport(cells, quadrupleTuples(size, digits, mainRegion || mainCage, otherRegion || otherCage))
        return support(domains)
      },
    }
  })
}

function quadrupleTuples(size: number, digits: readonly number[], mainDiagonal: boolean, otherDiagonal: boolean) {
  // Every listed occurrence consumes a separate cell. The two diagonals are
  // the only pairs that can repeat a digit in a grid with no boxes.
  const needed = Array<number>(size + 1).fill(0)
  for (const digit of digits) needed[digit]++
  const peers = [[], [0], otherDiagonal ? [0, 1] : [0], mainDiagonal ? [0, 1, 2] : [1, 2]]
  const chosen: number[] = []
  const tuples: number[] = []
  function visit(index: number, remaining: number) {
    if (index === 4) {
      for (const digit of chosen) tuples.push(bit(digit))
      return
    }
    for (let digit = 1; digit <= size; digit++) {
      const required = needed[digit] > 0
      if ((!required && remaining === 4 - index) || peers[index].some(peer => chosen[peer] === digit)) continue
      if (required) needed[digit]--
      chosen[index] = digit
      visit(index + 1, remaining - Number(required))
      if (required) needed[digit]++
    }
  }
  visit(0, digits.length)
  return Uint16Array.from(tuples)
}

export function encodeLatinQuadruples(clues?: readonly Quadruple[]) {
  if (!clues?.length) return ''
  return '.q' + clues.map(({ topLeft, digits }) => topLeft.toString(36).padStart(2, '0') + digits.length + digits.join('')).join('')
}

export function readLatinQuadruples(encoded: string) {
  const invalid = () => new Error('This puzzle link has invalid Quadruple clues.')
  if (encoded.length > maxQuadrupleTokenLength || !/^[0-9a-z]+$/.test(encoded)) throw invalid()
  const clues: Quadruple[] = []
  for (let offset = 0; offset < encoded.length;) {
    const count = Number(encoded[offset + 2])
    const digits = encoded.slice(offset + 3, offset + 3 + count)
    if (!(count >= 1 && count <= 4) || digits.length !== count || !/^[1-9]+$/.test(digits)) throw invalid()
    clues.push({ topLeft: Number.parseInt(encoded.slice(offset, offset + 2), 36), digits: [...digits].map(Number) })
    offset += 3 + count
  }
  return clues
}
