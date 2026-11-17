import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { puzzleHints, variantHintProblem } from '../src/sudoku/puzzle-help.ts'

const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
function game() {
  return { ...makeGame('hint-validation', 'Variant', STARTER, 'imported'),
    variant: { id: 'mixed' as const, puzzle: { version: 1, givens: STARTER } as VariantPuzzle, solution } }
}

test('invalid variant hint positions reject before any worker starts, for every hint request mode', async (t) => {
  let requests = 0
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class { constructor() { requests++; throw new Error('Unexpected engine request') } } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'Worker', previous); else Reflect.deleteProperty(globalThis, 'Worker') })
  const current = game()
  current.position.eliminations = Array<number>(81).fill(0)
  current.position.eliminations[2] = 1 << (Number(solution[2]) - 1)
  for (const query of [() => puzzleHints(current), () => puzzleHints(current, 'all'),
    () => puzzleHints(current, 'all', 'naked-single'), () => puzzleHints(current, 'all', undefined, 1)]) {
    await assert.rejects(query, (error: unknown) => error instanceof EngineError && error.code === 'invalid-eliminations')
  }
  current.position.entries = '009' + '0'.repeat(78)
  await assert.rejects(puzzleHints(current), { code: 'conflict' })
  assert.equal(requests, 0)
})

test('only empty cells lose required candidates, and valid non-solution removals remain usable', () => {
  const current = game()
  const masks = Array<number>(81).fill(0)
  masks[2] = 1 << (Number(solution[2]) % 9)
  assert.equal(variantHintProblem(current, STARTER, masks), undefined)
  masks[0] = 511 // Candidate remnants on a filled cell do not invalidate its placed digit.
  assert.equal(variantHintProblem(current, STARTER, masks), undefined)
  assert.equal(variantHintProblem({ variant: undefined }, STARTER, Array(81).fill(511)), undefined)
})

test('a complete displayed candidate grid cannot silently omit the solution digit', async () => {
  const current = game()
  current.position.center = [...STARTER].map(digit => digit === '0' ? 511 : 0)
  current.position.center[2] &= ~(1 << (Number(solution[2]) - 1))
  assert.equal(current.position.eliminations, undefined)
  await assert.rejects(puzzleHints(current), { code: 'invalid-eliminations' })
})
