import { isCollectionReference, type CollectionReference } from './collection-reference.ts'
import type { Game } from './game.ts'
import { CLASSIC_GRID, isGridText, isSizedGrid, type SizedGrid } from './grid.ts'
import { isSizedRuleAuthor, isSizedRuleList, type SizedRuleGame } from './sized-rule-game.ts'
import { isAlgebraicCageList, type AlgebraicCage } from './algebraic-cages.ts'
import { isSizedSudokuPadCode } from './sized-sudoku-pad.ts'
import { isPlayablePuzzle, isPuzzleVariantId, type VariantGame } from './variants.ts'
import { whispersLinkCounts } from './whispers-guide.ts'
import { validGivenCellColors, type ImportedCellColors } from './imported-colors.ts'
import { validAuthoredArtwork, type AuthoredMark } from './authored-artwork.ts'

export type SharedPuzzleDefinition = {
  version: 1
  title: string
  givens: string
  grid?: SizedGrid
  sizedRules?: SizedRuleGame['rules']
  sizedAuthor?: string
  algebraic?: { rules: readonly AlgebraicCage[] } | { sudokuPad: string }
  variant?: Pick<VariantGame, 'id' | 'puzzle' | 'fog'>
  whispersGuide?: true
  givenCellColors?: ImportedCellColors
  authoredArtwork?: readonly AuthoredMark[]
  collection?: CollectionReference
}

type SharedPuzzlePayload = SharedPuzzleDefinition & {
  sixRules?: SharedPuzzleDefinition['sizedRules']
  sixAuthor?: string
}

export function isSharedPuzzleId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
}

export function findSharedAttempt(games: readonly Game[], id: string) {
  return games.find(game => game.sharedPuzzleId === id.toLowerCase())
}

export function sharedPuzzleLink(id: string, origin: string) {
  return `${origin}/?${new URLSearchParams({ share: id })}`
}

export function puzzleDefinitionForSharing(game: Game): SharedPuzzlePayload {
  if (game.source === 'draft') throw new Error('Save this puzzle before creating a share link.')
  const variant = game.variant
  const { rules, regions } = variant?.puzzle ?? {}
  const collection = game.collection && { collectionId: game.collection.collectionId, puzzleId: game.collection.puzzleId }
  const algebraic = game.algebraic?.source ? { sudokuPad: game.algebraic.source.code }
    : game.algebraic ? { rules: game.algebraic.rules } : undefined
  return {
    version: 1, title: game.title, givens: game.givens, grid: game.grid,
    variant: variant && { id: variant.id, puzzle: { version: variant.puzzle.version, givens: game.givens, rules, regions }, ...(variant.fog && { fog: variant.fog }) },
    collection,
    ...(game.whispersGuide && { whispersGuide: true }),
    ...(game.givenCellColors && { givenCellColors: game.givenCellColors }),
    ...(game.authoredArtwork && { authoredArtwork: game.authoredArtwork }),
    ...(algebraic && { algebraic }),
    ...(game.sized && (game.grid?.size === 6
      ? { sixRules: game.sized.rules, ...(game.sized.author && { sixAuthor: game.sized.author }) }
      : { sizedRules: game.sized.rules, ...(game.sized.author && { sizedAuthor: game.sized.author }) })),
  }
}

export function puzzleExportText(game: Game) {
  return `${JSON.stringify({ ...puzzleDefinitionForSharing(game), format: 'sudoku-app-puzzle' }, null, 2)}\n`
}

