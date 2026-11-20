import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type EngineRequest, type SizedConstraintPosition } from '../src/sudoku/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker(process.env.SIZED_RULES_WASM)

test('one Renban request uses the supplied geometry across supported rectangular layouts', async () => {
  const layouts = [[4, 2, 2], [6, 2, 3], [6, 3, 2], [8, 2, 4], [8, 4, 2], [10, 2, 5], [12, 3, 4], [16, 4, 4]]
  for (const [size, boxRows, boxColumns] of layouts) {
    const digits = Array.from({ length: size * size }, (_, cell) => cell === 0 ? 1 : 0)
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'renban', cells: [0, 1, 2, 3], segments: [[0, 1], [1, 2, 3]] }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.ok(masks)
    assert.equal(masks.length, size * size)
    assert.deepEqual(masks.slice(1, 4), [0b1110, 0b1110, 0b1110])
    const solved = Array.from(digits, (_, cell) => {
      const row = Math.floor(cell / size)
      return (row * boxColumns + Math.floor(row / boxRows) + cell % size) % size + 1
    })
    const nearComplete = { ...position, digits: solved.map((digit, cell) => cell === 1 ? 0 : digit) }
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: nearComplete }), 'unique')
    assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position: nearComplete }))?.digits, solved)
    const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position: nearComplete })
    assert.deepEqual(trace?.at(-1)?.digits, solved)
    const eliminations = digits.map((_, cell) => cell === 1 ? (size < 16 ? 1 << size : 0) : 0)
    if (size === 16) eliminations.pop()
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'hints', position, eliminations, limit: 1 }),
      error => error instanceof EngineError && error.code === 'invalid-eliminations')
  }
})

test('one irregular layout composes Renban and parity without a size-specific solver', async () => {
  const regions = [[0, 1, 2, 3, 7], [4, 8, 9, 13, 14], [5, 6, 10, 11, 12], [17, 18, 19, 23, 24], [15, 16, 20, 21, 22]]
  const digits = Array.from('1000000000012000000005000', Number)
  const answer = Array.from('1234534512512342345145123', Number)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 5, regions }, digits,
    rules: [{ type: 'renban', cells: [0, 1, 2] }, { type: 'parity', parity: 'odd', cells: [7] }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position }))?.digits, answer)
  for (const rule of position.rules) {
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, rules: [rule] } }), 'multiple')
  }
  const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
  assert.deepEqual(trace?.at(-1)?.digits, answer)
  const regionOnlyDigits = digits.map((_, cell) => cell === 7 ? 5 : 0)
  const masks = await runEngine({ type: 'sized-classic', operation: 'candidates', position: {
    version: 2, grid: position.grid, digits: regionOnlyDigits,
  } })
  assert.equal(masks?.[0], 0b01111)
  assert.equal(masks?.[10], 0b11111)
  const disconnected = regions.map(cells => [...cells])
  ;[disconnected[0][0], disconnected[1][4]] = [disconnected[1][4], disconnected[0][0]]
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze',
    position: { ...position, grid: { size: 5, regions: disconnected } } }),
  error => error instanceof EngineError && error.code === 'invalid-layout')
})

test('the sized dispatcher rejects a whole variant position when a companion rule is unavailable', async () => {
  const request = {
    type: 'sized-variant', operation: 'analyze',
    position: {
      version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits: Array(16).fill(0),
      rules: [{ type: 'renban', cells: [0, 1, 2] }, { type: 'arrow', circle: 5, cells: [6, 7] }],
    },
  } as EngineRequest
  await assert.rejects(runEngine(request), error => error instanceof EngineError && error.code === 'unsupported-rule')
})
