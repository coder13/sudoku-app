import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPosition, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))

test('dense partial-source overlay scans retain exact proofs, empty Finder counts and edited positions', async () => {
  const saved = load('overlay-dense')
  const source = load('modular-coach').examples.find((s: { url: string }) => s.url === saved.url) as { puzzle: VariantPuzzle; solution: string }
  assert.ok(source)
  const position: VariantPosition = { puzzle: source.puzzle, entries: saved.entries, eliminations: saved.eliminations }
  // Replay the archived profile. Modular + sum reasoning now changes the
  // default path before these positions, whose overlay proofs stay valid.
  const order = (await getVariantPlayOrder()).filter(technique => technique !== 'modular')
  const replay = await runEngine({ type: 'variant', operation: 'replay-step', position: { puzzle: source.puzzle }, techniqueOrder: order, stepIndex: saved.replayStep })
  assert.ok(replay)
  const expectedPuzzle = {
    ...source.puzzle,
    regions: source.puzzle.regions ?? { type: 'boxes' },
    rules: (source.puzzle.rules ?? []).map(rule => rule.type === 'kropki' ? {
      ...rule,
      consecutive: rule.consecutive ?? { negative: false, pairs: [] },
      ratioTwo: rule.ratioTwo ?? { negative: false, pairs: [] },
    } : rule),
  }
  assert.deepEqual(replay.before.puzzle, expectedPuzzle)
  assert.equal(replay.before.entries, saved.entries)
  assert.deepEqual(replay.before.eliminations, saved.eliminations)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'candidates', position }), saved.domains)
  const singles = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['pattern-overlay'], limit: 0xffff_ffff })
  assert.deepEqual(singles.map(proof => proof.actions), [1,2,3].map(digit => [1,19].map(cell => ({ eliminate: { cell, digit } }))))
  for (const digit of [1,2,3]) for (const cell of [1,19]) assert.notEqual(Number(source.solution[cell]), digit)
  const scan = watchTechniqueScan(position.entries!, position.eliminations, position)
  try {
    for (const technique of ['pairwise-pattern-overlay','triple-pattern-overlay','quadruple-pattern-overlay','quintuple-pattern-overlay']) {
      const query = { type: 'variant' as const, operation: 'hints' as const, position, techniqueOrder: [technique], limit: 0xffff_ffff }
      assert.deepEqual(await runEngine(query), [])
      assert.equal(await scan.count(technique), 0)
      const page = await runEngine({ ...query, collection: 179 })
      assert.equal(page.available, 0)
      assert.deepEqual(page.choices, [])
      await runEngine({ type: 'release-hints', collection: 179 })
    }
  } finally {
    scan.close()
  }
  for (const stepIndex of [23,24]) {
    const edited = await runEngine({ type: 'variant', operation: 'replay-step', position: { puzzle: source.puzzle }, techniqueOrder: order, stepIndex })
    assert.ok(edited)
    assert.notDeepEqual(edited.before.eliminations, position.eliminations)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position: edited.before, techniqueOrder: ['quintuple-pattern-overlay'], limit: 0xffff_ffff }), [])
  }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [] }), [])
})

test('Quintuple Pattern Overlay has no deductions at the HCHW stall after same-group house deductions', async () => {
  const { puzzle } = load('modular-coach').examples.find(({ url }: { url: string }) => url.endsWith('/HCHW'))
  const trace = await runEngine({
    type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: await getVariantPlayOrder(),
  })
  assert.equal(trace.rating.status, 'stalled')
  assert.equal(trace.steps.length, 31)
  const technique = 'quintuple-pattern-overlay'
  const position = trace.end
  assert.deepEqual(await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff,
  }), [])
  const scan = watchTechniqueScan(position.entries, position.eliminations, position)
  try { assert.equal(await scan.count(technique), 0) } finally { scan.close() }
})
