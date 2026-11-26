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

function terrainSandwichSupports(rule: Extract<NonNullable<NonNullable<Awaited<ReturnType<typeof detectPuzzle>>['variant']>['puzzle']['rules']>[number], { type: 'terrain-sandwich' }>) {
  const support = Array<number>(rule.cells.length).fill(0)
  const digits = Array<number>(rule.cells.length)
  const visit = (index: number, used: number) => {
    if (index === digits.length) {
      const values = digits.map((digit, cell) => digit * rule.transforms[cell].multiplier + rule.transforms[cell].offset)
      const ones = values.flatMap((value, cell) => value === 1 ? [cell] : [])
      const nines = values.flatMap((value, cell) => value === 9 ? [cell] : [])
      const prefix = [0]
      values.forEach(value => prefix.push(prefix.at(-1)! + value))
      const totals = ones.flatMap(one => nines.flatMap(nine => one === nine ? [] : [
        prefix[Math.max(one, nine)] - prefix[Math.min(one, nine) + 1],
      ]))
      if (totals.length && Math.max(...totals) === rule.maximum) {
        digits.forEach((digit, cell) => { support[cell] |= 1 << (digit - 1) })
      }
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << (digit - 1)
      if (used & bit) continue
      digits[index] = digit
      visit(index + 1, used | bit)
    }
  }
  visit(0, 0)
  return support
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

  const firstRow = Array.from({ length: 9 }, (_, cell) => cell)
  const firstDigit = Number(source.source.solution[0])
  const firstRowXSum = {
    type: 'x-sum' as const,
    direction: 'east' as const,
    cells: firstRow,
    sum: [...source.source.solution.slice(0, firstDigit)].reduce((sum, digit) => sum + Number(digit), 0),
  }
  const terrainWithXSums = { ...parsed.variant.puzzle, rules: [...rules, ratioTwoCompanion, firstRowXSum] }
  assertVariantCompletion(terrainWithXSums, source.source.solution)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: terrainWithXSums } }),
    { status: 'unique', solution: source.source.solution },
    'Terrain transforms, a marked ratio edge, and a source-derived X-Sum must compose in the engine')

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

test('#196 Terrain candidates match an independent permutation oracle for every published clue', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const rules = parsed.variant.puzzle.rules ?? []
  const terrainRules = rules.filter((rule): rule is Extract<typeof rule, { type: 'terrain-sandwich' }> => rule.type === 'terrain-sandwich')
  assert.equal(terrainRules.length, 15)

  for (const [index, rule] of terrainRules.entries()) {
    const expected = terrainSandwichSupports(rule)
    assert.ok(expected.every(mask => mask !== 0), `oracle clue ${index + 1} has support in every ray cell`)
    const puzzle = { ...parsed.variant.puzzle, givens: '0'.repeat(81), rules: [rule] }
    const actual = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    assert.ok(actual)
    assert.deepEqual(rule.cells.map(cell => actual[cell]), expected,
      `Terrain clue ${index + 1} candidate support must match all distinct-digit assignments`)
  }
})
