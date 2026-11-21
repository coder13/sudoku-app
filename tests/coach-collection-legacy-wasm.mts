import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { restartGame, valuesOf } from '../src/sudoku/game.ts'
import type { ImportedCellColors } from '../src/sudoku/imported-colors.ts'
import { puzzleHints } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportAttempt, prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

type Source = { id: string; title: string; collection: string; code: string; solution: string }
type ClassicSource = Source & { givens: string; colorCount: number; sampleColors: ImportedCellColors }
const classic = JSON.parse(readFileSync(new URL('./fixtures/coach-collections-legacy.json', import.meta.url), 'utf8')) as ClassicSource[]
const clueStyles = JSON.parse(readFileSync(new URL('./fixtures/coach-clue-styles.json', import.meta.url), 'utf8')) as (Omit<Source, 'collection'> & { description: string })[]
const mixed = { ...clueStyles.find(({ id }) => id === '5uF2')!, collection: 'halloween-2024' }
const coach = 'https://sudoku.coach'
const all = [...classic, mixed]
const hierarchy = { id: 'collections', groups: [{ items: [...new Set(all.map(ex => ex.collection))].map(id =>
  ({ id, groups: [{ items: all.filter(ex => ex.collection === id).map(ex => ex.id) }] })) }] }
const collectionLink = ({ collection, id }: Source) => `${coach}/en/collections/${collection}/s/${id}`

test('original Coach collection and legacy codes keep givens, authored fills, and the published completion', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  let instructions = ''
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === coach + '/beapi/get-collection-hierarchy') return Promise.resolve(Response.json({ hierarchy }))
    if (!path.startsWith(coach)) return fetcher(path, init)
    const source = all.find(ex => path === `${coach}/beapi/get-sudoku/${ex.id}` || path === `${coach}/en/s/${ex.id}`)
    assert.ok(source)
    const publication = { sudoku_id: source.id, sudoku: source.code, name: source.title,
      description: 'description' in source ? source.description : instructions, blocked: false, custom_constraints: false, published: false }
    return Promise.resolve(path.startsWith(coach + '/en/s/')
      ? new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: publication }) + '</script>')
      : Response.json(publication))
  })
  try {
    for (const source of classic) {
      const url = collectionLink(source)
      const preview = await prepareImportedPuzzle(url)
      const { game } = preview
      const { givenCellColors } = game
      assert.ok(givenCellColors, source.title)
      assert.equal(game.title, source.title)
      assert.equal(game.givens, source.givens)
      assert.equal(valuesOf(game), source.givens)
      assert.equal(game.variant, undefined)
      assert.equal(preview.hasProgress, undefined)
      assert.equal(Object.keys(givenCellColors).length, source.colorCount)
      for (const [cell, shades] of Object.entries(source.sampleColors)) assert.deepEqual(givenCellColors[Number(cell)], shades)
      assert.equal(await runEngine({ type: 'solve', values: game.givens }), source.solution)
      const { choices } = await puzzleHints(game)
      assert.ok(choices.length > 0 && choices.length <= 10)
      assert.deepEqual(restartGame(game).givenCellColors, givenCellColors)
      assert.deepEqual(readGame(game.id, JSON.stringify(game))?.givenCellColors, givenCellColors)
      assert.equal(findImportAttempt([{ ...game, givenCellColors: undefined }], preview), undefined)
      assert.equal(findImportAttempt([game], preview), game)
      const id = await publishSharedPuzzle(game)
      const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
      assert.equal(shared.game.givens, source.givens)
      assert.deepEqual(shared.game.givenCellColors, givenCellColors)
      const reviewed = source.code.startsWith('SCv7_')
      const direct = await detectPuzzle(source.code)
      assert.deepEqual(direct, { format: 'Sudoku Coach', givens: source.givens, givenCellColors, ...(reviewed && { title: source.title }) })
      assert.deepEqual(await detectPuzzle(`${coach}/fr/solver/${encodeURIComponent(source.code)}`), direct)
      if (reviewed) assert.deepEqual(await detectPuzzle(`${coach}/en/s/${source.id}`), direct)
    }
    const { game } = await prepareImportedPuzzle(collectionLink(mixed))
    assert.deepEqual(game.variant?.puzzle.rules?.map(({ type }) => type),
      ['entropic', 'whispers', 'whispers', 'thermometer', 'thermometer', 'xv'])
    assert.equal(game.variant?.solution, mixed.solution)
    assert.ok((await puzzleHints(game)).choices.length > 0)
    instructions = 'Orange cells count twice.'
    await assert.rejects(detectPuzzle(collectionLink(classic[0])), /author instructions/)
  } finally {
    sqlite.close()
  }
})

test('a plain published Classic grid opens with its original title, hints and solution', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const source = JSON.parse(readFileSync(new URL('./fixtures/coach-plain-grid.json', import.meta.url), 'utf8'))
  const url = `${coach}/en/s/${source.sudoku_id}`
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: source }) + '</script>'))
    : fetcher(path, init))
  try {
    const { game } = await prepareImportedPuzzle(url)
    assert.equal(game.title, source.name)
    assert.equal(game.givens, source.sudoku)
    assert.equal(game.variant, undefined)
    assert.equal(await runEngine({ type: 'solve', values: game.givens }), source.solution)
    assert.ok((await puzzleHints(game)).choices.length > 0)
  } finally {
    sqlite.close()
  }
})
