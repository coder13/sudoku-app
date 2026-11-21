import { isAlgebraicCageList } from '../algebraic-cages.ts'
import { isFogDefinition } from '../fog.ts'
import { parsePuzzle } from '../formats.ts'
import { isGridText, isMiniGrid, MINI_GRID } from '../grid.ts'
import { downloadSharedPuzzle, isSharedPuzzleId } from '../puzzle-sharing.ts'
import { decodeSizedSudokuPad } from '../sized-sudoku-pad.ts'
import { isPlayablePuzzle, isPuzzleVariantId } from '../variants.ts'
import { parseJSON, record } from './shared.ts'
import { fromSudokuPad } from './sudoku-pad.ts'
import type { ImportResult } from './types.ts'

const format = 'Puzzle link'
export type NativeImport = ImportResult & { format: typeof format }

export async function importSharedPuzzle(id: string, signal?: AbortSignal): Promise<NativeImport> {
  const { givens, variant, collection, title, grid, algebraic, sizedRules, sizedAuthor, whispersGuide, givenCellColors, authoredArtwork } = await downloadSharedPuzzle(id, signal)
  const sizing = algebraic && 'sudokuPad' in algebraic ? decodeSizedSudokuPad(algebraic.sudokuPad) : undefined
  if (sizing && sizing.givens !== givens) throw new Error('The SudokuPad definition does not match the shared givens.')
  const cages = sizing ? { rules: sizing.rules, source: sizing.source } : algebraic && 'rules' in algebraic ? algebraic : undefined
  return { givens, variant, collection, title, grid, sizedRules, sizedAuthor, ...(cages && { algebraic: cages }),
    ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }), ...(authoredArtwork && { authoredArtwork }),
    sharedPuzzleId: id.toLowerCase(), format }
}

export function readNativeLink(url: URL, ownOrigin: string | undefined): NativeImport | Promise<NativeImport> | undefined {
  if (url.origin === ownOrigin && url.pathname === '/' && url.searchParams.has('share')) {
    const id = url.searchParams.get('share')
    if (!isSharedPuzzleId(id)) throw new Error('This puzzle link is invalid.')
    return importSharedPuzzle(id)
  }
  if (url.hash.startsWith('#sized=')) {
    const shared = parseJSON(new URLSearchParams(url.hash.slice(1)).get('sized') ?? '', format)
    if (record(shared) && shared.version === 2 && typeof shared.sudokuPad === 'string' &&
      Object.keys(shared).every(key => key === 'version' || key === 'sudokuPad') && /^(scl|ctc)/i.test(shared.sudokuPad)) {
      return { ...fromSudokuPad(shared.sudokuPad), format }
    }
    if (!record(shared) || shared.version !== 2 || !isMiniGrid(shared.grid) || !isGridText(shared.givens, MINI_GRID) ||
      Object.keys(shared).some(key => !['version', 'grid', 'givens', 'rules'].includes(key))) {
      throw new Error('This link is missing a supported sized Sudoku puzzle.')
    }
    if (shared.rules !== undefined) {
      if (!isAlgebraicCageList(shared.rules)) throw new Error('This sized puzzle has unsupported rules or invalid algebraic cages.')
      return { givens: shared.givens, format, grid: MINI_GRID, algebraic: { rules: shared.rules } }
    }
    return { givens: shared.givens, format, grid: MINI_GRID }
  }
  if (url.hash.startsWith('#variant=')) {
    const shared = parseJSON(new URLSearchParams(url.hash.slice(1)).get('variant') ?? '', format)
    if (!record(shared) || !isPuzzleVariantId(shared.id) || shared.id === 'classic' || !isPlayablePuzzle(shared.id, shared.puzzle, shared.fog)) {
      throw new Error('This link is missing a valid Sudoku variant.')
    }
    const variant: NonNullable<ImportResult['variant']> = { id: shared.id, puzzle: shared.puzzle, ...(isFogDefinition(shared.fog) && { fog: shared.fog }) }
    return { givens: variant.puzzle.givens, format, variant }
  }
  if (url.hash.startsWith('#puzzle=')) return { givens: parsePuzzle(url.href), format }
}
