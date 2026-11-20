import { createCalcudoku, type Cage, type CalcudokuPuzzle } from './engine.ts'
import { solveLatin } from '../latin/engine.ts'
import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog.ts'
import { seededIndex, shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'

export type CalcudokuRecipe = { size: number; cages: Cage[] }

const sizes = { easy: 3, medium: 4, hard: 5 } satisfies Record<NumberPuzzleDifficulty, number>

function neighbors(cell: number, size: number): number[] {
  const row = Math.floor(cell / size)
  const column = cell % size
  return [
    ...(row > 0 ? [cell - size] : []),
    ...(row < size - 1 ? [cell + size] : []),
    ...(column > 0 ? [cell - 1] : []),
    ...(column < size - 1 ? [cell + 1] : []),
  ]
}

function addCage(cells: number[], values: readonly number[], pick: PickIndex): Cage {
  cells.sort((a, b) => a - b)
  const digits = cells.map(cell => values[cell])
  if (digits.length === 1) return { cells, operator: 'equal', target: digits[0] }

  const choices: Cage[] = [
    { cells, operator: 'add', target: digits.reduce((sum, digit) => sum + digit, 0) },
    { cells, operator: 'multiply', target: digits.reduce((product, digit) => product * digit, 1) },
  ]
  if (digits.length === 2) {
    const [small, large] = digits.sort((a, b) => a - b)
    choices.push({ cells, operator: 'subtract', target: large - small })
    if (large % small === 0) choices.push({ cells, operator: 'divide', target: large / small })
  }
  return choices[pick(choices.length)]
}

function makeRecipe(size: number, pick: PickIndex): CalcudokuRecipe {
  const indices = Array.from({ length: size }, (_, i) => i)
  const rows = shuffled(indices, pick)
  const columns = shuffled(indices, pick)
  const digits = shuffled(indices.map(i => i + 1), pick)
  const values = rows.flatMap(row => columns.map(column => digits[(row + column) % size]))
  const available = new Set(shuffled(values.map((_, i) => i), pick))
  const cages: Cage[] = []
  for (const start of available) {
    const cells = [start]
    available.delete(start)
    // Easy boards can also use four-cell cages, as in the starter catalog.
    const length = 2 + pick(size === sizes.medium ? 2 : 3)
    while (cells.length < length) {
      const nearby = [...new Set(cells.flatMap(cell => neighbors(cell, size)).filter(cell => available.has(cell)))]
      if (!nearby.length) break
      const next = nearby[pick(nearby.length)]
      cells.push(next)
      available.delete(next)
    }
    cages.push(addCage(cells, values, pick))
  }
  cages.sort((a, b) => a.cells[0] - b.cells[0])
  return { size, cages }
}

const symmetries = Array.from({ length: 10 }, (_, size) => {
  const last = size - 1
  const images = Array.from({ length: 8 }, () => [] as number[])
  for (let cell = 0; cell < size * size; cell++) {
    const row = Math.floor(cell / size)
    const column = cell % size
    images[0][cell] = cell
    images[1][cell] = row * size + last - column
    images[2][cell] = (last - row) * size + column
    images[3][cell] = (last - row) * size + last - column
    images[4][cell] = column * size + row
    images[5][cell] = column * size + last - row
    images[6][cell] = (last - column) * size + row
    images[7][cell] = (last - column) * size + last - row
  }
  return images
})

function orientedCageKey(cages: readonly Cage[], cells: readonly number[]): string {
  const membership = Array<number>(cells.length)
  const clues: string[] = []
  for (const cage of cages) {
    let first = cells.length
    for (const cell of cage.cells) first = Math.min(first, cells[cell])
    // The first cell identifies its cage. Reserve zero for uncovered cells.
    for (const cell of cage.cells) membership[cells[cell]] = first + 1
    clues[first] = cage.operator + cage.target
  }
  return String.fromCharCode(...membership) + '|' + clues.join('|')
}

type CageLayout = Pick<CalcudokuPuzzle, 'size' | 'cages'>

export function calcudokuRecipeKey({ size, cages }: CageLayout): string {
  return size + '|' + orientedCageKey(cages, symmetries[size][0])
}

/** Identify equivalent cages after any rotation or reflection of the grid. */
export function calcudokuRecipeSignature({ size, cages }: CageLayout): string {
  let key: string | undefined
  for (const cells of symmetries[size]) {
    const transformed = orientedCageKey(cages, cells)
    if (key === undefined || transformed < key) key = transformed
  }
  return size + '|' + key
}

type CalcudokuGenerationHistory = {
  signatures: ReadonlySet<string>
  recipes: ReadonlySet<string>
}

/** Select connected cages with a unique solution that requires no search guesses. */
export function generateCalcudoku(
  difficulty: NumberPuzzleDifficulty,
  seed: number,
  excluded: ReadonlySet<string> = new Set(),
  history?: CalcudokuGenerationHistory,
): CalcudokuRecipe | null {
  const pick = seededIndex(seed)
  const size = sizes[difficulty]
  let fallback: CalcudokuRecipe | null = null
  for (let attempt = 0; attempt < 128; attempt++) {
    const recipe = makeRecipe(size, pick)
    if (recipe.cages.filter(cage => cage.operator === 'equal').length > Math.floor(size / 2)) continue
    const signature = calcudokuRecipeSignature(recipe)
    if (excluded.has(signature)) continue
    const seen = history?.signatures.has(signature)
    if (seen && (fallback || history?.recipes.has(calcudokuRecipeKey(recipe)))) continue
    const puzzle = createCalcudoku(size, recipe.cages)
    if (solveLatin(puzzle, [], 1).status !== 'unique') continue
    if (!seen) return recipe
    fallback = recipe
  }
  // If the search finds no new layout, offer an older one in an unplayed orientation.
  return fallback
}
