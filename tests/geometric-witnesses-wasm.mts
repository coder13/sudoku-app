import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('shared geometric witnesses preserve nested proofs across candidate and placement changes', async () => {
  const puzzle: VariantPuzzle = { version: 1,
    givens: '100007090030020008009600500005300900010080002600004000300000010041000007007000300' }
  const position = { puzzle }
  const techniqueOrder = ['nested-forcing-net']
  const request = { type: 'variant', operation: 'hints', position, techniqueOrder, limit: 0xffff_ffff } as const
  const solution = await runEngine({ type: 'variant', operation: 'solve', position, maxNodes: 20_000 })
  const check = (proofs: readonly VariantDeduction[]) => {
    for (const proof of proofs) for (const action of proof.actions) {
      if ('place' in action) assert.equal(Number(solution[action.place.cell]), action.place.digit)
      else assert.notEqual(Number(solution[action.eliminate.cell]), action.eliminate.digit)
    }
  }
  const proofs = await runEngine(request)
  assert.equal(proofs.length, 12)
  check(proofs)
  const removal = proofs.flatMap(proof => proof.actions).find(action => 'eliminate' in action)
  assert.ok(removal && 'eliminate' in removal)
  const eliminations = Array<number>(81).fill(0)
  eliminations[removal.eliminate.cell] = 1 << (removal.eliminate.digit - 1)
  const afterRemoval = await runEngine({ ...request, position: { puzzle, eliminations } })
  assert.equal(afterRemoval.length, 11)
  check(afterRemoval)
  assert.deepEqual(await runEngine(request), proofs)

  const entries = Array<string>(81).fill('0')
  const cell = puzzle.givens.indexOf('0')
  entries[cell] = solution[cell]
  const afterPlacement = await runEngine({ ...request, position: { puzzle, entries: entries.join('') } })
  assert.equal(afterPlacement.length, 53)
  check(afterPlacement)
  assert.deepEqual(await runEngine(request), proofs)

  const whispers = JSON.parse(readFileSync(new URL('./fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')).puzzle as VariantPuzzle
  assert.deepEqual(await runEngine({ ...request, position: { puzzle: whispers } }), [])
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: whispers }, maxNodes: 4096 }), 'search-limit')
  assert.deepEqual(await runEngine(request), proofs)
})
