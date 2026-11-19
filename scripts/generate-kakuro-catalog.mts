import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { countKakuroCandidates, createKakuro, findKakuroHint, solveKakuro,
  type KakuroCell, type KakuroPuzzle } from '../src/kakuro/engine.ts'

const layouts = {
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

type Difficulty = keyof typeof layouts
type Recipe = [width: number, clues: string]
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const seed = 0x19341c64
const attemptsPerLayout = 48
const editsPerAttempt = 120
const puzzlesPerLayout = 2

function randomIndex(initialSeed: number) {
  let state = initialSeed
  return (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 2 ** 32 * count)
  }
}

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
  for (const run of layout.runs) {
    cells[run.clue]![run.direction] = run.cells.reduce((total, cell) => total + values[cell], 0)
  }
  return createKakuro(layout.width, cells)
}

/** Give rotations, reflections, and digit complements the same signature. */
export function kakuroRecipeSignature(puzzle: KakuroPuzzle): string {
  const white = puzzle.cells.flatMap((cell, index) => cell === null ? [index] : [])
  const signatures: string[] = []
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
        for (const complement of [false, true]) {
          const runs = puzzle.runs.map(run => {
            const total = complement ? run.cells.length * 10 - run.total : run.total
            const cells = run.cells.map(cell => index.get(cell)!).sort((a, b) => a - b)
            return `${cells.join(',')}=${total}`
          })
          signatures.push(`${width}x${height}|${runs.sort().join('|')}`)
        }
      }
    }
  }
  return signatures.sort()[0]
}

function hintDifficulty(puzzle: KakuroPuzzle, whiteCount: number): Difficulty | null {
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

function catalogForLayout(layout: KakuroPuzzle, difficulty: Difficulty, signatures: Set<string>,
  pick: (count: number) => number): Recipe[] {
  const white = layout.cells.flatMap((cell, index) => cell === null ? [index] : [])
  const peers = layout.cells.map((_, index) => layout.runs.filter(run => run.cells.includes(index))
    .flatMap(run => run.cells.filter(cell => cell !== index)))
  const accepted: Recipe[] = []
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
            if (accepted.length === puzzlesPerLayout) return accepted
          }
        }
      }
      // Keep narrower positions most of the time. Some wider positions lead to new fills.
      if (remaining <= best || pick(16) === 0) best = remaining
      else values[cell] = before
    }
  }
  throw new Error(`Found ${accepted.length} ${difficulty} puzzles for layout ${white.join(',')}.`)
}

function generateCatalog() {
  const pick = randomIndex(seed)
  const signatures = new Set<string>()
  const lines = [
    '// Generated by scripts/generate-kakuro-catalog.mts. Keep published recipes in order.',
    'export const generatedKakuroRecipes = {',
  ]
  for (const difficulty of Object.keys(layouts) as Difficulty[]) {
    lines.push(`  ${difficulty}: [`)
    const byLayout = layouts[difficulty].map(rows => catalogForLayout(makeLayout(rows), difficulty, signatures, pick))
    for (let puzzle = 0; puzzle < puzzlesPerLayout; puzzle++) {
      for (const recipes of byLayout) {
        const [width, clues] = recipes[puzzle]
        lines.push(`    [${width}, '${clues}'],`)
      }
    }
    lines.push('  ],')
  }
  lines.push('} as const', '')
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--check')) {
    throw new Error('Use --check to compare the catalog without changing it.')
  }
  const catalog = generateCatalog()
  const file = new URL('../src/kakuro/generated-recipes.ts', import.meta.url)
  if (args[0] === '--check') {
    if (readFileSync(file, 'utf8') !== catalog) throw new Error('The Kakuro catalog differs from the generated recipes.')
  } else {
    process.stdout.write(catalog)
  }
}
