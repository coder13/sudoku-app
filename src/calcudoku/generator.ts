import { createCalcudoku, type Cage } from './engine.ts'
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
    const length = 2 + pick(size === 5 ? 3 : 2)
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

export function calcudokuRecipeKey({ size, cages }: CalcudokuRecipe): string {
  return size + '|' + cages.map(({ cells, operator, target }) => `${cells.join(',')}=${operator}${target}`).join('|')
}

/** Select connected cages with a unique solution that requires no search guesses. */
export function generateCalcudoku(
  difficulty: NumberPuzzleDifficulty,
  seed: number,
  excluded: ReadonlySet<string> = new Set(),
): CalcudokuRecipe | null {
  const pick = seededIndex(seed)
  const size = sizes[difficulty]
  for (let attempt = 0; attempt < 128; attempt++) {
    const recipe = makeRecipe(size, pick)
    if (recipe.cages.filter(cage => cage.operator === 'equal').length > Math.floor(size / 2) ||
      excluded.has(calcudokuRecipeKey(recipe))) continue
    const puzzle = createCalcudoku(size, recipe.cages)
    if (solveLatin(puzzle, [], 1).status === 'unique') return recipe
  }
  return null
}
