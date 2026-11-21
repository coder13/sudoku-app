import type { PuzzleCollection } from './collections.ts'

type BundledCollection = { file: string; header: Omit<PuzzleCollection, 'puzzles'> }

// The builder and client share source registration. Only the builder reads the grids.
export const BUNDLED_COLLECTIONS: readonly BundledCollection[] = [
  {
    file: 'nikoli-100',
    header: {
      id: 'nikoli-classics', title: 'Nikoli Classics', creator: 'Nikoli',
      description: 'Handmade classics by Nikoli.',
      sourceUrl: 'https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli',
      sourceRevision: '9034906b4ec06ab1e08daf110c6b562ef72859fd',
      license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      changes: 'Original givens and titles retained. Difficulty ratings added by this app.',
      kind: 'handmade',
    },
  },
  {
    file: 'sudoku-exchange',
    header: {
      id: 'sudoku-exchange', title: 'Sudoku Exchange Selection', creator: 'Grant McLean / Sudoku Exchange',
      description: 'A selection of generated classic puzzles across our difficulty levels.',
      sourceUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank',
      sourceRevision: 'd8c8ebaee0c08c412cfba96af1923dfa61c83317',
      license: 'Public domain', licenseUrl: 'https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt',
      changes: 'Original givens retained. Selection, titles, and difficulty ratings added by this app.',
      kind: 'generated',
    },
  },
]
