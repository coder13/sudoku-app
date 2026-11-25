import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, undo, redo, type Game } from '../src/sudoku/game.ts'
import { decodeCoachSix, detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { solveLatin } from '../src/latin/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
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
import { transformedBoard } from './helpers/transformed-board.ts'
const empty = '0'.repeat(81)
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/modular-${name}.json`, import.meta.url), 'utf8'))

test('published and zero-given Coach controls preserve every rule and their independent unique completion', async () => {
  const published = load('newman')
  for (const source of [published, ...load('coach').examples.filter((s: { puzzle?: VariantPuzzle }) => s.puzzle)]) {
    assertVariantCompletion(source.puzzle, source.solution)
    const independent = countLineSolutions(source.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, source.solution)
    const code = source.code ?? '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
    assert.deepEqual((await detectPuzzle(code)).variant?.puzzle, source.puzzle)
  }
  assert.equal(published.puzzle.givens.replaceAll('0', '').length, 18)
  for (const type of ['entropic', 'modular']) assert.equal(countLineSolutions({ ...published.puzzle,
    rules: published.puzzle.rules.filter((rule: { type: string }) => rule.type !== type) }).count, 2)
  const hch = load('coach').examples.find((source: { url: string }) => source.url.endsWith('HCHW'))
  assert.ok(hch.puzzle.rules.some((rule: { type: string; sum?: number }) => rule.type === 'adjacent-total' && rule.sum === 11))
})

test('touching segments stay independent, while closures and revisits retain their original order', async () => {
  const paths = [[0, 10, 20], [20, 30, 40], [2, 12, 22, 2], [8], [0, 10, 20, 0, 10, 20, 0]]
  const code = coachCode({
    givenConstraints: [
      {
        type: 'modularLine',
        settings: { colour: '#ffccaa', lineThickness: 20 },
        segments: paths.map((cells) => ({ cells, parameters: {} })),
      },
    ],
  })
  const imported = (await detectPuzzle(code)).variant!
  assert.deepEqual(
    imported.puzzle.rules,
    paths.map((cells) => ({ type: 'modular', cells }))
  )
  assert.equal(variantPeers(imported.puzzle, 0, 20), true)
  assert.equal(variantPeers(imported.puzzle, 0, 30), false)
  assert.equal(variantPeers(imported.puzzle, 0, 40), false)
})

test('every pair of placed digits obeys the repeating groups, with equal digits allowed three positions apart', () => {
  const cells = [0, 13, 26, 30, 43, 56]
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'modular', cells }] }
  for (const other of [13, 26, 30, 43, 56])
    for (let a = 1; a <= 9; a++)
      for (let b = 1; b <= 9; b++) {
        const samePhase = cells.indexOf(other) % 3 === 0,
          sameGroup = a % 3 === b % 3
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
    rules: [{ type: 'modular', cells: [0, 13, 26, 32] }],
  }
  const values = [...empty]
  values[0] = '1'
  values[32] = '1'
  assert.equal(conflictsOf(values.join(''), distant).size, 0)
  values[32] = '4'
  assert.equal(conflictsOf(values.join(''), distant).size, 0)
  values[32] = '2'
  assert.equal(conflictsOf(values.join(''), distant).size, 2)
})

test('both Pencil modes, bulk input, histories and walkthrough peer masks use the Modular relation', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [{ type: 'modular', cells: [0, 13, 26, 32] }],
  }
  const solution = load('newman').solution
  let game: Game = {
    ...makeGame('modular-input', 'Modular Lines', empty, 'imported'),
    variant: { id: 'modular' as const, puzzle, solution },
  }
  for (let d = 1; d <= 9; d++) {
    game = enter(game, [13, 26, 32, 80], 'center', d)
    game = enter(game, [13, 26, 32, 80], 'corner', d)
  }
  const changed = enter(game, [0], 'value', 1)
  for (const mode of ['center', 'corner'] as const) {
    assert.equal(changed.position[mode][13], 438)
    assert.equal(changed.position[mode][26], 438)
    assert.equal(changed.position[mode][32], 73)
    assert.equal(changed.position[mode][80], 511)
  }
  assert.deepEqual(undo(changed).position, game.position)
  assert.deepEqual(redo(undo(changed)).position, changed.position)
  assert.deepEqual(fillEntries(game, '1' + empty.slice(1)).position, changed.position)
  const masks = variantHouseMasks(puzzle, '1' + empty.slice(1))
  assert.equal(masks[13] & 1, 0)
  assert.ok(masks[32] & 1)
  // Full group removal remains an explained step in walkthrough displays.
  assert.ok(masks[13] & 8)
  assert.ok(masks[32] & 2)
  assert.equal(generationVariant({ id: 'modular' }), 'modular')
})

test('all grid transforms preserve complete mixed sources and their independent printed completions', () => {
  for (const source of [load('newman'), ...load('coach').examples.filter((s: { puzzle?: VariantPuzzle }) => s.puzzle)])
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const changed = reflectVariant(source.puzzle, symmetry)
      assert.equal(changed.rules!.length, source.puzzle.rules.length)
      assert.equal(isPlayablePuzzle(variantIdForPuzzle(changed), changed), true)
      assertVariantCompletion(changed, transformedBoard(source.solution, symmetry))
    }
})

test('malformed paths and unknown parameters reject without partial imports', async () => {
  for (const cells of [[], [81], [-1], [1.5]])
    assert.equal(
      isPlayablePuzzle('modular', {
        version: 1,
        givens: empty,
        rules: [{ type: 'modular', cells }],
      }),
      false
    )
  assert.equal(
    isPlayablePuzzle('modular', {
      version: 1,
      givens: empty,
      rules: [{ type: 'modular', cells: [40] }],
    }),
    true
  )
  for (const constraint of [
    { type: 'modularLine', segments: [] },
    { type: 'modularLine', segments: [{ cells: [0, 10], parameters: { groups: 2 } }] },
    {
      type: 'modularLine',
      settings: { groups: 2 },
      segments: [{ cells: [0, 10], parameters: {} }],
    },
  ])
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [constraint] })))
})


test('Cmki imports as a complete six-by-six mixed-rule Coach puzzle', async () => {
  const source = load('coach').examples.find((example: { url: string }) => example.url.endsWith('/Cmki'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, '0'.repeat(36))
  assert.deepEqual(imported.grid, {
    size: 6,
    regions: [[0, 1, 2, 3, 6, 9], [4, 5, 11, 17, 22, 23], [7, 8, 10, 14, 15, 16],
      [12, 13, 18, 24, 30, 31], [19, 20, 21, 25, 27, 28], [26, 29, 32, 33, 34, 35]],
  })
  assert.deepEqual(imported.sizedRules, [
    { type: 'whispers', cells: [4, 5, 11, 16, 21, 26, 31, 30, 24, 19, 14, 9, 4], minDifference: 3 },
    { type: 'whispers', cells: [22, 15, 8, 1, 0, 6, 13, 20, 27, 34, 35, 29, 22], minDifference: 3 },
    { type: 'xv', five: { pairs: [[4, 10]] } },
    { type: 'modular', cells: [21, 22, 23] },
    { type: 'modular', cells: [20, 26, 32] },
    { type: 'modular', cells: [8, 7, 6] },
    { type: 'modular', cells: [11, 10, 4] },
  ])
})

test('the original 5 × 5 Modular/Entropic Coach export retains every line and its unique Anti-King completion', async ({ mock }) => {
  const source = load('coach').examples.find((example: { url: string }) => example.url.endsWith('/7hzU'))
  assert.ok(source)
  const shortLinkEndpoint = '/api/v1/import/sudoku-coach/7hzU'
  mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, shortLinkEndpoint)
    return Response.json({ code: source.code, coach: { title: source.title, hasAuthorInstructions: false } })
  })

  const pasted = await detectPuzzle(source.code)
  const linked = await detectPuzzle(source.url)
  const puzzle = pasted.futoshiki!.puzzle
  const summarize = (value: typeof puzzle) => ({ size: value.size, givens: value.givens, inequalities: value.inequalities,
    parity: value.parity, diagonals: value.diagonals, exclusions: value.exclusions,
    lines: value.lines?.map(({ type, cells }) => ({ type, cells })), extrema: value.extrema })
  assert.deepEqual(summarize(linked.futoshiki!.puzzle), summarize(puzzle))
  assert.equal(puzzle.size, 5)
  assert.deepEqual(puzzle.exclusions, ['anti-king'])
  assert.deepEqual(puzzle.lines?.map(line => line.type), [
    'modular', 'modular', 'entropic', 'entropic', 'entropic', 'entropic',
  ])
  assert.deepEqual(solveLatin(puzzle).solution?.join(''), source.solution)
  assert.equal(solveLatin(puzzle).status, 'unique')
  const restored = readImportedFutoshiki(pasted.futoshiki!.id)!.puzzle
  assert.deepEqual(summarize(restored), summarize(puzzle))
})

test('published Modular imports retain their numbered white dots and ordered runs', async () => {
  const examples = load('coach').examples
  for (const [id, modular, runs, marks, total] of [
    ['9ZMr', 9, 0, 36, false], ['GYTv', 6, 8, 7, true],
  ] as const) {
    const source = examples.find((source: { url: string }) => source.url.endsWith(id))
    const { variant } = await detectPuzzle(source.code)
    assert.ok(variant)
    const rules = variant.puzzle.rules!
    assert.equal(rules.filter(rule => rule.type === 'modular').length, modular)
    assert.equal(rules.filter(rule => rule.type === 'consecutive-run').length, runs)
    const white = rules.filter(rule => rule.type === 'labeled-dots')
    assert.equal(white.length, 1)
    assert.equal(white[0].relation, 'difference')
    assert.equal(white[0].marks.length, marks)
    assert.ok(white[0].marks.every(mark => mark.value === 3))
    assert.equal(rules.some(rule => rule.type === 'adjacent-total' && rule.sum === 11), total)
    assertVariantCompletion(variant.puzzle, source.solution)
  }
})

test('the reviewed 220V raw Coach code applies its published color legend without short-link context', async () => {
  const source = load('coach').examples.find((example: { url: string }) => example.url.endsWith('/7rs9'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.deepEqual(imported.variant?.puzzle, source.publishedPuzzle)
  assertVariantCompletion(imported.variant!.puzzle, source.solution)
})

test('the 220V line legend does not apply to a modified raw export', async () => {
  const source = load('coach').examples.find((example: { url: string }) => example.url.endsWith('/7rs9'))
  assert.ok(source)
  const payload = await decodeSudokuCoachPayload(source.code)
  const line = payload.givenConstraints.find((layer: { type: string }) => layer.type === 'cosmeticLine')
  assert.ok(line)
  line.segments[0].cells[0][0] += 0.01
  await assert.rejects(detectPuzzle(coachCode(payload)), /unsupported|invalid/i)
})


test('the compiler’s original official demonstration retains its nine-cell grid and exact ordered path', async () => {
  const source = load('coach').officialDemo
  assert.equal(source.data.gridSize, 9)
  const imported = (await detectPuzzle(source.code)).variant!.puzzle
  assert.equal(imported.givens, empty)
  assert.deepEqual(imported.rules, [{ type: 'modular', cells: [37, 38, 39, 40, 41, 42, 43] }])
})


test('typed Modular rules reject invented partition, modulus and negative fields', () => {
  for (const field of ['groups', 'modulus', 'negative']) assert.equal(isPlayablePuzzle('modular', {
    version: 1, givens: empty, rules: [{ type: 'modular', cells: [0, 10, 20], [field]: 3 }],
  }), false)
})

test('the independent counter treats repeated references as the same variable in every local pair', () => {
  for (const cells of [[0, 0], [0, 10, 0]]) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'modular', cells }] }
    assert.equal(countLineSolutions(puzzle, 500).count, 0)
  }
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'modular', cells: [0, 10, 20, 0] }] }
  assert.equal(countLineSolutions(puzzle, 500).count, 2)
})
