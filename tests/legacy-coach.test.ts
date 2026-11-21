import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const givens = '000614000500000000080900617740000000010000005635001700000000501020495008800160900'
const layer = (type: string, cells: number[], parameters: Record<string, unknown> = {}) =>
  ({ type, segments: [{ cells, parameters }] })

test('the published SCv4 Global Entropy code keeps its givens and rule through code and solver links', async () => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8'))
  const source = examples.find(({ url }: { url: string }) => url.endsWith('2j53'))
  const expected = {
    givens, format: 'Sudoku Coach', variant: {
      id: 'global-entropy', puzzle: { version: 1, givens, rules: [{ type: 'global-entropy' }] },
    },
  }
  assert.deepEqual(await detectPuzzle(source.code), expected)
  assert.deepEqual(await detectPuzzle('https://sudoku.coach/en/solver/' + encodeURIComponent(source.code)), expected)
})

test('legacy rule records produce the same typed puzzle as modern exports in the same order', async () => {
  const raw = 'R1R2R3R4R31R6I0I1P7R6I11I12R10I5I6I7R11I8I17I26R13I16P1R13I27P2R14I28I29R15I30I31P2R20P2P3P19R40I40I41I42I43I44I45I46I47I48P1R30'
  const modern = coachCode({ givenConstraints: [
    { type: 'diagonalNegative', segments: [] },
    { type: 'diagonalPositive', segments: [] },
    { type: 'antiKnight', segments: [] },
    { type: 'antiKing', segments: [] },
    { type: 'nonconsecutive', segments: [] },
    layer('twoCellSum', [0, 1], { sum: 7 }),
    layer('twoCellSum', [11, 12], { sum: 5 }),
    layer('thermometer', [5, 6, 7]),
    layer('renban', [8, 17, 26]),
    layer('odd', [16]),
    layer('even', [27]),
    layer('difference', [28, 29]),
    layer('ratio', [30, 31], { ratio: 2 }),
    layer('sandwich', [], { side: 'left', index: 3, value: 19 }),
    layer('region', [40, 41, 42, 43, 44, 45, 46, 47, 48]),
    { type: 'globalEntropy', segments: [] },
  ] })
  const expected = await detectPuzzle(modern)
  assert.equal(expected.variant?.id, 'mixed')
  for (const version of [4, 5, 6]) assert.deepEqual(await detectPuzzle(`SCv${version}_yy${raw}_`), expected)
})

test('default playing fields, short macros and both repeat syntaxes retain the puzzle definition', async () => {
  const zero = '0a81b'
  const masks = '0Ac80d0'
  const state = [zero, zero, zero, zero, zero, masks, masks, masks, '', '', zero]
  const expected = await detectPuzzle('SCv4_yyR30_')
  assert.deepEqual(await detectPuzzle('SCv4_0(81)_yR30_yyyyy0A[80]0_0A[80]0_0A[80]0___y'), expected)
  assert.deepEqual(await detectPuzzle('SCv4_yyR30_yyyyyxxx__y'), expected)
  assert.deepEqual(await detectPuzzle('SCv4_yyR30_' + ['10a80b', zero, '90a80b', ...state.slice(3), ''].join('_')), expected)
  for (const [version, tail] of [
    [4, [...state, '']],
    [5, [...state, zero, '']],
    [6, [...state, zero, masks, '', '', '', '']],
  ] as const) {
    assert.deepEqual(await detectPuzzle(`SCv${version}_yyR30_` + tail.join('_')), expected)
  }
})

test('legacy input rejects oversized or malformed expansions, unsupported rules and unhandled author data', async () => {
  for (const code of [
    'SCv4_0a999999b_yR30_', 'SCv4_0a0b_yR30_', 'SCv4_a81b_yR30_', 'SCv4_0(81_yR30_',
    'SCv4_yyR30I0_', 'SCv4_yyR11I0I81_', 'SCv4_yyR14I0I1P1P2_', 'SCv4_yyR40I0I1_', 'SCv4_yyR99_',
    'SCv4_yyR30R_', 'SCv4_yyR30_META_{}', 'SCv6_32_0000',
  ]) await assert.rejects(detectPuzzle(code), /unsupported format|not supported yet/, code)

  await assert.rejects(detectPuzzle('SCv4_yyR12I0I1I2_'), /Consecutive Line/)
  await assert.rejects(detectPuzzle('SCv4_y1' + '0a80b_R30_'), /unsupported authored markings/)
  await assert.rejects(detectPuzzle('SCv4_yyR30_y10a80b_yyy0Ac80d0_0Ac80d0_0Ac80d0___y'), /playing state or annotations/)
})
