import assert from 'node:assert/strict'
import test from 'node:test'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { readDisabledHintTechniques, saveDisabledHintTechniques, withHintPreferences } from '../src/sudoku/hint-preferences.ts'
import { readSolverProfile, saveSolverProfile } from '../src/sudoku/solver-profile.ts'

test('worker requests pass complete boards and reject malformed input before writing', async () => {
  const memory = new WebAssembly.Memory({ initial: 1 })
  const board = new Uint8Array(memory.buffer, 0, 81)
  const analyzed: string[] = []
  let loads = 0
  const handle = createEngineHandler(async () => {
    loads++
    return {
      memory,
      board_buffer: () => 0,
      notes_buffer: () => 82,
      analyze_board: () => { analyzed.push(board.join('')); return 2 },
      fill_notes: () => { throw new Error('unexpected notes request') },
      solve_board: () => { throw new Error('unexpected solve request') },
      generate_board: () => { throw new Error('unexpected generate request') },
      request_buffer: () => { throw new Error('unexpected structured request') },
      run_request: () => { throw new Error('unexpected structured request') },
      response_buffer: () => { throw new Error('unexpected structured response') },
    }
  })

  assert.deepEqual(await handle({ id: 1, request: { type: 'analyze', values: STARTER } }), { id: 1, value: 'unique' })
  for (const [index, values] of ['0', 'x'.repeat(81), '0'.repeat(82), `${'0'.repeat(80)}\n`].entries()) {
    const id = index + 2
    assert.deepEqual(await handle({ id, request: { type: 'analyze', values } }), {
      id, code: 'invalid-grid', error: 'Enter exactly 81 cells. Use a dot or 0 for each empty cell.',
    })
    assert.equal(board.join(''), STARTER)
  }
  assert.deepEqual(await handle({ id: 6, request: { type: 'analyze', values: '.'.repeat(81) } }), { id: 6, value: 'unique' })
  assert.deepEqual(analyzed, [STARTER, '0'.repeat(81)])
  assert.equal(loads, 1)
})

test('solver profile storage preserves order, omissions, and an explicit empty profile', () => {
  const saved = new Map<string, string>()
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) } }

  assert.equal(readSolverProfile(storage), undefined)
  const order = ['x-wing', 'hidden-single', 'naked-single']
  assert.equal(saveSolverProfile(order, storage), true)
  assert.deepEqual(readSolverProfile({ ...storage }), order)
  assert.equal(saveSolverProfile(['x-wing', 'x-wing'], storage), false)
  assert.deepEqual(readSolverProfile(storage), order)
  assert.equal(saveSolverProfile([], storage), true)
  assert.deepEqual(readSolverProfile({ ...storage }), [])
  assert.equal(readSolverProfile({ getItem: () => '{partial' }), undefined)
})

test('hint preferences persist independently of solver order and apply only to hint requests', () => {
  const saved = new Map<string, string>()
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) } }
  assert.deepEqual(readDisabledHintTechniques(storage), [])
  assert.ok(saveSolverProfile(['full-house'], storage))
  const disabledTechniques = ['full-house', 'naked-single', 'hidden-single', 'pointing', 'claiming']
  assert.ok(saveDisabledHintTechniques(disabledTechniques, storage))
  assert.deepEqual(readDisabledHintTechniques(storage), disabledTechniques)
  assert.deepEqual(readSolverProfile(storage), ['full-house'])

  const hints = { type: 'hints', values: STARTER, limit: 1 } as const
  const next = { type: 'next-deduction', values: STARTER } as const
  const rate = { type: 'rate', values: STARTER } as const
  assert.deepEqual(withHintPreferences(hints, storage), { ...hints, disabledTechniques })
  assert.deepEqual(withHintPreferences(next, storage), { ...next, disabledTechniques })
  assert.deepEqual(withHintPreferences({ ...hints, disabledTechniques: [] }, storage), { ...hints, disabledTechniques: [] })
  assert.equal(withHintPreferences(rate, storage), rate)
  assert.deepEqual(readDisabledHintTechniques({ getItem: () => '{broken' }), [])
  assert.ok(saveDisabledHintTechniques([], storage))
  assert.deepEqual(readDisabledHintTechniques(storage), [])
})

test('a solver-only worker rejects generation and keeps validation available', async () => {
  let loads = 0
  const handle = createEngineHandler(async () => {
    loads++
    return {
      memory: new WebAssembly.Memory({ initial: 1 }),
      board_buffer: () => 0,
      notes_buffer: () => 82,
      analyze_board: () => 2,
      fill_notes: () => 1,
      solve_board: () => 1,
      request_buffer: () => 128,
      run_request: () => 0,
      response_buffer: () => 256,
    }
  })
  assert.deepEqual(await handle({ id: 1, request: { type: 'generate', seed: 17 } }), {
    id: 1,
    code: 'unsupported-capability',
    error: 'This engine build does not include puzzle generation.',
  })
  assert.deepEqual(await handle({ id: 2, request: { type: 'analyze', values: STARTER } }), { id: 2, value: 'unique' })
  assert.equal(loads, 1)
})
