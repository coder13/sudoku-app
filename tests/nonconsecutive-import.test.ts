import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, variantDigitExclusions, variantName, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { coachCode } from './helpers/coach-code.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-newman.json', import.meta.url), 'utf8')) as {
  puzzle: VariantPuzzle; solution: string; coachConstraint: Record<string, unknown>
}
const exports = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-coach.json', import.meta.url), 'utf8')) as {
  examples: { code: string; decoded: { givenConstraints: { type: string; segments: { cells: [number, number] }[] }[] } }[]
}

test('Literally No One has the published completion and needs the Non-Consecutive rule', () => {
  const result = countCellRuleSolutions(fixture.puzzle)
  assert.equal(result.count, 1)
  assert.equal(result.solution, fixture.solution)
  assert.equal(countCellRuleSolutions({ ...fixture.puzzle, rules: [] }).count, 2)
  assert.equal(fixture.puzzle.givens.replaceAll('0', '').length, 21)
})

test('global Non-Consecutive imports preserve the named rule and reject unknown scope or settings', async () => {
  const imported = await detectPuzzle(coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: [fixture.coachConstraint] }))
  assert.deepEqual(imported.variant, { id: 'non-consecutive', puzzle: fixture.puzzle })
  assert.equal(variantName(imported.variant), 'Non-Consecutive')
  assert.equal(generationVariant(imported.variant), 'non-consecutive')
  assert.match(variantRuleDescriptions(fixture.puzzle).join(' '), /1 and 9 are not consecutive/)
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported.variant)))).variant, imported.variant)
  for (const constraint of [
    { type: 'nonconsecutive', segments: [{ cells: [0, 1] }], settings: {} },
    { type: 'nonconsecutive', segments: [], settings: { cyclic: true } },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })), /unsupported/)
  const flockers = await detectPuzzle(exports.examples[1].code)
  assert.deepEqual(flockers.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(flockers.sizedRules?.find(rule => rule.type === 'non-consecutive'), { type: 'non-consecutive' })
  assert.equal(flockers.sizedRules?.some(rule => rule.type === 'whispers'), true)
  assert.equal(flockers.sizedRules?.some(rule => rule.type === 'inequality'), true)
})

test('sized Coach white-dot exceptions are retained independent of source layer order', async () => {
  const source = exports.examples[1].decoded as { givenDigits?: string; regions: number[]; givenConstraints: Record<string, unknown>[] }
  const nonconsecutive = source.givenConstraints.find(rule => rule.type === 'nonconsecutive')!
  const dot = { type: 'difference', segments: [{ cells: [0, 1], parameters: { difference: 1 } }], settings: {} }
  const imported = await detectPuzzle(coachCode({ ...source, givenConstraints: [nonconsecutive, dot, ...source.givenConstraints.filter(rule => rule !== nonconsecutive)] }))
  const reverse = await detectPuzzle(coachCode({ ...source, givenConstraints: [...source.givenConstraints.filter(rule => rule !== nonconsecutive), dot, nonconsecutive] }))
  const rule = imported.sizedRules?.find(rule => rule.type === 'non-consecutive')
  assert.deepEqual(rule, { type: 'non-consecutive', except: [[0, 1]] })
  assert.deepEqual(reverse.sizedRules?.find(rule => rule.type === 'non-consecutive'), rule)
  const blackDot = { type: 'ratio', segments: [{ cells: [0, 1], parameters: { ratio: 2 } }], settings: {} }
  const withoutException = await detectPuzzle(coachCode({ ...source, givenConstraints: [...source.givenConstraints, blackDot] }))
  assert.deepEqual(withoutException.sizedRules?.find(rule => rule.type === 'non-consecutive'), { type: 'non-consecutive' })

  const negativeWhiteLayer = { type: 'difference', segments: [{ cells: [0, 1], parameters: { difference: 1 } }], settings: { negativeConstraint: true } }
  const negativeWhite = await detectPuzzle(coachCode({ ...source, givenConstraints: [...source.givenConstraints, negativeWhiteLayer] }))
  assert.deepEqual(negativeWhite.sizedRules?.find(rule => rule.type === 'non-consecutive'), { type: 'non-consecutive', except: [[0, 1]] })
  assert.deepEqual(negativeWhite.sizedRules?.find(rule => rule.type === 'kropki'), {
    type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true },
  })
  const negativeWhiteReordered = await detectPuzzle(coachCode({ ...source,
    givenConstraints: [negativeWhiteLayer, ...source.givenConstraints] }))
  assert.deepEqual(negativeWhiteReordered.sizedRules?.find(rule => rule.type === 'non-consecutive'),
    negativeWhite.sizedRules?.find(rule => rule.type === 'non-consecutive'))

  const labeledDifference = { type: 'difference', segments: [{ cells: [0, 1], parameters: { difference: 2 } }], settings: {} }
  const labeled = await detectPuzzle(coachCode({ ...source, givenConstraints: [...source.givenConstraints, labeledDifference] }))
  assert.deepEqual(labeled.sizedRules?.find(rule => rule.type === 'non-consecutive'), { type: 'non-consecutive' })
})

