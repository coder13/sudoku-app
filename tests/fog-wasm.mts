import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { runEngine, type VariantRule, type VariantVisibility } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('the published Fog source verifies exactly and visible markers never expose their hidden layer companions', async () => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')) as {
    examples: { url: string; code: string; solution: string }[]
  }
  const source = examples.find(example => example.url.endsWith('/Fnxt'))!
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  const bits = [...source.code.slice('SCv7_32_'.length)].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const json = inflateSync(Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))).toString('utf8')
  const { givenConstraints, ...fields } = JSON.parse(json) as {
    givenConstraints: { type: string; segments: { cells: number[]; parameters: object }[]; settings: object }[]
  }
  const fog = givenConstraints.filter(layer => layer.type === 'fog')
  assert.equal(fog.length, 1)
  assert.deepEqual(fog[0].segments, [{ cells: [63], parameters: {} }])
  assert.deepEqual(fog[0].settings, {})
  const { variant } = await detectPuzzle(coachCode({ ...fields, givenConstraints: givenConstraints.filter(layer => layer.type !== 'fog') }))
  assert.ok(variant)
  assert.equal(variant.puzzle.rules?.length, 17)
  assertVariantCompletion(variant.puzzle, source.solution)
  const independent = countLineSolutions(variant.puzzle)
  assert.equal(independent.count, 1)
  assert.equal(independent.solution, source.solution)

  // Split marker layers into individually visible facts. The remaining engine rules
  // keep their original definitions and can still participate in the exact solve.
  const rules = variant.puzzle.rules!.flatMap((rule): VariantRule[] => {
    if (rule.type === 'kropki' && rule.ratioTwo?.pairs) {
      return rule.ratioTwo.pairs.map(pair => ({ type: 'kropki', ratioTwo: { pairs: [pair] } }))
    }
    if (rule.type === 'xv') {
      return [
        ...(rule.five?.pairs ?? []).map(pair => ({ type: 'xv' as const, five: { pairs: [pair] } })),
        ...(rule.ten?.pairs ?? []).map(pair => ({ type: 'xv' as const, ten: { pairs: [pair] } })),
      ]
    }
    return [rule]
  })
  const puzzle = { ...variant.puzzle, rules }
  const exact = await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } })
  assert.deepEqual(exact, { status: 'unique', solution: source.solution })

  const initial: VariantVisibility = { cells: [63], rules: [0] }
  const opening = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle }, visibility: initial })
  assert.equal(opening[63], 0x155)
  assert.equal(opening[72], 0x1ff)
  const entries = '0'.repeat(63) + source.solution[63] + '0'.repeat(17)
  const position = { puzzle, entries }
  const black = rules.findIndex(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs?.[0].includes(63))
  const ten = rules.findIndex(rule => rule.type === 'xv' && rule.ten?.pairs?.[0].includes(63))
  assert.ok(black > 0 && ten > 0)
  const revealed: VariantVisibility = { cells: [54, 55, 63, 64, 72, 73], rules: [0, black, ten] }
  const visible = await runEngine({ type: 'variant', operation: 'normalize', position, visibility: revealed })
  assert.deepEqual(visible.puzzle.rules.map(rule => rule.type), ['parity', 'kropki', 'xv'])
  assert.deepEqual(visible.puzzle.rules[1], { type: 'kropki', consecutive: { pairs: [], negative: false },
    ratioTwo: { pairs: [[72, 63]], negative: false } })
  assert.deepEqual(visible.puzzle.rules[2], { type: 'xv', five: { pairs: [], negative: false },
    ten: { pairs: [[63, 64]], negative: false } })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position, visibility: revealed })
  assert.equal(candidates[64], 1 << 8)
  assert.equal(candidates[72], 1 << 1)
  assert.equal(candidates[25], 0x1ff, 'An unrelated black dot is still hidden')
  const singles = await runEngine({ type: 'variant', operation: 'solve-singles', position, visibility: revealed })
  assert.equal(singles[64], source.solution[64])
  assert.equal(singles[72], source.solution[72])
  for (const [cell, digit] of [...singles].entries()) if (digit !== '0') assert.equal(digit, source.solution[cell])

  const beforeScan = watchTechniqueScan(entries, undefined, position, initial)
  const afterScan = watchTechniqueScan(entries, undefined, position, revealed)
  try {
    assert.equal(await beforeScan.count('kropki'), 0)
    const hints = await runEngine({ type: 'variant', operation: 'hints', position, visibility: revealed, techniqueOrder: ['kropki'] })
    const actions = new Set(hints.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 0)
    assert.equal(await afterScan.count('kropki'), actions.size)
    assert.equal(await beforeScan.count('kropki'), 0, 'A reveal must not change counts for the earlier view')
  } finally {
    beforeScan.close()
    afterScan.close()
  }
})
