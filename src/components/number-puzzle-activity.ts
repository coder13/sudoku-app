import type { NumberGameConfig } from './NumberPuzzle'
import { numberGameNames, type NumberGame, type NumberPuzzleEntry } from '../number-puzzles/catalog'
import { numberPositionKey } from '../number-puzzles/generated-storage'
import { numberPuzzleImportKey } from '../number-puzzles/imported-storage'
import { openGeneratedNumberResults } from '../number-puzzles/difficulty-history'
import type { GeneratedNumberWindowResult, NumberHistoryEntry, NumberResultStatus } from '../number-puzzles/generated-results'
import { matchesSolvedNumberFilters, type SolvedPuzzleFilters } from '../sudoku/puzzle-activity'

export type NumberPuzzleHistoryRow = NumberHistoryEntry & { game: NumberGame; name: string }

export type NumberPuzzleQuery = { filterKey: string; filters?: SolvedPuzzleFilters; limit: number }

export type NumberPuzzleActivity = {
  query: NumberPuzzleQuery
  entries: NumberPuzzleHistoryRow[]
  saved: NumberPuzzleHistoryRow[]
  hasAny: boolean
  hasMore: boolean
  pending?: true
}

async function catalogActivity<Entry extends NumberPuzzleEntry>(
  config: NumberGameConfig<Entry>, status: NumberResultStatus, imported: readonly Entry[] = [],
) {
  const { readCatalogNumberResults } = await import('./NumberPuzzle')
  const { game, name } = config
  const results = readCatalogNumberResults(imported.length ? { ...config, entries: [...config.entries, ...imported] } : config, status)
  return {
    entries: results.entries.map(entry => ({ ...entry, game, name })),
    saved: status === 'started'
      ? imported.filter(entry => !results.status.has(entry.id)).reverse()
        .map(({ id, difficulty, number }) => ({ id, difficulty, number, imported: true as const, game, name }))
      : [],
  }
}

const readCatalogActivity = {
  async kakuro(status) {
    const { kakuro } = await import('./Kakuro')
    return catalogActivity(kakuro, status)
  },
  async calcudoku(status) {
    const [{ calcudoku }, { readCalcudokuImports }] = await Promise.all([
      import('./Calcudoku'), import('../calcudoku/imported-storage'),
    ])
    return catalogActivity(calcudoku, status, readCalcudokuImports())
  },
  async futoshiki(status) {
    const [{ futoshiki }, { readFutoshikiImports }] = await Promise.all([
      import('./Futoshiki'), import('../futoshiki/imported-storage'),
    ])
    return catalogActivity(futoshiki, status, readFutoshikiImports())
  },
  async hidato(status) {
    const { hidato } = await import('./Hidato')
    return catalogActivity(hidato, status)
  },
  async rullo(status) {
    const { rullo } = await import('./Rullo')
    return catalogActivity(rullo, status)
  },
} satisfies Record<NumberGame, (status: NumberResultStatus) => ReturnType<typeof catalogActivity>>

function gamesWithCatalogSaves(): NumberGame[] {
  try {
    const keys = Object.keys(localStorage)
    return (Object.keys(readCatalogActivity) as NumberGame[]).filter(game => {
      const prefix = numberPositionKey(game, '')
      return keys.some(key => key.startsWith(prefix) || key === numberPuzzleImportKey(game))
    })
  } catch {
    return []
  }
}

export async function openNumberPuzzleHistory(status: NumberResultStatus, publish: (result: NumberPuzzleActivity) => void) {
  const games = await Promise.all(gamesWithCatalogSaves().map(game => readCatalogActivity[game](status)))
  const catalog = games.flatMap(game => game.entries)
  const saved = games.flatMap(game => game.saved)
  const sources = ['kakuro', 'calcudoku'] as const
  const generated = new Map<NumberGame, GeneratedNumberWindowResult>()
  let revision = 0
  let current: NumberPuzzleQuery | undefined
  let visibleCatalog: NumberPuzzleHistoryRow[] = []
  let subscriptions: ReturnType<typeof openGeneratedNumberResults>[] | undefined

  return {
    query(query: NumberPuzzleQuery) {
      if (query === current) return
      const newFilters = current?.filterKey !== query.filterKey
      current = query
      generated.clear()
      if (newFilters) {
        const { filters } = query
        visibleCatalog = catalog.filter(row => !filters || matchesSolvedNumberFilters(row, filters))
        if (visibleCatalog.length || saved.length) {
          publish({ query, entries: visibleCatalog, saved, hasAny: catalog.length > 0, hasMore: false, pending: true })
        }
      }
      // A row after the first N from its own game cannot rank in the first N overall.
      const window = { revision: ++revision, limit: query.limit, filters: query.filters }
      if (subscriptions) {
        for (const subscription of subscriptions) subscription.query(window)
        return
      }
      subscriptions = sources.map(game => openGeneratedNumberResults({ game, status, window }, result => {
        if (!current || !('revision' in result) || result.revision !== revision) return
        generated.set(game, result)
        if (generated.size !== sources.length) return
        publish({
          query: current,
          saved,
          entries: [
            ...visibleCatalog,
            ...sources.flatMap(game => generated.get(game)!.entries.map(entry => ({ ...entry, game, name: numberGameNames[game] }))),
          ],
          hasAny: catalog.length > 0 || sources.some(game => generated.get(game)!.hasAny),
          hasMore: sources.some(game => generated.get(game)!.hasMore),
        })
      }))
    },
    close() { subscriptions?.forEach(subscription => subscription.close()) },
  }
}
