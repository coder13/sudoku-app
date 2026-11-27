import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { coachNonogramRules } from '../src/sudoku/coach-nonogram.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import worker from '../cloudflare/pages/_worker.js'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

useWasmWorker()

const grid = { size: 4, noRegions: true } as const
const rules = [{ type: 'nonogram', axis: 'row', index: 0, digits: [2, 4], runs: [1, 1] }] as const
const source = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-nonogram.json', import.meta.url), 'utf8')) as {
  sudoku: string; description: string; solution: string
}

test('the app Wasm protocol enforces ordered run clues and prunes unsupported candidates', async () => {
  const solution = [1, 2, 3, 4, 2, 1, 4, 3, 4, 3, 2, 1, 3, 4, 1, 2]
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid, rules, digits: solution,
  } }), 'unique')

  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    version: 2, grid, rules, digits: [2, 0, 0, 3, ...Array(12).fill(0)],
  } })
  assert.equal(candidates?.[2], 1 << 3)

  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid, rules, digits: [1, 2, 4, 3, 2, 1, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1],
  } }), 'conflict')
})

test('the app Wasm protocol accepts a full-length run of the complete digit group', async () => {
  const fullDigitRule = [{ type: 'nonogram', axis: 'row', index: 0, digits: [1, 2, 3, 4], runs: [4] }] as const
  const solution = [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid, rules: fullDigitRule, digits: solution,
  } }), 'unique')
})

test('the published 6×6 Coach Nonogram completion satisfies its parsed clues in Wasm', async () => {
  const payload = await decodeSudokuCoachPayload(source.sudoku)
  const sourceRules = coachNonogramRules(payload.givenConstraints as unknown[], 6, source.description)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: { size: 6, noRegions: true }, rules: sourceRules,
    digits: Array.from(source.solution, Number),
  } }), 'unique')
  const copiedCode = await detectPuzzle(source.sudoku)
  assert.deepEqual(copiedCode.sizedRules?.filter(rule => rule.type === 'nonogram'), sourceRules)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: copiedCode.grid!, rules: copiedCode.sizedRules!,
    digits: Array.from(source.solution, Number),
  } }), 'unique')
})

test('#381 the complete published Nonogram import satisfies all companion rules in Wasm', async ({ mock }) => {
  const url = 'https://sudoku.coach/en/s/8kgS'
  const page = '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: '8kgS', sudoku: source.sudoku, name: 'Nonogram sudoku 6x6', blocked: false,
    custom_constraints: true, description: source.description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return Promise.resolve(new Response('Not found.', { status: 404 }))
  })
  const imported = await detectPuzzle(url)
  assert.ok(imported.grid && imported.sizedRules)
  assert.equal(imported.sizedRules.filter(rule => rule.type === 'nonogram').length, 12)
  assert.equal(imported.sizedRules.filter(rule => rule.type === 'renban').length, 7)
  assert.deepEqual((await detectPuzzle(source.sudoku)).sizedRules, imported.sizedRules)
  const result = await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: imported.grid, rules: imported.sizedRules,
    digits: Array.from(source.solution, Number),
  } })
  assert.equal(result, 'unique')
})
