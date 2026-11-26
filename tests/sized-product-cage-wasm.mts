import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { conflictsOf, enter } from '../src/sudoku/game.ts'
import { positionText } from '../src/sudoku/digit-symbols.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

useWasmWorker()

const fixture = readFileSync(new URL('./fixtures/sudokupad-10k.scl', import.meta.url), 'utf8').trim()
const puzzle = await detectPuzzle(fixture)
const solution = Array.from(puzzle.authoredSolution ?? '', Number)

test('#439 the engine verifies the 10K product cage and authored corner rule', async () => {
  assert.ok(puzzle.grid && puzzle.sizedRules)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: puzzle.grid, rules: puzzle.sizedRules, digits: solution,
  } }), 'unique')

  const badCorners = solution.map(digit => digit === 3 ? 2 : digit === 2 ? 3 : digit)
  const cornerRule = puzzle.sizedRules.find(rule => rule.type === 'digit-count')
  assert.ok(cornerRule?.type === 'digit-count')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: puzzle.grid, rules: [cornerRule], digits: badCorners,
  } }), 'unsolvable')
  assert.equal(conflictsOf(badCorners.map(String).join(''), undefined, puzzle.grid, [cornerRule]).size, 4)

  const wrongProduct = solution.slice()
  wrongProduct[8] = wrongProduct[8] === 1 ? 2 : 1
  assert.ok(conflictsOf(wrongProduct.map(String).join(''), undefined, puzzle.grid, puzzle.sizedRules).size > 0)

  const parityComposition = [...puzzle.sizedRules, { type: 'parity' as const, parity: 'odd' as const, cells: [8] }]
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: puzzle.grid, rules: parityComposition, digits: solution,
  } }), 'unique', 'the product and corner constraints must compose with a compatible parity rule')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: puzzle.grid,
    rules: [...puzzle.sizedRules, { type: 'parity', parity: 'even', cells: [8] }], digits: solution,
  } }), 'conflict', 'the parity companion still applies to a product-cage cell')
})

test('#439 the engine propagates an at-least-one corner digit to the last possible corner', async () => {
  assert.ok(puzzle.grid && puzzle.sizedRules)
  const digits = Array(36).fill(0)
  digits[0] = 2
  digits[5] = 5
  digits[30] = 5
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    version: 2, grid: puzzle.grid, rules: puzzle.sizedRules, digits,
  } })
  assert.ok(Array.isArray(candidates))
  assert.equal(candidates[35], 1 << 2)
})

test('#439 sized product cages support repeated digits on a wide grid', async () => {
  const size = 16
  const digits = Array.from({ length: size * size }, (_, cell) => {
    const row = Math.floor(cell / size), column = cell % size
    return (row * 4 + Math.floor(row / 4) + column) % size + 1
  })
  const cells = [1, 29, 42, 54, 66, 94, 107, 119, 131, 159]
  assert.deepEqual(cells.map(cell => digits[cell]), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
  const product = cells.reduce((result, cell) => result * digits[cell], 1)
  assert.equal(product, 518_400)

  const position = {
    version: 2 as const,
    grid: { size, boxRows: 4, boxColumns: 4 },
    rules: [{ type: 'product-cage' as const, cells, product }],
    digits,
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: [{ ...position.rules[0], product: product - 1 }],
  } }), 'unsolvable')
})

test('#439 zero-based product cages use displayed values and require a displayed zero for product zero', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 }
  const position = {
    version: 2 as const,
    grid,
    zeroBased: true as const,
    digits: Array(36).fill(0),
    rules: [{ type: 'product-cage' as const, cells: [0, 7, 14], product: 0 }],
  }
  const partial = position.digits.slice()
  partial[0] = 2 // Displayed 1.
  partial[7] = 3 // Displayed 2.
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: { ...position, digits: partial } })
  assert.ok(Array.isArray(candidates))
  assert.equal(candidates[14], 1, 'the last open cage cell must display zero')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, digits: partial.map((digit, cell) => cell === 14 ? 4 : digit),
  } }), 'unsolvable', 'a product-zero cage cannot have every digit nonzero')

  const positive = await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    ...position, digits: Array(36).fill(0), rules: [{ type: 'product-cage', cells: [0, 14], product: 1 }],
  } })
  assert.ok(Array.isArray(positive))
  assert.equal(positive[0], 1 << 1, 'displayed product 1 uses rank 2 on a zero-based grid')
  assert.equal(positive[14], 1 << 1)

  const noZero = Array(36).fill(0)
  noZero[0] = 2
  noZero[7] = 3
  noZero[14] = 4
  assert.deepEqual(conflictsOf(positionText(noZero), undefined, { ...grid, notation: 'zero-based' }, position.rules),
    new Set([0, 7, 14]))
})

test('#439 product cage rules survive app import, progress reload, and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string | URL, options?: RequestInit) =>
      fetcher(new URL(String(path), 'https://sudoku.test'), options))
    const { game } = await prepareImportedPuzzle(fixture)
    assert.deepEqual(game.sized?.rules, puzzle.sizedRules)
    assert.ok(game.sized?.solution)
    const cell = game.givens.indexOf('0')
    const progressed = enter(game, [cell], 'value', Number(game.sized.solution[cell]))
    assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.sized, game.sized)

    const shareId = await publishSharedPuzzle(progressed)
    const reopened = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
    assert.deepEqual(reopened.game.sized, game.sized)
    assert.equal(reopened.game.givens, game.givens)
    assert.deepEqual(reopened.game.grid, game.grid)
  } finally {
    sqlite.close()
  }
})
