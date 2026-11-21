import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog.ts'
import { seededIndex, shuffled, type PickIndex } from '../number-puzzles/generation-random.ts'
import { createKakuro, createKakuroCandidateCounter, kakuroSolutionDepth, solveKakuro,
  type KakuroCell, type KakuroPuzzle, type KakuroRun } from './engine.ts'
import { varyKakuroLayout } from './layout-variation.ts'

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
type KakuroCandidate = { signature: string; recipe: KakuroRecipe }

export function kakuroRecipeFromPuzzle(puzzle: KakuroPuzzle): KakuroRecipe {
  return [puzzle.width, puzzle.cells.map(cell =>
    cell === null ? '.' : `${cell.down ?? ''}/${cell.across ?? ''}`).join(' ')]
}

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const allDigits = (1 << digits.length) - 1
const digitsByMask = Array.from({ length: allDigits + 1 }, (_, mask) =>
  digits.filter(digit => mask & (1 << (digit - 1))))
const attemptsPerLayout = 48
const attemptsPerVariation = 4
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

function setRunTotal(puzzle: KakuroPuzzle, run: KakuroRun, total: number) {
  run.total = total
  puzzle.cells[run.clue]![run.direction] = total
}

function availableDigits(values: readonly number[], peers: readonly number[], excluded = 0) {
  // Bit zero represents an empty cell and does not remove any digits.
  let used = 1 << excluded
  for (const peer of peers) used |= 1 << values[peer]
  return digitsByMask[allDigits & ~(used >>> 1)]
}

type SignatureRun = { index: number; complementBase: number }
type SignatureLayout = { topology: string; orders: SignatureRun[][] }

// Generated histories can contain hundreds of shapes. Reuse their run orders when reading history.
const signatureLayoutLimit = 512
const signatureLayouts = new Map<string, SignatureLayout>()

function buildSignatureLayouts(puzzle: KakuroPuzzle): SignatureLayout {
  const white = puzzle.cells.flatMap((cell, index) => cell === null ? [index] : [])
  let topology: string | undefined
  const orders: SignatureRun[][] = []
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
          cells: run.cells.map(cell => index.get(cell)!).sort((a, b) => a - b).join(','),
          complementBase: run.cells.length * 10,
        }))
        // Each run covers a different set of cells. Sort once, before adding its sum.
        runs.sort((a, b) => a.cells < b.cells ? -1 : a.cells > b.cells ? 1 : 0)
        // Choose the grid shape before comparing any clue sums.
        const shape = `${width}x${height}|${runs.map(run => run.cells).join('|')}`
        if (topology === undefined || shape < topology) {
          topology = shape
          orders.length = 0
        }
        if (shape === topology) orders.push(runs)
      }
    }
  }
  return { topology: topology!, orders }
}

function signatureLayout(puzzle: KakuroPuzzle): SignatureLayout {
  // The clue, direction, and length identify all cells in a contiguous run.
  const key = puzzle.width + '|' + puzzle.runs.map(run =>
    `${run.clue}${run.direction === 'across' ? 'a' : 'd'}${run.cells.length}`).join(',')
  let layouts = signatureLayouts.get(key)
  if (!layouts) {
    layouts = buildSignatureLayouts(puzzle)
    if (signatureLayouts.size >= signatureLayoutLimit) signatureLayouts.delete(signatureLayouts.keys().next().value!)
    signatureLayouts.set(key, layouts)
  }
  return layouts
}

function recipeSignature(puzzle: KakuroPuzzle, layouts: SignatureLayout): string {
  let signature: string | undefined
  // Only orders with the same canonical shape can represent this puzzle.
  for (const runs of layouts.orders) {
    let original = ''
    let complement = ''
    for (const { index, complementBase } of runs) {
      const total = puzzle.runs[index].total
      // Each sum fits in one code unit, so totals keep their boundaries.
      original += String.fromCharCode(total)
      complement += String.fromCharCode(complementBase - total)
    }
    const first = original < complement ? original : complement
    if (signature === undefined || first < signature) signature = first
  }
  return layouts.topology + '|' + signature!
}

/** Give rotations, reflections, and digit complements the same signature. */
export function kakuroRecipeSignature(puzzle: KakuroPuzzle): string {
  return recipeSignature(puzzle, signatureLayout(puzzle))
}

export function kakuroHintDifficulty(puzzle: KakuroPuzzle, whiteCount: number): NumberPuzzleDifficulty | null {
  const depth = kakuroSolutionDepth(puzzle, whiteCount)
  if (depth === null) return null
  return depth === 1 ? 'easy' : depth === 2 ? 'medium' : 'hard'
}

export function findKakuroRecipes(
  rows: readonly string[],
  difficulty: NumberPuzzleDifficulty,
  signatures: Set<string>,
  pick: PickIndex,
  count: number,
): KakuroRecipe[] {
  const recipes: KakuroRecipe[] = []
  for (const candidate of recipesForLayout(makeLayout(rows), difficulty, signatures, pick, attemptsPerLayout)) {
    signatures.add(candidate.signature)
    recipes.push(candidate.recipe)
    if (recipes.length === count) break
  }
  return recipes
}

