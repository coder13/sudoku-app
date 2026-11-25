import { isJigsawSize, isRectangularSize } from '../grid.ts'
import { decodeSizedSudokuPad, decodeSudokuPadEnvelope } from '../sized-sudoku-pad.ts'
import { hasDeclaredSudokuPadJigsaw, readLinkedDoubleArrowSudokuPad, readSizedRuleSudokuPad } from '../sized-rule-sudoku-pad.ts'
import { digitRuns } from './digit-runs.ts'
import { FP_CODE, fromFPuzzles } from './f-puzzles.ts'
import { fetchPublishedExport } from './published-link.ts'
import { readClassicSudokuPad } from './sudoku-pad-classic.ts'
import { record } from './shared.ts'
import type { ImportResult, PuzzleImporter } from './types.ts'

const publishedId = /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64})?$/

export function fromSudokuPad(code: string): ImportResult {
  if (/^scf/i.test(code)) return digitRuns(code.slice(3), 'SudokuPad')
  if (FP_CODE.test(code)) return fromFPuzzles(code.replace(FP_CODE, ''), 'SudokuPad')
  if (/^(scl|ctc)/i.test(code)) {
    const data = decodeSudokuPadEnvelope(code)
    if (record(data) && Array.isArray(data.cells) && data.cells.length === 9) {
      return readClassicSudokuPad(data)
    }
    if (record(data) && Array.isArray(data.cells) && Array.isArray(data.regions) &&
      (data.regions.length === 4 || isRectangularSize(data.regions.length)) && data.cells.length === data.regions.length + 2) {
      return { ...readLinkedDoubleArrowSudokuPad(data) }
    }
    if (record(data) && Array.isArray(data.cells) && !(Array.isArray(data.cages) && data.cages.some(cage => record(cage) && typeof cage.value === 'string')) &&
      (isRectangularSize(data.cells.length) || isJigsawSize(data.cells.length) ||
      data.cells.length === 4 && (hasDeclaredSudokuPadJigsaw(record(data.metadata) ? data.metadata.rules : undefined) ||
        ['lines', 'underlays', 'overlays', 'arrows'].some(field => Object.hasOwn(data, field))))) {
      return { ...readSizedRuleSudokuPad(data) }
    }
    const { givens, grid, rules, source } = decodeSizedSudokuPad(code, data)
    return { givens, grid, algebraic: { rules, source } }
  }
  throw new Error('This SudokuPad link does not contain the puzzle data. For Classic puzzles, copy the 81 givens.')
}

export const sudokuPad = {
  format: 'SudokuPad',
  links: {
    domains: ['sudokupad.app', 'beta.sudokupad.app', 'sudokupad.svencodes.com', 'app.crackingthecryptic.com'],
    absoluteOnly: ['sudokupad.svencodes.com', 'app.crackingthecryptic.com'],
    async read(url) {
      const host = url.hostname.replace(/^www\./, '')
      const path = url.pathname.slice(1).replace(/\/$/, '')
      const pathCode = decodeURIComponent(path)
      const code = pathCode || url.searchParams.get('puzzleid') || ''
      if ((host === 'sudokupad.app' || host === 'beta.sudokupad.app') && !/%2f/i.test(path) && publishedId.test(code) &&
        !/^(?:scl|ctc|scf|fpuz)/i.test(code)) return fromSudokuPad((await fetchPublishedExport('sudokupad', code)).code)
      return fromSudokuPad(code)
    },
  },
  readText(text) {
    if (/^(scf|scl|ctc)/i.test(text)) return fromSudokuPad(text)
  },
} as const satisfies PuzzleImporter
