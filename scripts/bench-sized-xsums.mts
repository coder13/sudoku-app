import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { sizedRuleCandidates, sizedRuleHintChoices } from '../src/sudoku/sized-rule-play.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-sized-xsums.mts.
// Timings include app request encoding/decoding and the in-process worker adapter,
// but exclude worker startup/transfers and browser layout/paint.
useWasmWorker()

test('#404 measures the published 4×4 X-Sum Twins imports and Play callers', async () => {
  const sources = [
    { name: 'White Dots', file: 'sized-sudokupad-xsums-white-dots.scl', solution: '4321213412433412' },
    { name: 'Black Dots', file: 'sized-sudokupad-xsums-black.scl', solution: '4231312424131342' },
  ] as const
  const wasm = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    engine: createHash('sha256').update(wasm).digest('hex'), rawBytes: wasm.length,
    method: '5 warmups/40 samples; assertions outside timing; run alone with no compiler, test suite, or other benchmark; in-process app worker excludes browser worker startup, transfer, layout, and paint.' }))

  async function sample<T>(name: string, run: () => Promise<T>, check: (value: T) => void) {
    const times: number[] = []
    for (let index = 0; index < 45; index++) {
      const start = performance.now()
      const value = await run()
      const elapsed = performance.now() - start
      check(value)
      if (index >= 5) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name,
      medianP95ms: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  }

  for (const source of sources) {
    const code = readFileSync(new URL(`../tests/fixtures/${source.file}`, import.meta.url), 'utf8').trim()
    const { game } = await prepareImportedPuzzle(code)
    assert.equal(game.grid?.size, 4)
    assert.ok(game.sized && game.grid)
    assert.equal(game.sized.solution, source.solution)
    const position = sizedRulePosition(game.grid, game.sized, game.givens)
    const exactPosition = { ...position, digits: Array.from(source.solution, Number) }
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: exactPosition }), 'unique')
    const solved = await runEngine({ type: 'sized-variant', operation: 'solve', position })
    assert.equal(solved?.digits.map(String).join(''), source.solution)
    const candidates = await sizedRuleCandidates(game.sized, game.grid, game.givens)
    assert.equal(candidates?.length, 16)
    const hints = await sizedRuleHintChoices(game.sized, game.grid, game.givens)
    assert.ok(hints?.choices.length)

    await sample(`${source.name} import and preview`, async () => prepareImportedPuzzle(code), value => {
      assert.equal(value.game.sized?.solution, source.solution)
      assert.deepEqual(value.game.sized?.rules, game.sized!.rules)
    })
    await sample(`${source.name} Play candidates`, () => sizedRuleCandidates(game.sized!, game.grid!, game.givens), value => {
      assert.equal(value?.length, 16)
    })
    await sample(`${source.name} Play hints`, () => sizedRuleHintChoices(game.sized!, game.grid!, game.givens), value => {
      assert.ok(value?.choices.length)
    })
    await sample(`${source.name} exact uniqueness`, () => runEngine({
      type: 'sized-variant', operation: 'analyze', position: exactPosition,
    }), value => assert.equal(value, 'unique'))
    await sample(`${source.name} exact solve`, () => runEngine({ type: 'sized-variant', operation: 'solve', position }), value => {
      assert.equal(value?.digits.map(String).join(''), source.solution)
    })
  }
})
