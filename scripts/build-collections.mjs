import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { BUNDLED_COLLECTIONS } from '../src/sudoku/collection-files.ts'
import { collectionGridHash } from '../src/sudoku/collection-integrity.ts'

// Only this build step reads grids. The client imports the small metadata index.
const output = new URL('../public/collections/', import.meta.url)
await rm(output, { recursive: true, force: true })
const index = {}
for (const { file, header: { id } } of BUNDLED_COLLECTIONS) {
  const puzzles = JSON.parse(await readFile(new URL(`../src/sudoku/collections/${file}.json`, import.meta.url), 'utf8'))
  await mkdir(new URL(`${id}/`, output), { recursive: true })
  index[id] = []
  for (const { givens, ...puzzle } of puzzles) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(puzzle.id) || !/^[0-9]{81}$/.test(givens)) throw new Error(`Invalid puzzle: ${puzzle.id}`)
    const givensHash = collectionGridHash(givens)
    index[id].push({ ...puzzle, givensHash, bytes: Buffer.byteLength(givens) })
    await writeFile(new URL(`${id}/${puzzle.id}-${givensHash}.txt`, output), givens)
  }
}
await mkdir(new URL('../src/sudoku/generated/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/sudoku/generated/collection-index.json', import.meta.url), JSON.stringify(index))
