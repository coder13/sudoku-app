import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, undo, redo, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import {
  generationVariant,
  isPlayablePuzzle,
  variantDigitExclusions,
  variantHouseMasks,
  variantPeers,
  variantIdForPuzzle,
} from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
const empty = '0'.repeat(81)
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/entropic-${name}.json`, import.meta.url), 'utf8'))

test('published Clover and five complete Coach sources preserve every rule and their independent unique completion', async () => {
  for (const source of [
    load('clover'),
    ...load('coach').examples.filter((s: { deferred?: string }) => !s.deferred),
  ]) {
    assertVariantCompletion(source.puzzle, source.solution)
    const independent = countLineSolutions(source.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, source.solution)
    const without = countLineSolutions({
      ...source.puzzle,
      rules: source.puzzle.rules.filter((r: { type: string }) => r.type !== 'entropic'),
    })
    // Ksy3's printed orange path is redundant. Structural equality still
    // preserves it even when the final completion cannot expose its loss.
    assert.equal(without.count, source.url?.endsWith('Ksy3') ? 1 : 2)
    const code =
      source.code ??
      '#variant=' +
        encodeURIComponent(
          JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle })
        )
    assert.deepEqual((await detectPuzzle(code)).variant?.puzzle, source.puzzle)
  }
})

test('touching segments stay independent, while closures and revisits retain their original order', async () => {
  const paths = [[0, 10, 20], [20, 30, 40], [2, 12, 22, 2], [8], [0, 10, 20, 0, 10, 20, 0]]
  const code = coachCode({
    givenConstraints: [
      {
        type: 'entropicLine',
        settings: { colour: '#ffccaa', lineThickness: 20 },
        segments: paths.map((cells) => ({ cells, parameters: {} })),
      },
    ],
  })
  const imported = (await detectPuzzle(code)).variant!
  assert.deepEqual(
    imported.puzzle.rules,
    paths.map((cells) => ({ type: 'entropic', cells }))
  )
  assert.equal(variantPeers(imported.puzzle, 0, 20), true)
  assert.equal(variantPeers(imported.puzzle, 0, 30), false)
  assert.equal(variantPeers(imported.puzzle, 0, 40), false)
})

test('every pair of placed digits obeys the repeating groups, with equal digits allowed three positions apart', () => {
  const cells = [0, 13, 26, 30, 43, 56]
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'entropic', cells }] }
  for (const other of [13, 26, 30, 43, 56])
    for (let a = 1; a <= 9; a++)
      for (let b = 1; b <= 9; b++) {
        const samePhase = cells.indexOf(other) % 3 === 0,
          sameGroup = Math.floor((a - 1) / 3) === Math.floor((b - 1) / 3)
        assert.equal(
          Boolean(variantDigitExclusions(puzzle, 0, other, a) & (1 << (b - 1))),
          samePhase ? !sameGroup : sameGroup
        )
        assert.equal(variantPeers(puzzle, 0, other), !samePhase)
      }
  // Distant cells have no ordinary shared house.
  const distant: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [{ type: 'entropic', cells: [0, 13, 26, 32] }],
  }
  const values = [...empty]
  values[0] = '1'
  values[32] = '1'
  assert.equal(conflictsOf(values.join(''), distant).size, 0)
  values[32] = '2'
  assert.equal(conflictsOf(values.join(''), distant).size, 0)
  values[32] = '4'
  assert.equal(conflictsOf(values.join(''), distant).size, 2)
})

test('both Pencil modes, bulk input, histories and walkthrough peer masks use the Entropic relation', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [{ type: 'entropic', cells: [0, 13, 26, 32] }],
  }
  const solution = load('clover').solution
  let game: Game = {
    ...makeGame('entropic-input', 'Entropic Lines', empty, 'imported'),
    variant: { id: 'entropic' as const, puzzle, solution },
  }
  for (let d = 1; d <= 9; d++) {
    game = enter(game, [13, 26, 32, 80], 'center', d)
    game = enter(game, [13, 26, 32, 80], 'corner', d)
  }
  const changed = enter(game, [0], 'value', 1)
  for (const mode of ['center', 'corner'] as const) {
    assert.equal(changed.position[mode][13], 504)
    assert.equal(changed.position[mode][26], 504)
    assert.equal(changed.position[mode][32], 7)
    assert.equal(changed.position[mode][80], 511)
  }
  assert.deepEqual(undo(changed).position, game.position)
  assert.deepEqual(redo(undo(changed)).position, changed.position)
  assert.deepEqual(fillEntries(game, '1' + empty.slice(1)).position, changed.position)
  const masks = variantHouseMasks(puzzle, '1' + empty.slice(1))
  assert.equal(masks[13] & 1, 0)
  assert.ok(masks[32] & 1)
  // Full group removal remains an explained step in walkthrough displays.
  assert.ok(masks[13] & 2)
  assert.ok(masks[32] & 8)
  assert.equal(generationVariant({ id: 'entropic' }), 'entropic')
})

test('all grid transforms preserve every repeated reference and complete mixed source', () => {
  const source = load('coach').examples.find((s: { url: string }) => s.url.endsWith('Hyk5'))
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const cell = (cell: number) => {
      let [r, c] = [Math.floor(cell / 9), cell % 9]
      if (symmetry & 1) [r, c] = [c, r]
      if (symmetry & 2) r = 8 - r
      if (symmetry & 4) c = 8 - c
      return r * 9 + c
    }
    const changed = reflectVariant(source.puzzle, symmetry)
    const original = source.puzzle.rules.find((r: { type: string }) => r.type === 'entropic')
    assert.deepEqual(
      changed.rules!.find((r) => r.type === 'entropic'),
      { type: 'entropic', cells: original.cells.map(cell) }
    )
    assert.equal(isPlayablePuzzle(variantIdForPuzzle(changed), changed), true)
  }
})

test('malformed paths and unknown parameters reject without partial imports', async () => {
  for (const cells of [[], [81], [-1], [1.5]])
    assert.equal(
      isPlayablePuzzle('entropic', {
        version: 1,
        givens: empty,
        rules: [{ type: 'entropic', cells }],
      }),
      false
    )
  assert.equal(
    isPlayablePuzzle('entropic', {
      version: 1,
      givens: empty,
      rules: [{ type: 'entropic', cells: [40] }],
    }),
    true
  )
  for (const constraint of [
    { type: 'entropicLine', segments: [] },
    { type: 'entropicLine', segments: [{ cells: [0, 10], parameters: { groups: 2 } }] },
    {
      type: 'entropicLine',
      settings: { groups: 2 },
      segments: [{ cells: [0, 10], parameters: {} }],
    },
  ])
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })))
})
