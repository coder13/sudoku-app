import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantRating } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/coach-forcing-rating.json', import.meta.url), 'utf8')) as {
  id: string; title: string; code: string; solution: string; status: VariantRating['status']; points: number; traceDigest: string
}[]

test('deferred import ratings preserve uniqueness, complete proofs, and versioned scores', async (context) => {
  const techniqueOrder = await getVariantPlayOrder()
  for (const source of fixtures) {
    await context.test(source.title, async () => {
      const { game, ratingPending, grade } = await prepareImportedPuzzle(source.code, [], { deferRating: true })
      assert.ok(game.variant)
      assert.equal(game.variant.solution, source.solution)
      assert.equal(ratingPending, true)
      assert.equal(grade, undefined)
      assert.equal(game.score, undefined)
      if (source.id === 'Lq4f') assert.deepEqual(game.variant.puzzle.rules?.map(({ type }) => type), Array(16).fill('arrow'))
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: game.variant.puzzle }, techniqueOrder })
      assert.deepEqual(trace.rating.status, source.status)
      assert.equal(trace.rating.points, source.points)
      assert.equal(trace.rating.scoringVersion, 14)
      // Compare the entire recorded proof with the previous profile metadata.
      assert.deepEqual(trace.rating.techniqueOrder, techniqueOrder)
      assert.ok(techniqueOrder.includes('entropy-quadruple'))
      const value = { ...trace, rating: { ...trace.rating, scoringVersion: 9,
        techniqueOrder: techniqueOrder.filter(id => id !== 'entropy-quadruple') } }
      assert.equal(createHash('sha256').update(JSON.stringify({ value })).digest('hex'), source.traceDigest)
      if (source.status === 'stalled') assert.equal(trace.steps.length, 16)
    })
  }
})
