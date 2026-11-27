import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EngineRequest, EngineResult, EngineRunner, VariantPuzzle } from '../src/sudoku/engine.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { solveSingleValues } from '../src/sudoku/solve-singles.ts'

test('Solve Singles passes displayed candidates to classic and variant engines', async () => {
  const values = '0'.repeat(81)
  const displayedCandidates = Array<number>(81).fill(511)
  displayedCandidates[0] = 1
  const puzzle: VariantPuzzle = { version: 1, givens: values, rules: [{ type: 'anti-knight' }] }
  const game = { ...makeGame('solve-singles', 'Variant', values, 'imported'),
    variant: { id: 'mixed' as const, puzzle } }
  const requests: EngineRequest[] = []
  const run: EngineRunner = async <T extends EngineRequest>(request: T): Promise<EngineResult<T>> => {
    requests.push(request)
    return values as EngineResult<T>
  }

  await solveSingleValues(game, values, {
    displayedCandidates,
    run,
    variantRules: ['anti-knight'],
  })

  assert.equal(requests.length, 2)
  assert.deepEqual(requests.map((request) => {
    if (request.type === 'solve-singles') return request.displayedCandidates
    if (request.type === 'variant' && request.operation === 'solve-singles') return request.displayedCandidates
    return undefined
  }), [displayedCandidates, displayedCandidates])
})
