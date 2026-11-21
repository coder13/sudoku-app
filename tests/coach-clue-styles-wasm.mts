import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { applyDeduction, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const sources = JSON.parse(readFileSync(new URL('./fixtures/coach-clue-styles.json', import.meta.url), 'utf8')) as
  { id: string; url: string; title: string; description: string; code: string; solution: string }[]
const source = (id: string) => sources.find(puzzle => puzzle.id === id)!

type Layer = { type: string; settings?: Record<string, unknown>; segments: { cells: number[]; parameters: Record<string, unknown> }[] }
function publishedData(code: string): { gridSize: number; givenConstraints: Layer[] } {
  const bits = [...code.slice('SCv7_32_'.length)].map(char => Number.parseInt(char, 32).toString(2).padStart(5, '0')).join('')
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))
  return JSON.parse(inflateSync(bytes).toString('utf8'))
}

function withSettings(id: string, type: string, settings: Record<string, unknown>) {
  const data = publishedData(source(id).code)
  return coachCode({
    ...data,
    givenConstraints: data.givenConstraints.map(layer => layer.type === type ? { ...layer, settings } : layer),
  })
}

test('published ordinary Arrow styling preserves the circle, ordered shaft and sum', async () => {
  const layers = ['HQXe', 'HBLt'].map(id => publishedData(source(id).code).givenConstraints.find(layer => layer.type === 'arrow')!)
  assert.deepEqual(layers.map(layer => layer.settings?.bulbSize), [85, 85])
  for (const layer of layers) {
    const { variant } = await detectPuzzle(coachCode({ givenConstraints: [layer] }))
    assert.deepEqual(variant?.puzzle.rules, layer.segments.map(({ cells: [circle, ...cells] }) => ({ type: 'arrow', circle, cells })))
  }
  const mixed = await prepareImportedPuzzle(source('HQXe').code, [], { deferRating: true })
  assert.ok(mixed.game.variant)
  assert.ok(mixed.game.variant.puzzle.rules?.some(rule => rule.type === 'consecutive-run'))
  assert.equal(mixed.game.variant.solution, source('HQXe').solution)
  assertVariantCompletion(mixed.game.variant.puzzle, source('HQXe').solution)
  const mixedArrows = await prepareImportedPuzzle(source('HBLt').code, [], { deferRating: true })
  assert.equal(mixedArrows.game.variant?.solution, source('HBLt').solution)
  assert.equal(mixedArrows.game.variant?.puzzle.rules?.filter(rule => rule.type === 'pill-arrow').length, 2)
  assertVariantCompletion(mixedArrows.game.variant!.puzzle, source('HBLt').solution)

  // Apply the published drawing settings to an independently verified ordinary Arrow puzzle.
  const styled = withSettings('Lq4f', 'arrow', layers[0].settings!)
  const original = await detectPuzzle(source('Lq4f').code)
  const { game } = await prepareImportedPuzzle(styled)
  assert.deepEqual(game.variant?.puzzle, original.variant?.puzzle)
  assert.equal(game.variant?.puzzle.rules?.length, 16)
  assert.equal(game.variant?.solution, source('Lq4f').solution)
  assertVariantCompletion(game.variant!.puzzle, source('Lq4f').solution)

  const candidates = await playCandidates(game)
  assert.equal(candidates?.length, 81)
  candidates?.forEach((mask, cell) => assert.ok(mask & (1 << (Number(source('Lq4f').solution[cell]) - 1))))
  await assert.rejects(detectPuzzle(withSettings('Lq4f', 'arrow', { ...layers[0].settings, sumMultiplier: 2 })), /arrow uses unsupported settings/)
})

