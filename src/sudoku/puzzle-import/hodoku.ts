import { parsePuzzle } from '../formats.ts'
import type { PuzzleImporter } from './types.ts'

export const hoDoKu = {
  format: 'HoDoKu',
  readText(text) {
    if (text.startsWith(':')) return { givens: parsePuzzle(text) }
  },
} as const satisfies PuzzleImporter
