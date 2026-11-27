import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-magic-square.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#423 Magic Square import passes the complete puzzle through the Rust engine', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: source.solution,
  } }), 'unique')

  const preview = await prepareImportedPuzzle(source.code, [], { deferRating: true })
  assert.equal(preview.game.variant?.solution, source.solution)
  assert.equal(preview.ratingPending, true)
})

test('#423 Magic Square retains a valid appended Ratio in the Rust engine', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const solution = source.solution
  const pair = Array.from({ length: 81 }, (_, cell) => cell).flatMap(cell => {
    const row = Math.floor(cell / 9), column = cell % 9
    return [row < 8 ? cell + 9 : -1, column < 8 ? cell + 1 : -1]
      .filter(other => other >= 0 && (Number(solution[cell]) === 2 * Number(solution[other]) ||
        Number(solution[other]) === 2 * Number(solution[cell])))
      .map(other => [cell, other] as [number, number])
  })[0]
  assert.ok(pair)
  const ratio = { type: 'ratio', segments: [{ cells: pair, parameters: {} }] }
  const code = coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] })
  const { game } = await prepareImportedPuzzle(code)
  assert.ok(game.variant?.puzzle.rules?.some(rule => rule.type === 'magic-square'))
  assert.ok(game.variant?.puzzle.rules?.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
  assert.equal(game.variant?.solution, solution)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: game.variant!.puzzle,
    entries: solution,
  } }), 'unique')
})
