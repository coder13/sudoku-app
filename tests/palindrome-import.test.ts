import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isPlayablePuzzle, variantDigitExclusions, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/palindrome-${name}.json`, import.meta.url), 'utf8'))
const clover = load('clover') as { puzzle: VariantPuzzle; solution: string }
const empty = '0'.repeat(81)
const rule: VariantRule = { type: 'palindrome', cells: [0, 10, 40, 50, 80] }

test('published Palindrome fixtures match independent completions and depend on the rule', () => {
  for (const name of ['clover', 'newman']) {
    const { puzzle, solution } = load(name)
    assertVariantCompletion(puzzle, solution)
    const independent = countLineSolutions(puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, solution)
    assert.equal(countLineSolutions({ ...puzzle, rules: puzzle.rules.filter((rule: VariantRule) => rule.type !== 'palindrome') }).count, 2)
  }
})

test('mirrored equality differs from peers and leaves the odd center unrestricted', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [rule] }
  assert.equal(isPlayablePuzzle('palindrome', puzzle), true)
  assert.equal(generationVariant({ id: 'palindrome' }), undefined)
  for (let digit = 1; digit <= 9; digit++) {
    assert.equal(variantDigitExclusions(puzzle, 0, 80, digit), 511 & ~(1 << (digit - 1)))
    assert.equal(variantDigitExclusions(puzzle, 10, 50, digit), 511 & ~(1 << (digit - 1)))
    assert.equal(variantDigitExclusions(puzzle, 0, 40, digit), 0)
    assert.equal(variantDigitExclusions(puzzle, 0, 10, digit), 0)
  }
  assert.equal(variantPeers(puzzle, 0, 80), false)
  const values = [...empty]; values[0] = '4'; values[80] = '5'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)], [0, 80])
  values[80] = '4'; assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
  values[40] = '4'; assert.equal(conflictsOf(values.join(''), puzzle).size, 0)

  let game = { ...makeGame('palindrome-notes', 'Palindrome', empty, 'imported'), variant: { id: 'palindrome' as const, puzzle, solution: clover.solution } }
  for (const digit of [4, 5]) { game = enter(game, [80], 'center', digit); game = enter(game, [80], 'corner', digit) }
  const next = enter(game, [0], 'value', 4)
  assert.equal(next.position.center[80], 1 << 3); assert.equal(next.position.corner[80], 1 << 3)
  assert.deepEqual(redo(undo(next)).position, next.position)
  const filled = fillEntries(game, '4' + empty.slice(1))
  assert.equal(filled.position.center[80], 1 << 3); assert.equal(filled.position.corner[80], 1 << 3)
})

test('real Coach combined lines preserve every rule and unsupported companions reject', async () => {
  const { examples } = load('coach')
  const imported = await detectPuzzle(examples[0].code)
  assert.equal(imported.variant?.id, 'mixed')
  const puzzle = imported.variant!.puzzle
  assert.equal(puzzle.rules!.filter(rule => rule.type === 'palindrome').length, 3)
  assert.equal(puzzle.rules!.filter(rule => rule.type === 'whispers').length, 5)
  assertVariantCompletion(puzzle, examples[0].solution)
  const counted = countLineSolutions(puzzle)
  assert.equal(counted.count, 1); assert.equal(counted.solution, examples[0].solution)
  await assert.rejects(detectPuzzle(examples[1].code), /greaterLess/)
})

test('Coach normalization follows connected components and preserves raw drawings', async () => {
  // The middle segment is discovered only after the later segment extends the component.
  const paths = [[0, 10], [40, 50], [10, 40], [8, 16, 60, 8]]
  const code = coachCode({ givenConstraints: [{ type: 'palindromeLine', settings: {},
    segments: paths.map(cells => ({ cells, parameters: {} })) }] })
  const imported = (await detectPuzzle(code)).variant!
  assert.equal(imported.id, 'palindrome')
  assert.deepEqual(imported.puzzle.rules, [
    { type: 'palindrome', cells: [0, 10, 40, 50], segments: paths.slice(0, 3) },
    { type: 'palindrome', cells: [8, 16, 60], segments: [paths[3]] },
  ])
  const shared = '#variant=' + encodeURIComponent(JSON.stringify(imported))
  assert.deepEqual((await detectPuzzle(shared)).variant, imported)
  assert.ok(variantRuleDescriptions(imported.puzzle).some(text => /r1c1 with r6c6/.test(text)))
  // Independent constraint layers must not be joined even if their paths share cells.
  const split = await detectPuzzle(coachCode({ givenConstraints: paths.slice(0, 2).map(cells =>
    ({ type: 'palindromeLine', settings: {}, segments: [{ cells, parameters: {} }] })) }))
  assert.equal(split.variant!.puzzle.rules!.length, 2)
  const branched = await detectPuzzle(coachCode({ givenConstraints: [{ type: 'palindromeLine', settings: {},
    segments: [[0, 10, 20], [10, 40, 50]].map(cells => ({ cells, parameters: {} })) }] }))
  assert.deepEqual(branched.variant!.puzzle.rules, [{ type: 'palindrome', cells: [0, 10, 20, 40, 50],
    segments: [[0, 10, 20], [10, 40, 50]] }])
})

test('all grid symmetries preserve segmented geometry and complete rule definitions', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'palindrome', cells: [0, 10, 40, 50], segments: [[0, 10, 40], [40, 50, 0]] },
  ] }
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const at = (cell: number) => {
      let [r, c] = [Math.floor(cell / 9), cell % 9]
      if (symmetry & 1) [r, c] = [c, r]
      if (symmetry & 2) r = 8 - r
      if (symmetry & 4) c = 8 - c
      return r * 9 + c
    }
    const changed = reflectVariant(puzzle, symmetry)
    assert.deepEqual(changed.rules, [{ type: 'palindrome', cells: [0, 10, 40, 50].map(at),
      segments: [[0, 10, 40], [40, 50, 0]].map(path => path.map(at)) }])
    assert.equal(isPlayablePuzzle('palindrome', changed), true)
    assertVariantCompletion(reflectVariant(clover.puzzle, symmetry), (() => {
      const solution = [...empty]; [...clover.solution].forEach((digit, cell) => { solution[at(cell)] = digit }); return solution.join('')
    })())
  }
})

test('malformed logical or drawing data and unknown parameters never silently disappear', async () => {
  for (const cells of [[], [0], [0, 81], [0, 0], [-1, 80], [0, 1.5]]) {
    assert.equal(isPlayablePuzzle('palindrome', { version: 1, givens: empty, rules: [{ type: 'palindrome', cells }] }), false)
  }
  for (const segments of [[], [[]], [[0]], [[0, 80, 81]], [[0, 80, 1]], null]) {
    assert.equal(isPlayablePuzzle('palindrome', { version: 1, givens: empty, rules: [{ type: 'palindrome', cells: [0, 80], segments }] }), false)
  }
  for (const constraint of [
    { type: 'palindromeLine', segments: [] },
    { type: 'palindromeLine', segments: [{ cells: [0, 80], parameters: { sum: 9 } }] },
    { type: 'palindromeLine', segments: [{ cells: [0, 81] }] },
    { type: 'palindromeLine', settings: { difference: 5 }, segments: [{ cells: [0, 80] }] },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })), /Palindrome|unsupported|invalid/)
})
