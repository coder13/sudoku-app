import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { collectionGridHash } from '../src/sudoku/collection-integrity.ts'
import { collectionPuzzleData, collectionVariantHash } from '../src/sudoku/collection-data.ts'
import { COLLECTION_FILES } from '../src/sudoku/collection-files.ts'
import { packPuzzleInfo } from '../src/sudoku/collection-index.ts'
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'
import { buildSinclairCatalog } from './pack-sinclair-library.mjs'

// Only this build step reads grids. The client imports the small metadata index.
const output = new URL('../public/collections/', import.meta.url)
await rm(output, { recursive: true, force: true })
const index = {}
for (const [id, filename] of Object.entries(COLLECTION_FILES)) {
  const puzzles = JSON.parse(await readFile(new URL(`../src/sudoku/collections/${filename}.json`, import.meta.url), 'utf8'))
  await mkdir(new URL(`${id}/`, output), { recursive: true })
  index[id] = []
  for (const { givens, puzzle: definition, ...puzzle } of puzzles) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(puzzle.id) || !/^[0-9]{81}$/.test(givens)) throw new Error(`Invalid puzzle: ${puzzle.id}`)
    const givensHash = collectionGridHash(givens)
    if (definition && (!isPlayablePuzzle('mixed', definition) || definition.givens !== givens)) throw new Error(`Invalid variant definition: ${puzzle.id}`)
    const data = collectionPuzzleData({ givens, puzzle: definition })
    const variantHash = definition ? collectionVariantHash(definition) : undefined
    index[id].push(packPuzzleInfo({ ...puzzle, givensHash, variantHash, bytes: Buffer.byteLength(data) }))
    await writeFile(new URL(`${id}/${puzzle.id}-${variantHash ?? givensHash}.txt`, output), data)
  }
}
await mkdir(new URL('../src/sudoku/generated/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/sudoku/generated/collection-index.json', import.meta.url), JSON.stringify(index))
await buildSinclairCatalog(output, new URL('../src/sudoku/generated/', import.meta.url))
