import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { coreModeLimit, coreSudokuModes, customModeDifficulties, readSudokuModes, selectedMarkerRules, writeSudokuModes } from '../src/sudoku/custom-modes.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

let server: ViteDevServer
let renderNewPuzzle: typeof import('./helpers/new-puzzle-render.tsx').renderNewPuzzle
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })

test('the chooser offers five 9×9 modes, Import, and separate custom generation', async () => {
  const markup = await renderNewPuzzle('/puzzles/new?step=variant', { variant: 'six', difficulty: 'medium', boxRows: 3 }, false)
  assert.match(markup, /Choose a Sudoku mode/)
  for (const name of ['Classic', 'X Sudoku', 'Windoku', 'Killer', 'Jigsaw']) {
    assert.ok(markup.includes(`>${name}</span>`), name)
  }
  assert.doesNotMatch(markup, /Other grid sizes|Mini Sudoku|5 × 5 Jigsaw|6 × 6 Sudoku|7 × 7 Jigsaw|8 × 8 Sudoku|Algebraic Cages|Create puzzle|Create by hand/)
  assert.match(markup, /href="\/import"[^>]*>.*Import puzzle/)
  assert.match(markup, /href="\/puzzles\/new\/custom"[^>]*>.*Generate a custom puzzle/)
  assert.ok(markup.indexOf('href="/import"') < markup.indexOf('href="/puzzles/new/custom"'))
  assert.equal([...markup.matchAll(/href="\/puzzles\/new\/difficulty\?variant=/g)].length, 5)
  assert.doesNotMatch(markup, />Quadruple</)
  const builder = await renderNewPuzzle('/puzzles/new/custom', undefined, false)
  assert.equal([...builder.matchAll(/type="checkbox"/g)].length, 36)
  assert.match(builder, /<label[^>]*>Grid<.*<option value="classic" selected="">9 × 9 Sudoku<\/option>/)
  for (const grid of ['mini', 'jigsaw-five', 'six', 'jigsaw-seven', 'eight', 'algebraic-cages']) {
    assert.ok(builder.includes(`<option value="${grid}">`), grid)
  }
  assert.match(builder, /Show in core modes/)
  assert.match(builder, /Save mode/)
  assert.match(builder, /Generate puzzle/)
  assert.match(builder, /<option value="hard">Hard<\/option>/)
  const saved = await renderNewPuzzle('/puzzles/new/difficulty?mode=00000000-0000-4000-8000-000000000000')
  assert.match(saved, /Loading saved mode/)
  const xSudoku = await renderNewPuzzle('/puzzles/new/difficulty?variant=diagonal')
  assert.match(xSudoku, /Each of the two marked diagonals/)
  assert.deepEqual(customModeDifficulties(['jigsaw']), ['easy', 'medium', 'tricky'])
  assert.deepEqual(customModeDifficulties(['jigsaw', 'x-sum']), ['easy', 'medium', 'hard'])
})

test('smaller grids are configured inside custom generation and retain their difficulty links', async () => {
  const six = await renderNewPuzzle('/puzzles/new/custom?variant=six&boxRows=3', undefined, false)
  assert.match(six, /<h1[^>]*>Generate a custom puzzle<\/h1>/)
  assert.match(six, /<option value="six" selected="">6 × 6 Sudoku<\/option>/)
  assert.match(six, /<option value="3" selected="">3 × 2 boxes/)
  assert.match(six, /href="\/puzzles\/new\/difficulty\?variant=six&amp;boxRows=3&amp;difficulty=medium"/)
  assert.doesNotMatch(six, /Find a rule|Create puzzle/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=six&boxRows=3')
  assert.match(difficulty, /href="\/puzzles\/new\/custom\?variant=six&amp;boxRows=3&amp;difficulty=medium"/)
  assert.match(difficulty, /Start medium puzzle/)
  const legacy = await renderNewPuzzle('/puzzles/new?variant=mini')
  assert.match(legacy, /<h1[^>]*>Generate a custom puzzle<\/h1>/)
  assert.match(legacy, /href="\/puzzles\/new\/difficulty\?variant=mini&amp;difficulty=medium"/)
})

test('saved mode definitions and rule choices round-trip, with nine core slots in total', () => {
  const storage = new MemoryStorage()
  const modes = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`, name: `Mode ${i}`,
    rules: ['windoku', 'arrow'] as const, pinned: true,
  }))
  writeSudokuModes(modes, storage)
  const saved = readSudokuModes(storage)
  assert.equal(saved.length, 6)
  assert.equal(coreSudokuModes.length + saved.filter(mode => mode.pinned).length, coreModeLimit)
  assert.deepEqual(saved[5].rules, ['windoku', 'arrow'])
  assert.equal(saved[5].pinned, false)
})

test('saved sets retain complete markings only for symbols the mode uses', () => {
  const storage = new MemoryStorage()
  const id = '00000000-0000-4000-8000-000000000000'
  assert.deepEqual(selectedMarkerRules(['kropki', 'xv', 'kropki-black']), ['kropki-white', 'kropki-black', 'xv-five', 'xv-ten'])
  writeSudokuModes([{ id, name: 'Dots and V', rules: ['kropki-black', 'xv-five'],
    negativeMarkers: ['kropki-white', 'kropki-black', 'xv-five', 'xv-five', 'xv-ten'], pinned: true }], storage)
  assert.deepEqual(readSudokuModes(storage), [{ id, name: 'Dots and V', rules: ['kropki-black', 'xv-five'],
    negativeMarkers: ['kropki-black', 'xv-five'], pinned: true }])
})
