import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hasUniquenessProof } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { coachCode } from './helpers/coach-code.ts'

useWasmWorker()

const sources = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-crust.json', import.meta.url), 'utf8')) as {
  id: string; title: string; code: string; solution?: string
}[]

test('reviewed Sudoku Coach Crust imports verify through the sized Rust engine', async () => {
  for (const source of sources.filter(item => item.id !== 'BKR7')) {
    const { game } = await prepareImportedPuzzle(source.code)
    assert.equal(game.title, source.title)
    assert.ok(game.grid && game.sized?.rules[0]?.type === 'crust')
    assert.equal(game.sized.solution.length, game.grid.size ** 2)
    if (source.solution) assert.equal([...game.sized.solution].join(''), source.solution)
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
      version: 2,
      grid: game.grid,
      rules: game.sized.rules,
      digits: [...game.sized.solution].map(Number),
    } }), 'unique')
    const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
      version: 2,
      grid: game.grid,
      rules: game.sized.rules,
      digits: [...game.sized.solution].map(Number),
    } })
    assert.deepEqual(candidates, Array(game.grid.size ** 2).fill(0))
  }
})

test('Crust of Void imports its published completion without claiming a uniqueness proof', async () => {
  const source = sources.find(item => item.id === 'BKR7')!
  const preview = await prepareImportedPuzzle(source.code)
  assert.equal(preview.game.title, source.title)
  assert.equal(preview.game.sized?.solution, source.solution)
  assert.equal(hasUniquenessProof(preview.game), false)
  assert.ok(preview.game.grid && preview.game.sized)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: preview.game.grid, digits: [...source.solution!].map(Number), rules: preview.game.sized.rules,
  } }), 'unique')
})

test('a reviewed Crust puzzle keeps a supported companion rule through engine validation', async () => {
  const source = sources.find(item => item.id === 'BKR7')!
  const data = await decodeSudokuCoachPayload(source.code)
  const ratio = { type: 'ratio', segments: [{ cells: [6, 7], parameters: {} }] }
  const { game } = await prepareImportedPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  assert.ok(game.grid && game.sized?.rules.some(rule => rule.type === 'crust'))
  assert.ok(game.sized.rules.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.some(([a, b]) => a === 6 && b === 7)))
  assert.equal(game.sized.solution, source.solution)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2,
    grid: game.grid,
    rules: game.sized.rules,
    digits: [...source.solution!].map(Number),
  } }), 'unique')
})

test('the published 9 × 9 Edge-Count Crust solves uniquely from a blank grid', async () => {
  const source = sources.find(item => item.id === '9Z8C')!
  const { game } = await prepareImportedPuzzle(source.code)
  assert.ok(game.grid && game.sized?.rules[0]?.type === 'crust')
  assert.ok(source.solution)

  const result = await runEngine({ type: 'sized-variant', operation: 'solve-unique', position: {
    version: 2,
    grid: game.grid,
    digits: [...game.givens].map(Number),
    rules: game.sized.rules,
  } })
  assert.equal(result.status, 'unique')
  assert.equal(result.solution?.digits.join(''), source.solution)
})
