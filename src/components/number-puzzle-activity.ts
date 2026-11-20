import { calcudoku } from './Calcudoku'
import { futoshiki } from './Futoshiki'
import { hidato } from './Hidato'
import { kakuro } from './Kakuro'
import { readCatalogNumberResults, type NumberGameConfig } from './NumberPuzzle'
import { rullo } from './Rullo'
import type { NumberGame, NumberPuzzleEntry } from '../number-puzzles/catalog'
import { requestGeneratedNumberResults } from '../number-puzzles/difficulty-history'
import type { NumberHistoryEntry, NumberResultStatus } from '../number-puzzles/generated-results'

export type NumberPuzzleHistoryRow = NumberHistoryEntry & { game: NumberGame; name: string }

export type NumberPuzzleActivity = { entries: NumberPuzzleHistoryRow[]; loading: boolean }

function catalogActivity<Entry extends NumberPuzzleEntry>(config: NumberGameConfig<Entry>, status: NumberResultStatus) {
  const { game, name } = config
  return readCatalogNumberResults(config, status).entries.map(entry => ({ ...entry, game, name }))
}

export function requestNumberPuzzleHistory(status: NumberResultStatus, publish: (result: NumberPuzzleActivity) => void) {
  const catalog = [
    ...catalogActivity(kakuro, status),
    ...catalogActivity(calcudoku, status),
    ...catalogActivity(futoshiki, status),
    ...catalogActivity(hidato, status),
    ...catalogActivity(rullo, status),
  ]
  const sources = [kakuro, calcudoku]
  const generated = new Map<NumberGame, NumberPuzzleHistoryRow[]>()
  publish({ entries: catalog, loading: true })
  const cancel = sources.map(({ game, name }) => requestGeneratedNumberResults({ game, status }, ({ entries }) => {
    generated.set(game, entries.map(entry => ({ ...entry, game, name })))
    publish({
      entries: [...catalog, ...sources.flatMap(({ game }) => generated.get(game) ?? [])],
      loading: generated.size < sources.length,
    })
  }))
  return () => { cancel.forEach(stop => stop()) }
}
