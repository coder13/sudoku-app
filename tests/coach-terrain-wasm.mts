import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { parsePuzzleExport, puzzleDefinitionForSharing, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncRequest } from '../src/sudoku/sync-engine.ts'
import { syncDatabase } from './helpers/sync-database.ts'
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

  const ratioTwoCompanion = { type: 'kropki' as const, ratioTwo: { pairs: [[6, 15] as [number, number]] } }
  const combinedPuzzle = { ...parsed.variant.puzzle, rules: [...rules, ratioTwoCompanion] }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: combinedPuzzle } }),
    { status: 'unique', solution: source.source.solution })

  const { game } = await prepareImportedPuzzle(source.source.sudoku)
  assert.equal(game.variant?.solution, source.source.solution)
  assert.equal(game.givenCellColors && Object.keys(game.givenCellColors).length > 0, true)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant, game.variant)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.givenCellColors, game.givenCellColors)
  const shared = parsePuzzleExport(puzzleExportText(game))
  assert.deepEqual(shared.variant, { id: game.variant?.id, puzzle: game.variant?.puzzle })
  assert.deepEqual(shared.givenCellColors, game.givenCellColors)

  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const combinedGame = { ...game, variant: { ...game.variant!, puzzle: combinedPuzzle } }
    const definition = puzzleDefinitionForSharing(combinedGame)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), JSON.parse(JSON.stringify(definition)))

    type RulePayload = {
      type: string
      cells?: number[]
      direction?: string
      maximum?: number
      transforms?: { multiplier: number; offset: number }[]
    }
    type VariantPayload = { puzzle: { rules: RulePayload[] } }
    const changeTerrain = (edit: (rule: RulePayload) => void) => {
      const invalid = JSON.parse(JSON.stringify(definition)) as { variant: VariantPayload }
      edit(invalid.variant.puzzle.rules.find(rule => rule.type === 'terrain-sandwich')!)
      return invalid
    }
    const invalidTransform = changeTerrain(rule => { rule.transforms![0].multiplier = 3 })
    const invalidMaximum = changeTerrain(rule => { rule.maximum = 127 })
    const invalidRay = changeTerrain(rule => { rule.cells!.reverse() })
    for (const invalid of [invalidTransform, invalidMaximum, invalidRay]) {
      await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
    }
  } finally { sqlite.close() }
})
