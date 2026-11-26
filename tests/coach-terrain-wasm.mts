import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { parsePuzzleExport, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sandwich-terrain-unsupported.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
}

test('#196 imports the reviewed Terrain source and checks its transformed maxima in Wasm', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  assertVariantCompletion(parsed.variant.puzzle, source.source.solution)

  const rules = parsed.variant.puzzle.rules ?? []
  const firstTerrainRule = rules.findIndex(rule => rule.type === 'terrain-sandwich')
  assert.notEqual(firstTerrainRule, -1)
  const alteredRules = rules.map((rule, index) => index === firstTerrainRule && rule.type === 'terrain-sandwich'
    ? { ...rule, maximum: rule.maximum + 1 }
    : rule)
  const altered = await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: { ...parsed.variant.puzzle, rules: alteredRules },
  } })
  assert.notEqual(altered.status, 'unique', 'the Wasm engine must enforce every imported Terrain maximum')

  const { game } = await prepareImportedPuzzle(source.source.sudoku)
  assert.equal(game.variant?.solution, source.source.solution)
  assert.equal(game.givenCellColors && Object.keys(game.givenCellColors).length > 0, true)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant, game.variant)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.givenCellColors, game.givenCellColors)
  const shared = parsePuzzleExport(puzzleExportText(game))
  assert.deepEqual(shared.variant, { id: game.variant?.id, puzzle: game.variant?.puzzle })
  assert.deepEqual(shared.givenCellColors, game.givenCellColors)
})
