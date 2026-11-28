import { DIFFICULTY_LEVELS } from '../src/sudoku/difficulty.ts'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { changeCustomRule, customModeDifficulties, readCustomModeDefinition, readSudokuModes, ruleSelectionConflict, selectedMarkerRules, writeSudokuModes } from '../src/sudoku/custom-modes.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

test('families replace overlapping choices and legacy saved modes retain their full rules', () => {
  const both = changeCustomRule(['kropki-white', 'parity', 'kropki-black'], 'kropki', true)
  assert.deepEqual(both, ['parity', 'kropki'])
  const white = changeCustomRule(both, 'kropki-white', true)
  assert.deepEqual(white, ['parity', 'kropki-white'])
  assert.match(ruleSelectionConflict([...white, 'non-consecutive'], ['kropki-white'])!, /already enforces/)
  assert.equal(ruleSelectionConflict([...white, 'kropki-black', 'non-consecutive'], ['kropki-white']), undefined)
  assert.deepEqual(readCustomModeDefinition({ name: 'Saved', rules: ['diagonal-main', 'diagonal', 'xv', 'xv-five'], negativeMarkers: ['xv-ten'] }),
    { name: 'Saved', rules: ['diagonal', 'xv'], negativeMarkers: ['xv-ten'] })
})

test('proved conflicts distinguish standard boxes and white-dot exceptions', () => {
  assert.match(ruleSelectionConflict(['windoku', 'arrow', 'non-consecutive'])!, /cannot share a completed grid/)
  assert.equal(ruleSelectionConflict(['windoku', 'non-consecutive', 'kropki-white']), undefined)
  assert.equal(ruleSelectionConflict(['windoku', 'non-consecutive', 'jigsaw']), undefined)
  for (const diagonal of ['diagonal', 'diagonal-main', 'diagonal-anti'] as const) {
    const chess = ['anti-king', 'anti-knight', diagonal] as const
    assert.match(ruleSelectionConflict(chess)!, /cannot share a completed grid/)
    assert.equal(ruleSelectionConflict([...chess, 'jigsaw']), undefined)
  }
})

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
  assert.equal([...builder.matchAll(/type="checkbox"/g)].length, 35)
  assert.match(builder, /<label[^>]*>Grid<.*<option value="classic" selected="">9 × 9 Sudoku<\/option>/)
  for (const grid of ['mini', 'jigsaw-five', 'six', 'jigsaw-seven', 'eight', 'algebraic-cages']) {
    assert.ok(builder.includes(`<option value="${grid}">`), grid)
  }
  assert.doesNotMatch(builder, /Show in core modes|Saved modes|Find a rule|Mode name/)
  assert.match(builder, /Save mode/)
  assert.match(builder, /<button[^>]*disabled[^>]*>Continue/)
  assert.doesNotMatch(builder, /Generate puzzle|Miracle puzzle|<option value="hard">/)
  const saved = await renderNewPuzzle('/puzzles/new/difficulty?mode=00000000-0000-4000-8000-000000000000')
  assert.match(saved, /Loading saved mode/)
  const xSudoku = await renderNewPuzzle('/puzzles/new/difficulty?variant=diagonal')
  assert.match(xSudoku, /Each of the two marked diagonals/)
  assert.deepEqual(customModeDifficulties(['jigsaw']), DIFFICULTY_LEVELS)
  assert.deepEqual(customModeDifficulties(['jigsaw', 'x-sum']), DIFFICULTY_LEVELS)
})

test('direct custom next steps without a draft link back to rule selection', async () => {
  for (const step of ['difficulty?draft=true', 'save']) {
    const markup = await renderNewPuzzle(`/puzzles/new/${step}`, { variant: 'six', difficulty: 'medium', boxRows: 3 })
    assert.match(markup, /href="\/puzzles\/new\/custom"[^>]*>Choose rules<\/a>/)
    assert.match(markup, /aria-label="Back to custom puzzle setup"/)
    assert.doesNotMatch(markup, /Start medium puzzle|6 × 6 Sudoku|Mode name/)
  }
})

test('the naming step can restore rule choices from a fresh navigation', async () => {
  const draft = encodeURIComponent(JSON.stringify({ rules: ['kropki-black', 'dutch-whispers'],
    negativeMarkers: ['kropki-black'] }))
  const markup = await renderNewPuzzle(`/puzzles/new/save?draft=${draft}`)
  assert.match(markup, /<h1[^>]*>Save mode<\/h1>/)
  assert.match(markup, /Black Kropki dots · Dutch Whispers/)
  assert.match(markup, /No doubling without a Kropki dot/)
  assert.match(markup, /Mode name/)
  assert.doesNotMatch(markup, /Choose rules|No consecutive digits without a Kropki dot/)
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

test('saved mode definitions and rule choices round-trip without a core-mode limit', () => {
  const storage = new MemoryStorage()
  const modes = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`, name: `Mode ${i}`,
    rules: ['windoku', 'arrow'] as const,
  }))
  writeSudokuModes(modes, storage)
  const saved = readSudokuModes(storage)
  assert.equal(saved.length, 6)
  assert.deepEqual(saved[5].rules, ['windoku', 'arrow'])
  assert.equal('pinned' in saved[5], false)
})

test('saved sets retain complete markings only for symbols the mode uses', () => {
  const storage = new MemoryStorage()
  const id = '00000000-0000-4000-8000-000000000000'
  assert.deepEqual(selectedMarkerRules(['kropki', 'xv', 'kropki-black']), ['kropki-white', 'kropki-black', 'xv-five', 'xv-ten'])
  writeSudokuModes([{ id, name: 'Dots and V', rules: ['kropki-black', 'xv-five'],
    negativeMarkers: ['kropki-white', 'kropki-black', 'xv-five', 'xv-five', 'xv-ten'] }], storage)
  assert.deepEqual(readSudokuModes(storage), [{ id, name: 'Dots and V', rules: ['kropki-black', 'xv-five'],
    negativeMarkers: ['kropki-black', 'xv-five'] }])
})
