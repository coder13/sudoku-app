import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuPadEnvelope } from '../src/sudoku/sized-sudoku-pad.ts'
import { cornerPairs, readCornerKropki, validCornerKropki } from '../src/sudoku/corner-kropki.ts'

const source = readFileSync(new URL('./fixtures/sized-quadki.scl', import.meta.url), 'utf8').trim()

test('#437 imports the published Quadki code and SudokuPad link with its complete corner-dot rule', async ({ mock }) => {
  mock.method(globalThis, 'fetch', (path: string) => path === '/api/v1/import/sudokupad/dx12wro0k0'
    ? Promise.resolve(Response.json({ code: source })) : Promise.resolve(new Response('Not found.', { status: 404 })))
  const imported = await detectPuzzle(source)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, 'Quadki')
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(imported.sizedRules, [{
    type: 'corner-kropki', consecutive: [28, 13], ratioTwo: [1, 8, 15, 20],
  }])
  assert.equal(imported.authoredSolution, '164523523164352641416235641352235416')
  const linked = await detectPuzzle('https://sudokupad.app/dx12wro0k0')
  assert.equal(linked.title, imported.title)
  assert.deepEqual(linked.grid, imported.grid)
  assert.deepEqual(linked.sizedRules, imported.sizedRules)
})

test('#437 parses every Quadki corner dot into both diagonal pairs', () => {
  const data = decodeSudokuPadEnvelope(source)
  assert.equal(data.cells?.length, 6)
  const parsed = readCornerKropki(data.overlays ?? [], 6)
  assert.deepEqual(parsed.rule, {
    type: 'corner-kropki', consecutive: [28, 13], ratioTwo: [1, 8, 15, 20],
  })
  assert.deepEqual(parsed.unused, [])
  assert.deepEqual(cornerPairs(1, 6), [[1, 8], [2, 7]])
  assert.equal(validCornerKropki(parsed.rule, 6), true)
})

test('corner dots reject unsupported colors and keep unrelated overlays separate', () => {
  const white = { center: [2, 2], width: .34, height: .34, rounded: true, backgroundColor: '#fff' }
  const unrelated = { center: [1.5, 1.5], text: 'A' }
  assert.deepEqual(readCornerKropki([white, unrelated], 6), {
    rule: { type: 'corner-kropki', consecutive: [7] }, unused: [unrelated],
  })
  assert.throws(() => readCornerKropki([{ ...white, backgroundColor: '#f00' }], 6), /must be white or black/)
  assert.throws(() => readCornerKropki([{ ...white, center: [0, 2] }], 6), /invalid Quadruple Kropki dot/)
})
