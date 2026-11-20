import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSizedSudokuPad, decodeSudokuPadEnvelope } from '../src/sudoku/sized-sudoku-pad.ts'

const metadata = {
  title: 'Shared totals',
  author: 'Test author',
  rules: '* Normal 4x4 Sudoku rules apply: Place the digits 1-4 in each row, column, and region.\n' +
    '* Algebraic Killer Cages: Digits in a cage must not repeat and must sum to the total in the top-left corner of the cage. ' +
    '"n" is a positive integer to be determined by the solver.',
}
const input = {
  id: 'fixture',
  metadata,
  cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({}))),
  regions: [
    [[0,0],[0,1],[1,0],[1,1]], [[0,2],[0,3],[1,2],[1,3]],
    [[2,0],[2,1],[3,0],[3,1]], [[2,2],[2,3],[3,2],[3,3]],
  ],
  cages: [{ cells: [[1,0],[1,1]], value: 'n+2' }, { cells: [[2,0]], value: 'n-1' }],
}
const encode = (payload: unknown) => 'scl' + lzString.compressToBase64(JSON.stringify(payload))

test('sized SudokuPad definitions retain cage order, labels, offsets, and authored metadata', () => {
  const code = encode(input)
  const decoded = decodeSizedSudokuPad(code)
  assert.equal(decoded.givens, '0'.repeat(16))
  assert.deepEqual(decoded.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.deepEqual(decoded.rules, [
    { type: 'algebraic-cage', cells: [4,5], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
    { type: 'algebraic-cage', cells: [8], label: 'n-1', total: { type: 'variable', name: 'n', offset: -1 } },
  ])
  assert.equal(decoded.source.code, code)
  assert.equal(decoded.source.rulesText, metadata.rules)
  assert.equal(decoded.source.author, metadata.author)
})

test('sized SudokuPad rejects unrepresented rules and geometry', () => {
  assert.throws(() => decodeSizedSudokuPad(encode({ ...input, lines: [{}] })), /unsupported puzzle fields/)
  assert.throws(() => decodeSizedSudokuPad(encode({ ...input, metadata: { ...metadata, rules: metadata.rules + '\n* Antiknight.' } })), /cannot verify/)
  assert.throws(() => decodeSizedSudokuPad(encode({
    ...input, cages: [{ cells: [[0,0]], value: 'log(n)' }],
  })), /unsupported total expression/)
  assert.throws(() => decodeSizedSudokuPad(encode({
    ...input, cages: [{ cells: [[0,0],[0,0]], value: 'n' }],
  })), /same cell twice/)
})

function thermoExport(boxRows: 2 | 3) {
  const boxColumns = 6 / boxRows
  return {
    id: 'thermometer-fixture',
    metadata: {
      title: 'Straight stretches', author: 'Test author',
      rules: `Normal 6x6 sudoku rules apply. Place the digits 1 to 6 in every row, column and ${boxRows}x${boxColumns} box.\n\n` +
        'Digits along a thermometer strictly increase from bulb to tip.',
    },
    cells: Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) =>
      row === 0 && column === 0 ? { value: 1 } : {})),
    regions: Array.from({ length: 6 }, (_, box) => Array.from({ length: 6 }, (_, cell) => [
      Math.floor(box / boxRows) * boxRows + Math.floor(cell / boxColumns),
      box % boxRows * boxColumns + cell % boxColumns,
    ])),
    lines: [{ wayPoints: [[0.5, 3.5], [0.5, 0.5]], color: '#ccc', thickness: 19.2 }],
    underlays: [{ center: [0.5, 0.5], rounded: true, width: 0.8, height: 0.8, backgroundColor: '#ccc' }],
  }
}

test('6 × 6 SudokuPad thermometers follow the bulb and fill skipped collinear cells', async () => {
  for (const boxRows of [2, 3] as const) {
    const imported = await detectPuzzle(encode(thermoExport(boxRows)))
    assert.equal(imported.givens, '1' + '0'.repeat(35))
    assert.deepEqual(imported.grid, { size: 6, boxRows, boxColumns: 6 / boxRows })
    assert.deepEqual(imported.sizedRules, [{ type: 'thermometer', cells: [0, 1, 2, 3] }])
    assert.equal(imported.sizedAuthor, 'Test author')
  }
})