async function sharingRequest(path: string, definition?: SharedPuzzlePayload, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(20_000)
  let response: Response
  try {
    response = await fetch(`/api/v1/shares${path}`, {
      method: definition ? 'POST' : 'GET', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: definition ? { 'Content-Type': 'application/json' } : undefined,
      body: definition && JSON.stringify(definition),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    const message = navigator.onLine ? 'Puzzle sharing is unavailable. Try again in a moment.' : 'Connect to the internet to use puzzle links.'
    throw new Error(message)
  }
  if (response.status === 404 && !definition) throw new Error('This puzzle link is unavailable.')
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error ?? 'Puzzle sharing is unavailable. Try again in a moment.')
  return data
}

export async function publishSharedPuzzle(game: Game, signal?: AbortSignal): Promise<string> {
  const data = await sharingRequest('', puzzleDefinitionForSharing(game), signal) as { id?: unknown }
  if (!isSharedPuzzleId(data.id)) throw new Error('The sharing service did not return a valid link.')
  return data.id
}

export async function downloadSharedPuzzle(id: string, signal?: AbortSignal): Promise<SharedPuzzleDefinition> {
  if (!isSharedPuzzleId(id)) throw new Error('This puzzle link is invalid.')
  return validatePuzzleDefinition(await sharingRequest(`/${id.toLowerCase()}`, undefined, signal), 'link')
}

export function parsePuzzleExport(text: string): SharedPuzzleDefinition {
  let value: unknown
  try { value = JSON.parse(text) }
  catch { throw new Error('This puzzle export is unreadable. Copy it again and try once more.') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { format?: unknown }).format !== 'sudoku-app-puzzle') {
    throw new Error('This puzzle export uses an unsupported definition.')
  }
  return validatePuzzleDefinition(value)
}

export function isPuzzleExport(text: string) {
  try {
    const value: unknown = JSON.parse(text)
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as { format?: unknown }).format === 'sudoku-app-puzzle')
  } catch { return false }
}

function validatePuzzleDefinition(value: unknown, source: 'link' | 'export' = 'export'): SharedPuzzleDefinition {
  const unsupported = source === 'link' ? 'This link uses an unsupported puzzle definition.' : 'This puzzle export uses an unsupported definition.'
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(unsupported)
  }
  const data = value as Partial<SharedPuzzlePayload>
  const { version, title, givens, variant, collection, grid, algebraic, sixRules, sixAuthor, whispersGuide, givenCellColors, authoredArtwork } = data
  const legacy = sixRules !== undefined || sixAuthor !== undefined
  const sizedRules = legacy ? sixRules : data.sizedRules
  const sizedAuthor = legacy ? sixAuthor : data.sizedAuthor
  if (version !== 1 || typeof title !== 'string' || !title.trim() || title.length > 72 ||
    (grid !== undefined && (!isSizedGrid(grid) || variant !== undefined)) || !isGridText(givens, grid ?? CLASSIC_GRID) ||
    (algebraic !== undefined && (grid?.size !== 4 || !validSharedAlgebraic(algebraic))) ||
    (legacy && (grid?.size !== 6 || data.sizedRules !== undefined || data.sizedAuthor !== undefined)) ||
    (grid && grid.size !== 4 && sizedRules === undefined) ||
    (sizedRules !== undefined && (!grid || algebraic !== undefined || !isSizedRuleList(sizedRules, grid) ||
      (grid.size === 4 && !sizedRules.length))) ||
    (sizedAuthor !== undefined && (!sizedRules || !isSizedRuleAuthor(sizedAuthor))) ||
    (variant !== undefined && (!variant || !isPuzzleVariantId(variant.id) ||
      !isPlayablePuzzle(variant.id, variant.puzzle, variant.fog) || variant.puzzle.givens !== givens)) ||
    (whispersGuide !== undefined && (whispersGuide !== true || variant?.id !== 'whispers' || !whispersLinkCounts(variant.puzzle))) ||
    (givenCellColors !== undefined && (variant?.fog !== undefined ||
      !validGivenCellColors(givenCellColors, variant, grid))) ||
    (authoredArtwork !== undefined && (grid !== undefined || !variant || variant.fog !== undefined || !validAuthoredArtwork(authoredArtwork))) ||
    (collection !== undefined && !isCollectionReference(collection))) {
    throw new Error(unsupported)
  }
  return { version, title, givens, variant, collection, grid, sizedRules, sizedAuthor,
    ...(algebraic && { algebraic }), ...(whispersGuide && { whispersGuide }), ...(givenCellColors && { givenCellColors }),
    ...(authoredArtwork && { authoredArtwork }) }
}

function validSharedAlgebraic(value: unknown): value is NonNullable<SharedPuzzleDefinition['algebraic']> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return false
  return 'sudokuPad' in value ? isSizedSudokuPadCode(value.sudokuPad) : 'rules' in value && isAlgebraicCageList(value.rules)
}
