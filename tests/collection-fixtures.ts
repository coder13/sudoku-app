import { readFileSync } from 'node:fs'
import { BUNDLED_COLLECTIONS } from '../src/sudoku/collection-files.ts'
import { COLLECTIONS, type CollectionPuzzle } from '../src/sudoku/collections.ts'

// Source grids are test/build inputs only, never client imports.
export const fullCollections = BUNDLED_COLLECTIONS.map(({ file, header }) => {
  const collection = COLLECTIONS.find(({ id }) => id === header.id)!
  const source = JSON.parse(readFileSync(new URL(`../src/sudoku/collections/${file}.json`, import.meta.url), 'utf8')) as CollectionPuzzle[]
  return { ...collection, puzzles: collection.puzzles.map(info => ({ ...info, givens: source.find(puzzle => puzzle.id === info.id)!.givens })) }
})

export class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

export const puzzleResponse = async (url: string | URL | Request) => {
  const path = typeof url === 'string' ? url : url instanceof URL ? url.pathname : url.url
  return new Response(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'))
}
