import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSharedPuzzleId, publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

type Fixture = { url: string; code: string; title: string; puzzle: VariantPuzzle; solution: string }
const between: Fixture = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
const renban: Fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-coach.json', import.meta.url), 'utf8')).examples[0]

function coachPage(id: string, code: string, name: string, details: Record<string, unknown> = {}) {
  const specificSudoku = {
    sudoku_id: id, sudoku: code, name, blocked: false, custom_constraints: false, description: '', ...details,
  }
  return '<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'
}

test('a published mixed Coach short link preserves the title, all rules, help, progress and shared starting puzzle', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const browser = { window: {}, localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() }
  const originals = Object.keys(browser).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const [key, value] of Object.entries(browser)) Object.defineProperty(globalThis, key, { value, configurable: true })
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === between.url) return Promise.resolve(new Response(coachPage('9KxH', between.code, between.title)))
    return fetcher(path, init)
  })
  try {
    const { game, format } = await prepareImportedPuzzle(between.url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, between.title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, between.puzzle)
    assert.equal(game.variant.solution, between.solution)

    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1 && ranked.choices.length <= 10)
    const selected = await puzzleHints(game, 'all', 'between')
    assert.ok(selected.choices.length > 0)
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('between'), targets.size) } finally { scan.close() }

    const path = await puzzleSolution(game)
    assert.equal(path.steps.length, 62)
    assert.equal(path.rating.status, 'stalled')
    assert.notEqual(path.board, between.solution)
    const move = ranked.choices[0].actions
    const applied = applyDeduction(game, move, ranked.candidates!)
    assert.notEqual(applied, game)
    assert.deepEqual(undo(applied).position, game.position)
    assert.deepEqual(redo(undo(applied)).position, applied.position)

    const storage = '../src/sudoku/storage.ts?coach-short-links-save'
    const { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(applied)
    const reload = '../src/sudoku/storage.ts?coach-short-links-reload'
    const { games } = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot()
    const restored = games.find(saved => saved.id === applied.id)
    assert.ok(restored)
    assert.equal(restored.title, game.title)
    assert.deepEqual(restored.variant, game.variant)
    assert.deepEqual(restored.position, applied.position)
    const id = await publishSharedPuzzle(restored)
    assert.ok(isSharedPuzzleId(id))
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, game.title)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(valuesOf(shared.game), game.givens)
  } finally {
    sqlite.close()
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('a complete Renban short link and the same pasted code have the same logical solution', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === renban.url) return Promise.resolve(new Response(coachPage('Jh4o', renban.code, renban.title)))
    return fetcher(path, init)
  })
  try {
    const { game } = await prepareImportedPuzzle(renban.url)
    assert.deepEqual(game.variant?.puzzle, renban.puzzle)
    assert.equal(game.variant?.solution, renban.solution)
    const pasted = await prepareImportedPuzzle(renban.code)
    const path = await puzzleSolution(game)
    assert.deepEqual(path, await puzzleSolution(pasted.game))
    assert.equal(path.board, renban.solution)
  } finally { sqlite.close() }
})

test('short links reject unknown and authored rules even when the numeric grid would decode', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const sources = {
    Blank: '<script>const puzzle = "' + between.code + '"</script>',
    Wrong: coachPage('Other', between.code, 'Wrong puzzle'),
    Custom: coachPage('Custom', between.code, 'Custom rule', { custom_constraints: true }),
    Text: coachPage('Text', between.code, 'Author text', { description: 'Reverse the digits on blue cells.' }),
    Markings: coachPage('Markings', coachCode({ givenColours: [{ cells: [0] }] }), 'Colored cells'),
    Unknown: coachPage('Unknown', coachCode({ givenConstraints: [{ type: 'globalModularity', segments: [] }] }), 'Unknown rule'),
  }
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const id = path.split('/').at(-1)!
    if (path.startsWith('https://sudoku.coach/') && Object.hasOwn(sources, id)) {
      return Promise.resolve(new Response(sources[id as keyof typeof sources]))
    }
    return fetcher(path, init)
  })
  try {
    for (const id of ['Blank', 'Wrong']) await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), /use Copy → Puzzle/)
    for (const id of ['Custom', 'Text']) await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), /has author instructions/)
    await assert.rejects(detectPuzzle('sudoku.coach/s/Markings'), /unsupported authored markings/)
    await assert.rejects(detectPuzzle('sudoku.coach/s/Unknown'), /not supported yet.*globalModularity/)
  } finally { sqlite.close() }
})
