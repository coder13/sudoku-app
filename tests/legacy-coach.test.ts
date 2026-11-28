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
  const currentVersion = `SCv4_yy${raw}_`
  const wrapped = currentVersion.match(/.{1,40}/g)!.join('\n  ')
  assert.deepEqual(await detectPuzzle(wrapped), expected)
  for (const version of [4, 5, 6]) assert.deepEqual(await detectPuzzle(`SCv${version}_yy${raw}_`), expected)
  assert.deepEqual(await detectPuzzle(`SCv3_yyyyyyy0Ac80d0_0Ac80d0_0Ac80d0___y${raw}`), expected)
})

test('default playing fields, short macros and both repeat syntaxes retain the puzzle definition', async () => {
  const zero = '0a81b'
  const masks = '0Ac80d0'
  const state = [zero, zero, zero, zero, zero, masks, masks, masks, '', '', zero]
  const expected = await detectPuzzle('SCv4_yyR30_')
  assert.deepEqual(await detectPuzzle('SCv4_0(81)_yR30_yyyyy0A[80]0_0A[80]0_0A[80]0___y'), expected)
  assert.deepEqual(await detectPuzzle('SCv4_yyR30_yyyyyxxx__y'), expected)
  const importedLegacyDigits = await detectPuzzle('SCv4_yyR30_' + ['10a80b', zero, '90a80b', ...state.slice(3), ''].join('_'))
  const { progress: _, ...importedLegacyDefinition } = importedLegacyDigits
  assert.deepEqual(importedLegacyDefinition, expected)
  assert.equal(importedLegacyDigits.progress?.entries[0], '9', 'the serializer writes placed digits in this field')
  for (const [version, tail] of [
    [3, []],
    [4, [...state, '']],
    [5, [...state, zero, '']],
    [6, [...state, zero, masks, '', '', '', '']],
  ] as const) {
    const code = version === 3 ? `SCv3_yy${[...state, 'R30'].join('_')}`
      : `SCv${version}_yyR30_${tail.join('_')}`
    assert.deepEqual(await detectPuzzle(code), expected)
  }
})

test('SCv3–SCv6 restore placed digits and both candidate styles from verified legacy slots', async () => {
  const zero = '0a81b'
  const zeroMasks = '0Ac80d0'
  const userDigits = '1' + '0'.repeat(80)
  const userCellCandidates = ['0', '2', ...Array(79).fill('0')].join('-')
  const userBoxCandidates = ['0', '8', ...Array(79).fill('0')].join('-')
  const state = [zero, zero, userDigits, zero, zero, userCellCandidates, zeroMasks, userBoxCandidates, '', '', zero]

  for (const [version, tail] of [
    [3, []],
    [4, ['']],
    [5, [zero, '']],
    [6, [zero, zeroMasks, '', '', '', '']],
  ] as const) {
    const code = version === 3 ? `SCv3_yy${[...state, 'R30'].join('_')}`
      : `SCv${version}_yyR30_${[...state, ...tail].join('_')}`
    const imported = await detectPuzzle(code)
    assert.equal(imported.progress?.entries[0], '1', `SCv${version} placed digit`)
    assert.equal(imported.progress?.center[1], 1, `SCv${version} center candidate`)
    assert.equal(imported.progress?.corner[1], 4, `SCv${version} corner candidate`)
    assert.equal(imported.variant?.puzzle.rules?.[0]?.type, 'global-entropy')
  }
})

test('legacy progress rejects placed digits that replace givens and malformed candidate masks', async () => {
  const zero = '0a81b'
  const zeroMasks = '0Ac80d0'
  const userDigits = '2' + '0'.repeat(80)
  const state = [zero, zero, userDigits, zero, zero, '1024-' + Array(80).fill('0').join('-'), zeroMasks, zeroMasks, '', '', zero, '']
  await assert.rejects(detectPuzzle(`SCv4_10a80b_yR30_${state.join('_')}`), /placed digit that replaces a given/)
  await assert.rejects(detectPuzzle(`SCv4_yyR30_${state.join('_')}`), /invalid candidate marks/)
})

test('legacy input rejects oversized or malformed expansions, unsupported rules and unhandled author data', async () => {
  for (const code of [
    'SCv4_0a999999b_yR30_', 'SCv4_0a0b_yR30_', 'SCv4_a81b_yR30_', 'SCv4_0(81_yR30_',
    'SCv4_yyR30I0_', 'SCv4_yyR11I0I81_', 'SCv4_yyR14I0I1P1P2_', 'SCv4_yyR40I0I1_', 'SCv4_yyR99_',
    'SCv4_yyR30R_', 'SCv4_yyR30_META_{}', 'SCv6_32_0000',
    'SCv3_yyR30_', 'SCv3_yy90a80b_', 'SCv3_y90a80b_',
  ]) await assert.rejects(detectPuzzle(code), /unsupported format|not supported yet/, code)

  assert.deepEqual((await detectPuzzle('SCv4_yyR12I0I1I2_')).variant?.puzzle.rules,
    [{ type: 'consecutive-run', cells: [0, 1, 2] }])
  await assert.rejects(detectPuzzle('SCv4_y1' + '0a80b_R30_'), /unsupported authored markings/)
  await assert.rejects(detectPuzzle('SCv4_yyR30_y10a80b_yyy0Ac80d0_0Ac80d0_0Ac80d0___y'), /playing state or annotations/)
})

test('legacy Consecutive Line records import as typed line rules', async () => {
  const path = [4, 13, 22, 31, 40]
  const code = `SCv4_yyR12${path.map(cell => `I${cell}`).join('')}_`
  const imported = await detectPuzzle(code)
  assert.deepEqual(imported.variant?.puzzle.rules, [{ type: 'consecutive-run', cells: path }])
})