test('compact SudokuPad thermometers can use a darker bulb and still follow its endpoint', async () => {
  const makeExport = (bulb: string, clause: string) => 'scl' + lzString.compressToBase64(String.raw`{
    ce:[[,,,],[,,,],[,,,],[,,,]],
    re:[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]],
    ca:[{v:'rules: SUDOKU\n- Fill the grid with the digits 1-4 so that no digit repeats in a row, column, or box.\n\nTHERMOMETER\n- ${clause}'}],
    l:[{wp:[[0.5,0.5],[2.5,0.5]],c:'#ccc',th:19}],
    u:[{stroke:'none',ct:[2.5,0.5],w:0.8,h:0.8,r:t,c2:'${bulb}'}]
  }`)
  const strict = 'Digits increase in value along a thermometer, starting from the bulb end.'
  const imported = await detectPuzzle(makeExport('#999', strict))
  assert.deepEqual(imported.sizedRules, [{ type: 'thermometer', cells: [8, 4, 0] }])
  await assert.rejects(detectPuzzle(makeExport('#f00', strict)), /exactly one end/)
  await assert.rejects(detectPuzzle(makeExport('#999', 'Digits can stay the same along a thermometer.')), /authored rules/)
})

test('6 × 6 SudokuPad rejects ambiguous bulbs, unknown companion rules, and altered region geometry', async () => {
  const source = thermoExport(2)
  await assert.rejects(detectPuzzle(encode({ ...source,
    underlays: [{ ...source.underlays[0], center: [0.5, 1.5] }],
  })), /exactly one end/)
  await assert.rejects(detectPuzzle(encode({ ...source,
    lines: [{ ...source.lines[0], wayPoints: [[0.5, 0.5], [1.5, 3.5]] }],
  })), /ambiguous line segment/)
  await assert.rejects(detectPuzzle(encode({ ...source,
    metadata: { ...source.metadata, rules: source.metadata.rules + '\n\nKnight moves have different digits.' },
  })), /authored rules/)
  await assert.rejects(detectPuzzle(encode({ ...source, overlays: [{}] })), /unsupported rules or markings/)
  source.regions[0][0] = source.regions[1][0]
  await assert.rejects(detectPuzzle(encode(source)), /share a cell/)
})

test('6 × 6 SudokuPad lines combine Renban with a thermometer and expand skipped cells', async () => {
  const source = thermoExport(3)
  const pink = { wayPoints: [[1.5, 0.5], [1.5, 2.5]], color: '#f067f0ff', thickness: 19.2 }
  const clause = 'Digits along a pink line form a set of non-repeating consecutive digits in any order.'
  const imported = await detectPuzzle(encode({ ...source, lines: [pink, ...source.lines],
    metadata: { ...source.metadata, rules: source.metadata.rules + '\n\n' + clause } }))
  assert.deepEqual(imported.sizedRules, [
    { type: 'renban', cells: [6, 7, 8] },
    { type: 'thermometer', cells: [0, 1, 2, 3] },
  ])
  const pure = await detectPuzzle(encode({ ...source, lines: [pink], underlays: [],
    metadata: { ...source.metadata, rules: source.metadata.rules.split('\n\n')[0] + '\n\n' + clause } }))
  assert.deepEqual(pure.sizedRules, [{ type: 'renban', cells: [6, 7, 8] }])
})

