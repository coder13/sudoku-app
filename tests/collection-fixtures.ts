import { readFileSync } from 'node:fs'
import { COLLECTIONS, type CollectionPuzzle } from '../src/sudoku/collections.ts'
import { COLLECTION_FILES } from '../src/sudoku/collection-files.ts'

// Source grids are test/build inputs only, never client imports.
export const fullCollections = COLLECTIONS.filter(c => Object.hasOwn(COLLECTION_FILES, c.id)).map((collection) => {
  const file = COLLECTION_FILES[collection.id]
  const source = JSON.parse(readFileSync(new URL(`../src/sudoku/collections/${file}.json`, import.meta.url), 'utf8')) as CollectionPuzzle[]
  return { ...collection, puzzles: collection.puzzles.map(info => ({ ...source.find(puzzle => puzzle.id === info.id)!, ...info })) }
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
