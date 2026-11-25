import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const examples = (JSON.parse(readFileSync(new URL('./fixtures/sudokupad-entropy-lines.json', import.meta.url), 'utf8')) as {
  examples: { id: string; title: string; code: string }[]
}).examples
const expectedTypes = [
  ['anti-king', 'entropic', 'killer-cages', 'kropki'],
  ['entropic', 'entropic', 'kropki'],
]

test('published SudokuPad Entropic Line puzzles solve uniquely and every source rule matters', async () => {
  for (const [index, source] of examples.entries()) {
    const payload = JSON.parse(lzString.decompressFromBase64(source.code.slice(3))!)
    const imported = await detectPuzzle(source.code)
    assert.ok(imported.grid && imported.sizedRules)
    const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, imported.givens)
    const authored = { ...position, digits: Array.from(payload.metadata.solution, Number) }
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: authored }), 'unique', `${source.id}: authored answer validity`)
    const solved = await runEngine({ type: 'sized-variant', operation: 'solve-unique', position })
    assert.equal(solved.status, 'unique', source.id)
    assert.equal(solved.solution?.digits.join(''), payload.metadata.solution)
    const { game } = await prepareImportedPuzzle(source.code)
    assert.ok(game.grid && game.sized)
    assert.equal(game.title, source.title)
    assert.equal(game.grid.size, 6)
    assert.deepEqual(game.sized.rules.map(rule => rule.type).sort(), expectedTypes[index])
    for (const type of new Set(game.sized.rules.map(rule => rule.type))) {
      const position = sizedRulePosition(game.grid, {
        rules: game.sized.rules.filter(rule => rule.type !== type),
      }, game.givens)
      assert.equal((await runEngine({ type: 'sized-variant', operation: 'solve-unique', position })).status, 'multiple', `${source.id}: ${type}`)
    }
  }
})
