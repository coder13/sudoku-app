import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run in isolation with `node --experimental-strip-types --test scripts/bench-coupled-sums.mts`.
// Measures the exact published 6×6 Zipper Duality import through app request serialization.
useWasmWorker()

test('measure the published Zipper and Region Sum combination', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/zipper-region-sum.json', import.meta.url), 'utf8')) as {
    code: string
    solution: string
  }
  const wasm = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  const imported = await detectPuzzle(fixture.code)
  assert.ok(imported.grid && imported.sizedRules)
  const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, imported.givens)
  console.log(JSON.stringify({
    host: `${process.platform} ${process.arch}`,
    node: process.version,
    engine: createHash('sha256').update(wasm).digest('hex'),
    method: '5 warmups/20 samples; app worker request path; excludes browser worker startup, transfer, layout and paint.',
  }))

  async function sample<T>(name: string, run: () => Promise<T>, check: (value: T) => void) {
    const times: number[] = []
    for (let round = 0; round < 25; round++) {
      const start = performance.now()
      const result = await run()
      const elapsed = performance.now() - start
      check(result)
      if (round >= 5) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({
      name,
      medianP95Ms: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))),
    }))
  }

  await sample('candidates', () => runEngine({ type: 'sized-variant', operation: 'candidates', position }), masks => {
    assert.ok(masks)
    for (const [cell, digit] of Array.from(fixture.solution, Number).entries()) {
      assert.ok(masks[cell] & (1 << (digit - 1)))
    }
  })
  await sample('hints', () => runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 10 }), result => {
    assert.ok(result)
  })
  await sample('analyze', () => runEngine({ type: 'sized-variant', operation: 'analyze', position }), result => {
    assert.equal(result, 'unique')
  })
  await sample('solve', () => runEngine({ type: 'sized-variant', operation: 'solve', position }), result => {
    assert.deepEqual(result?.digits, Array.from(fixture.solution, Number))
  })
  await sample('trace', () => runEngine({ type: 'sized-variant', operation: 'trace', position }), result => {
    assert.deepEqual(result?.at(-1)?.digits, Array.from(fixture.solution, Number))
  })
})
