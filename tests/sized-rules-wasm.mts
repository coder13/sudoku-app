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
      rules: [{ type: 'renban', cells: [0, 1, 2] }, { type: 'between', cells: [5, 6, 7] }],
    },
  } as EngineRequest
  await assert.rejects(runEngine(request), error => error instanceof EngineError && error.code === 'unsupported-rule')
})

test('Kropki support uses the digit range and edge layout on small and wide grids', async () => {
  for (const [size, boxRows, boxColumns] of [[4, 2, 2], [6, 2, 3], [6, 3, 2], [16, 4, 4]]) {
    const digits = Array.from({ length: size ** 2 }, (_, cell) => cell === 0 ? 1 : 0)
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'kropki', consecutive: { pairs: [[0, 1]] }, ratioTwo: { pairs: [[1, 2]] } }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.equal(masks?.[1], 1 << 1)
    assert.equal(masks?.[2], 1 << 3)
    assert.equal(masks?.[size], (1 << size) - 2)
    const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 5 })
    assert.ok(hints?.choices.some(choice => choice.type === 'kropki' && choice.pair.cells[1] === 1 &&
      choice.pair.relation === 'consecutive' && !choice.pair.negative))
    const invalid: SizedConstraintPosition = { ...position, rules: [{ type: 'kropki', ratioTwo: { pairs: [[size - 1, size]] } }] }
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: invalid }),
      error => error instanceof EngineError && error.code === 'invalid-rules')
  }
})

test('Kropki negative rules exempt any marked edge across authored rule records', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const digits = Array<number>(36).fill(0)
  digits[0] = 1
  const position: SizedConstraintPosition = {
    version: 2, grid, digits,
    rules: [{ type: 'kropki', consecutive: { negative: true } },
      { type: 'kropki', ratioTwo: { pairs: [[1, 0]] } }],
  }
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 8 })
  assert.ok(hints?.choices.some(choice => choice.type === 'kropki' && choice.rule === 0 &&
    choice.pair.cells[0] === 0 && choice.pair.cells[1] === 6 && choice.pair.negative &&
    choice.actions.some(action => 'eliminate' in action && action.eliminate.cell === 6 && action.eliminate.digit === 2)))
  assert.ok(!hints?.choices.some(choice => choice.type === 'kropki' && choice.pair.cells[0] === 0 &&
    choice.pair.cells[1] === 1 && choice.pair.negative))
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(masks?.[1], 1 << 1)
  assert.equal((masks?.[6] ?? 0) & (1 << 1), 0)
})

test('Difference markers can use the largest valid gap at each supplied size', async () => {
  for (const [size, boxRows, boxColumns] of [[4, 2, 2], [8, 2, 4], [16, 4, 4]]) {
    const digits = Array<number>(size * size).fill(0)
    digits[0] = 1
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'difference', cells: [1, 0], difference: size - 1 }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.equal(masks?.[1], 1 << (size - 1))
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: {
      ...position, rules: [{ type: 'difference', cells: [1, 0], difference: size }],
    } }), error => error instanceof EngineError && error.code === 'invalid-rules')
  }
})

test('an Arrow permits repeated shaft digits when the houses also permit them', async () => {
  const digits = Array<number>(16).fill(0)
  digits[0] = digits[6] = 1
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits,
    rules: [{ type: 'arrow', circle: 1, cells: [0, 6] }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(masks?.[1], 1 << 1)
  const response = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 1 })
  assert.deepEqual(response?.choices, [{ type: 'rule', rule: 0,
    actions: [{ eliminate: { cell: 1, digit: 3 } }, { eliminate: { cell: 1, digit: 4 } }] }])
  const completed = Array.from('1234341221434321', Number)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, digits: completed } }), 'unique')
})

test('a full-length Arrow uses the digit range and scratch space of a 16 × 16 layout', async () => {
  const size = 16
  const digits = Array<number>(size ** 2).fill(0)
  const cells = Array.from({ length: size }, (_, row) => row * size + ((size - (row * 4 + Math.floor(row / 4)) % size) % size))
  digits[15] = size
  const position: SizedConstraintPosition = {
    version: 2, grid: { size, boxRows: 4, boxColumns: 4 }, digits,
    rules: [{ type: 'arrow', circle: 15, cells }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  for (const cell of cells) assert.equal(masks?.[cell], 1)
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze',
    position: { ...position, rules: [{ type: 'arrow', circle: cells[0], cells }] },
  }), error => error instanceof EngineError && error.code === 'invalid-rules')
})

test('Region Sum distinguishes consecutive visits from totals grouped by box', async () => {
  const digits = Array.from('0030000000000001', Number)
  const answer = Array.from('1234341221434321', Number)
  const cells = [0, 4, 9, 13, 10, 5]
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits,
    rules: [{ type: 'region-sum', cells }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: [{ type: 'region-sum', cells, groupByRegion: true }],
  } }), 'unsolvable')
  assert.equal(await runEngine({ type: 'sized-classic', operation: 'analyze', position: {
    version: 2, grid: position.grid, digits,
  } }), 'multiple')
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 1 })
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0))
  const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
  assert.deepEqual(trace?.at(-1)?.digits, answer)
})

test('Region Sum supports a total of 136 across two complete 16 × 16 boxes', async () => {
  const size = 16
  const answer = Array.from({ length: size ** 2 }, (_, cell) => {
    const row = Math.floor(cell / size)
    return (row * 4 + Math.floor(row / 4) + cell % size) % size + 1
  })
  const digits = answer.map((digit, cell) => cell === 19 || cell === 39 ? 0 : digit)
  const firstBox = Array.from({ length: size }, (_, cell) => Math.floor(cell / 4) * size + cell % 4)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size, boxRows: 4, boxColumns: 4 }, digits,
    rules: [{ type: 'region-sum', cells: [...firstBox, ...firstBox.map(cell => cell + 4)] }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  for (const cell of [19, 39]) assert.equal(masks?.[cell], 1 << (answer[cell] - 1))
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position }))?.digits, answer)
})
