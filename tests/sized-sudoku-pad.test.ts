import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSizedSudokuPad, decodeSudokuPadEnvelope } from '../src/sudoku/sized-sudoku-pad.ts'
import { readSizedRuleSudokuPad, readSudokuPadXSumDots } from '../src/sudoku/sized-rule-sudoku-pad.ts'

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

function permutations(values: number[]): number[][] {
  if (values.length === 1) return [values]
  return values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index))
    .map(rest => [value, ...rest]))
}

function classicFourByFourSolutions() {
  const rows: number[][] = []
  const solutions: number[][] = []
  const rowPermutations = permutations([1, 2, 3, 4])
  function visit() {
    if (rows.length === 4) {
      solutions.push(rows.flat())
      return
    }
    const rowIndex = rows.length
    for (const row of rowPermutations) {
      if (rows.some(previous => row.some((digit, column) => previous[column] === digit))) continue
      if (rowIndex % 2 === 1) {
        const previous = rows[rowIndex - 1]
        if ([0, 2].some(start => new Set([...previous.slice(start, start + 2), ...row.slice(start, start + 2)]).size !== 4)) continue
      }
      rows.push(row)
      visit()
      rows.pop()
    }
  }
  visit()
  return solutions
}

const easyThermoCode = readFileSync(new URL('./fixtures/sudokupad-easy-thermo-1.scl', import.meta.url), 'utf8').trim()
const slowThermo6x6Code = readFileSync(new URL('./fixtures/sudokupad-slow-thermo-6x6.scl', import.meta.url), 'utf8').trim()
const smallSailboatCode = readFileSync(new URL('./fixtures/sudokupad-small-sailboat.scl', import.meta.url), 'utf8').trim()
const betweenLinesCode = readFileSync(new URL('./fixtures/sized-sudokupad-between-lines.scl', import.meta.url), 'utf8').trim()
const mountainClimbingCode = readFileSync(new URL('./fixtures/sudokupad-mountain-climbing.scl', import.meta.url), 'utf8').trim()
const xSumDotCode = readFileSync(new URL('./fixtures/sized-sudokupad-xsums-white-dots.scl', import.meta.url), 'utf8').trim()
const blackXSumDotCode = readFileSync(new URL('./fixtures/sized-sudokupad-xsums-black.scl', import.meta.url), 'utf8').trim()
const weightedLibraCode = readFileSync(new URL('./fixtures/sudoku-pad-weighted-libra.scl', import.meta.url), 'utf8').trim()
const pointingKnightsCode = readFileSync(new URL('./fixtures/sudokupad-3-pointing-knights.fpuz', import.meta.url), 'utf8').trim()
const entropyLineExamples = JSON.parse(readFileSync(new URL('./fixtures/sudokupad-entropy-lines.json', import.meta.url), 'utf8')) as {
  examples: { id: string; title: string; code: string }[]
}

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

test('#400 imports the original Between Lines export with rectangular box notation and translucent circles', async () => {
  const imported = await detectPuzzle(betweenLinesCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, 'Choose Your Fighter: Between Lines')
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.equal(imported.givens, '030000000000000000000002000000000000')
  assert.deepEqual(imported.sizedRules, [
    { type: 'between', cells: [16, 22, 28, 34, 33, 27, 21] },
    { type: 'between', cells: [21, 26, 19, 24] },
    { type: 'between', cells: [24, 18, 12, 7] },
    { type: 'between', cells: [7, 8, 9, 4, 5] },
    { type: 'between', cells: [5, 11, 17, 16] },
  ])
  assert.equal(imported.authoredSolution, '634125512364246513351642465231123456')
  assert.equal(imported.authoredSolutionOnly, true)
})

