import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/inequality-palindrome14.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }

test('sparse mixed exact validation succeeds within the unchanged default budget', async () => {
  const position = { puzzle: fixture.puzzle }
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position })
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 0 }), 'search-limit')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 20_000 }), 'search-limit')
  await assert.rejects(runEngine({ type: 'variant', operation: 'solve', position, maxNodes: 20_000 }), (error: unknown) => error instanceof EngineError && error.code === 'search-limit')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
  assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), fixture.solution)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'candidates', position }), candidates)
  const without = { puzzle: { ...fixture.puzzle, rules: fixture.puzzle.rules?.filter(rule => rule.type !== 'inequality') } }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: without }), 'multiple')
})

test('exact house propagation does not silently enable human techniques', async () => {
  const position = { puzzle: fixture.puzzle }
  const techniqueOrder = await getVariantPlayOrder()
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(trace.rating.status, 'stalled')
  assert.equal(trace.rating.points, 98)
  assert.equal(trace.rating.scoringVersion, 9)
  assert.equal(trace.steps.length, 9)
  const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
  assert.equal(disabled.rating.status, 'stalled')
  assert.equal(disabled.steps.length, 0)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
})
