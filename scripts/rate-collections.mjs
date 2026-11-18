import { readFile, writeFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { COLLECTION_FILES } from '../src/sudoku/collection-files.ts'
import { collectionVariantHash } from '../src/sudoku/collection-data.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

// Run after build:wasm whenever the engine's grading rules change.
const handle = createEngineHandler(async () => {
  const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  return (await WebAssembly.instantiate(bytes)).instance.exports
})
let id = 0
async function run(request) {
  const response = await handle({ id: ++id, request })
  if (!('value' in response)) throw new Error(JSON.stringify(response))
  return response.value
}

const { difficultyOrder } = await run({ type: 'techniques' })
const classic = await run({ type: 'techniques' })
const variant = await run({ type: 'techniques', variant: true })
const variantOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
const output = []
const seen = new Set()
for (const file of Object.values(COLLECTION_FILES)) {
  const filename = file + '.json'
  const url = new URL('../src/sudoku/collections/' + filename, import.meta.url)
  const puzzles = JSON.parse(await readFile(url, 'utf8'))
  for (const puzzle of puzzles) {
    const identity = puzzle.puzzle ? collectionVariantHash(puzzle.puzzle) : puzzle.givens
    if (seen.has(identity)) throw new Error('Duplicate grid: ' + puzzle.id)
    seen.add(identity)
    const position = { puzzle: puzzle.puzzle }
    if (await run(puzzle.puzzle ? { type: 'variant', operation: 'analyze', position }
      : { type: 'analyze', values: puzzle.givens }) !== 'unique') {
      throw new Error('Puzzle does not have one solution: ' + puzzle.id)
    }
    const rating = await run(puzzle.puzzle ? { type: 'variant', operation: 'rate', position, techniqueOrder: variantOrder }
      : { type: 'rate', values: puzzle.givens, techniqueOrder: difficultyOrder })
    if (rating.status === 'stalled') throw new Error('No complete logical solve: ' + puzzle.id)
    Object.assign(puzzle, {
      difficulty: rating.status.solved,
      points: puzzle.puzzle ? rating.points : rating.score.points,
      hardestTechnique: puzzle.puzzle ? rating.hardest : rating.score.hardest,
      scoringVersion: rating.scoringVersion,
    })
  }
  const contents = file.startsWith('sinclair-')
    ? '[\n  ' + puzzles.map(puzzle => JSON.stringify(puzzle)).join(',\n  ') + '\n]\n'
    : JSON.stringify(puzzles, null, 2) + '\n'
  output.push([url, contents])
  console.log(filename + ': ' + puzzles.length + ' puzzles checked and rated')
}
// Write the catalogs together after every puzzle passes the checks.
for (const [url, content] of output) await writeFile(url, content)
