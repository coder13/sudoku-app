import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { readCoachSolutionSources, standaloneCoachSolutionSources } from './helpers/coach-fixture-sources.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const sources = readCoachSolutionSources()

test('published Sudoku Coach completions pass the Rust engine with every imported rule combination', async () => {
  assert.equal(sources.size, 80)
  const standaloneSeen = new Set<string>()
  let checked = 0

  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    const sourceName = source.references[0]

    if (imported.futoshiki || imported.calcudoku) {
      assert.ok(source.references.every(reference => standaloneCoachSolutionSources.has(reference)), sourceName)
      for (const reference of source.references) standaloneSeen.add(reference)
      continue
    }

    if (imported.variant) {
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: imported.variant.puzzle,
        entries: source.solution,
      } }), 'unique', sourceName)
    } else if (imported.grid) {
      const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, source.solution)
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique', sourceName)
    } else {
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
        entries: source.solution,
      } }), 'unique', sourceName)
    }
    checked++
  }

  assert.equal(checked, 77)
  assert.deepEqual([...standaloneSeen].sort(), [...standaloneCoachSolutionSources].sort())
})