function* recipesForLayout(
  layout: KakuroPuzzle,
  difficulty: NumberPuzzleDifficulty,
  signatures: ReadonlySet<string>,
  pick: PickIndex,
  attempts: number,
  startingFill?: readonly number[],
): Generator<KakuroCandidate> {
  const white = layout.cells.flatMap((cell, index) => cell === null ? [index] : [])
  const runsAtCell = layout.cells.map(() => [] as KakuroRun[])
  for (const run of layout.runs) {
    for (const cell of run.cells) runsAtCell[cell].push(run)
  }
  const peers = runsAtCell.map((runs, index) => runs.flatMap(run => run.cells.filter(cell => cell !== index)))
  const signature = signatureLayout(layout)
  const countCandidates = createKakuroCandidateCounter(layout)
  const seen = new Set<string>()

  for (let attempt = 0; attempt < attempts; attempt++) {
    const values = startingFill?.slice() ?? layout.cells.map(() => 0)
    if (!startingFill) {
      for (const cell of white) {
        const available = availableDigits(values, peers[cell])
        if (!available.length) break
        values[cell] = available[pick(available.length)]
      }
      if (white.some(cell => !values[cell])) continue
    }

    for (const run of layout.runs) {
      setRunTotal(layout, run, run.cells.reduce((sum, cell) => sum + values[cell], 0))
    }
    let best = countCandidates() ?? Infinity
    for (let edit = 0; edit < editsPerAttempt; edit++) {
      const cell = white[pick(white.length)]
      const before = values[cell]
      const available = availableDigits(values, peers[cell], before)
      if (!available.length) continue
      const digit = available[pick(available.length)]
      const difference = digit - before
      // An edit changes only the across and down totals for this cell.
      for (const run of runsAtCell[cell]) setRunTotal(layout, run, run.total + difference)
      const remaining = countCandidates() ?? Infinity
      if (remaining === white.length) {
        const key = recipeSignature(layout, signature)
        if (!seen.has(key) && !signatures.has(key)) {
          seen.add(key)
          if (kakuroHintDifficulty(layout, white.length) === difficulty && solveKakuro(layout, [], 1).status === 'unique') {
            yield { signature: key, recipe: kakuroRecipeFromPuzzle(layout) }
          }
        }
      }
      // Keep narrower positions most of the time. Some wider positions lead to new fills.
      if (remaining <= best || pick(16) === 0) {
        best = remaining
        values[cell] = digit
      } else {
        for (const run of runsAtCell[cell]) setRunTotal(layout, run, run.total - difference)
      }
    }
  }
}

export function* kakuroCandidates(
  difficulty: NumberPuzzleDifficulty, seed: number, excluded: ReadonlySet<string> = new Set(),
): Generator<KakuroCandidate> {
  const pick = seededIndex(seed)
  const variations = seededIndex(seed ^ 0x2d89e657)
  const bases = kakuroLayouts[difficulty]
  // Try a new shape first with a small budget, then run the full search on the base layouts.
  const changed = varyKakuroLayout(bases[variations(bases.length)], variations)
  if (changed) {
    yield* recipesForLayout(makeLayout(changed), difficulty, excluded, variations, attemptsPerVariation)
  }
  for (const rows of shuffled<readonly string[]>(bases, pick)) {
    yield* recipesForLayout(makeLayout(rows), difficulty, excluded, pick, attemptsPerLayout)
  }
}

/** Generate a new recipe with a complete logical solution for the requested difficulty. */
export function generateKakuro(difficulty: NumberPuzzleDifficulty, seed: number, excluded?: ReadonlySet<string>): KakuroRecipe | null {
  const candidate = kakuroCandidates(difficulty, seed, excluded).next()
  return candidate.done ? null : candidate.value.recipe
}

export function* kakuroClueCandidates(
  difficulty: NumberPuzzleDifficulty, seed: number, excluded: ReadonlySet<string>, sources: readonly KakuroPuzzle[],
): Generator<KakuroCandidate> {
  const pick = seededIndex(seed ^ 0x6d2b79f5)
  // Use one fill per source before spending time on another full search.
  for (const source of shuffled(sources, pick).slice(0, 8)) {
    const { status, solution } = solveKakuro(source, [], 1)
    if (status !== 'unique' || !solution) continue
    const copy = createKakuro(source.width, source.cells.map(cell => cell === null ? null : { ...cell }))
    yield* recipesForLayout(copy, difficulty, excluded, pick, 1, solution)
  }
}

/** Try new clues near a solved grid when the usual seed searches miss. */
export function varyKakuroClues(
  difficulty: NumberPuzzleDifficulty, seed: number, excluded: ReadonlySet<string>, sources: readonly KakuroPuzzle[],
): KakuroRecipe | null {
  const candidate = kakuroClueCandidates(difficulty, seed, excluded, sources).next()
  return candidate.done ? null : candidate.value.recipe
}
