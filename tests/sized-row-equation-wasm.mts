import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fillEntries, isSolved } from '../src/sudoku/game.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { readReviewedCoachRowEquations } from '../src/sudoku/puzzle-import/coach-row-equation.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSizedRuleList, sizedRulePosition, verifySizedRulePuzzle } from '../src/sudoku/sized-rule-game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-row-equations.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('the sized engine solves and validates all five parsed row equations', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const rules = await readReviewedCoachRowEquations(data.givenConstraints, data.gridSize)
  const grid = { size: 5, noRegions: true } as const
  assert.ok(rules)
  assert.equal(isSizedRuleList(rules, grid), true)

  const game = await verifySizedRulePuzzle({ grid, givens: '0'.repeat(25), rules, authoredSolution: source.solution })
  assert.equal(game.solution, source.solution)
  const position = sizedRulePosition(grid, game, game.solution)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')

  const swapped = source.solution.replace(/[12]/g, digit => digit === '1' ? '2' : '1')
  const nearMiss = { ...position, digits: [...swapped].map(Number) }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...nearMiss, rules: [] } }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...nearMiss,
  } }), 'conflict')
})

test('the row-equation constraint rejects malformed operator sequences and non-row paths', async () => {
  const grid = { size: 5, noRegions: true } as const
  const rules = [
    { type: 'row-equation', cells: [0, 1, 2], operators: ['equals', 'equals'] },
    { type: 'row-equation', cells: [0, 1, 6], operators: ['add', 'equals'] },
  ] as const
  assert.equal(isSizedRuleList(rules, grid), false)
})

test('#409 imports the reviewed Sudoku Coach puzzle through Preview, Play and saved reload', async () => {
  const imported = await detectPuzzle(source.code)
  assert.deepEqual(imported.grid, { size: 5, noRegions: true })
  assert.deepEqual(imported.sizedRules, await readReviewedCoachRowEquations(
    (await decodeSudokuCoachPayload(source.code)).givenConstraints, 5))
  const preview = await prepareImportedPuzzle(source.code)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.equal(preview.game.sized?.solution, source.solution)
  assert.equal(preview.game.sized?.rules.filter(rule => rule.type === 'row-equation').length, 5)
  const finished = fillEntries(preview.game, source.solution)
  assert.equal(isSolved(finished), true)
  const restored = readGame(finished.id, JSON.stringify(finished))
  assert.deepEqual(restored?.sized?.rules, finished.sized?.rules)
  assert.equal(restored?.sized?.solution, source.solution)
  assert.equal(restored?.position.entries, source.solution)
})
