import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { actionHistoryMatcher } from '../src/sudoku/action-history-matcher.ts'
import { matchActionBatch, recordAction } from '../src/sudoku/action-history.ts'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResponse, EngineResult } from '../src/sudoku/engine.ts'
import { enter, makeGame, replaceCandidates } from '../src/sudoku/game.ts'

const LOCKED_PAIR = '970500060000007103800040000000080900685000000100003002000000000000600057008090200'
const handler = createEngineHandler(async () => {
  const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  const { instance } = await WebAssembly.instantiate(bytes)
  return instance.exports as unknown as EngineExports
})
let id = 0
async function run<T extends EngineRequest>(request: T): Promise<EngineResult<T>> {
  const response = await handler({ id: ++id, request })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value as EngineResult<T>
}

test('real engine matches a group of manual removals from the pre-removal board', async () => {
  const matches = await run({ type: 'deductions', values: LOCKED_PAIR, techniqueOrder: ['pointing', 'locked-pair'] })
  const proof = matches.find(({ actions }) => actions.length > 1)!
  assert.ok(proof)
  const masks = await run({ type: 'notes', values: LOCKED_PAIR })
  assert.ok(masks)
  let game = replaceCandidates(makeGame('test', 'Test', LOCKED_PAIR, 'custom'), masks)
  for (const [index, action] of proof.actions.entries()) {
    assert.ok('eliminate' in action)
    game = recordAction(game, enter(game, [action.eliminate.cell], 'candidate', action.eliminate.digit), 'edit', { at: index * 500 + 1000 })
  }
  const matched = await matchActionBatch(game.actionHistory!, actionHistoryMatcher(undefined, run))
  assert.equal(matched.length, 1)
  assert.ok(matched[0].technique)
  assert.equal(matched[0].changes.length, proof.actions.length)
  assert.equal(matched[0].pending, undefined)
})

test('removing a solution candidate has no matching technique', async () => {
  const solution = await run({ type: 'solve', values: LOCKED_PAIR })
  assert.ok(solution)
  const cell = LOCKED_PAIR.indexOf('0')
  assert.equal(await actionHistoryMatcher(undefined, run)({ values: LOCKED_PAIR }, [
    { eliminate: { cell, digit: Number(solution[cell]) } },
  ]), null)
})

test('variant attribution uses the saved board and runs outside the play worker', async (t) => {
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  class TestWorker {
    onmessage?: (event: { data: EngineResponse }) => void
    postMessage(message: { id: number; request: EngineRequest }) {
      void handler(message).then(data => this.onmessage?.({ data }))
    }
  }
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true })
  t.after(() => {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const solution = '658492731974316582132875694461523978387149256295768143849251367726934815513687429'
  const givens = [...solution].map((digit, cell) => [1, 6, 10, 15].includes(cell) ? '0' : digit).join('')
  const variant = {
    id: 'diagonal', solution,
    puzzle: { version: 1, givens, rules: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }] },
  } as const
  const requests: { request: EngineRequest; background?: boolean }[] = []
  const match = actionHistoryMatcher(variant, async (request, options) => {
    requests.push({ request, background: options?.background })
    return run(request)
  })
  assert.ok(await match({ values: givens }, [{ place: { cell: 1, digit: Number(solution[1]) } }]))
  assert.equal(requests[0].background, true)
})