test('compact SudokuPad retains empty cells, escaped metadata, and drawing layers', () => {
  const encoded = 'scl' + lzString.compressToBase64("{id:'compact',ca:[{v:'author: A\\'B'},{v:'rules: First\\nSecond'}],ce:[[,{v:3},,]],cs:50,u:[{ct:[0.5,0.5],r:t,c2:#0}],o:[{ct:[1,0.5],c1:#F,c2:001122}]}")
  const decoded = decodeSudokuPadEnvelope(encoded) as Record<string, unknown>
  assert.deepEqual(decoded.cells, [[{}, { value: 3 }, {}, {}]])
  assert.deepEqual(decoded.metadata, { author: "A'B", rules: 'First\nSecond' })
  assert.deepEqual(decoded.underlays, [{ center: [0.5, 0.5], rounded: true, backgroundColor: '#000000' }])
  assert.deepEqual(decoded.overlays, [{ center: [1, 0.5], borderColor: '#ffffff', backgroundColor: '#001122' }])

  for (const malformed of [
    "{ce:[[,,,]],cells:[]}",
    "{ce:[[,,,]],ca:[{v:'title: A'},{v:'title: B'}]}",
    "{ce:[[,,,]],ce:[]}",
    "{ce:[[,,,]]}junk",
  ]) assert.throws(() => decodeSudokuPadEnvelope('scl' + lzString.compressToBase64(malformed)), /does not contain a supported puzzle export/)
})

test('sized SudokuPad uses midpoint overlays for positive Kropki dots', async () => {
  const { lines, underlays, ...source } = thermoExport(2)
  source.metadata.rules = source.metadata.rules.split('\n\n')[0] + '\n\n' +
    'Digits separated by a white dot are consecutive.\nDigits separated by a black dot have a 1:2 ratio.\nNot all dots are given.'
  const overlay = { rounded: true, width: .34, height: .34, text: '' }
  const overlays = [{ ...overlay, center: [1, .5], backgroundColor: '#fff' },
    { ...overlay, center: [1.5, 1], backgroundColor: '#000' }]
  assert.deepEqual((await detectPuzzle(encode({ ...source, overlays }))).sizedRules,
    [{ type: 'kropki', consecutive: { pairs: [[0, 6]] }, ratioTwo: { pairs: [[6, 7]] } }])
  await assert.rejects(detectPuzzle(encode({ ...source, overlays: [{ ...overlays[0], center: [1, 1] }] })), /between two neighboring cells/)
  await assert.rejects(detectPuzzle(encode({ ...source, overlays: [{ ...overlays[0], text: '2' }] })), /unsupported dot/)
})

test('sized SudokuPad aligns shortened arrow paths to bulbs and preserves companion dots', async () => {
  const { lines, underlays, ...source } = thermoExport(2)
  source.metadata.rules = source.metadata.rules.split('\n\n')[0] + '\n\n' +
    'Digits along an arrow sum to the digit in a bulb. Digits may repeat if allowed by other rules.\n\n' +
    'Digits separated by a white dot are consecutive.\nDigits separated by a black dot have a 1:2 ratio.\nNot all dots are given.'
  const bulb = { center: [0.5, 0.5], width: .82, height: .82, rounded: true, backgroundColor: '#fff', borderColor: '#aaaf' }
  const dot = { center: [1.5, 1], width: .34, height: .34, rounded: true, backgroundColor: '#fff' }
  const arrow = { wayPoints: [[0.5, .899], [0.5, 2.5], [1.5, 3.5]], headLength: .35, color: '#aaaf', thickness: 3.2 }
  const code = (arrows = [arrow], overlays = [dot, bulb]) => encode({ ...source, arrows, overlays })
  assert.deepEqual((await detectPuzzle(code())).sizedRules, [
    { type: 'arrow', circle: 0, cells: [1, 2, 9] }, { type: 'kropki', consecutive: { pairs: [[6, 7]] } },
  ])
  await assert.rejects(detectPuzzle(code([arrow], [dot])), /exactly one matching bulb/)
  await assert.rejects(detectPuzzle(code([{ ...arrow, wayPoints: [[.88, .5], ...arrow.wayPoints.slice(1)] }])), /does not align/)
  await assert.rejects(detectPuzzle(code([arrow], [dot, bulb, { ...bulb, center: [1.5, 1.5] }])), /between two neighboring cells|unsupported dot/)
})
