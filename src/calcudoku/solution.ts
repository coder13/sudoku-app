import { shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'

type GeneratedSize = 3 | 4 | 5
const reducedSquares = new Map<GeneratedSize, number[][]>()

// Fix the first row and column in digit order. This keeps the tables small.
function buildReducedSquares(size: GeneratedSize): number[][] {
  const all = (1 << size) - 1
  const rowFree = Array.from({ length: size }, (_, i) => all ^ (1 << i))
  const columnFree = [...rowFree]
  const values = Array<number>(size * size)
  for (let i = 0; i < size; i++) {
    values[i] = i
    values[i * size] = i
  }

  const squares: number[][] = []
  function fill(row: number, column: number) {
    if (row === size) {
      squares.push([...values])
      return
    }
    const lastColumn = column === size - 1
    const nextRow = lastColumn ? row + 1 : row
    const nextColumn = lastColumn ? 1 : column + 1
    for (let choices = rowFree[row] & columnFree[column]; choices; choices &= choices - 1) {
      const digit = choices & -choices
      values[row * size + column] = 31 - Math.clz32(digit)
      rowFree[row] ^= digit
      columnFree[column] ^= digit
      fill(nextRow, nextColumn)
      rowFree[row] ^= digit
      columnFree[column] ^= digit
    }
  }
  fill(1, 1)
  return squares
}

export function makeCalcudokuSolution(size: GeneratedSize, pick: PickIndex): number[] {
  let squares = reducedSquares.get(size)
  if (!squares) {
    squares = buildReducedSquares(size)
    reducedSquares.set(size, squares)
  }
  const indices = Array.from({ length: size }, (_, i) => i)
  const rows = shuffled(indices, pick)
  const columns = shuffled(indices, pick)
  const digits = shuffled(indices.map(i => i + 1), pick)
  // The 3 × 3 table has one reduced square, so it needs no extra random choice.
  const base = squares[squares.length === 1 ? 0 : pick(squares.length)]
  return rows.flatMap(row => columns.map(column => digits[base[row * size + column]]))
}