test('#404 imports the original 4 × 4 X-Sum Twins Penpa export and verifies both white dots', async () => {
  const imported = await detectPuzzle(xSumDotCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, '4x4 X-Sum Twins: White Dots')
  assert.equal(imported.sizedAuthor, 'Cale Schoon')
  assert.deepEqual(imported.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.equal(imported.givens, '0'.repeat(16))
  assert.deepEqual(imported.sizedRules, [
    { type: 'x-sum-dot', ends: [{ direction: 'south', index: 1 }, { direction: 'south', index: 2 }], relation: 'consecutive' },
    { type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, 4], relation: 'consecutive' },
  ])
  const decoded = decodeSudokuPadEnvelope(xSumDotCode) as Record<string, unknown>
  assert.deepEqual(readSudokuPadXSumDots(decoded), {
    givens: '0'.repeat(16), grid: { size: 4, boxRows: 2, boxColumns: 2 }, sizedRules: imported.sizedRules,
    title: '4x4 X-Sum Twins: White Dots', sizedAuthor: 'Cale Schoon', authoredSolution: '4321213412433412',
    authoredSolutionOnly: true,
  })
})

test('#404 resolves the published X-Sum Twins short link to the same imported rules', async ({ mock }) => {
  const fetcher = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/v1/import/sudokupad/6slam9s9ap')
    return Response.json({ code: xSumDotCode })
  })
  const imported = await detectPuzzle('https://sudokupad.app/6slam9s9ap')
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, '4x4 X-Sum Twins: White Dots')
  assert.equal(imported.sizedAuthor, 'Cale Schoon')
  assert.deepEqual(imported.sizedRules, [
    { type: 'x-sum-dot', ends: [{ direction: 'south', index: 1 }, { direction: 'south', index: 2 }], relation: 'consecutive' },
    { type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, 4], relation: 'consecutive' },
  ])
  assert.equal(fetcher.mock.callCount(), 1)
})

test('#404 imports the original 4 × 4 X-Sum Twins Black Dots export', async () => {
  const imported = await detectPuzzle(blackXSumDotCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, '4x4 X-Sum Twins: Black Dots')
  assert.equal(imported.sizedAuthor, 'Cale Schoon')
  assert.deepEqual(imported.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.equal(imported.givens, '0'.repeat(16))
  assert.deepEqual(imported.sizedRules, [
    { type: 'x-sum-dot', ends: [{ direction: 'south', index: 1 }, { direction: 'south', index: 2 }], relation: 'ratio' },
    { type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, 4], relation: 'ratio' },
  ])
  assert.equal(imported.authoredSolution, '4231312424131342')
})

test('#404 resolves the published black-dot X-Sum Twins short link', async ({ mock }) => {
  const fetcher = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/v1/import/sudokupad/0n497kpnvt')
    return Response.json({ code: blackXSumDotCode })
  })
  const imported = await detectPuzzle('https://sudokupad.app/0n497kpnvt')
  assert.equal(imported.title, '4x4 X-Sum Twins: Black Dots')
  assert.equal(imported.sizedAuthor, 'Cale Schoon')
  assert.deepEqual(imported.sizedRules?.map(rule => rule.type === 'x-sum-dot' ? rule.relation : rule.type), [
    'ratio', 'ratio',
  ])
  assert.equal(imported.authoredSolution, '4231312424131342')
  assert.equal(fetcher.mock.callCount(), 1)
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

