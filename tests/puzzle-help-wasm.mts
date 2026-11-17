import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type Difficulty, type HintChoice } from '../src/sudoku/engine.ts'
import { applyDeduction, hintEliminations, completeCandidateMasks, makeGame, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution, puzzleTechniqueCatalog } from '../src/sudoku/puzzle-help.ts'
import { saveDisabledHintTechniques } from '../src/sudoku/hint-preferences.ts'
import { scanTechnique, techniqueScanKey, cachedTechniqueCounts } from '../src/sudoku/technique-scan.ts'
import { getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { mixedFixtures } from './helpers/mixed-fixtures.ts'
import { STARTER } from '../src/sudoku/formats.ts'

useWasmWorker()

function targets(hints: readonly HintChoice[]) {
  return new Set(hints.flatMap(({ actions }) => actions.map(action => {
    const { cell, digit } = 'place' in action ? action.place : action.eliminate
    return `${'place' in action ? 'p' : 'e'}:${cell}:${digit}`
  }))).size
}

test('app hints, technique selection, and complete solutions work for every offered variant difficulty', async (t) => {
  const techniqueOrder = await getVariantPlayOrder()
  const catalog = await puzzleTechniqueCatalog(true)
  assert.ok(catalog.techniques.some(({ id }) => id === 'locked-candidates'))
  assert.ok(!(await puzzleTechniqueCatalog(false)).techniques.some(({ id }) => id === 'thermometer'))
  for (const [id, levels] of Object.entries(variantSeeds)) {
    for (const [difficulty, recipes] of Object.entries(levels)) await t.test(`${id} ${difficulty}`, async () => {
      const { puzzle, solution } = await runEngine(variantGenerationRequest(
        id as keyof typeof variantSeeds, difficulty as Difficulty, recipes![0], techniqueOrder,
      ))
      const game = { ...makeGame(`help-${id}-${difficulty}`, 'Variant', puzzle.givens, 'generated'),
        variant: { id: id as keyof typeof variantSeeds, puzzle, solution }, difficulty: difficulty as Difficulty }
      const saved = JSON.stringify(game)
      const hints = await puzzleHints(game)
      assert.ok(hints.choices.length > 0 && hints.choices.length <= 10)
      assert.ok(hints.candidates)
      assert.equal(new Set(hints.choices.map(({ actions }) => JSON.stringify(actions))).size, hints.choices.length)
      const path = await puzzleSolution(game)
      assert.notEqual(path.rating.status, 'stalled')
      assert.equal(path.board, solution)
      assert.equal(path.positions!.length, path.steps.length + 1)
      let played = game
      for (const [index, step] of path.steps.entries()) {
        assert.ok(step.actions.length)
        for (const action of step.actions) {
          if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit))
          else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
        }
        played = applyDeduction(played, step.actions, path.positions![index].candidates!) as typeof game
        assert.equal(valuesOf(played), [...puzzle.givens].map((digit, cell) => digit === '0' ? path.positions![index + 1].entries[cell] : digit).join(''))
        if (index === Math.floor(path.steps.length / 2)) {
          const next = await puzzleHints(played)
          assert.ok(next.choices.length)
          for (const hint of next.choices) for (const action of hint.actions) {
            if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit))
            else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
          }
        }
      }
      assert.equal(valuesOf(played), solution)
      // Selecting a row must return its proofs and the same distinct candidate count.
      const technique = hints.choices[0].technique
      const selected = await puzzleHints(game, 'all', technique)
      assert.ok(selected.choices.length)
      assert.ok(selected.choices.every(hint => hint.technique === technique))
      const removals = hintEliminations(valuesOf(game), completeCandidateMasks(game), game.position.eliminations)
      const count = await scanTechnique(valuesOf(game), removals, technique, variantPosition(game.variant, game.position))
      assert.equal(count, targets(selected.choices))
      assert.deepEqual(cachedTechniqueCounts(techniqueScanKey(valuesOf(game), removals, puzzle))[technique], { count })
      assert.equal(JSON.stringify(game), saved, 'Viewing hints and solutions must not edit the game')
      if (id === 'jigsaw') {
        const regionStep = path.steps.findIndex(step => 'variant' in step.evidence && step.evidence.variant.description.includes('region'))
        assert.ok(regionStep >= 0, 'Jigsaw help must use its actual regions')
        const before = path.positions![regionStep]
        const progressed = { ...game, position: { ...game.position, entries: before.entries, eliminations: before.eliminations } }
        const regionHints = await puzzleHints(progressed, 'all', path.steps[regionStep].technique)
        assert.ok(regionHints.choices.some(hint => JSON.stringify(hint.actions) === JSON.stringify(path.steps[regionStep].actions)))
        assert.ok(regionHints.choices.some(hint => 'variant' in hint.evidence && hint.evidence.variant.description.includes('region')))
      }
    })
  }
})

