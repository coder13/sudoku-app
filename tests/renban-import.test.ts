import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isPlayablePuzzle, variantDigitExclusions, variantHouseMasks, variantIdForPuzzle, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/renban-${name}.json`, import.meta.url), 'utf8'))
const clover = load('clover') as { puzzle: VariantPuzzle; solution: string }

test('published original Renban and Renban/Killer fixtures preserve unique completions and every clue', async () => {
  for (const name of ['clover', 'killer-clover']) {
    const fixture = load(name), puzzle = fixture.puzzle as VariantPuzzle
    assertVariantCompletion(puzzle, fixture.solution)
    const result = countLineSolutions(puzzle)
    assert.equal(result.count, 1); assert.equal(result.solution, fixture.solution)
    assert.equal(countLineSolutions({ ...puzzle, rules: puzzle.rules!.filter(r => r.type !== 'renban') }).count, 2)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
    assert.deepEqual((await detectPuzzle(shared)).variant?.puzzle, puzzle)
  }
  // The published cages are redundant for uniqueness. Data equality above
  // remains necessary even when the final completion alone cannot detect loss.
  const mixed = load('killer-clover').puzzle as VariantPuzzle
  assert.equal(countLineSolutions({ ...mixed, rules: mixed.rules!.filter(r => r.type !== 'killer-cages') }).count, 1)
})

test('three unmodified modern Coach sources import while unsupported complete exports reject explicitly', async () => {
  for (const source of load('coach').examples) {
    if (source.deferred) {
      if (source.url.endsWith('Ksy3')) {
        const current = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples.find((s: { url: string }) => s.url === source.url)
        assert.deepEqual((await detectPuzzle(source.code)).variant!.puzzle, current.puzzle)
        continue
      }
      const reason = source.url.endsWith('9uMo') ? /6 × 6.*unsupported active rule/ : /format|version/i
      await assert.rejects(detectPuzzle(source.code), reason)
      continue
    }
    const imported = (await detectPuzzle(source.code)).variant!
    assert.equal(imported.id, 'renban'); assert.deepEqual(imported.puzzle, source.puzzle)
    assertVariantCompletion(imported.puzzle, source.solution)
    const result = countLineSolutions(imported.puzzle)
    assert.equal(result.count, 1); assert.equal(result.solution, source.solution)
    assert.equal(countLineSolutions({ ...imported.puzzle, rules: [] }).count, 2)
  }
})

test('connected branches, cycles and repeated visits form one set inside each independent Coach layer', async () => {
  const paths = [[0, 10], [40, 50], [10, 40], [8, 16, 60, 8]]
  const code = coachCode({ givenConstraints: [{ type: 'renban', settings: { colour: '#ffd5fc', lineThickness: 30 }, segments: paths.map(cells => ({ cells, parameters: {} })) },
    { type: 'renban', settings: {}, segments: [{ cells: [10, 20], parameters: {} }] }] })
  const expected = [
    { type: 'renban', cells: [0, 10, 40, 50], segments: paths.slice(0, 3) },
    { type: 'renban', cells: [8, 16, 60], segments: [paths[3]] },
    { type: 'renban', cells: [10, 20] },
  ]
  const result = (await detectPuzzle(code)).variant!
  assert.deepEqual(result.puzzle.rules, expected)
  assert.equal(variantPeers(result.puzzle, 0, 50), true)
  assert.equal(variantPeers(result.puzzle, 0, 20), false)
  assert.match(variantRuleDescriptions(result.puzzle).join(' '), /Overlapping clues stay independent/)
})

test('every partial pair obeys Renban distinctness and numerical span regardless of drawing order', () => {
  const all = [0, 13, 26, 30, 43, 56, 60, 73, 80]
  for (let length = 2; length <= 9; length++) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'renban', cells: all.slice(0, length) }] }
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
      for (const [from, to] of [[0, 13], [13, 0]]) {
        assert.equal(Boolean(variantDigitExclusions(puzzle, from, to, a) & 1 << (b - 1)), Math.abs(a - b) >= length)
      }
      const values = [...empty]; values[0] = String(a); values[13] = String(b)
      assert.equal(conflictsOf(values.join(''), puzzle).size, a !== b && Math.abs(a - b) < length ? 0 : 2)
    }
  }
})

test('Renban candidates and both Pencil modes retain the allowed interval through input, bulk input and history', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'renban', cells: [18, 27, 36] }] }
  let game = { ...makeGame('renban-input', 'Renban', empty, 'imported'), variant: { id: 'renban' as const, puzzle, solution: clover.solution } }
  for (let digit = 1; digit <= 9; digit++) { game = enter(game, [18, 36, 80], 'center', digit); game = enter(game, [18, 36, 80], 'corner', digit) }
  const entered = enter(game, [27], 'value', 1)
  for (const cell of [18, 36]) { assert.equal(entered.position.center[cell], 6); assert.equal(entered.position.corner[cell], 6) }
  assert.equal(entered.position.center[80], 511); assert.equal(entered.position.corner[80], 511)
  assert.deepEqual(undo(entered).position, game.position); assert.deepEqual(redo(undo(entered)).position, entered.position)
  const entries = [...empty]; entries[27] = '1'
  assert.deepEqual(fillEntries(game, entries.join('')).position.center, entered.position.center)
  assert.equal(generationVariant({ id: 'renban' }), undefined)
  const distant: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'renban', cells: [0,13,26] }] }
  const display = variantHouseMasks(distant, '3' + empty.slice(1))
  assert.equal(display[13] & 4, 0); assert.equal(display[26] & 4, 0)
  // Display removes same-digit peers. Range deductions remain explained steps.
  assert.ok(display[13] & 256)
})

test('every square transform preserves the complete logical set and all original drawing paths', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'renban', cells: [0, 10, 20, 40], segments: [[0, 10, 20], [10, 40, 0]] }] }
  for (let transform = 0; transform < 8; transform++) {
    const cell = (cell: number) => {
      let [r, c] = [Math.floor(cell / 9), cell % 9]
      if (transform & 1) [r, c] = [c, r]
      if (transform & 2) r = 8 - r
      if (transform & 4) c = 8 - c
      return r * 9 + c
    }
    const changed = reflectVariant(puzzle, transform)
    assert.deepEqual(changed.rules, [{ type: 'renban', cells: [0, 10, 20, 40].map(cell), segments: [[0, 10, 20], [10, 40, 0]].map(p => p.map(cell)) }])
    assert.equal(isPlayablePuzzle('renban', changed), true)
  }
})

test('invalid sets, mismatched drawings and unknown Coach semantics never silently disappear', async () => {
  assert.equal(isPlayablePuzzle('renban', { version: 1, givens: empty, rules: [{ type: 'renban', cells: [40] }] }), true)
  for (const cells of [[], [0, 0], [0, 81], [-1, 2], [0, 1.5], Array.from({ length: 10 }, (_, i) => i)]) {
    assert.equal(isPlayablePuzzle('renban', { version: 1, givens: empty, rules: [{ type: 'renban', cells }] }), false)
  }
  for (const segments of [[], [[]], [[0]], [[0, 80, 1]], [[0, 80, 81]], null]) {
    assert.equal(isPlayablePuzzle('renban', { version: 1, givens: empty, rules: [{ type: 'renban', cells: [0, 80], segments }] }), false)
  }
  for (const constraint of [{ type: 'renban', segments: [] }, { type: 'renban', segments: [{ cells: [0, 1], parameters: { difference: 2 } }] },
    { type: 'renban', segments: [{ cells: [0, 1], parameters: {} }], settings: { repeatsAllowed: true } }]) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })))
  }
})
