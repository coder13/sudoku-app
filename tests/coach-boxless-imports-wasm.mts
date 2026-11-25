import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { parsePuzzleExport, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { solveLatin } from '../src/latin/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const noncon = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-noncon.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
const diagonal = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-diagonal.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#483/#484 verify the complete Non-con import through Rust and portable sharing', async () => {
  const imported = await detectPuzzle(noncon.code)
  assert.ok(imported.variant)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: noncon.solution,
  } }), 'unique')

  const { game } = await prepareImportedPuzzle(noncon.code)
  assert.equal(game.variant?.solution, noncon.solution)
  const shared = parsePuzzleExport(puzzleExportText(game))
  assert.deepEqual(shared.variant?.puzzle.rules, imported.variant.puzzle.rules)
})

test('#479 verifies the published King X solution with the boxless Latin engine', async () => {
  const imported = await detectPuzzle(diagonal.code)
  assert.ok(imported.futoshiki)
  const puzzle = imported.futoshiki.puzzle
  assert.deepEqual(puzzle.diagonals, ['anti', 'main'])
  assert.deepEqual(puzzle.exclusions, ['anti-king'])
  assert.equal(puzzle.parity.filter(rule => rule.parity === 'odd').length, 3)
  assert.equal(puzzle.parity.filter(rule => rule.parity === 'even').length, 10)
  const solved = solveLatin(puzzle)
  assert.equal(solved.status, 'unique')
  assert.equal(solved.solution?.join(''), diagonal.solution)

  const preview = await prepareImportedPuzzle(diagonal.code)
  assert.deepEqual(preview.futoshiki?.puzzle.diagonals, ['anti', 'main'])
  assert.deepEqual(preview.futoshiki?.puzzle.exclusions, ['anti-king'])
})
