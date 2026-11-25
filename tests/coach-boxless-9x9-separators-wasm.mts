import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { parsePuzzleExport, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-9x9-separators.json', import.meta.url), 'utf8')) as {
  code: string
}

test('#414 complete boxless export verifies with all source rules in Wasm', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  assert.ok(game.variant)
  assert.equal(game.variant.solution.length, 81)
  assert.ok(game.variant.solution.split('').every(digit => digit >= '1' && digit <= '9'))
  assert.ok(game.authoredArtwork?.length === 3)
  assert.equal(game.variant.puzzle.rules?.filter(rule => rule.type === 'extra-house' && rule.cells.length === 9).length, 3)
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: game.variant.puzzle } })
  assert.ok(candidates && game.variant.solution.split('').every((digit, cell) => candidates[cell] & (1 << (Number(digit) - 1))))
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: game.variant.puzzle, entries: game.variant.solution,
  } }), 'unique')
  const shared = parsePuzzleExport(puzzleExportText(game))
  assert.deepEqual(shared.variant?.puzzle, game.variant.puzzle)
  assert.deepEqual(shared.authoredArtwork, game.authoredArtwork)
})

test('#414 keeps the Anti-Knight, Kropki, and Whispers combination required for uniqueness', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  assert.ok(game.variant)
  const puzzle = game.variant.puzzle
  const blank = '0'.repeat(81)
  const analyze = (rules: typeof puzzle.rules) => runEngine({
    type: 'variant', operation: 'analyze', position: { puzzle: { ...puzzle, rules }, entries: blank },
  })

  assert.equal(await analyze(puzzle.rules), 'unique')
  for (const family of ['anti-knight', 'kropki', 'whispers'] as const) {
    assert.equal(await analyze(puzzle.rules?.filter(rule => rule.type !== family)), 'multiple',
      `expected the source to become ambiguous without ${family}`)
  }
})
