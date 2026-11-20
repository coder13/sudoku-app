import { calcudoku } from './Calcudoku'
import { futoshiki } from './Futoshiki'
import { hidato } from './Hidato'
import { kakuro } from './Kakuro'
import { readCatalogNumberResults, type NumberGameConfig } from './NumberPuzzle'
import { rullo } from './Rullo'
import type { NumberGame, NumberPuzzleEntry } from '../number-puzzles/catalog'
import { requestGeneratedNumberResults } from '../number-puzzles/difficulty-history'
import type { ActiveNumberEntry } from '../number-puzzles/generated-results'

export type ActiveNumberPuzzle = ActiveNumberEntry & { game: NumberGame; name: string }

export type NumberPuzzleActivity = { entries: ActiveNumberPuzzle[]; loading: boolean }

function catalogActivity<Entry extends NumberPuzzleEntry>(config: NumberGameConfig<Entry>) {
  const { game, name } = config
  return readCatalogNumberResults(config).active.map(entry => ({ ...entry, game, name }))
}

export function requestActiveNumberPuzzles(publish: (result: NumberPuzzleActivity) => void) {
  const catalog = [
    ...catalogActivity(kakuro),
    ...catalogActivity(calcudoku),
    ...catalogActivity(futoshiki),
    ...catalogActivity(hidato),
    ...catalogActivity(rullo),
  ]
  const sources = [kakuro, calcudoku]
  const generated = new Map<NumberGame, ActiveNumberPuzzle[]>()
  publish({ entries: catalog, loading: true })
  const cancel = sources.map(({ game, name }) => requestGeneratedNumberResults(game, ({ active }) => {
    generated.set(game, active.map(entry => ({ ...entry, game, name })))
    publish({
      entries: [...catalog, ...sources.flatMap(({ game }) => generated.get(game) ?? [])],
      loading: generated.size < sources.length,
    })
  }))
  return () => { cancel.forEach(stop => stop()) }
}
