import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const puzzle: VariantPuzzle = {
  version: 1,
  givens: '0'.repeat(81),
  rules: [{ type: 'conditional-neighbor', triggerDigit: 5, alternatives: [
    { rowOffset: -1, columnOffset: 0, digit: 1 },
    { rowOffset: 1, columnOffset: 0, digit: 9 },
  ] }],
}

test('conditional neighbor rules propagate alternatives and reject invalid completions', async () => {
  const blocked = Array(81).fill('0')
  blocked[31] = '2'
  blocked[49] = '8'
  const withoutSupport = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle, entries: blocked.join(''),
  } })
  assert.equal(withoutSupport?.[40] & (1 << 4), 0)
  const impossibleTrigger = (await runEngine({ type: 'variant', operation: 'hints', position: {
    puzzle, entries: blocked.join(''),
  }, techniqueOrder: ['conditional-neighbor'], limit: 0xffff_ffff }))
    .find(deduction => deduction.actions.some(action => 'eliminate' in action && action.eliminate.cell === 40 && action.eliminate.digit === 5))
  assert.ok(impossibleTrigger)
  const impossibleHint = variantHintChoice(impossibleTrigger, puzzle)
  assert.match(impossibleHint.evidence.variant.reason, /Remove 5 from r5c5/)

  const forced = Array(81).fill('0')
  forced[40] = '5'
  forced[31] = '2'
  const withOneOption = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle, entries: forced.join(''),
  } })
  assert.equal(withOneOption?.[49], 1 << 8)

  const classicSolution = Array.from({ length: 81 }, (_, cell) =>
    String((Math.floor(cell / 9) * 3 + Math.floor(Math.floor(cell / 9) / 3) + cell % 9) % 9 + 1)).join('')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle, entries: classicSolution,
  } }), 'unsolvable')
})

test('Dutch Flatmates gets a named technique alongside Anti-Knight and Anti-King', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  for (const technique of ['anti-knight', 'anti-king', 'conditional-neighbor']) {
    assert.ok(catalog.defaultOrder.includes(technique), `${technique} is in the default variant solve order`)
  }

  const examples = await runEngine({ type: 'practice-examples', technique: 'conditional-neighbor', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    assert.equal(example.deduction.technique, 'conditional-neighbor')
    assert.ok(example.deduction.actions.some(action => 'eliminate' in action))
    const choice = variantHintChoice(example.deduction, example.position.puzzle)
    assert.match(choice.evidence.variant.description, /If r\d+c\d+ is 5, at least one of .* is 1 or .* is 9/i)
    assert.match(choice.evidence.variant.reason, /must be [19]|remove 5/i)

    const trace = await runEngine({ type: 'variant', operation: 'trace', position: example.position,
      techniqueOrder: ['conditional-neighbor'] })
    assert.equal(trace.rating.scoringVersion, 26)
    assert.equal(trace.steps[0]?.technique, 'conditional-neighbor')
  }
})
