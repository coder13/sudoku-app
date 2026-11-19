import type { Game } from '../../src/sudoku/game.ts'
import { puzzleDefinitionForSharing, type SharedPuzzleDefinition } from '../../src/sudoku/puzzle-sharing.ts'
import { syncRequest } from '../../src/sudoku/sync-engine.ts'
import { syncDatabase } from './sync-database.ts'

export async function publishFixture(game: Game): Promise<SharedPuzzleDefinition> {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const { id } = await api<{ id: string }>('shares', 'POST', puzzleDefinitionForSharing(game))
    return await api(`shares/${id}`)
  } finally { sqlite.close() }
}
