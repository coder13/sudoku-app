import { calcudoku } from './Calcudoku'
import { futoshiki } from './Futoshiki'
import { hidato } from './Hidato'
import { kakuro } from './Kakuro'
import { readCatalogNumberResults, type NumberGameConfig } from './NumberPuzzle'
import { rullo } from './Rullo'
import type { NumberGame, NumberPuzzleEntry } from '../number-puzzles/catalog'
import { openGeneratedNumberResults } from '../number-puzzles/difficulty-history'
import type { GeneratedNumberWindowResult, NumberHistoryEntry, NumberResultStatus } from '../number-puzzles/generated-results'
import { matchesSolvedNumberFilters, type SolvedPuzzleFilters } from '../sudoku/puzzle-activity'

export type NumberPuzzleHistoryRow = NumberHistoryEntry & { game: NumberGame; name: string }

export type NumberPuzzleQuery = { filterKey: string; filters?: SolvedPuzzleFilters; limit: number }

export type NumberPuzzleActivity = {
  query: NumberPuzzleQuery
  entries: NumberPuzzleHistoryRow[]
  hasAny: boolean
  hasMore: boolean
  pending?: true
}

function catalogActivity<Entry extends NumberPuzzleEntry>(config: NumberGameConfig<Entry>, status: NumberResultStatus) {
  const { game, name } = config
  return readCatalogNumberResults(config, status).entries.map(entry => ({ ...entry, game, name }))
}

export function openNumberPuzzleHistory(status: NumberResultStatus, publish: (result: NumberPuzzleActivity) => void) {
  const catalog = [
    ...catalogActivity(kakuro, status),
    ...catalogActivity(calcudoku, status),
    ...catalogActivity(futoshiki, status),
    ...catalogActivity(hidato, status),
    ...catalogActivity(rullo, status),
  ]
  const sources = [kakuro, calcudoku]
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
        if (visibleCatalog.length) {
          publish({ query, entries: visibleCatalog, hasAny: true, hasMore: false, pending: true })
        }
      }
      // A row after the first N from its own game cannot rank in the first N overall.
      const window = { revision: ++revision, limit: query.limit, filters: query.filters }
      if (subscriptions) {
        for (const subscription of subscriptions) subscription.query(window)
        return
      }
      subscriptions = sources.map(({ game }) => openGeneratedNumberResults({ game, status, window }, result => {
        if (!current || !('revision' in result) || result.revision !== revision) return
        generated.set(game, result)
        if (generated.size !== sources.length) return
        publish({
          query: current,
          entries: [
            ...visibleCatalog,
            ...sources.flatMap(({ game, name }) => generated.get(game)!.entries.map(entry => ({ ...entry, game, name }))),
          ],
          hasAny: catalog.length > 0 || sources.some(({ game }) => generated.get(game)!.hasAny),
          hasMore: sources.some(({ game }) => generated.get(game)!.hasMore),
        })
      }))
    },
    close() { subscriptions?.forEach(subscription => subscription.close()) },
  }
}