test('real Coach white dots exempt exactly their edges, independent of source order', async () => {
  const original = await detectPuzzle(exports.examples[0].code)
  const expected = exports.examples[0].decoded.givenConstraints.find(rule => rule.type === 'difference')!.segments
    .map(({ cells: [a, b] }) => [Math.min(a, b), Math.max(a, b)])
  const rule = original.variant!.puzzle.rules!.find(rule => rule.type === 'non-consecutive')!
  assert.equal(rule.type, 'non-consecutive')
  assert.deepEqual(rule.except, expected)
  assert.equal(rule.except?.length, 38)
  const swapped = await detectPuzzle(coachCode({ ...exports.examples[0].decoded,
    givenConstraints: [...exports.examples[0].decoded.givenConstraints].reverse() }))
  assert.deepEqual(swapped.variant!.puzzle.rules!.find(rule => rule.type === 'non-consecutive'), rule)
  assert.match(variantRuleDescriptions(original.variant!.puzzle).join(' '), /white-dot pairs are exempt/)
  const sourceConstraints = exports.examples[0].decoded.givenConstraints
  const whiteLayer = sourceConstraints.find(rule => rule.type === 'difference')!
  const nonconsecutiveLayer = sourceConstraints.find(rule => rule.type === 'nonconsecutive')!
  const negativeWhite = await detectPuzzle(coachCode({ ...exports.examples[0].decoded, givenConstraints: [
    { ...whiteLayer, settings: { negativeConstraint: true } }, nonconsecutiveLayer,
  ] }))
  const negativeRule = negativeWhite.variant!.puzzle.rules!.find(rule => rule.type === 'non-consecutive')
  assert.equal(negativeRule?.type, 'non-consecutive')
  assert.deepEqual(negativeRule?.except, rule.except)
  assert.deepEqual(negativeWhite.variant!.puzzle.rules!.find(rule => rule.type === 'kropki'), {
    type: 'kropki', consecutive: { pairs: whiteLayer.segments.map(segment => segment.cells), negative: true },
  })
  // Native data keeps its explicit meaning; a dot does not implicitly exempt an edge.
  const native = { id: 'mixed', puzzle: { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'non-consecutive' }, { type: 'kropki', consecutive: { pairs: [[0, 1]] } },
  ] } }
  assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(native)))).variant, native)
})

test('black dots never exempt edges and malformed native exceptions cannot enter Play', async () => {
  const imported = await detectPuzzle(coachCode({ givenConstraints: [fixture.coachConstraint,
    { type: 'ratio', segments: [{ cells: [0, 1], parameters: { ratio: 2 } }], settings: {} },
  ] }))
  assert.deepEqual(imported.variant!.puzzle.rules![0], { type: 'non-consecutive' })
  for (const except of [[[0, 0]], [[8, 9]], [[0, 10]], [[0, 81]], [[0, 1, 2]]]) {
    const native = { id: 'non-consecutive', puzzle: { ...fixture.puzzle, rules: [{ type: 'non-consecutive', except }] } }
    await assert.rejects(detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(native))))
  }
})

test('every cell pair and placed digit has exactly the edge exclusions, including 1/9 and row boundaries', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive' }] }
  for (let a = 0; a < 81; a++) {
    const neighbors = new Set<number>()
    const row = Math.floor(a / 9), col = a % 9
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (row + dr >= 0 && row + dr < 9 && col + dc >= 0 && col + dc < 9) neighbors.add((row + dr) * 9 + col + dc)
    }
    for (let b = 0; b < 81; b++) for (let digit = 1; digit <= 9; digit++) {
      const expected = neighbors.has(b) ? [digit - 1, digit + 1].filter(d => d > 0 && d < 10)
        .reduce((mask, d) => mask | 1 << (d - 1), 0) : 0
      assert.equal(variantDigitExclusions(puzzle, a, b, digit), expected, `${a}, ${b}, ${digit}`)
    }
  }
  const exempt = { ...puzzle, rules: [{ type: 'non-consecutive' as const, except: [[1, 0] as const] }] }
  assert.equal(variantDigitExclusions(exempt, 0, 1, 4), 0)
  assert.notEqual(variantDigitExclusions({ ...exempt, rules: [...exempt.rules, { type: 'non-consecutive' }] }, 0, 1, 4), 0)
})

test('conflicts and both candidate styles follow restrictions and exceptions through entry, fill and undo', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive', except: [[0, 1]] }] }
  const variant = { id: 'non-consecutive' as const, puzzle, solution: fixture.solution }
  let game: Game = { ...makeGame('nc-history', 'NC', puzzle.givens, 'imported'), variant }
  for (const mode of ['center', 'corner'] as const) for (const digit of [3, 4, 5]) game = enter(game, [1, 9, 10], mode, digit)
  const before = game.position
  for (const next of [enter(game, [0], 'value', 4), fillEntries(game, '4' + '0'.repeat(80))]) {
    assert.equal(next.position.center[1], (1 << 2) | (1 << 4), 'The exempt edge keeps 3 and 5')
    assert.equal(next.position.corner[9], 0, 'The other edge loses 3, 4 and 5')
    assert.equal(next.position.center[10], (1 << 2) | (1 << 4), 'The diagonal loses only the box peer digit')
    assert.deepEqual(undo(next).position, before)
    assert.deepEqual(redo(undo(next)).position, next.position)
  }
  const values = Array<string>(81).fill('0'); values[0] = '4'; values[1] = '5'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
  values[1] = '0'; values[9] = '5'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)], [0, 9])
  values[0] = '9'; values[9] = '1'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
})

test('all app reflections transform the explicit exceptions with their cells', () => {
  const puzzle: VariantPuzzle = { ...fixture.puzzle, rules: [{ type: 'non-consecutive', except: [[0, 1], [0, 9], [79, 80]] }] }
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = reflectVariant(puzzle, symmetry)
    const rule = transformed.rules![0]
    assert.equal(rule.type, 'non-consecutive')
    const expected = reflectVariant({ ...puzzle, rules: [{ type: 'kropki', consecutive: { pairs: [[0, 1], [0, 9], [79, 80]] } }] }, symmetry).rules![0]
    assert.equal(expected.type, 'kropki')
    assert.deepEqual(rule.except, expected.consecutive?.pairs)
  }
})
