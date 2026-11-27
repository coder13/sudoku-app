import { parsePuzzle, textGridCells } from './formats.ts'
import { isGridText, MINI_GRID } from './grid.ts'
import { fPuzzles } from './puzzle-import/f-puzzles.ts'
import { hoDoKu } from './puzzle-import/hodoku.ts'
import { readNativeLink, type NativeImport } from './puzzle-import/native-link.ts'
import { MAX_DECODED_LENGTH, MAX_IMPORT_LENGTH } from './puzzle-import/shared.ts'
import { sudokuCoach } from './puzzle-import/sudoku-coach.ts'
import { sudokuExchange } from './puzzle-import/sudoku-exchange.ts'
import { sudokuPad } from './puzzle-import/sudoku-pad.ts'
import { decodeSizedSudokuPad } from './sized-sudoku-pad.ts'
import { isPuzzleExport, parsePuzzleExport } from './puzzle-sharing.ts'
import type { ImportResult, PuzzleImporter } from './puzzle-import/types.ts'

export { importSharedPuzzle } from './puzzle-import/native-link.ts'
export { decodeCoachSix } from './puzzle-import/sudoku-coach.ts'
export { MAX_IMPORT_LENGTH } from './puzzle-import/shared.ts'

const importers = [sudokuCoach, sudokuExchange, sudokuPad, hoDoKu, fPuzzles] as const satisfies readonly PuzzleImporter[]
export type ImportFormat = typeof importers[number]['format'] | NativeImport['format'] | 'Puzzle export' | 'Text grid' | 'Manual entry'
export type ImportedPuzzle = ImportResult & { format: ImportFormat }

type LinkReader = {
  format: ImportFormat
  read: NonNullable<PuzzleImporter['links']>['read']
  allowBareDomain: boolean
}

const linkReaders = new Map<string, LinkReader>()
for (const importer of importers) {
  if (!('links' in importer)) continue
  const { domains, absoluteOnly, read }: NonNullable<PuzzleImporter['links']> = importer.links
  for (const domain of domains) {
    if (linkReaders.has(domain)) throw new Error(`Duplicate puzzle import domain: ${domain}`)
    linkReaders.set(domain, { format: importer.format, read, allowBareDomain: !absoluteOnly?.includes(domain) })
  }
}

function parseImportUrl(text: string, origin: string) {
  const bareDomain = /^([a-z0-9.-]+)\//i.exec(text)?.[1]?.toLowerCase().replace(/^www\./, '')
  const link = bareDomain && linkReaders.get(bareDomain)?.allowBareDomain ? `https://${text}` : text
  if (/^(https?:\/\/|#(?:puzzle|variant|sized)=|\/\?share=)/i.test(link) && URL.canParse(link, origin)) {
    return new URL(link, origin)
  }
}

export async function detectPuzzle(input: string): Promise<ImportedPuzzle> {
  const text = input.trim().replace(/^```(?:text)?\s*([\s\S]*?)\s*```$/i, '$1')
  // App exports may include authored artwork and exceed the provider-code paste limit.
  // Keep them within the same hard bound as decoded source data.
  if (text.length > MAX_DECODED_LENGTH) throw new Error('Paste one puzzle at a time.')
  const largePuzzleExport = text.length > MAX_IMPORT_LENGTH && isPuzzleExport(text)
  if (text.length > MAX_IMPORT_LENGTH && !largePuzzleExport) throw new Error('Paste one puzzle at a time.')
  if (largePuzzleExport || isPuzzleExport(text)) {
    const { title, givens, variant, collection, grid, sizedRules, sizedAuthor, algebraic, whispersGuide, givenCellColors, authoredArtwork } = parsePuzzleExport(text)
    const sizing = algebraic && 'sudokuPad' in algebraic ? decodeSizedSudokuPad(algebraic.sudokuPad) : undefined
    if (sizing && sizing.givens !== givens) throw new Error('The SudokuPad definition does not match the exported givens.')
    const cages = sizing ? { rules: sizing.rules, source: sizing.source } : algebraic && 'rules' in algebraic ? algebraic : undefined
    return { givens, title, variant, collection, grid, sizedRules, sizedAuthor, ...(cages && { algebraic: cages }),
      ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }), ...(authoredArtwork && { authoredArtwork }),
      format: 'Puzzle export' }
  }
  const ownOrigin = globalThis.window?.location?.origin
  const url = parseImportUrl(text, ownOrigin ?? 'https://sudoku.invalid')
  if (url) {
    // Native shares and fragments can use a URL that also matches an external provider.
    const native = readNativeLink(url, ownOrigin)
    if (native !== undefined) return native
    const reader = linkReaders.get(url.hostname.replace(/^www\./, ''))
    if (reader) {
      const puzzle = reader.read(url)
      if (puzzle !== undefined) return { ...await puzzle, format: reader.format }
    }
    throw new Error('This link format is not supported. Try pasting the puzzle code or its 81 givens.')
  }
  for (const importer of importers) {
    if (!('readText' in importer)) continue
    const puzzle = importer.readText(text)
    if (puzzle !== undefined) return { ...await puzzle, format: importer.format }
  }
  for (const importer of importers) {
    if (!('readUnmarkedText' in importer)) continue
    const puzzle = importer.readUnmarkedText(text)
    if (puzzle !== undefined) return { ...await puzzle, format: importer.format }
  }
  const mini = textGridCells(text).replaceAll('.', '0')
  if (isGridText(mini, MINI_GRID)) return { givens: mini, format: 'Text grid', grid: MINI_GRID }
  return { givens: parsePuzzle(text), format: 'Text grid' }
}
