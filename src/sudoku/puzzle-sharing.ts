import { isCollectionReference, type CollectionReference } from './collection-reference.ts'
import type { Game } from './game.ts'
import { CLASSIC_GRID, isGridText, isMiniGrid, type MiniGrid } from './grid.ts'
import { isAlgebraicCageList, type AlgebraicCage } from './algebraic-cages.ts'
import { isSizedSudokuPadCode } from './sized-sudoku-pad.ts'
import { isPlayablePuzzle, isPuzzleVariantId, type VariantGame } from './variants.ts'

export type SharedPuzzleDefinition = {
  version: 1
  title: string
  givens: string
  grid?: MiniGrid
  algebraic?: { rules: readonly AlgebraicCage[] } | { sudokuPad: string }
  variant?: Pick<VariantGame, 'id' | 'puzzle'>
  collection?: CollectionReference
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

export function puzzleDefinitionForSharing(game: Game): SharedPuzzleDefinition {
  if (game.source === 'draft') throw new Error('Save this puzzle before creating a share link.')
  const variant = game.variant
  const { rules, regions } = variant?.puzzle ?? {}
  const collection = game.collection && { collectionId: game.collection.collectionId, puzzleId: game.collection.puzzleId }
  const algebraic = game.algebraic?.source ? { sudokuPad: game.algebraic.source.code }
    : game.algebraic ? { rules: game.algebraic.rules } : undefined
  return {
    version: 1, title: game.title, givens: game.givens, grid: game.grid,
    variant: variant && { id: variant.id, puzzle: { version: variant.puzzle.version, givens: game.givens, rules, regions } },
    collection,
    ...(algebraic && { algebraic }),
  }
}

async function sharingRequest(path: string, definition?: SharedPuzzleDefinition, signal?: AbortSignal): Promise<unknown> {
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
  const data = await sharingRequest(`/${id.toLowerCase()}`, undefined, signal) as Partial<SharedPuzzleDefinition>
  const { version, title, givens, variant, collection, grid, algebraic } = data
  if (version !== 1 || typeof title !== 'string' || !title.trim() || title.length > 72 ||
    (grid !== undefined && (!isMiniGrid(grid) || variant !== undefined)) || !isGridText(givens, grid ?? CLASSIC_GRID) ||
    (algebraic !== undefined && (!grid || !validSharedAlgebraic(algebraic))) ||
    (variant !== undefined && (!variant || !isPuzzleVariantId(variant.id) ||
      !isPlayablePuzzle(variant.id, variant.puzzle) || variant.puzzle.givens !== givens)) ||
    (collection !== undefined && !isCollectionReference(collection))) {
    throw new Error('This link uses an unsupported puzzle definition.')
  }
  return { version, title, givens, variant, collection, grid, ...(algebraic && { algebraic }) }
}

function validSharedAlgebraic(value: unknown): value is NonNullable<SharedPuzzleDefinition['algebraic']> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return false
  return 'sudokuPad' in value ? isSizedSudokuPadCode(value.sudokuPad) : 'rules' in value && isAlgebraicCageList(value.rules)
}
