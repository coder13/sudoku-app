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
  const game = { ...makeGame('entropy', 'Global Entropy', puzzle.givens, 'imported'), variant: { id: 'global-entropy' as const, puzzle, solution: published.solution } }
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
    assert.ok(puzzle.rules)
    assert.equal(puzzle.rules.filter((rule: { type: string }) => rule.type === 'global-entropy').length, 1)
    assert.equal(puzzle.rules.length, source.puzzle.rules.length)
    assert.match(variantRuleDescriptions(puzzle).join(' '), /Every 2 × 2 area/)
    assert.ok(isPlayablePuzzle(variantIdForPuzzle(puzzle), puzzle))
  }
  assert.equal(generationVariant({ id: 'global-entropy' }), 'global-entropy')
})

test('global imports reject local cells, unknown parameters and invalid definitions', async () => {
  for (const settings of [{ threshold: 3 }, { negativeConstraint: true }])
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'globalEntropy', segments: [], settings }] })), /unsupported settings/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'globalEntropy', segments: [{ cells: [0] }] }] })), /unsupported cells/)
  assert.equal(isPlayablePuzzle('global-entropy', { ...plain, rules: [{ type: 'global-entropy', cells: [0, 1, 9, 10] }] }), false)
  assert.equal(isPlayablePuzzle('global-entropy', { ...plain, rules: [{ type: 'global-entropy', groups: [1, 2, 3] }] }), false)
  assert.equal(isPlayablePuzzle('global-entropy', { ...plain, rules: [{ type: 'global-entropy', groups: [[1, 2], [3, 4], [5, 6, 7, 8, 9]] }] }), false)
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

test('raw imports preserve the spiral gap and enforce Entropic Order group positions', async () => {
  const spiral = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8'))
    .examples.find((source: { url: string }) => source.url.endsWith('LEjN'))
  const ordered = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8'))
    .examples.find((source: { url: string }) => source.url.endsWith('7nms'))
  assert.ok(spiral && ordered)
  assert.equal(spiral.deferred, '')
  assert.equal(ordered.deferred, '')
  const encoded = (await detectPuzzle(spiral.code)).variant!.puzzle
  assert.equal(encoded.rules!.length, 35)
  assert.equal(encoded.rules!.filter(rule => rule.type === 'entropic').length, 18)
  assert.equal(encoded.rules!.filter(rule => rule.type === 'global-entropy').length, 1)
  assert.equal(encoded.rules!.filter(rule => rule.type === 'forbidden-entropic-connection').length, 16)
  assertVariantCompletion(encoded, spiral.solution)
  const importedOrder = (await detectPuzzle(ordered.code)).variant!.puzzle
  const orders = importedOrder.rules!.filter(rule => rule.type === 'digit-order')
  assert.equal(orders.length, 7)
  assertVariantCompletion(importedOrder, ordered.solution)
})


test('the published 7/13 sum export keeps all active rules beside its empty Consecutive Line layer', async () => {
  const source = load('coach').examples.find(({ url }: { url: string }) => url.endsWith('HqJ9'))
  const { variant } = await detectPuzzle(source.code)
  assert.equal(variant?.id, 'mixed')
  const clues = [
    [29, 30, 7], [39, 30, 7], [50, 59, 7], [53, 44, 7], [6, 15, 7], [10, 11, 7], [45, 54, 7],
    [25, 34, 13], [7, 16, 13], [5, 4, 13], [31, 40, 13], [70, 79, 7], [68, 77, 7], [56, 55, 13],
    [37, 38, 13], [13, 22, 7], [48, 49, 13], [33, 34, 13], [73, 74, 7], [64, 63, 13], [24, 33, 7],
    [3, 4, 7], [78, 77, 13], [62, 71, 13], [51, 42, 13], [57, 66, 13], [26, 25, 13],
  ]
  assert.deepEqual(variant.puzzle.rules, [
    ...clues.map(([first, second, sum]) => ({ type: 'adjacent-total', cells: [first, second], sum })),
    { type: 'global-entropy' },
    { type: 'kropki', ratioTwo: { pairs: [[15, 24], [58, 59]], negative: false } },
  ])
  assertVariantCompletion(variant.puzzle, source.solution)

  const line = { type: 'consecutiveLine', segments: [{ cells: [0, 1, 2], parameters: {} }] }
  assert.deepEqual((await detectPuzzle(coachCode({ givenConstraints: [line] }))).variant?.puzzle.rules, [
    { type: 'consecutive-run', cells: [0, 1, 2] },
  ])
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [
    { ...line, segments: [], settings: { negativeConstraint: true } },
  ] })), /Consecutive Line uses unsupported settings/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [
    { ...line, segments: [], wholeGrid: true },
  ] })), /Consecutive Line uses unsupported settings/)
})


test('Modular Lines completes the earlier Hu9m export without losing its global or companion rules', async () => {
  const source = load('coach').examples.find((source: { url: string }) => source.url.endsWith('Hu9m'))
  const complete = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples.find((source: { url: string }) => source.url.endsWith('Hu9m'))
  assert.equal(source.code, complete.code)
  assert.equal(source.solution, complete.solution)
  assert.deepEqual((await detectPuzzle(source.code)).variant!.puzzle, complete.puzzle)
  assert.equal(complete.puzzle.rules.length, 35)
})
