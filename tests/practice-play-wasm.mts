import assert from 'node:assert/strict'
import test from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { articles } from '../src/sudoku/lessons.ts'
import { practiceBases } from '../src/sudoku/practice-bases.ts'
import { generatePracticePuzzle, generateVariantPracticePuzzle, hasVariantPracticePuzzles, practiceTechniqueOrder } from '../src/sudoku/practice-play.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const singles = new Set(['full-house', 'hidden-single-box', 'naked-single', 'hidden-single'])

test('practice playlists start and finish with a verified path for their chosen technique', async () => {
  const catalog = await runEngine({ type: 'techniques' })
  for (const [technique, bases] of Object.entries(practiceBases)) {
    const { board, rating } = await generatePracticePuzzle(technique, 42, [], runEngine)
    const path = await runEngine({ type: 'logical-solve', values: board, techniqueOrder: practiceTechniqueOrder(catalog, technique) })
    assert.equal(path.steps[0]?.technique, technique, technique)
    assert.equal(path.rating.score.hardest, technique, technique)
    assert.notEqual(path.rating.status, 'stalled', technique)
    assert.deepEqual(path.rating.score, rating.score)
    if (bases.singles) assert.ok(path.steps.slice(1).every(step => singles.has(step.technique)), technique)
  }
})

test('standard Play hints and the solution start with the selected practice technique', async () => {
  const technique = 'continuous-nice-loop'
  const { board } = await generatePracticePuzzle(technique, 42, [], runEngine)
  const game = { ...makeGame('practice', 'Continuous Nice Loop practice', board, 'generated'), practiceTechnique: technique }
  assert.equal((await puzzleHints(game)).choices[0]?.technique, technique)
  const solution = await puzzleSolution(game)
  assert.equal(solution.steps[0]?.technique, technique)
  assert.equal(solution.rating.score.hardest, technique)
})

test('next WXYZ-Wing puzzle excludes previous grids even when the seed repeats', async () => {
  const first = await generatePracticePuzzle('wxyz-wing', 42, [], runEngine)
  const next = await generatePracticePuzzle('wxyz-wing', 42, [first.board], runEngine)
  assert.notEqual(first.board, next.board)
  assert.equal(next.rating.score.hardest, 'wxyz-wing')
  assert.equal(await runEngine({ type: 'analyze', values: next.board }), 'unique')
})

test('variant practice playlists keep the trainer rules and can continue in Play', async () => {
  const techniques = new Set(articles.flatMap(article => article.blocks.flatMap(block =>
    block.type === 'practice' ? block.drills.map(drill => drill.example).filter(hasVariantPracticePuzzles) : [])))
  assert.ok(techniques.has('locked-candidates'))
  for (const technique of techniques) {
    const first = await generateVariantPracticePuzzle(technique, 42, [], runEngine)
    const next = await generateVariantPracticePuzzle(technique, 42, [first.puzzle], runEngine)
    assert.notDeepEqual(next.puzzle, first.puzzle, technique)
    assert.equal(next.rating.hardest, technique)
    const id = variantIdForPuzzle(next.puzzle)
    assert.notEqual(id, 'classic', technique)
    if (id === 'classic') assert.fail('Expected a variant puzzle.')
    const game = { ...makeGame('variant-practice', 'Variant practice', next.puzzle.givens, 'generated'),
      practiceTechnique: technique, variant: { id, puzzle: next.puzzle, solution: next.solution } }
    assert.equal((await puzzleHints(game)).choices[0]?.technique, technique)
  }
})
