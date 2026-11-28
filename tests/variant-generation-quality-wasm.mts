import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { DIFFICULTY_LEVELS } from '../src/sudoku/difficulty.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { EMPTY, makeGame } from '../src/sudoku/game.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

test('zero-given X-Sum and diagonal need both rules on the Hard solve path', async () => {
  const { puzzle, solution, rating, ruleDependencies } = await generateCustomSudoku(['x-sum', 'diagonal-main'], 'hard', 5, [], { miracle: true })
  assert.equal(puzzle.givens, EMPTY)
  assert.deepEqual(rating.status, { solved: 'hard' })
  assert.equal(await runEngine({ type: 'analyze', values: puzzle.givens }), 'multiple')
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }), { status: 'unique', solution })
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
  assert.deepEqual(new Set(ruleDependencies?.map(proof => proof.rule)), new Set(['x-sum', 'diagonal-main']))
  for (const proof of ruleDependencies!) {
    const reduced = { ...puzzle, rules: puzzle.rules!.filter(rule => rule.type !== (proof.rule === 'diagonal-main' ? 'diagonal' : 'x-sum')) }
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: reduced } }), 'multiple')
    assert.notEqual(proof.alternative, solution)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: reduced, entries: proof.alternative } }), 'unique')
    const { step, alternative } = proof
    assert.equal(trace.steps[step - 1].technique, proof.technique)
    assert.ok(trace.steps[step - 1].actions.some(action => JSON.stringify(action) === JSON.stringify(proof.action)))
    function fits(action: typeof proof.action) {
      return 'place' in action ? Number(alternative[action.place.cell]) === action.place.digit
        : Number(alternative[action.eliminate.cell]) !== action.eliminate.digit
    }
    assert.ok(trace.steps.slice(0, step - 1).every(move => move.actions.every(fits)))
    assert.equal(fits(proof.action), false)
  }
  const play = await runEngine({ type: 'variant', operation: 'rate', position: { puzzle }, techniqueOrder: await getVariantPlayOrder(puzzle) })
  assert.deepEqual(play.status, rating.status)
})

test('symmetry, grades below Hard, duplicate rules and cancellation have distinct outcomes', async () => {
  await assert.rejects(generateCustomSudoku(['anti-king', 'non-consecutive'], 'hard', 3, [], { miracle: true }), { code: 'unsupported', message: /second solution/ })
  await assert.rejects(generateCustomSudoku(['x-sum'], 'tricky', 3, [], { miracle: true }), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['kropki', 'kropki-black'], 'hard', 3, []), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['non-consecutive', 'kropki-white'], 'hard', 3, [], { negativeMarkers: ['kropki-white'] }), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['x-sum'], 'hard', 3, [], { miracle: true, signal: AbortSignal.abort() }), { name: 'AbortError' })
})

test('the checked diagonal X-Sum constructions replay at all six Miracle grades', async () => {
  for (const grade of DIFFICULTY_LEVELS.slice(DIFFICULTY_LEVELS.indexOf('hard'))) {
    const result = await generateCustomSudoku(['diagonal-main', 'x-sum'], grade, 1, [], { miracle: true })
    assert.equal(result.givens, 0)
    assert.deepEqual(result.rating.status, { solved: grade })
    assert.deepEqual(new Set(result.ruleDependencies?.map(item => item.rule)), new Set(['x-sum', 'diagonal-main']))
  }
  const anti = await generateCustomSudoku(['diagonal-anti', 'x-sum'], 'hard', 1, [], { miracle: true })
  assert.equal(anti.givens, 0)
  assert.ok(anti.puzzle.rules?.some(rule => rule.type === 'diagonal' && rule.diagonal === 'anti'))
  assert.ok(anti.ruleDependencies?.some(item => item.rule === 'diagonal-anti'))
})

test('a played Miracle layout is excluded before searching for its successor', async () => {
  const rules = ['x-sum', 'diagonal-main'] as const
  const first = await generateCustomSudoku(rules, 'hard', 5, [], { miracle: true })
  const game = { ...makeGame('played', 'Diagonal X-Sums', EMPTY, 'generated'),
    variant: { id: 'mixed' as const, puzzle: first.puzzle, solution: first.solution } }
  const next = await generateCustomSudoku(rules, 'hard', 5, [game], { miracle: true })
  assert.equal(next.puzzle.givens, EMPTY)
  assert.notDeepEqual(next.puzzle.rules, first.puzzle.rules)
  assert.deepEqual(next.rating.status, { solved: 'hard' })
  assert.equal(next.ruleDependencies?.length, rules.length)
})

test('Beginners can use the simple border clue in each outside-row variant', async () => {
  for (const rule of ['x-sum', 'sandwich', 'skyscrapers'] as const) {
    const { puzzle, rating, ruleDependencies } = await generateCustomSudoku([rule], 'beginner', 7, [])
    assert.deepEqual(rating.status, { solved: 'beginner' })
    assert.equal(ruleDependencies?.[0].rule, rule)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
    const step = trace.steps.find(step => step.evidence.type === 'rule-single')
    assert.ok(step, rule)
    const hint = variantHintChoice(step, puzzle)
    assert.ok('variant' in hint.evidence)
    assert.match(hint.evidence.variant.reason, /sandwich|between 1 and 9|X-Sum|skyscraper|Seeing all nine/i)
  }
})

test('Chess can replay all ten grades with a separate dependency for every rule', async () => {
  const rules = ['anti-king', 'anti-knight', 'non-consecutive'] as const
  for (const grade of DIFFICULTY_LEVELS) {
    const { puzzle, rating, ruleDependencies } = await generateCustomSudoku(rules, grade, 21, [])
    assert.deepEqual(rating.status, { solved: grade })
    assert.deepEqual(new Set(ruleDependencies?.map(proof => proof.rule)), new Set(rules))
    assert.equal(await runEngine({ type: 'analyze', values: puzzle.givens }), 'multiple')
  }
})
