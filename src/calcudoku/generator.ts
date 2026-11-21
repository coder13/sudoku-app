import { createCalcudoku, type Cage, type CalcudokuPuzzle } from './engine.ts'
import { solveLatin } from '../latin/engine.ts'
import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog.ts'
import { seededIndex, shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'
import { makeCalcudokuSolution } from './solution.ts'

export type CalcudokuRecipe = { size: number; cages: Cage[] }

const sizes = { easy: 3, medium: 4, hard: 5 } as const satisfies Record<NumberPuzzleDifficulty, number>

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

function cluesForCage(cells: readonly number[], values: readonly number[]): Cage[] {
  const digits = cells.map(cell => values[cell])
  const choices: Cage[] = [
    { cells, operator: 'add', target: digits.reduce((sum, digit) => sum + digit, 0) },
    { cells, operator: 'multiply', target: digits.reduce((product, digit) => product * digit, 1) },
  ]
  if (digits.length === 2) {
    const [small, large] = digits.sort((a, b) => a - b)
    choices.push({ cells, operator: 'subtract', target: large - small })
    if (large % small === 0) choices.push({ cells, operator: 'divide', target: large / small })
  }
  return choices
}

function makeRecipe(size: typeof sizes[NumberPuzzleDifficulty], pick: PickIndex, firstCageLength?: number) {
  const values = makeCalcudokuSolution(size, pick)
  const available = new Set(shuffled(values.map((_, i) => i), pick))
  const cages: Cage[] = []
  for (const start of available) {
    const cells = [start]
    available.delete(start)
    // Easy boards can also use four-cell cages, as in the starter catalog.
    const length = !cages.length && firstCageLength !== undefined
      ? firstCageLength : 2 + pick(size === sizes.medium ? 2 : 3)
    while (cells.length < length) {
      const nearby = [...new Set(cells.flatMap(cell => neighbors(cell, size)).filter(cell => available.has(cell)))]
      if (!nearby.length) break
      const next = nearby[pick(nearby.length)]
      cells.push(next)
      available.delete(next)
    }
    cells.sort((a, b) => a - b)
    if (cells.length === 1) cages.push({ cells, operator: 'equal', target: values[start] })
    else {
      const clues = cluesForCage(cells, values)
      cages.push(clues[pick(clues.length)])
    }
  }
  cages.sort((a, b) => a.cells[0] - b.cells[0])
  return { recipe: { size, cages }, values }
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

function cageMembership(
  cages: readonly Cage[],
  cells: readonly number[],
  membership: number[],
  starts: number[],
): string {
  membership.fill(0)
  for (let index = 0; index < cages.length; index++) {
    const cageCells = cages[index].cells
    let first = cells.length
    for (const cell of cageCells) first = Math.min(first, cells[cell])
    // The first cell identifies its cage. Reserve zero for uncovered cells.
    for (const cell of cageCells) membership[cells[cell]] = first + 1
    starts[index] = first
  }
  return String.fromCharCode(...membership)
}

function cageClues(cages: readonly Cage[], starts: readonly number[]): string {
  const clues: string[] = []
  for (let index = 0; index < cages.length; index++) {
    const { operator, target } = cages[index]
    clues[starts[index]] = operator + target
  }
  return clues.join('|')
}

type CageLayout = Pick<CalcudokuPuzzle, 'size' | 'cages'>

export function calcudokuRecipeKey({ size, cages }: CageLayout): string {
  const starts = Array<number>(cages.length)
  const membership = cageMembership(cages, symmetries[size][0], Array<number>(size * size), starts)
  return size + '|' + membership + '|' + cageClues(cages, starts)
}

function recipeSignature({ size, cages }: CageLayout, recordKey?: (key: string) => void): string {
  const membership = Array<number>(size * size)
  const starts = Array<number>(cages.length)
  const images = symmetries[size]
  let bestShape = cageMembership(cages, images[0], membership, starts)
  let bestClues = cageClues(cages, starts)
  recordKey?.(size + '|' + bestShape + '|' + bestClues)
  for (let i = 1; i < images.length; i++) {
    const shape = cageMembership(cages, images[i], membership, starts)
    // The membership comes first in the key. Compare clues only for this shape or a smaller one.
    if (shape > bestShape) continue
    const clues = cageClues(cages, starts)
    if (shape !== bestShape || clues < bestClues) {
      bestShape = shape
      bestClues = clues
    }
  }
  return size + '|' + bestShape + '|' + bestClues
}

/** Identify equivalent cages after any rotation or reflection of the grid. */
export function calcudokuRecipeSignature(recipe: CageLayout): string {
  return recipeSignature(recipe)
}

/** Get the saved orientation and the canonical signature in one pass. */
export function calcudokuRecipeKeys(recipe: CageLayout) {
  let key = ''
  const signature = recipeSignature(recipe, orientation => { key = orientation })
  return { key, signature }
}

export type CalcudokuGenerationHistory = {
  signatures: ReadonlySet<string>
  recipes: ReadonlySet<string>
}

export function* calcudokuCandidates(
  difficulty: NumberPuzzleDifficulty, seed: number, { largerCage = false }: { largerCage?: boolean } = {},
) {
  const pick = seededIndex(seed)
  const size = sizes[difficulty]
  const firstCageLength = largerCage ? (size === sizes.medium ? 4 : 5) : undefined
  // The Easy catalog already uses up to two single-cell cages.
  const maxGivens = largerCage && size === sizes.easy ? 2 : Math.floor(size / 2)
  for (let attempt = 0; attempt < 128; attempt++) {
    const { recipe } = makeRecipe(size, pick, firstCageLength)
    if (recipe.cages.filter(cage => cage.operator === 'equal').length <= maxGivens) {
      yield { recipe, signature: calcudokuRecipeSignature(recipe) }
    }
  }
}

export function* calcudokuClueVariants(difficulty: NumberPuzzleDifficulty, seed: number) {
  const pick = seededIndex(seed)
  const size = sizes[difficulty]
  const maxGivens = Math.floor(size / 2)
  for (let attempt = 0; attempt < 24; attempt++) {
    const { recipe, values } = makeRecipe(size, pick)
    if (recipe.cages.filter(cage => cage.operator === 'equal').length > maxGivens) continue
    for (const [index, cage] of recipe.cages.entries()) {
      if (cage.operator === 'equal') continue
      // Keep the fill and cage shapes. A different operator can make a new puzzle.
      for (const clue of cluesForCage(cage.cells, values)) {
        if (clue.operator === cage.operator) continue
        const cages = recipe.cages.slice()
        cages[index] = clue
        const candidate = { size, cages }
        yield { recipe: candidate, signature: calcudokuRecipeSignature(candidate) }
      }
    }
  }
}

export function calcudokuCandidateSignatures(difficulty: NumberPuzzleDifficulty, seed: number): string[] {
  return Array.from(calcudokuCandidates(difficulty, seed), ({ signature }) => signature)
}

/** Select connected cages with a unique solution that requires no search guesses. */
export function generateCalcudoku(
  difficulty: NumberPuzzleDifficulty,
  seed: number,
  excluded: ReadonlySet<string> = new Set(),
  history?: CalcudokuGenerationHistory,
): CalcudokuRecipe | null {
  let fallback: CalcudokuRecipe | null = null
  for (const { recipe, signature } of calcudokuCandidates(difficulty, seed)) {
    if (excluded.has(signature)) continue
    const seen = history?.signatures.has(signature)
    if (seen && (fallback || history?.recipes.has(calcudokuRecipeKey(recipe)))) continue
    const puzzle = createCalcudoku(recipe.size, recipe.cages)
    if (solveLatin(puzzle, [], 1).status !== 'unique') continue
    if (!seen) return recipe
    fallback = recipe
  }
  // If the search finds no new layout, offer an older one in an unplayed orientation.
  return fallback
}
