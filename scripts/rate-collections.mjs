import { readFile, writeFile } from 'node:fs/promises'
import { BUNDLED_COLLECTIONS } from '../src/sudoku/collection-files.ts'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'

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
const output = []
const seen = new Set()
for (const { file } of BUNDLED_COLLECTIONS) {
  const filename = file + '.json'
  const url = new URL('../src/sudoku/collections/' + filename, import.meta.url)
  const puzzles = JSON.parse(await readFile(url, 'utf8'))
  for (const puzzle of puzzles) {
    if (seen.has(puzzle.givens)) throw new Error('Duplicate grid: ' + puzzle.id)
    seen.add(puzzle.givens)
    if (await run({ type: 'analyze', values: puzzle.givens }) !== 'unique') {
      throw new Error('Puzzle does not have one solution: ' + puzzle.id)
    }
    const rating = await run({ type: 'rate', values: puzzle.givens, techniqueOrder: difficultyOrder })
    if (rating.status === 'stalled') throw new Error('No complete logical solve: ' + puzzle.id)
    Object.assign(puzzle, {
      difficulty: rating.status.solved,
      points: rating.score.points,
      hardestTechnique: rating.score.hardest,
      scoringVersion: rating.scoringVersion,
    })
  }
  output.push([url, JSON.stringify(puzzles, null, 2) + '\n'])
  console.log(filename + ': ' + puzzles.length + ' puzzles checked and rated')
}
// Do not change either file until all puzzles pass the checks.
for (const [url, content] of output) await writeFile(url, content)
