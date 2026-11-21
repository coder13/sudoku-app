import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertMatchingDigitProof } from './helpers/matching-digit-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const technique = 'matching-digit-contradiction'

test('practice examples teach matching-digit proofs with both Palindrome and Clone clues', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const metadata = catalog.techniques.find(item => item.id === technique)
  assert.equal(metadata?.cost, 80)
  assert.equal(metadata?.difficulty, 'hard')
  const exercises = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(exercises.length, 3)
  assert.equal(new Set(exercises.map(exercise => exercise.position.puzzle.givens)).size, 3)
  assert.ok(exercises.some(exercise => exercise.position.puzzle.rules?.some(rule => rule.type === 'clone')))
  assert.ok(exercises.some(exercise => exercise.position.puzzle.rules?.some(rule => rule.type === 'palindrome')))
  const drill = await runEngine({ type: 'generate-practice-example', variant: true, technique, seed: 181,
    exclude: exercises[0].position.puzzle.givens })
  assert.ok(drill)
  assert.notEqual(drill.position.puzzle.givens, exercises[0].position.puzzle.givens)
  for (const example of [...exercises, drill]) {
    const { position, candidates, deduction, suggestion } = example
    const { puzzle } = position
    const values = [...puzzle.givens].map((digit, i) => digit === '0' ? position.entries?.[i] ?? '0' : digit).join('')
    assertMatchingDigitProof(puzzle, values, candidates, deduction)
    const solved = countLineSolutions(puzzle)
    assert.equal(solved.count, 1)
    for (const action of deduction.actions) {
      assert.ok('eliminate' in action)
      assert.notEqual(Number(solved.solution![action.eliminate.cell]), action.eliminate.digit)
    }
    const clue = variantHintChoice(deduction, puzzle).evidence
    assert.ok('variant' in clue && clue.variant.reasonSteps!.length > 2)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position, technique,
      action: suggestion }), deduction)
  }
})
