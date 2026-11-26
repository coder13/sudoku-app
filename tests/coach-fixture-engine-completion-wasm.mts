import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { readCoachSolutionSources, standaloneCoachSolutionSources } from './helpers/coach-fixture-sources.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const sources = readCoachSolutionSources()

function assertSolutionCandidates(candidates: readonly number[], givens: string, solution: string, source: string) {
  for (let cell = 0; cell < solution.length; cell++) {
    if (givens[cell] !== '0') continue
    const digit = Number(solution[cell])
    assert.ok(Number.isInteger(digit) && digit > 0 && (candidates[cell] & (1 << (digit - 1))),
      `${source}: the engine removed the published solution digit from cell ${cell}`)
  }
}

function coachProgress(givens: string, solution: string) {
  const emptyCells = [...givens].flatMap((digit, cell) => digit === '0' ? [cell] : [])
  const moves = Array(solution.length).fill('0')
  const values = [...givens]
  for (const offset of new Set([Math.floor(emptyCells.length / 4), Math.floor(emptyCells.length / 2), Math.floor(emptyCells.length * 3 / 4)])) {
    const cell = emptyCells[offset]
    if (cell === undefined) continue
    moves[cell] = solution[cell]
    values[cell] = solution[cell]
  }
  return { entries: moves.join(''), values: values.join('') }
}

test('published Sudoku Coach completions pass the Rust engine with every imported rule combination', async () => {
  assert.equal(sources.size, 80)
  const standaloneSeen = new Set<string>()
  let checked = 0

  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    const sourceName = source.references[0]
    const progress = coachProgress(imported.givens, source.solution)

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
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: imported.variant.puzzle } })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: imported.variant.puzzle,
        entries: progress.entries,
      } })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    } else if (imported.grid) {
      const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, source.solution)
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique', sourceName)
      const startingPosition = sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, imported.givens)
      const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: startingPosition })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'sized-variant', operation: 'candidates', position:
        sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, progress.values) })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    } else {
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
        entries: source.solution,
      } }), 'unique', sourceName)
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
      } })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
        entries: progress.entries,
      } })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    }
    checked++
  }

  assert.equal(checked, 77)
  assert.deepEqual([...standaloneSeen].sort(), [...standaloneCoachSolutionSources].sort())
})
