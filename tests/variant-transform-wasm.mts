import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

test('actual Wasm retains transformed markers, unique published completions and valid candidates under all eight symmetries', async () => {
  for (const name of ['quadruple-clover', 'parity-big-eight']) {
    const { puzzle, solution } = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as {
      puzzle: VariantPuzzle; solution: string
    }
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const transformed = reflectVariant(puzzle, symmetry)
      const expected = transformedBoard(solution, symmetry)
      const position = { puzzle: transformed }
      const normalized = await runEngine({ type: 'variant', operation: 'normalize', position })
      assert.deepEqual(normalized.puzzle.rules, transformed.rules)
      assert.equal(normalized.puzzle.givens, transformed.givens)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), expected)
      assertVariantCompletion(transformed, expected)
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position })
      for (let cell = 0; cell < 81; cell++) if (transformed.givens[cell] === '0') {
        assert.ok(candidates[cell] & 1 << (Number(expected[cell]) - 1), `${name}/${symmetry}/${cell}`)
      }
    }
  }
})