test('published Thermometer and cage styles retain their complete mixed puzzles through both import paths', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  let badCageDeclaration = false
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const puzzle = sources.find(puzzle => path === puzzle.url)
    if (!puzzle) return fetcher(path, init)
    const specificSudoku = { sudoku_id: puzzle.id, sudoku: puzzle.code, name: puzzle.title, custom_constraints: false, blocked: false,
      description: badCageDeclaration ? 'All cages are 6 or 12.' : puzzle.description }
    return Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
  })
  try {
    const expectedTypes = {
      '5uF2': ['entropic', 'whispers', 'whispers', 'thermometer', 'thermometer', 'xv'],
      '5uuR': ['thermometer', 'between', 'renban', 'renban', 'renban', 'parity', 'extra-house', 'kropki'],
      '5wyn': ['killer-cages', 'quadruple', 'quadruple', 'quadruple', 'quadruple', 'quadruple'],
    }
    for (const [id, types] of Object.entries(expectedTypes)) {
      const puzzle = source(id)
      const { game } = await prepareImportedPuzzle(puzzle.url)
      const pasted = await detectPuzzle(puzzle.code)
      assert.equal(game.title, puzzle.title)
      assert.deepEqual(game.variant?.puzzle, pasted.variant?.puzzle)
      assert.deepEqual(game.variant?.puzzle.rules?.map(rule => rule.type), types)
      assert.equal(game.variant?.solution, puzzle.solution)
      assertVariantCompletion(game.variant!.puzzle, puzzle.solution)

      const layers = publishedData(puzzle.code).givenConstraints
      const rules = game.variant!.puzzle.rules!
      const thermo = layers.find(layer => layer.type === 'thermometer')
      if (thermo) {
        assert.equal(thermo.settings?.bulbSize, id === '5uF2' ? 80 : 82)
        assert.deepEqual(rules.filter(rule => rule.type === 'thermometer'),
          thermo.segments.map(({ cells }) => ({ type: 'thermometer', cells })))
      } else {
        const cage = layers.find(layer => layer.type === 'cage')!
        assert.equal(cage.settings?.horizontalOffset, 23)
        assert.equal(cage.segments.length, 22)
        assert.deepEqual(rules[0], { type: 'killer-cages',
          cages: cage.segments.map(({ cells, parameters }) => ({ cells, sum: parameters.sum })) })
      }
    }
    badCageDeclaration = true
    await assert.rejects(detectPuzzle(source('5wyn').url), /cage totals do not match the published description/)
  } finally {
    sqlite.close()
  }
  await assert.rejects(detectPuzzle(withSettings('5uF2', 'thermometer', { bulbSize: 80, allowEquality: true })),
    /thermometer uses unsupported settings/)
})


test('the published Windoku construction note keeps all 28 encoded clues through import and Play', async ({ mock }) => {
  const puzzle = source('HQXe')
  const { sqlite, fetcher } = syncDatabase()
  let description = puzzle.description
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path !== puzzle.url) return fetcher(path, init)
    const specificSudoku = {
      sudoku_id: puzzle.id, sudoku: puzzle.code, name: puzzle.title, custom_constraints: false, blocked: false, description,
    }
    return Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
  })
  try {
    const { game } = await prepareImportedPuzzle(puzzle.url)
    const pasted = await detectPuzzle(puzzle.code)
    assert.equal(game.title, puzzle.title)
    assert.ok(game.variant)
    assert.deepEqual(game.variant.puzzle, pasted.variant?.puzzle)
    const rules = game.variant.puzzle.rules!
    assert.equal(rules.length, 28)
    assert.equal(rules.filter(rule => rule.type === 'extra-house').length, 4)
    assert.equal(rules.filter(rule => rule.type === 'sandwich').length, 8)
    assert.deepEqual(rules.find(rule => rule.type === 'kropki'), {
      type: 'kropki', ratioTwo: { pairs: [], negative: true },
    })
    assert.equal(game.variant.solution, puzzle.solution)
    assertVariantCompletion(game.variant.puzzle, puzzle.solution)

    const ranked = await puzzleHints(game)
    assert.equal(ranked.choices.length, 10)
    const filtered = await puzzleHints(game, 'all', 'consecutive-run')
    const finder = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try {
      const moves = new Set(filtered.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      assert.ok(moves.size)
      assert.equal(await finder.count('consecutive-run'), moves.size)
    } finally { finder.close() }
    const changed = applyDeduction(game, ranked.choices[0].actions, ranked.candidates!)
    assert.notEqual(changed, game)
    assert.deepEqual(undo(changed).position, game.position)
    assert.deepEqual(readGame(changed.id, JSON.stringify(changed))?.variant, game.variant)
    const id = await publishSharedPuzzle(changed)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(valuesOf(shared.game), game.givens)

    const path = await puzzleSolution(game)
    assert.deepEqual(path.rating.status, { solved: 'hard' })
    assert.equal(path.rating.score.points, 3149)
    assert.equal(path.steps.length, 153)
    assert.equal(path.board, puzzle.solution)

    description += '\nDigits on the arrow count twice.'
    await assert.rejects(detectPuzzle(puzzle.url), /author instructions/)
  } finally {
    sqlite.close()
  }
})
