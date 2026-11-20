import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog.ts'
import { seededIndex, shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'
import { countKakuroCandidates, createKakuro, findKakuroHint, solveKakuro,
  type KakuroCell, type KakuroPuzzle } from './engine.ts'

export const kakuroLayouts = {
  easy: [
    ['..#', '...', '...'],
    ['...#', '....', '#...'],
    ['##..', '##..', '....', '..##', '..##'],
    ['..##', '....', '....', '##..'],
  ],
  medium: [
    ['...#', '...#', '#...', '#...'],
    ['..###', '.....', '.....', '###..'],
    ['##..#', '##...', '.....', '...##', '..###'],
    ['...##', '...##', '.....', '##...', '##...'],
  ],
  hard: [
    ['#...#', '.....', '..#..', '.....', '#...#'],
    ['##...#', '......', '...#..', '......', '#...##'],
    ['#...##', '......', '..##..', '......', '##...#'],
    ['...##', '....#', '##...', '##...', '.....', '..###'],
  ],
} as const

export type KakuroRecipe = [width: number, clues: string]
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const attemptsPerLayout = 48
const editsPerAttempt = 120

function makeLayout(rows: readonly string[]): KakuroPuzzle {
  const width = rows[0].length + 1
  const cells: KakuroCell[] = Array.from({ length: width }, () => ({}))
  for (const row of rows) {
    if (row.length !== width - 1) throw new Error('Every row in a layout must have the same length.')
    cells.push({}, ...Array.from(row, cell => cell === '.' ? null : {}))
  }
  for (const [index, clue] of cells.entries()) {
    if (clue === null) continue
    for (const [direction, stride] of [['across', 1], ['down', width]] as const) {
      let length = 0
      while ((direction === 'down' || index % width + length + 1 < width) &&
        cells[index + (length + 1) * stride] === null) {
        length++
      }
      // A temporary legal sum lets the engine check the layout and identify its runs.
      if (length) clue[direction] = length * (length + 1) / 2
    }
  }
  return createKakuro(width, cells)
}

function puzzleFromFill(layout: KakuroPuzzle, values: readonly number[]): KakuroPuzzle {
  const cells: KakuroCell[] = layout.cells.map(cell => cell === null ? null : {})
  // The layout already validates every run. A new fill only changes its totals.
  const runs = layout.runs.map(run => {
    const total = run.cells.reduce((sum, cell) => sum + values[cell], 0)
    cells[run.clue]![run.direction] = total
    return { ...run, total }
  })
  return { ...layout, cells, runs }
}

type SignatureLayout = {
  size: string
  runs: { index: number; prefix: string; complementBase: number }[]
}

const signatureLayouts = new Map<string, SignatureLayout[]>()

function buildSignatureLayouts(puzzle: KakuroPuzzle): SignatureLayout[] {
  const white = puzzle.cells.flatMap((cell, index) => cell === null ? [index] : [])
  const layouts: SignatureLayout[] = []
  for (const transpose of [false, true]) {
    for (const flipRows of [1, -1]) {
      for (const flipColumns of [1, -1]) {
        const positions = white.map(cell => {
          const row = Math.floor(cell / puzzle.width)
          const column = cell % puzzle.width
          return [(transpose ? column : row) * flipRows, (transpose ? row : column) * flipColumns]
        })
        const rows = positions.map(([row]) => row)
        const columns = positions.map(([, column]) => column)
        const firstRow = Math.min(...rows)
        const firstColumn = Math.min(...columns)
        const width = Math.max(...columns) - firstColumn + 1
        const height = Math.max(...rows) - firstRow + 1
        const index = new Map(white.map((cell, i) =>
          [cell, (rows[i] - firstRow) * width + columns[i] - firstColumn]))
        const runs = puzzle.runs.map((run, runIndex) => ({
          index: runIndex,
          prefix: run.cells.map(cell => index.get(cell)!).sort((a, b) => a - b).join(',') + '=',
          complementBase: run.cells.length * 10,
        }))
        // Each run covers a different set of cells. Sort once, before adding its sum.
        runs.sort((a, b) => a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0)
        layouts.push({ size: `${width}x${height}`, runs })
      }
    }
  }
  return layouts
}

/** Give rotations, reflections, and digit complements the same signature. */
export function kakuroRecipeSignature(puzzle: KakuroPuzzle): string {
  // The clue, direction, and length identify all cells in a contiguous run.
  const key = puzzle.width + '|' + puzzle.runs.map(run =>
    `${run.clue}${run.direction === 'across' ? 'a' : 'd'}${run.cells.length}`).join(',')
  let layouts = signatureLayouts.get(key)
  if (!layouts) {
    layouts = buildSignatureLayouts(puzzle)
    if (signatureLayouts.size >= 32) signatureLayouts.delete(signatureLayouts.keys().next().value!)
    signatureLayouts.set(key, layouts)
  }

  let signature: string | undefined
  for (const { size, runs } of layouts) {
    let original = size
    let complement = size
    for (const { index, prefix, complementBase } of runs) {
      const total = puzzle.runs[index].total
      original += `|${prefix}${total}`
      complement += `|${prefix}${complementBase - total}`
    }
    const first = original < complement ? original : complement
    if (signature === undefined || first < signature) signature = first
  }
  return signature!
}

function hintDifficulty(puzzle: KakuroPuzzle, whiteCount: number): NumberPuzzleDifficulty | null {
  const values = puzzle.cells.map(() => 0)
  let depth = 0
  for (let i = 0; i < whiteCount; i++) {
    const hint = findKakuroHint(puzzle, values)
    if (!hint) return null
    values[hint.cell] = hint.digit
    depth = Math.max(depth, hint.depth)
  }
  return depth === 1 ? 'easy' : depth === 2 ? 'medium' : 'hard'
}

export function findKakuroRecipes(
  rows: readonly string[],
  difficulty: NumberPuzzleDifficulty,
  signatures: Set<string>,
  pick: PickIndex,
  count: number,
): KakuroRecipe[] {
  const layout = makeLayout(rows)
  const white = layout.cells.flatMap((cell, index) => cell === null ? [index] : [])
  const peers = layout.cells.map((_, index) => layout.runs.filter(run => run.cells.includes(index))
    .flatMap(run => run.cells.filter(cell => cell !== index)))
  const accepted: KakuroRecipe[] = []
  const seen = new Set<string>()

  for (let attempt = 0; attempt < attemptsPerLayout; attempt++) {
    const values = layout.cells.map(() => 0)
    for (const cell of white) {
      const available = digits.filter(digit => !peers[cell].some(peer => values[peer] === digit))
      if (!available.length) break
      values[cell] = available[pick(available.length)]
    }
    if (white.some(cell => !values[cell])) continue

    let best = countKakuroCandidates(puzzleFromFill(layout, values)) ?? Infinity
    for (let edit = 0; edit < editsPerAttempt; edit++) {
      const cell = white[pick(white.length)]
      const before = values[cell]
      const available = digits.filter(digit => digit !== before && !peers[cell].some(peer => values[peer] === digit))
      if (!available.length) continue
      values[cell] = available[pick(available.length)]
      const puzzle = puzzleFromFill(layout, values)
      const remaining = countKakuroCandidates(puzzle) ?? Infinity
      if (remaining === white.length) {
        const key = kakuroRecipeSignature(puzzle)
        if (!seen.has(key) && !signatures.has(key)) {
          seen.add(key)
          if (hintDifficulty(puzzle, white.length) === difficulty && solveKakuro(puzzle, [], 1).status === 'unique') {
            signatures.add(key)
            accepted.push([puzzle.width, puzzle.cells.map(cell =>
              cell === null ? '.' : `${cell.down ?? ''}/${cell.across ?? ''}`).join(' ')])
            if (accepted.length === count) return accepted
          }
        }
      }
      // Keep narrower positions most of the time. Some wider positions lead to new fills.
      if (remaining <= best || pick(16) === 0) best = remaining
      else values[cell] = before
    }
  }
  return accepted
}

/** Generate a new recipe with a complete logical solution for the requested difficulty. */
export function generateKakuro(difficulty: NumberPuzzleDifficulty, seed: number, excluded: ReadonlySet<string> = new Set()): KakuroRecipe | null {
  const pick = seededIndex(seed)
  const signatures = new Set(excluded)
  for (const rows of shuffled<readonly string[]>(kakuroLayouts[difficulty], pick)) {
    const [recipe] = findKakuroRecipes(rows, difficulty, signatures, pick, 1)
    if (recipe) return recipe
  }
  return null
}
