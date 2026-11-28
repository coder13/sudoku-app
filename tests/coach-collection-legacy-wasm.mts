import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { restartGame, valuesOf } from '../src/sudoku/game.ts'
import type { ImportedCellColors } from '../src/sudoku/imported-colors.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { findImportAttempt, prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

type Source = { id: string; title: string; collection: string; code: string; solution: string }
type ClassicSource = Source & { givens: string; colorCount: number; sampleColors?: ImportedCellColors; givenCellColors?: ImportedCellColors }
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
      const expected = source.givenCellColors ?? source.sampleColors
      assert.ok(expected)
      for (const [cell, shades] of Object.entries(expected)) assert.deepEqual(givenCellColors[Number(cell)], shades)
      if (source.givenCellColors) {
        const independent = countLineSolutions({ version: 1, givens: source.givens })
        assert.equal(independent.count, 1, source.title)
        assert.equal(independent.solution, source.solution)
      }
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
    for (const { id } of classic.filter(source => source.givenCellColors)) {
      await assert.rejects(detectPuzzle(`${coach}/en/s/${id}`), /author instructions/)
    }
  } finally {
    sqlite.close()
  }
})

test('reviewed Candy fills match by their cell colors and kept givens in a Current State export', async () => {
  const source = classic.find(({ id }) => id === '679X')!
  assert.ok(source.givenCellColors)
  const palette = [...new Set(Object.values(source.givenCellColors).flat())].reverse()
  const cells = Array.from({ length: 81 }, (_, cell) =>
    (source.givenCellColors![cell] ?? []).map(shade => palette.indexOf(shade)).join(''))
  const open = source.givens.indexOf('0')
  const userDigits = '0'.repeat(open) + source.solution[open] + '0'.repeat(80 - open)
  const { game, hasProgress } = await prepareImportedPuzzle(coachCode({
    givenDigits: source.givens, colours: palette, givenColours: cells.join(','), userDigits,
  }))
  assert.equal(hasProgress, true)
  assert.equal(game.title, source.title)
  assert.equal(game.position.entries, userDigits)
  assert.deepEqual(game.givenCellColors, source.givenCellColors)
  assert.deepEqual(restartGame(game).givenCellColors, source.givenCellColors)
  const firstMarked = cells.findIndex(Boolean)
  cells[firstMarked] = ''
  await assert.rejects(detectPuzzle(coachCode({
    givenDigits: source.givens, colours: palette, givenColours: cells.join(','),
  })), /unsupported authored markings/)
})

test('reviewed Halloween fills survive an appended Ratio companion in legacy Coach codes', async () => {
  for (const source of classic.filter(({ id }) => ['675G', '6767', '678g', '679X', '67C6', '67Cw'].includes(id))) {
    const data = await decodeSudokuCoachPayload(source.code)
    const digits = [...source.solution].map(Number)
    const pair = Array.from({ length: 81 }, (_, cell) => {
      const right = cell % 9 < 8 ? cell + 1 : -1
      const down = cell < 72 ? cell + 9 : -1
      return [right, down].filter(next => next >= 0 && Math.max(digits[cell], digits[next]) === 2 * Math.min(digits[cell], digits[next]))
        .map(next => [cell, next] as [number, number])
    }).flat()[0]
    assert.ok(pair, source.title)
    const code = coachCode({ ...data, givenConstraints: [
      ...(Array.isArray(data.givenConstraints) ? data.givenConstraints : []),
      { type: 'ratio', segments: [{ cells: pair, parameters: {} }], settings: {} },
    ] })
    const imported = await detectPuzzle(code)
    assert.equal(imported.title, source.title)
    assert.deepEqual(imported.givenCellColors, await detectPuzzle(source.code).then(({ givenCellColors }) => givenCellColors))
    assert.equal((await puzzleSolution((await prepareImportedPuzzle(code)).game)).board, source.solution, source.title)
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
