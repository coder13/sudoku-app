import { digitRuns } from './digit-runs.ts'
import type { PuzzleImporter } from './types.ts'

export const sudokuExchange = {
  format: 'Sudoku Exchange',
  links: {
    domains: ['sudokuexchange.com'],
    read(url) {
      if (/^\/play\/?$/.test(url.pathname)) return digitRuns(url.searchParams.get('s') ?? '', 'Sudoku Exchange')
    },
  },
} as const satisfies PuzzleImporter
