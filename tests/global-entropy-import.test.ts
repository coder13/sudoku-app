import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { ENTROPY_AREAS, globalEntropyState } from '../src/sudoku/global-entropy.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { disjointGroupRuleIndices, generationVariant, isPlayablePuzzle, variantDigitExclusions, variantHouseMasks,
  variantIdForPuzzle, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'

const empty = '0'.repeat(81)
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/global-entropy-${name}.json`, import.meta.url), 'utf8'))
const published = load('newman')
const sources = load('coach').examples.filter((source: { puzzle?: VariantPuzzle }) => source.puzzle)
const plain: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'global-entropy' }] }

function hasGroups(partial: number[]): boolean {
  const index = partial.indexOf(0)
  if (index < 0) return partial.some(digit => digit <= 3) && partial.some(digit => digit >= 4 && digit <= 6)
    && partial.some(digit => digit >= 7)
  for (const digit of [1, 4, 7]) {
    const copy = [...partial]
    copy[index] = digit
    if (hasGroups(copy)) return true
  }
  return false
}

test('the published puzzle and three complete Coach exports preserve every encoded rule and independent unique completion', async () => {
  for (const source of [published, ...sources]) {
    assertVariantCompletion(source.puzzle, source.solution)
    const independent = countLineSolutions(source.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, source.solution)
    const code = source.code ?? '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
    assert.deepEqual((await detectPuzzle(code)).variant?.puzzle, source.puzzle)
    assert.ok(source.puzzle.rules.some((rule: { type: string }) => rule.type === 'global-entropy'))
  }
  assert.equal(published.puzzle.givens.replaceAll('0', '').length, 20)
  assert.equal(countLineSolutions({ ...published.puzzle, rules: [] }).count, 2)
  assert.equal(sources.find((source: { url: string }) => source.url.endsWith('A2s7')).puzzle.rules.length, 11)
  assert.equal(sources.find((source: { url: string }) => source.url.endsWith('CJhv')).puzzle.rules.length, 15)
  assert.equal(sources.find((source: { url: string }) => source.url.endsWith('AdoP')).puzzle.rules.length, 10)
})

test('placed-digit restrictions match direct completion of every partial four-cell group pattern', () => {
  const area = [20, 21, 29, 30]
  assert.equal(ENTROPY_AREAS.length, 64)
  assert.deepEqual(ENTROPY_AREAS[18], area)
  assert.deepEqual(ENTROPY_AREAS[63], [70, 71, 79, 80])
  for (let code = 0; code < 256; code++) {
    const partial = area.map((_, i) => [0, 1, 4, 7][(code >> (i * 2)) & 3])
    const values = Array<string>(81).fill('0')
    partial.forEach((digit, i) => { values[area[i]] = String(digit) })
    const state = globalEntropyState(plain, values.join(''))!
    const valid = hasGroups(partial)
    assert.deepEqual([...state.conflicts].sort((a, b) => a - b), valid ? [] : area.filter((_, i) => partial[i] !== 0))
    for (let i = 0; i < 4; i++) if (partial[i] === 0) for (let digit = 1; digit <= 9; digit++) {
      const trial = [...partial]
      trial[i] = digit
      assert.equal(Boolean(state.allowed[area[i]] & (1 << (digit - 1))), hasGroups(trial), `pattern ${code}, cell ${i}, digit ${digit}`)
    }
  }
  assert.equal(globalEntropyState(undefined, empty), undefined)
})

test('a second direct completion witnesses the zero-given Quadruple puzzle’s Global Entropy dependency', () => {
  const source = sources.find((source: { url: string }) => source.url.endsWith('CJhv'))
  const without = { ...source.puzzle, rules: source.puzzle.rules.filter((rule: { type: string }) => rule.type !== 'global-entropy') }
  assert.notEqual(source.withoutEntropyWitness, source.solution)
  assertVariantCompletion(without, source.solution)
  assertVariantCompletion(without, source.withoutEntropyWitness)
  assert.throws(() => assertVariantCompletion(source.puzzle, source.withoutEntropyWitness), assert.AssertionError)
})

test('opposite corners can repeat across boxes and the global rule creates no binary peer relation', () => {
  const values = Array<string>(81).fill('0')
  for (const [cell, digit] of [[20, 7], [21, 1], [29, 6], [30, 7]]) values[cell] = String(digit)
  assert.equal(conflictsOf(values.join(''), plain).size, 0)
  assert.equal(variantPeers(plain, 20, 30), false)
  assert.equal(variantDigitExclusions(plain, 20, 30, 7), 0)
  for (const [cell, digit] of [[20, 2], [21, 3], [29, 7], [30, 8]]) values[cell] = String(digit)
  assert.equal(conflictsOf(values.join('')).size, 0)
  assert.deepEqual([...conflictsOf(values.join(''), plain)].sort((a, b) => a - b), [20, 21, 29, 30])
})

test('both Pencil modes clear incompatible groups after input and batch fill, with exact undo/redo', () => {
  const givens = [...empty]
  givens[48] = '3'; givens[49] = '5'
  const puzzle: VariantPuzzle = { ...plain, givens: givens.join('') }
  const game = { ...makeGame('entropy', 'Global Entropy', puzzle.givens), variant: { id: 'global-entropy' as const, puzzle, solution: published.solution } }
  assertVariantCompletion(puzzle, published.solution)
  game.position.center = Array(81).fill(511)
  game.position.corner = Array(81).fill(511)
  const entered = enter(game, [58], 'value', 6)
  assert.equal(entered.position.center[57], 448)
  assert.equal(entered.position.corner[57], 448)
  assert.deepEqual(undo(entered).position, game.position)
  assert.deepEqual(redo(undo(entered)).position, entered.position)
  const filled = [...puzzle.givens]; filled[58] = '6'
  const batch = fillEntries(game, filled.join(''))
  assert.equal(batch.position.center[57], 448)
  assert.equal(batch.position.corner[57], 448)
})

test('walkthrough masks retain group deductions for an explained hint step', () => {
  const masks = variantHouseMasks(published.puzzle, published.puzzle.givens)
  assert.ok(masks[57] & 1)
  assert.ok(masks[57] & 2)
})

test('every square symmetry retains all global and companion clues, completion and readable rule text', () => {
  for (const source of [published, ...sources]) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry)
    const transformed = transformedBoard(source.solution, symmetry)
    assertVariantCompletion(puzzle, transformed)
    assert.equal(puzzle.rules.filter((rule: { type: string }) => rule.type === 'global-entropy').length, 1)
    assert.equal(puzzle.rules.length, source.puzzle.rules.length)
    assert.match(variantRuleDescriptions(puzzle).join(' '), /Every 2 × 2 area/)
    assert.ok(isPlayablePuzzle(variantIdForPuzzle(puzzle), puzzle))
  }
  assert.equal(generationVariant({ id: 'global-entropy' }), undefined)
})

test('global imports reject local cells, unknown parameters and invalid definitions', async () => {
  for (const settings of [{ threshold: 3 }, { negativeConstraint: true }])
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'globalEntropy', segments: [], settings }] })), /unsupported settings/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'globalEntropy', segments: [{ cells: [0] }] }] })), /unsupported cells/)
  assert.equal(isPlayablePuzzle('global-entropy', { ...plain, rules: [{ type: 'global-entropy', cells: [0, 1, 9, 10] }] }), false)
  assert.equal(isPlayablePuzzle('global-entropy', { ...plain, rules: [{ type: 'global-entropy', groups: [1, 2, 3] }] }), false)
})

test('the Disjoint Groups presentation requires all nine exact houses and preserves their source indices', () => {
  const source = sources.find((source: { url: string }) => source.url.endsWith('AdoP'))
  assert.deepEqual([...disjointGroupRuleIndices(source.puzzle.rules)], [0, 1, 2, 3, 4, 5, 6, 7, 8])
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry)
    assert.equal(disjointGroupRuleIndices(puzzle.rules!).size, 9)
    assertVariantCompletion(puzzle, transformedBoard(source.solution, symmetry))
  }
  const missing = source.puzzle.rules.slice(1)
  assert.equal(disjointGroupRuleIndices(missing).size, 0)
  const duplicated = [...missing, source.puzzle.rules[1]]
  assert.equal(disjointGroupRuleIndices(duplicated).size, 0)
  const malformed = structuredClone(source.puzzle.rules)
  malformed[0].cells[0] = malformed[0].cells[1]
  assert.equal(disjointGroupRuleIndices(malformed).size, 0)
  const shifted = [{ type: 'global-entropy' as const }, ...source.puzzle.rules]
  assert.deepEqual([...disjointGroupRuleIndices(shifted)], [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('raw exports preserve their encoded scope while incomplete authored sources remain tracked', async () => {
  const deferred = load('coach').examples.filter((source: { deferred?: string }) => source.deferred)
  for (const source of deferred) await assert.rejects(detectPuzzle(source.url), /Copy → Puzzle/)
  const spiral = deferred.find((source: { url: string }) => source.url.endsWith('LEjN'))
  const encoded = (await detectPuzzle(spiral.code)).variant!.puzzle
  assert.equal(encoded.rules!.length, 19)
  assert.equal(encoded.rules!.filter(rule => rule.type === 'entropic').length, 18)
  assert.equal(encoded.rules!.filter(rule => rule.type === 'global-entropy').length, 1)
  assertVariantCompletion(encoded, spiral.solution)
  assert.match(spiral.deferred, /forbidden connections.*168/)
  const ordered = deferred.find((source: { url: string }) => source.url.endsWith('7nms'))
  await assert.rejects(detectPuzzle(ordered.code), /cosmeticText/)
  assert.match(ordered.deferred, /order digit groups.*169/)
  for (const id of ['HqJ9', 'FLAb', 'Hu9m', '2j53']) {
    const source = deferred.find((source: { url: string }) => source.url.endsWith(id))
    await assert.rejects(detectPuzzle(source.code), /unsupported|not supported|version|region/i)
  }
})