test('published 6 × 6 SudokuPad imports keep their combined rules and authored solutions', async () => {
  const zigZagSnack = await detectPuzzle(slowThermo6x6Code)
  assert.equal(zigZagSnack.format, 'SudokuPad')
  assert.equal(zigZagSnack.title, '6x6 Zig Zag Snack')
  assert.equal(zigZagSnack.givens, '0'.repeat(36))
  assert.deepEqual(zigZagSnack.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(zigZagSnack.sizedRules, [
    { type: 'slow-thermometer', cells: [33, 26, 21, 14, 9, 2] },
    { type: 'slow-thermometer', cells: [32, 27, 20, 15, 8, 3] },
    { type: 'xv', five: { pairs: [[7, 8], [21, 22], [19, 20], [21, 27], [33, 34]] }, ten: { pairs: [[2, 8]] } },
    { type: 'sandwich', direction: 'south', cells: [3, 9, 15, 21, 27, 33], sum: 6 },
  ])
  assert.equal(zigZagSnack.authoredSolution, '326541514632145263632415263154451326')

  const smallSailboat = await detectPuzzle(smallSailboatCode)
  assert.equal(smallSailboat.format, 'SudokuPad')
  assert.equal(smallSailboat.title, 'Small Sailboat')
  assert.deepEqual(smallSailboat.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(smallSailboat.sizedRules, [
    { type: 'thermometer', cells: [24, 31, 32, 33, 34, 29] },
    { type: 'whispers', cells: [26, 20, 14, 8, 2, 7, 12, 13], minDifference: 2 },
    { type: 'whispers', cells: [27, 21, 15, 16], minDifference: 3 },
    { type: 'whispers', cells: [15, 9, 3, 10, 17], minDifference: 3 },
    { type: 'sandwich', direction: 'west', cells: [5, 4, 3, 2, 1, 0], sum: 2 },
  ])
  assert.equal(smallSailboat.authoredSolution, '536214412563365142241635154326623451')

  const source = decodeSudokuPadEnvelope(smallSailboatCode) as { metadata: { rules: string }; [key: string]: unknown }
  assert.throws(() => readSizedRuleSudokuPad({ ...source, metadata: { ...source.metadata,
    rules: `${source.metadata.rules}\n-----German whisper lines:\nTwo cells connected by a German whisper line must have a difference of at least 2.`,
  } }), /authored rules this importer cannot verify/)
})

test('#396 imports the published Anti-King and Region Sum combination with its solution annotation', async () => {
  const imported = await detectPuzzle(weightedLibraCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, 'Weighted Libra')
  assert.equal(imported.sizedAuthor, 'vguardiano')
  assert.equal(imported.givens, '000000030060000000000000060030000000')
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(imported.sizedRules, [
    { type: 'anti-king' },
    { type: 'region-sum', cells: [19, 20, 13, 7, 8, 9, 10, 16, 21, 22] },
    { type: 'region-sum', cells: [25, 26, 27, 28] },
  ])
  assert.equal(imported.authoredSolution, '621345435261216453543126162534354612')

  const source = decodeSudokuPadEnvelope(weightedLibraCode) as Record<string, unknown>
  assert.throws(() => readSizedRuleSudokuPad({ ...source,
    cages: [{ value: 'solution: 123' }],
  }), /unsupported rules or markings/)
})

test('published 6 × 6 Entropic Line imports preserve Anti-King, paths, and authored solutions', async () => {
  const paths = [
    [[32, 25, 19, 12, 6, 1]],
    [[13, 19, 25, 31], [23, 17, 11, 5]],
  ]
  for (const [index, example] of entropyLineExamples.examples.entries()) {
    const imported = await detectPuzzle(example.code)
    assert.equal(imported.format, 'SudokuPad', example.id)
    assert.equal(imported.title, example.title)
    assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
    if (example.id === 'ua0shvo1dt') assert.ok(imported.sizedRules?.some(rule => rule.type === 'anti-king'), `${example.id} has Anti-King`)
    const entropic = imported.sizedRules?.filter(rule => rule.type === 'entropic') ?? []
    assert.equal(entropic.length, example.id === '590b62qlwt' ? 2 : 1, `${example.id} line count`)
    assert.deepEqual(entropic.map(rule => rule.cells), paths[index])
    assert.ok(entropic.every(rule => rule.type === 'entropic' && rule.groups.flat().length === 6))
    assert.ok(imported.authoredSolution)
  }
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

test('#394 imports SudokuPad Anti-Knight metadata alongside sized companion rules', async () => {
  const base = thermoExport(2)
  const source = { ...base, metadata: { ...base.metadata, antiknight: true } }
  const imported = await detectPuzzle(encode(source))
  assert.deepEqual(imported.sizedRules, [
    { type: 'anti-knight' },
    { type: 'thermometer', cells: [0, 1, 2, 3] },
  ])
})

test('#394 imports the published 6 × 6 f-puzzles Anti-Knight and Arrow combination', async ({ mock }) => {
  const imported = await detectPuzzle(pointingKnightsCode)
  assert.equal(imported.format, 'f-puzzles')
  assert.equal(imported.title, '3 Pointing Knights')
  assert.equal(imported.sizedAuthor, 'Plok')
  assert.equal(imported.givens, '0'.repeat(36))
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(imported.sizedRules, [
    { type: 'anti-knight' },
    { type: 'arrow', circle: 18, cells: [13, 8, 3] },
    { type: 'arrow', circle: 28, cells: [21, 14, 7] },
    { type: 'arrow', circle: 32, cells: [27, 22, 17] },
  ])
  assert.equal(imported.authoredSolution, '456321321654612543543216234165165432')

  const fetch = mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/v1/import/sudokupad/uzqvdilyi5')
    return Response.json({ code: pointingKnightsCode })
  })
  const linked = await detectPuzzle('https://sudokupad.app/uzqvdilyi5')
  assert.equal(linked.format, 'SudokuPad')
  assert.deepEqual(linked.sizedRules, imported.sizedRules)
  assert.equal(fetch.mock.callCount(), 1)
})

test('#388 imports the published zero-based 10 × 10 Mountain Climbing export', async () => {
  const imported = await detectPuzzle(mountainClimbingCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.title, 'Mountain Climbing')
  assert.equal(imported.sizedAuthor, 'Fenners')
  assert.equal(imported.givens, '0'.repeat(100))
  assert.deepEqual(imported.grid, { size: 10, boxRows: 2, boxColumns: 5, notation: 'zero-based' })
  const rules = imported.sizedRules ?? []
  assert.deepEqual(rules[0], { type: 'kropki', ratioTwo: { pairs: [[8, 9]] } })
  assert.deepEqual(rules.filter(rule => rule.type === 'adjacent-total'), [
    { type: 'adjacent-total', cells: [61, 62], sum: 5 },
    { type: 'adjacent-total', cells: [57, 58], sum: 5 },
    { type: 'adjacent-total', cells: [13, 23], sum: 5 },
    { type: 'adjacent-total', cells: [3, 4], sum: 5 },
    { type: 'adjacent-total', cells: [90, 91], sum: 5 },
  ])
  const arrows = rules.filter(rule => rule.type === 'arrow')
  assert.equal(arrows.length, 10)
  assert.deepEqual(arrows[0], {
    type: 'arrow', circle: 80,
    cells: [71, 61, 52, 42, 33, 23, 14, 4, 5, 15, 26, 36, 47, 57, 68, 78, 89],
  })
  assert.equal(arrows[0].cells.length, 17)
  assert.equal(arrows[6].circle, arrows[7].circle, 'two arrow shafts share their authored bulb')
  assert.equal(imported.authoredSolution?.length, 100)
})

test('#388 synthetic zero-based export parses a 17-cell Arrow and colored companion pairs', () => {
  const size = 10
  const source = {
    metadata: {
      rules: 'Normal 10x10 sudoku rules apply, using the digits 0-9. Place the digits 0-9 once in every row, column, and 2x5 box. ' +
        'Arrows: Digits on an arrow must sum to the digit in the bulb. The Sun: Digits separated by the yellow sun must be in a 1:2 ratio. ' +
        'Falling Rocks: Digits separated by grey rocks must sum to 5.',
    },
    cells: Array.from({ length: size }, () => Array.from({ length: size }, () => ({}))),
    regions: Array.from({ length: size }, (_, box) => Array.from({ length: size }, (_, cell) => [
      Math.floor(box / 2) * 2 + Math.floor(cell / 5), box % 2 * 5 + cell % 5,
    ])),
    arrows: [{ wayPoints: [[0.5, 0.65], ...Array.from({ length: 9 }, (_, column) => [0.5, column + 1.5]),
      ...Array.from({ length: 8 }, (_, column) => [1.5, 9.5 - column])], color: '#123456', thickness: 0.1, headLength: 0.2 }],
    overlays: [
      { center: [0.5, 0.5], width: 0.4, height: 0.4, rounded: true, backgroundColor: '#ffffffff', borderColor: '#123456' },
      { center: [0.5, 2], width: 0.3, height: 0.3, rounded: true, backgroundColor: '#ffc50dff' },
      { center: [0.5, 3], width: 0.3, height: 0.3, rounded: true, backgroundColor: '#b6b39aff' },
    ],
  }

  const imported = readSizedRuleSudokuPad(source)
  assert.deepEqual(imported.grid, { size: 10, boxRows: 2, boxColumns: 5, notation: 'zero-based' })
  assert.deepEqual(imported.sizedRules, [
    { type: 'kropki', ratioTwo: { pairs: [[1, 2]] } },
    { type: 'adjacent-total', cells: [2, 3], sum: 5 },
    { type: 'arrow', circle: 0, cells: [1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 18, 17, 16, 15, 14, 13, 12] },
  ])
})

test('#87 imports an f-puzzles Jigsaw and Anti-Knight combination without dropping either rule', async () => {
  const decoded = lzString.decompressFromBase64(pointingKnightsCode.slice(4))
  assert.ok(decoded)
  const source = JSON.parse(decoded)
  delete source.arrow
  source.ruleset = 'Normal irregular 6x6 Antiknight Sudoku rules apply.'
  source.solution = Array.from('456321321654612543543216234165165432', Number)
  for (const row of source.grid) for (const [column, cell] of row.entries()) cell.region = column

  const code = 'fpuz' + lzString.compressToBase64(JSON.stringify(source))
  const imported = await detectPuzzle(code)
  assert.deepEqual(imported.grid, {
    size: 6,
    regions: Array.from({ length: 6 }, (_, column) => Array.from({ length: 6 }, (_, row) => row * 6 + column)),
  })
  assert.deepEqual(imported.sizedRules, [{ type: 'anti-knight' }])
  assert.equal(imported.authoredSolution, '456321321654612543543216234165165432')

  source.antiknight = false
  await assert.rejects(detectPuzzle('fpuz' + lzString.compressToBase64(JSON.stringify(source))), /Anti-Knight metadata/)
})

test('Easy Thermo 1 imports its original wording and named publication link', async ({ mock }) => {
  const imported = await detectPuzzle(easyThermoCode)
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.givens, '0'.repeat(16))
  assert.deepEqual(imported.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.deepEqual(imported.sizedRules, [
    { type: 'thermometer', cells: [8, 4, 5] },
    { type: 'thermometer', cells: [13, 14, 15] },
  ])
  assert.equal(imported.title, 'Easy Thermo 1')
  assert.equal(imported.sizedAuthor, 'addie')

  const classic = classicFourByFourSolutions()
  assert.equal(classic.length, 288)
  const thermometers = imported.sizedRules!.filter(rule => rule.type === 'thermometer')
  const matching = classic.filter(solution => thermometers.every(rule =>
    rule.cells.every((cell, index) => index === 0 || solution[rule.cells[index - 1]] < solution[cell])))
  assert.deepEqual(matching.map(solution => solution.join('')), ['1234341223414123'])
  assert.equal(imported.authoredSolution, matching[0].join(''))

  const source = JSON.parse(lzString.decompressFromBase64(easyThermoCode.slice(3))!)
  const slowThermo = encode({ ...source,
    metadata: { ...source.metadata, rules: source.metadata.rules.replace('increase from bulb to tip', 'increase or stay the same from bulb to tip') },
  })
  await assert.rejects(detectPuzzle(slowThermo), /authored rules this importer cannot verify/)

  const fetch = mock.method(globalThis, 'fetch', async (path: string) => {
    assert.ok([
      '/api/v1/import/sudokupad/rin34es86q',
      '/api/v1/import/sudokupad/james-sinclair/easy-thermo-1',
    ].includes(path))
    return Response.json({ code: easyThermoCode })
  })
  const shortLink = await detectPuzzle('https://sudokupad.app/rin34es86q')
  assert.deepEqual(shortLink.sizedRules, imported.sizedRules)
  const linked = await detectPuzzle('https://sudokupad.app/james-sinclair/easy-thermo-1?setting-hidecolours=1')
  assert.equal(linked.title, 'Easy Thermo 1')
  assert.equal(linked.sizedAuthor, 'addie')
  assert.deepEqual(linked.sizedRules, imported.sizedRules)
  assert.equal(fetch.mock.callCount(), 2)
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

test('6 × 6 SudokuPad splits a closed Between stroke at marked endpoint circles', async () => {
  const source = thermoExport(2)
  const path = [0, 1, 2, 3, 4, 5, 11, 17, 23, 29, 35, 34, 33, 32, 31, 30, 24, 18, 12, 6, 0]
  const toPoint = (cell: number) => [Math.floor(cell / 6) + .5, cell % 6 + .5]
  const circles = [0, 4, 23, 33, 24].map(cell => ({
    center: toPoint(cell), width: .4, height: .4, rounded: true,
    backgroundColor: '#fff', borderColor: '#ccc',
  }))
  const imported = await detectPuzzle(encode({
    ...source,
    metadata: { ...source.metadata, rules: source.metadata.rules.split('\n\n')[0] +
      ' Between Lines: Digits along a grey line must be strictly between the digits in two connected circles.' },
    lines: [{ wayPoints: [toPoint(path[0]), toPoint(path[5]), toPoint(path[10]), toPoint(path[15]), toPoint(path[20])], color: '#ccc', thickness: 4 }],
    underlays: [], overlays: circles,
  }))
  assert.deepEqual(imported.sizedRules, [
    { type: 'between', cells: [0, 1, 2, 3, 4] },
    { type: 'between', cells: [4, 5, 11, 17, 23] },
    { type: 'between', cells: [23, 29, 35, 34, 33] },
    { type: 'between', cells: [33, 32, 31, 30, 24] },
    { type: 'between', cells: [24, 18, 12, 6, 0] },
  ])
})

test('6 × 6 SudokuPad splits open Between paths and rejects unmatched endpoint circles', async () => {
  const source = thermoExport(2)
  const metadataWithBetween = { ...source.metadata, rules: source.metadata.rules.split('\n\n')[0] +
    ' Between Lines: Digits along a grey line must be strictly between the digits in two connected circles.' }
  const circle = (cell: number) => ({ center: [Math.floor(cell / 6) + .5, cell % 6 + .5],
    width: .4, height: .4, rounded: true, backgroundColor: '#fff', borderColor: '#ccc' })
  const line = { wayPoints: [[.5, .5], [.5, 4.5]], color: '#ccc', thickness: 4 }
  const valid = await detectPuzzle(encode({ ...source, metadata: metadataWithBetween, lines: [line], underlays: [],
    overlays: [circle(0), circle(2), circle(4)] }))
  assert.deepEqual(valid.sizedRules, [
    { type: 'between', cells: [0, 1, 2] }, { type: 'between', cells: [2, 3, 4] },
  ])
  await assert.rejects(detectPuzzle(encode({ ...source, metadata: metadataWithBetween, lines: [line], underlays: [],
    overlays: [circle(0), circle(2), circle(4), circle(5)] })), /circle|marked/)
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

test('SudokuPad Region Sum keeps box visits and authored line geometry beside other rules', async () => {
  const { lines, underlays, ...source } = thermoExport(2)
  source.metadata.rules = source.metadata.rules.split('\n\n')[0] + '\n\n' +
    'Box borders split region sum lines into segments with the same sum. Different lines can have different segment sums.\n\n' +
    'Digits along a pink line form a set of non-repeating consecutive digits in any order.'
  const blue = { wayPoints: [[0.5, 1.5], [0.5, 3.5], [1.5, 3.5], [1.5, 2.5], [0.5, 1.5]], color: '#2ecbff', thickness: 10 }
  const pink = { wayPoints: [[1.5, 0.5], [1.5, 2.5]], color: '#f067f0', thickness: 10 }
  assert.deepEqual((await detectPuzzle(encode({ ...source, lines: [blue, pink] }))).sizedRules, [
    { type: 'region-sum', cells: [3, 9, 8, 1, 2], segments: [[1, 2, 3, 9, 8, 1]] },
    { type: 'renban', cells: [6, 7, 8] },
  ])
  await assert.rejects(detectPuzzle(encode({ ...source, lines: [{ ...blue, color: '#bada55' }, pink] })), /markings without supported rules/)
})

test('SudokuPad imports the Zipper and Region Sum layered source with its square digit key', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/zipper-region-sum.json', import.meta.url), 'utf8')) as {
    code: string; solution: string
  }
  const imported = await detectPuzzle(fixture.code)
  assert.equal(imported.authoredSolution, fixture.solution)
  assert.deepEqual(imported.sizedRules, [
    { type: 'zipper', cells: [2, 7, 13, 12] },
    { type: 'region-sum', cells: [2, 7, 13, 12] },
    { type: 'zipper', cells: [9, 3, 4, 11, 16, 22, 21, 26, 31, 24] },
    { type: 'region-sum', cells: [9, 3, 4, 11, 16, 22, 21, 26, 31, 24] },
    { type: 'digit-restriction', cells: [0], digits: [1, 4], shape: 'square' },
  ])
})

test('SudokuPad imports classic 9 × 9 Nonconsecutive, Quadruple, and Killer clues', async () => {
  const regions = Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, cell) => [
    Math.floor(box / 3) * 3 + Math.floor(cell / 3), box % 3 * 3 + cell % 3,
  ]))
  const data = {
    id: 'classic-nine',
    metadata: {
      title: '3s and 4s', author: 'addie',
      rules: 'Standard 9x9 sudoku rules apply.\n' +
        'Nonconsecutive: Any two orthogonally adjacent cells cannot contain consecutive digits.\n' +
        'Quadruples: Digits in white circles must be present at least once in the cells the clue touches. If a digit appears more than once in a circle, it must be present at least that many times in the cells the clue touches.\n' +
        'Killer Cages: Digits in a cage may not repeat and must sum to the number in the top left corner of that cage.',
    },
    cells: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({}))),
    regions,
    cages: [{ cells: [[0, 0], [0, 1]], value: 3, unique: true }],
    overlays: [
      ...[[1, 3], [4, 6], [5, 3], [8, 6], [2, 5], [7, 4], [7, 2], [2, 8]].map(center => ({
        center, width: .62, height: .62, thickness: 1.28, rounded: true, text: '',
        backgroundColor: '#FFFFFF', borderColor: '#000000',
      })),
      ...[
        [[1, 2.915], 3], [[1, 3.085], 4],
        [[4, 5.915], 3], [[4, 6.085], 4],
        [[5, 2.915], 3], [[5, 3.085], 4],
        [[8, 5.915], 3], [[8, 6.085], 4],
        [[2, 5], 3], [[7, 4], 4], [[7, 2], 3], [[2, 8], 4],
      ].map(([center, text]) => ({ center, width: .1, height: .1, text })),
    ],
  }
  const imported = await detectPuzzle(encode(data))
  assert.equal(imported.givens, '0'.repeat(81))
  assert.equal(imported.title, '3s and 4s')
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'non-consecutive' },
    { type: 'quadruple', topLeft: 2, digits: [3, 4] },
    { type: 'quadruple', topLeft: 32, digits: [3, 4] },
    { type: 'quadruple', topLeft: 38, digits: [3, 4] },
    { type: 'quadruple', topLeft: 68, digits: [3, 4] },
    { type: 'quadruple', topLeft: 13, digits: [3] },
    { type: 'quadruple', topLeft: 57, digits: [4] },
    { type: 'quadruple', topLeft: 55, digits: [3] },
    { type: 'quadruple', topLeft: 16, digits: [4] },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] },
  ])
  await assert.rejects(detectPuzzle(encode({ ...data, metadata: { ...data.metadata, rules: data.metadata.rules + '\nThermometers must increase.' } })),
    /authored rules this importer cannot verify/)
})