test('variant hint preferences apply to normal hints while explicit technique inspection remains available', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  const { puzzle, solution } = await runEngine(variantGenerationRequest(
    'jigsaw', 'medium', variantSeeds.jigsaw.medium![0], await getVariantPlayOrder(),
  ))
  const game = { ...makeGame('help-preferences', 'Jigsaw', puzzle.givens, 'generated'),
    variant: { id: 'jigsaw' as const, puzzle, solution } }
  const first = (await puzzleHints(game)).choices[0]
  saveDisabledHintTechniques((await puzzleTechniqueCatalog(true)).techniques.map(({ id }) => id))
  assert.deepEqual((await puzzleHints(game)).choices, [])
  assert.ok((await puzzleHints(game, 'all', first.technique)).choices.length)
})

test('technique scan caches distinguish classic grids, Jigsaw regions, and combined rules', () => {
  const values = '0'.repeat(81)
  const regions = { type: 'jigsaw' as const, regions: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)) }
  const puzzle = { givens: values, regions }
  assert.equal(new Set([
    techniqueScanKey(values), techniqueScanKey(values, undefined, puzzle),
    techniqueScanKey(values, undefined, { ...puzzle, regions: { type: 'standard' } }),
    techniqueScanKey(values, undefined, { ...puzzle, rules: [{ type: 'diagonal', diagonal: 'main' }] }),
    techniqueScanKey(values, [1], puzzle),
  ]).size, 5)
})

test('the shared app help path retains combined rules and Classic behavior', async (t) => {
  for (const [name, fixture] of Object.entries(mixedFixtures)) await t.test(name, async () => {
    const game = { ...makeGame(`help-${name}`, 'Combined rules', fixture.puzzle.givens, 'imported'),
      variant: { id: 'mixed' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
    const hints = await puzzleHints(game)
    assert.ok(hints.choices.length >= 2)
    const solution = await puzzleSolution(game)
    assert.equal(solution.board, fixture.solution)
    assert.notEqual(solution.rating.status, 'stalled')
    for (const hint of hints.choices) for (const action of hint.actions) {
      if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit))
      else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit))
    }
  })
  const classic = makeGame('help-classic', 'Classic', STARTER, 'starter')
  const hints = await puzzleHints(classic)
  assert.ok(hints.choices.length)
  assert.ok((await puzzleHints(classic, 'all', hints.choices[0].technique)).choices.length)
  assert.equal((await puzzleSolution(classic)).board, await runEngine({ type: 'solve', values: STARTER }))
})

test('every technique row in the Jigsaw finder can be scanned and inspected against the same current grid', async () => {
  const { puzzle, solution } = await runEngine(variantGenerationRequest(
    'jigsaw', 'medium', variantSeeds.jigsaw.medium![0], await getVariantPlayOrder(),
  ))
  const game = { ...makeGame('help-jigsaw-catalog', 'Jigsaw', puzzle.givens, 'generated'),
    variant: { id: 'jigsaw' as const, puzzle, solution } }
  const removals = hintEliminations(valuesOf(game), completeCandidateMasks(game), game.position.eliminations)
  for (const { id } of (await puzzleTechniqueCatalog(true)).techniques) {
    const count = await scanTechnique(valuesOf(game), removals, id, variantPosition(game.variant, game.position))
    const selected = await puzzleHints(game, 'all', id)
    assert.equal(count, targets(selected.choices), id)
    for (const hint of selected.choices) for (const action of hint.actions) {
      if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit), id)
      else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit), id)
    }
  }
})
