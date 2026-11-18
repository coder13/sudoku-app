import type { VariantPuzzle } from './engine.ts'
import { clueShapes } from './sinclair-layout.ts'

export function visibleClues(puzzle: VariantPuzzle) {
  const givens = new Set([...puzzle.givens].flatMap((digit, cell) => digit === '0' ? [] : [String(cell)]))
  const shapes = new Set(clueShapes(puzzle).keys())
  return { givens, shapes }
}

export type PuzzleStyle = ReturnType<typeof visibleClues> & { opening?: string; hardest?: string }

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / (a.size + b.size - common)
}

// Compare visible positions, the opening sequence and the hardest deduction.
// Fixed guides such as the two diagonals do not distinguish puzzles in a pack.
export function puzzleSimilarity(a: PuzzleStyle, b: PuzzleStyle) {
  const layers: number[] = []
  if (a.givens.size || b.givens.size) layers.push(overlap(a.givens, b.givens))
  if (a.shapes.size || b.shapes.size) layers.push(overlap(a.shapes, b.shapes))
  const geometry = layers.reduce((sum, n) => sum + n, 0) / Math.max(1, layers.length)
  return .65 * geometry + .20 * Number(!!a.hardest && a.hardest === b.hardest)
    + .15 * Number(!!a.opening && a.opening === b.opening)
}
