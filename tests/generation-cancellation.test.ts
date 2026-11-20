import assert from 'node:assert/strict'
import test from 'node:test'
import { generateClassic } from '../src/sudoku/classic-generation.ts'
import { EngineError, type EngineRequest, type EngineResponse, type EngineRunner } from '../src/sudoku/engine.ts'
import { generatePlayableVariant } from '../src/sudoku/variant-play.ts'
import { verifyAlgebraicPuzzle } from '../src/sudoku/algebraic-game.ts'
import { verifySizedRulePuzzle } from '../src/sudoku/sized-rule-game.ts'
import { sixGridForBoxRows } from '../src/sudoku/grid.ts'

test('generation and verification never retry an abandoned request', async t => {
  const metadata: EngineRequest[] = []
  class TestWorker {
    onmessage?: (event: { data: EngineResponse }) => void
    postMessage({ id, request }: { id: number; request: EngineRequest }) {
      assert.equal(request.type, 'techniques')
      metadata.push(request)
      queueMicrotask(() => this.onmessage?.({ data: { id, value: {
        techniques: [{ id: 'naked-single', difficulty: 'easy' }, { id: 'x-wing', difficulty: 'tricky' }],
        defaultOrder: ['naked-single', 'x-wing'], difficultyOrder: ['naked-single', 'x-wing'],
      } } as EngineResponse }))
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const cancelled = () => new DOMException('Generation closed.', 'AbortError')
  let calls: EngineRequest[] = []
  const stop: EngineRunner = async request => { calls.push(request); throw cancelled() }

  await t.test('classic and variant generation stop on AbortError', async () => {
    await assert.rejects(generateClassic('tricky', 0, undefined, [], stop), { name: 'AbortError' })
    assert.deepEqual(calls.map(request => request.type), ['generate-constrained'])
    calls = []
    await assert.rejects(generatePlayableVariant('arrow', 'expert', 0, [], undefined, stop), { name: 'AbortError' })
    assert.deepEqual(calls.map(request => request.type), ['generate-variant'])
    assert.ok(metadata.length >= 2, 'shared catalogs remain outside the owned generation runner')
  })

  await t.test('a search-limit fallback still stops when its next request is cancelled', async () => {
    calls = []
    const fallback: EngineRunner = async request => {
      calls.push(request)
      if (calls.length === 1) throw new EngineError('No puzzle found.', 'search-limit')
      throw cancelled()
    }
    await assert.rejects(generateClassic('tricky', 0, undefined, [], fallback), { name: 'AbortError' })
    assert.deepEqual(calls.map(request => request.type), ['generate-constrained', 'generate-targeted'])
    calls = []
    await assert.rejects(generatePlayableVariant('arrow', 'expert', 0, [], undefined, fallback), { name: 'AbortError' })
    assert.equal(calls.length, 2)
  })

  await t.test('small-grid verification does not start a solve after canceled analysis', async () => {
    calls = []
    await assert.rejects(verifyAlgebraicPuzzle({ givens: '0'.repeat(16), rules: [] }, stop), { name: 'AbortError' })
    assert.equal(calls.length, 1)
    assert.ok('operation' in calls[0] && calls[0].operation === 'analyze')
    calls = []
    await assert.rejects(verifySizedRulePuzzle({ grid: sixGridForBoxRows(), givens: '0'.repeat(36), rules: [] }, stop), { name: 'AbortError' })
    assert.equal(calls.length, 1)
    assert.ok('operation' in calls[0] && calls[0].operation === 'analyze')
  })
})
