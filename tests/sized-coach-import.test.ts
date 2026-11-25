import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { conflictsOf, enter, makeGame } from '../src/sudoku/game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { isSizedRuleList } from '../src/sudoku/sized-rule-game.ts'
import { checkLatin, solveLatin } from '../src/latin/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { decodeCoachSix, detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { tournamentQuadrupleCode, tournamentQuadrupleRules, tournamentQuadrupleSolution } from './fixtures/tournament-quadruple.ts'
import { coachCode } from './helpers/coach-code.ts'

const jankoChaos = JSON.parse(readFileSync(new URL('./fixtures/janko-chaos-sudoku-001.json', import.meta.url), 'utf8')) as {
  title: string; sourceUrl: string; author: string; size: 4; givens: string; regionLabels: number[]; solution: string
}
const coachBoxlessCalcudoku = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-calcudoku.json', import.meta.url), 'utf8')) as {
  code: string
}

const six = { gridSize: 6, givenDigits: '000000000000000000000000000030000400' }
const rectangularRegions = (rows: number, columns: number) => Array.from({ length: 36 }, (_, cell) =>
  Math.floor(cell / 6 / rows) * (6 / columns) + Math.floor(cell % 6 / columns) + 1)

test('six-by-six Coach decoding preserves the box orientation, clue order and both diagonals', async () => {
  const constraint = (type: string, paths: number[][]) => ({ type, segments: paths.map(cells => ({ cells, parameters: {} })), settings: {} })
  const result = await decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [
    constraint('palindromeLine', []), constraint('diagonalNegative', []), constraint('even', [[5], [10]]),
    constraint('thermometer', [[1, 7, 13], [23, 29]]), constraint('odd', []), constraint('diagonalPositive', []),
  ] }))
  assert.deepEqual(result, {
    version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: six.givenDigits, rules: [
      { type: 'diagonal', diagonal: 'main' }, { type: 'parity', parity: 'even', cells: [5, 10] },
      { type: 'thermometer', cells: [1, 7, 13] }, { type: 'thermometer', cells: [23, 29] }, { type: 'diagonal', diagonal: 'anti' },
    ],
  })
  const tall = await decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(3, 2) }))
  assert.deepEqual(tall.grid, { size: 6, boxRows: 3, boxColumns: 2 })
})

test('six-by-six Coach inequality imports reject unknown layer, setting and segment fields', async () => {
  const inequality = { type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] }
  const invalid = [
    { ...inequality, futureRule: true },
    { ...inequality, settings: { futureSetting: true } },
    { ...inequality, segments: [{ ...inequality.segments[0], futureSegment: true }] },
    { ...inequality, segments: [{ cells: [0, 1], parameters: { futureParameter: true } }] },
  ]
  for (const [index, layer] of invalid.entries()) {
    await assert.rejects(decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [layer] })),
      /inequality|settings|invalid/i, `inequality variant ${index + 1}`)
  }
})

test('six-by-six Coach decoding imports Sandwich clues with other typed rules', async () => {
  const solution = '123456456123234561561234345612612345'
  const sandwich = (side: string, index: number, value: number) => ({ type: 'sandwich',
    segments: [{ cells: [], parameters: { side, index, value } }], settings: {} })
  const imported = await detectPuzzle(coachCode({
    gridSize: 6,
    regions: rectangularRegions(2, 3),
    givenDigits: solution,
    givenConstraints: [sandwich('top', 0, 14), sandwich('right', 2, 0), sandwich('bottom', 5, 3),
      { type: 'thermometer', segments: [{ cells: [0, 1, 2], parameters: {} }], settings: {} }],
  }))
  assert.deepEqual(imported.sizedRules, [
    { type: 'sandwich', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 14 },
    { type: 'sandwich', direction: 'west', cells: [17, 16, 15, 14, 13, 12], sum: 0 },
    { type: 'sandwich', direction: 'north', cells: [35, 29, 23, 17, 11, 5], sum: 3 },
    { type: 'thermometer', cells: [0, 1, 2] },
  ])
  assert.deepEqual(conflictsOf(imported.givens, undefined, imported.grid, imported.sizedRules), new Set())
  await assert.rejects(decodeCoachSix(coachCode({ gridSize: 6, regions: rectangularRegions(2, 3),
    givenConstraints: [sandwich('top', 0, 15)] })), /invalid Sandwich clue/)
  await assert.rejects(decodeCoachSix(coachCode({ gridSize: 6, regions: rectangularRegions(2, 3),
    givenConstraints: [sandwich('top', 6, 0)] })), /invalid Sandwich clue/)
})

test('published sized Coach X-Sums parse outside labels against the grid size', async ({ mock }) => {
  const code = coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [{
    type: 'cosmeticText', settings: {}, segments: [
      { cells: [[0.5, -0.5]], parameters: { text: '21' } },
      { cells: [[6.5, 2.5]], parameters: { text: '14' } },
      { cells: [[0.5, 6.5]], parameters: { text: '1' } },
      { cells: [[-0.5, 5.5]], parameters: { text: '20' } },
    ],
  }, { type: 'thermometer', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] }] })
  let responseCode = code
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: responseCode, coach: {
    hasAuthorInstructions: true, authoredRule: 'x-sum', title: 'Six by six X-Sums',
  } }), { headers: { 'content-type': 'application/json' } }))

  const imported = await detectPuzzle('https://sudoku.coach/en/s/Ab12')
  assert.equal(imported.title, 'Six by six X-Sums')
  assert.deepEqual(imported.sizedRules, [
    { type: 'x-sum', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 21 },
    { type: 'x-sum', direction: 'west', cells: [17, 16, 15, 14, 13, 12], sum: 14 },
    { type: 'x-sum', direction: 'north', cells: [30, 24, 18, 12, 6, 0], sum: 1 },
    { type: 'x-sum', direction: 'east', cells: [30, 31, 32, 33, 34, 35], sum: 20 },
    { type: 'thermometer', cells: [0, 1, 2] },
  ])

  responseCode = coachCode({ gridSize: 4, givenDigits: '0'.repeat(16), givenConstraints: [{
    type: 'cosmeticText', settings: {}, segments: [{ cells: [[2.5, -0.5]], parameters: { text: '10' } }],
  }] })
  const mini = await detectPuzzle('https://sudoku.coach/en/s/Ab12')
  assert.deepEqual(mini.sizedRules, [
    { type: 'x-sum', direction: 'south', cells: [2, 6, 10, 14], sum: 10 },
  ])

  const impossible = coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [{
    type: 'cosmeticText', settings: {}, segments: [{ cells: [[0.5, -0.5]], parameters: { text: '22' } }],
  }] })
  responseCode = impossible
  await assert.rejects(detectPuzzle('https://sudoku.coach/en/s/Ab12'), /total from 1 through 21/)

  responseCode = coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [{
    type: 'cosmeticText', futureSemantics: true, settings: {},
    segments: [{ cells: [[0.5, -0.5]], parameters: { text: '5' } }],
  }] })
  await assert.rejects(detectPuzzle('https://sudoku.coach/en/s/Ab12'), /X-Sums layer has unsupported fields/)

  responseCode = coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [{
    type: 'cosmeticText', settings: {},
    segments: [{ cells: [[0.5, -0.5]], parameters: { text: '5' }, futureMeaning: true }],
  }] })
  await assert.rejects(detectPuzzle('https://sudoku.coach/en/s/Ab12'), /invalid X-Sum label/)
})

test('six-by-six Coach decoding reports unsupported rules instead of importing a partial puzzle', async () => {
  const puzzle = { ...six, regions: rectangularRegions(2, 3) }
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenDigits: null })), /invalid givens/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: 'thermometer' })), /invalid rules/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: null })), /invalid rules/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: [{ type: 'globalEntropy', segments: [] }] })), /needs three explicit digit groups/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: [{
    type: 'thermometer', segments: [], settings: {}, authoredMeaning: 'unknown',
  }] })), /unsupported fields \(thermometer\)/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: [{ type: 'thermometer', segments: [{ cells: [1, 1] }] }] })), /invalid rules/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, regions: Array(36).fill(0) })), /6 × 6 Jigsaw grid needs six connected regions/)
})

test('Coach rejects malformed 4 × 4 region labels instead of treating them as Mini Sudoku boxes', async () => {
  const source = { gridSize: 4, givenDigits: '0'.repeat(16) }
  assert.deepEqual((await detectPuzzle(coachCode(source))).grid, { size: 4, boxRows: 2, boxColumns: 2 })
  await assert.rejects(detectPuzzle(coachCode({ ...source, regions: Array(16).fill(-1) })), /invalid regions/)
  await assert.rejects(detectPuzzle(coachCode({ ...source, regions: '0000111122223333' })), /invalid regions/)
  await assert.rejects(detectPuzzle(coachCode({ ...source, regions: Array(16).fill(0) })),
    /A 4 × 4 Jigsaw grid needs four connected regions of four cells/)
})

test('sized Coach current-state imports preserve entries, both pencil modes and player colors', async () => {
  const userDigits = Array(36).fill('0')
  userDigits[0] = '4'
  const center = Array(36).fill('0')
  center[1] = '8'
  const corner = Array(36).fill('0')
  corner[2] = '16'
  const userColours = Array(36).fill('')
  userColours[2] = '0'
  const imported = await detectPuzzle(coachCode({
    ...six,
    regions: rectangularRegions(2, 3),
    userDigits: userDigits.join(''),
    userCellCandidates: center.join('-'),
    userBoxCandidates: corner.join('-'),
    userColours: userColours.join(','),
    userCellCandidatesColours: '1+3+0',
    colours: ['#ff0000'],
  }))
  assert.deepEqual(imported.progress, {
    entries: '4' + '0'.repeat(35),
    center: [0, 4, ...Array(34).fill(0)],
    corner: [0, 0, 8, ...Array(33).fill(0)],
    importedCellColors: { 2: ['#ff0000'] },
    importedCandidateColors: { 1: { 3: '#ff0000' } },
  })
  await assert.rejects(detectPuzzle(coachCode({ ...six, regions: rectangularRegions(2, 3),
    cells: { 0: { quickSymbol: { shape: 'circle', colour: '#ff0000' } } } })), /Quick Draw progress is only supported for 9 × 9/)
  const givens = Array(36).fill('0')
  givens[34] = '4'
  const replacesGiven = Array(36).fill('0')
  replacesGiven[34] = '3'
  await assert.rejects(detectPuzzle(coachCode({ ...six, givenDigits: givens.join(''), regions: rectangularRegions(2, 3),
    userDigits: replacesGiven.join('') })), /placed digit that replaces a given/)
  const outOfRange = Array(36).fill('0')
  outOfRange[0] = '7'
  await assert.rejects(detectPuzzle(coachCode({ ...six, regions: rectangularRegions(2, 3), userDigits: outOfRange.join('') })),
    /progress has invalid placed digits/)
})

test('#402 imports explicit Global Entropy groups from a six-by-six Coach layer', async () => {
  const groups = [[1, 2], [3, 4], [5, 6]]
  const result = await decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [
    { type: 'globalEntropy', segments: [], settings: { groups } },
  ] }))
  assert.deepEqual(result.rules, [{ type: 'global-entropy', groups }])
  await assert.rejects(decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [
    { type: 'globalEntropy', segments: [], settings: { groups: [[1, 2], [2, 4], [5, 6]] } },
  ] })), /needs three explicit digit groups/)
})

test('#410 preserves the original 6 × 6 boxless Calcudoku cages, hidden operation, given and colors', async () => {
  const imported = await detectPuzzle(coachBoxlessCalcudoku.code)
  assert.equal(imported.format, 'Sudoku Coach')
  const entry = imported.calcudoku
  assert.ok(entry)
  assert.equal(entry.puzzle.size, 6)
  assert.deepEqual(entry.puzzle.givens, Array.from({ length: 36 }, (_, cell) => cell === 34 ? 4 : 0))
  assert.equal(entry.puzzle.cages.length, 14)
  assert.deepEqual(entry.puzzle.cages.find(cage => cage.target === 6 && cage.cells.join(',') === '8,14,15'), {
    target: 6, operator: 'hidden', cells: [8, 14, 15],
  })
  assert.equal(entry.puzzle.cages.reduce((count, cage) => count + cage.cells.length, 0), 35)
  assert.equal(Object.keys(entry.givenCellColors ?? {}).length, 26)
  const exact = solveLatin(entry.puzzle)
  assert.equal(exact.status, 'unique')
  assert.equal(exact.solution?.join(''), '321564632451463125546213154632215346')
  assert.ok(checkLatin(entry.puzzle, exact.solution!).complete)
  const restored = readImportedCalcudoku(entry.id)
  assert.deepEqual(restored?.puzzle.cages, entry.puzzle.cages)
  assert.deepEqual(restored?.puzzle.givens, entry.puzzle.givens)
  assert.deepEqual(restored?.givenCellColors, entry.givenCellColors)
  const preview = await prepareImportedPuzzle(coachBoxlessCalcudoku.code)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.equal(preview.calcudoku?.id, entry.id)
})


test('six-by-six Coach Jigsaw imports keep the complete Entropic Runaround definition', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples
    .find((example: { url: string }) => example.url.endsWith('/Cmki'))
  const result = await decodeCoachSix(source.code)
  assert.ok('regions' in result.grid)
  const membership = Array<number>(36)
  result.grid.regions.forEach((region, index) => region.forEach(cell => { membership[cell] = index }))
  const sourceLabels = [1, 1, 1, 1, 2, 2, 1, 5, 5, 1, 5, 2, 4, 4, 5, 5, 5, 2,
    4, 6, 6, 6, 2, 2, 4, 6, 3, 6, 6, 3, 4, 4, 3, 3, 3, 3]
  const regionOrder = [...new Set(sourceLabels)]
  assert.deepEqual(membership, sourceLabels.map(label => regionOrder.indexOf(label)))
  assert.deepEqual(result.givens, '0'.repeat(36))
  assert.deepEqual(result.rules, [
    { type: 'whispers', cells: [4, 5, 11, 16, 21, 26, 31, 30, 24, 19, 14, 9, 4], minDifference: 3 },
    { type: 'whispers', cells: [22, 15, 8, 1, 0, 6, 13, 20, 27, 34, 35, 29, 22], minDifference: 3 },
    { type: 'xv', five: { pairs: [[4, 10]] } },
    { type: 'modular', cells: [21, 22, 23] },
    { type: 'modular', cells: [20, 26, 32] },
    { type: 'modular', cells: [8, 7, 6] },
    { type: 'modular', cells: [11, 10, 4] },
  ])
})

test('Coach 5 × 5 fractional regions keep their authored shading and Little Killer clues', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/coach-fractional-regions.json', import.meta.url), 'utf8'))
  const imported = await detectPuzzle(source.code)
  assert.deepEqual(imported.grid, { size: 5, noRegions: true })
  assert.equal(imported.sizedRules?.length, 4)
  assert.deepEqual(imported.sizedRules?.slice(0, 3), [
    { type: 'little-killer', direction: 'north-west', cells: [14, 8, 2], sum: 10 },
    { type: 'little-killer', direction: 'south-west', cells: [4, 8, 12, 16, 20], sum: 10 },
    { type: 'little-killer', direction: 'south-east', cells: [0, 6, 12, 18, 24], sum: 10 },
  ])
  const shading = imported.sizedRules?.[3]
  assert.equal(shading?.type, 'fractional-regions')
  if (shading?.type === 'fractional-regions') {
    assert.equal(shading.pieces.length, 4)
    assert.deepEqual(shading.pieces.map(piece => piece.color), ['#b4b4b4', '#bebebe', '#c8c8c8', '#aaaaaa'])
    assert.equal(shading.pieces.flatMap(piece => piece.quarters).length, 100)
  }
})

test('sized Coach Little Killer import validates ray geometry and rejects unknown segment data', async () => {
  const layer = { type: 'littleKiller', settings: {}, segments: [{ cells: [[-1, 2]], parameters: { positive: true, value: 5 } }] }
  const code = () => coachCode({ gridSize: 6, regions: rectangularRegions(2, 3), givenConstraints: [layer] })
  assert.deepEqual((await detectPuzzle(code())).sizedRules, [
    { type: 'little-killer', direction: 'north-east', cells: [6, 1], sum: 5 },
  ])
  Object.assign(layer.segments[0].parameters, { unrecognized: true })
  await assert.rejects(detectPuzzle(code()), /invalid or cosmetic Little Killer clue/)
})

test('#456 keeps shared Thermometer paths through boxless Futoshiki and Calcudoku imports', async () => {
  const thermometers = { type: 'thermometer', settings: {}, segments: [
    { cells: [0, 4, 8], parameters: {} }, { cells: [8, 12], parameters: {} },
  ] }
  const futoCode = coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] }, thermometers,
  ] })
  const futo = await detectPuzzle(futoCode)
  assert.ok(futo.futoshiki)
  assert.deepEqual(futo.futoshiki.puzzle.lines, [
    { type: 'thermometer', cells: [0, 4, 8] }, { type: 'thermometer', cells: [8, 12] },
  ])
  assert.equal(checkLatin(futo.futoshiki.puzzle, [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]).complete, true)
  assert.deepEqual(readImportedFutoshiki(futo.futoshiki.id)?.puzzle.lines, futo.futoshiki.puzzle.lines)

  const calcudokuCode = coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'cage', settings: {}, segments: Array.from({ length: 4 }, (_, row) => ({
      cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), parameters: { sum: 10 },
    })) }, thermometers,
  ] })
  const calcudoku = await detectPuzzle(calcudokuCode)
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.lines, futo.futoshiki.puzzle.lines)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]).complete, true)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.lines, calcudoku.calcudoku.puzzle.lines)
})

test('boxless imports preserve #459–462/#477/#481 lines and #476/#480/#483/#484 rules', async () => {
  const lines = [
    { type: 'thermometer', settings: {}, segments: [{ cells: [0, 9, 18], parameters: {} }] },
    { type: 'entropicLine', settings: {}, segments: [
      { cells: [0, 3, 6], parameters: {} }, { cells: [6, 12, 18], parameters: {} },
    ] },
    { type: 'modularLine', settings: {}, segments: [
      { cells: [0, 1, 2], parameters: {} }, { cells: [2, 11, 20], parameters: {} },
    ] },
    { type: 'renban', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
    { type: 'arrow', settings: {}, segments: [{ cells: [10, 0, 9], parameters: {} }] },
    { type: 'betweenLine', settings: {}, segments: [{ cells: [0, 10, 20], parameters: {} }] },
    { type: 'lockoutLine', settings: {}, segments: [{ cells: [1, 8, 5], parameters: {} }] },
  ]
  const extraRules = [
    { type: 'antiKnight', settings: {}, segments: [] },
    { type: 'antiKing', settings: {}, segments: [] },
    { type: 'nonconsecutive', settings: {}, segments: [] },
    { type: 'minimum', settings: {}, segments: [{ cells: [26], parameters: {} }] },
    { type: 'maximum', settings: {}, segments: [{ cells: [30], parameters: {} }] },
  ]
  const completion = Array.from({ length: 81 }, (_, cell) => (Math.floor(cell / 9) + cell % 9) % 9 + 1)
  const expectedLines = [
    { type: 'thermometer', cells: [0, 9, 18] },
    { type: 'entropic', cells: [0, 3, 6], groups: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    { type: 'entropic', cells: [6, 12, 18], groups: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    { type: 'modular', cells: [0, 1, 2] },
    { type: 'modular', cells: [2, 11, 20] },
    { type: 'renban', cells: [0, 1, 2] },
    { type: 'arrow', circle: 10, cells: [0, 9] },
    { type: 'between', cells: [0, 10, 20] },
    { type: 'lockout', cells: [1, 8, 5], minDifference: 4 },
  ]
  const inequality = { type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] }
  const futoLineOnly = await detectPuzzle(coachCode({ gridSize: 9, regions: [], givenDigits: '0'.repeat(81), givenConstraints: [...lines, inequality] }))
  assert.ok(futoLineOnly.futoshiki)
  assert.equal(checkLatin(futoLineOnly.futoshiki.puzzle, completion).complete, true)
  const futo = await detectPuzzle(coachCode({ gridSize: 9, regions: [], givenDigits: '0'.repeat(81), givenConstraints: [...lines, ...extraRules, inequality] }))
  assert.ok(futo.futoshiki)
  assert.deepEqual(futo.futoshiki.puzzle.lines, expectedLines)
  assert.deepEqual(futo.futoshiki.puzzle.exclusions, ['anti-knight', 'anti-king', 'nonconsecutive'])
  assert.deepEqual(futo.futoshiki.puzzle.extrema, [
    { type: 'minimum', cells: [26], ignoreMarkedNeighbors: true },
    { type: 'maximum', cells: [30], ignoreMarkedNeighbors: true },
  ])
  assert.deepEqual(readImportedFutoshiki(futo.futoshiki.id)?.puzzle.lines, expectedLines)
  for (const [values, kind] of [
    [[1, ...Array(10).fill(0), 1], 'anti-knight'],
    [[1, ...Array(9).fill(0), 1], 'anti-king'],
    [[1, 2], 'nonconsecutive'],
    [[...Array(25).fill(0), 1, 2], 'minimum'],
    [[...Array(30).fill(0), 2, 3], 'maximum'],
  ] as const) {
    assert.ok(checkLatin(futo.futoshiki.puzzle, values).conflicts.some(rule => rule.kind === kind), kind)
  }

  const cages = { type: 'cage', settings: {}, segments: Array.from({ length: 9 }, (_, row) => {
    const values = completion.slice(row * 9, row * 9 + 9)
    return [
      { cells: Array.from({ length: 5 }, (_, column) => row * 9 + column), parameters: { sum: values.slice(0, 5).reduce((sum, digit) => sum + digit) } },
      { cells: Array.from({ length: 4 }, (_, column) => row * 9 + column + 5), parameters: { sum: values.slice(5).reduce((sum, digit) => sum + digit) } },
    ]
  }).flat() }
  const calcudokuLineOnly = await detectPuzzle(coachCode({ gridSize: 9, regions: [], givenDigits: '0'.repeat(81), givenConstraints: [...lines, cages] }))
  assert.ok(calcudokuLineOnly.calcudoku)
  assert.equal(checkLatin(calcudokuLineOnly.calcudoku.puzzle, completion).complete, true)
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 9, regions: [], givenDigits: '0'.repeat(81), givenConstraints: [...lines, ...extraRules, cages] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.lines, expectedLines)
  assert.deepEqual(calcudoku.calcudoku.puzzle.exclusions, futo.futoshiki.puzzle.exclusions)
  assert.deepEqual(calcudoku.calcudoku.puzzle.extrema, futo.futoshiki.puzzle.extrema)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.lines, expectedLines)
})

test('the 4 × 4 Coach path uses the same rule objects and preserves companion clues', async () => {
  const source = { gridSize: 4, givenDigits: '0000032000000010', givenConstraints: [
    { type: 'renban', segments: [{ cells: [0, 5] }, { cells: [5, 6] }] },
    { type: 'odd', segments: [{ cells: [9] }] },
  ] }
  const imported = await detectPuzzle(coachCode(source))
  assert.deepEqual(imported.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.deepEqual(imported.sizedRules, [
    { type: 'renban', cells: [0, 5, 6], segments: [[0, 5], [5, 6]] },
    { type: 'parity', parity: 'odd', cells: [9] },
  ])
  source.givenConstraints[0].segments[1].cells[1] = 16
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('#457 imports a 4 × 4 Jigsaw with a companion line and shares its layout', async () => {
  const givens = '1234234134124123'
  const regions = [1, 1, 2, 2, 3, 1, 4, 2, 3, 1, 4, 2, 3, 3, 4, 4]
  const code = coachCode({ gridSize: 4, regions, givenDigits: givens, givenConstraints: [
    { type: 'renban', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
  ] })

  const imported = await detectPuzzle(code)
  assert.deepEqual(imported.grid, {
    size: 4, regions: [[0, 1, 5, 9], [2, 3, 7, 11], [4, 8, 12, 13], [6, 10, 14, 15]],
  })
  assert.deepEqual(imported.sizedRules, [{ type: 'renban', cells: [0, 1, 2] }])

  const game = { ...makeGame('mini-jigsaw', '4 × 4 Jigsaw', givens, 'imported', 0, imported.grid),
    sized: { rules: imported.sizedRules!, solution: givens } }
  const shared = await publishFixture(game)
  assert.deepEqual(shared.grid, imported.grid)
  assert.deepEqual(shared.sizedRules, imported.sizedRules)
  assert.equal(shared.givens, givens)
})

test('#457 imports the published Janko Chaos 001 givens and irregular regions', async () => {
  const code = coachCode({ gridSize: jankoChaos.size, regions: jankoChaos.regionLabels, givenDigits: jankoChaos.givens })
  const imported = await detectPuzzle(code)
  assert.equal(imported.title, undefined)
  assert.equal(imported.givens, jankoChaos.givens)
  assert.deepEqual(imported.grid, {
    size: 4, regions: [[0, 1, 2, 4], [3, 5, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]],
  })
  const game = { ...makeGame('janko-chaos-001', jankoChaos.title, imported.givens, 'imported', 0, imported.grid),
    sized: { rules: imported.sizedRules!, solution: jankoChaos.solution } }
  const shared = await publishFixture(game)
  assert.deepEqual(shared.grid, imported.grid)
  assert.deepEqual(shared.sizedRules, imported.sizedRules)
  assert.equal(shared.givens, jankoChaos.givens)
})

test('six-by-six Coach keeps intersecting Renban segments as one set alongside other rules', async () => {
  const puzzle = { ...six, regions: rectangularRegions(3, 2) }
  const source = { ...puzzle, givenConstraints: [
    { type: 'renban', segments: [{ cells: [1, 7, 13] }, { cells: [7, 8] }] },
    { type: 'thermometer', segments: [{ cells: [1, 7, 13] }] },
  ] }
  assert.deepEqual((await decodeCoachSix(coachCode(source))).rules, [
    { type: 'renban', cells: [1, 7, 13, 8], segments: [[1, 7, 13], [7, 8]] },
    { type: 'thermometer', cells: [1, 7, 13] },
  ])
  source.givenConstraints[0].segments[1].cells[1] = 36
  await assert.rejects(decodeCoachSix(coachCode(source)), /invalid rules/)
})

test('sized Coach Kropki combines positive dots, independent negative rules and companion lines', async () => {
  const source = {
    ...six, regions: rectangularRegions(2, 3), givenConstraints: [
      { type: 'difference', settings: { negativeConstraint: true }, segments: [{ cells: [0, 1], parameters: { difference: 1 } }] },
      { type: 'ratio', settings: { negativeConstraint: false }, segments: [{ cells: [1, 7], parameters: { ratio: 2 } }] },
      { type: 'renban', segments: [{ cells: [0, 1, 7] }] },
    ],
  }
  const imported = await detectPuzzle(coachCode(source))
  assert.deepEqual(imported.sizedRules, [
    { type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true } },
    { type: 'kropki', ratioTwo: { pairs: [[1, 7]], negative: false } },
    { type: 'renban', cells: [0, 1, 7] },
  ])
  source.givenConstraints[0].segments[0].cells = [5, 6]
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('sized Coach Non-Consecutive exempts only positive white-dot edges in mixed rules', async () => {
  const solution = '123456456123231564564231312645645312'
  const digits = [...solution].map(Number)
  const whiteDots: [number, number][] = []
  for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
    const cell = row * 6 + column
    for (const [nextRow, nextColumn] of [[row, column + 1], [row + 1, column]]) {
      if (nextRow < 6 && nextColumn < 6) {
        const next = nextRow * 6 + nextColumn
        if (Math.abs(digits[cell] - digits[next]) === 1) whiteDots.push([cell, next])
      }
    }
  }
  const source = {
    ...six, givenDigits: solution, regions: rectangularRegions(2, 3), givenConstraints: [
      { type: 'nonconsecutive', settings: {}, segments: [] },
      { type: 'difference', settings: {}, segments: whiteDots.map(cells => ({ cells, parameters: { difference: 1 } })) },
      { type: 'ratio', settings: {}, segments: [{ cells: [5, 11], parameters: { ratio: 2 } }] },
      { type: 'thermometer', settings: {}, segments: [{ cells: [12, 13], parameters: {} }] },
    ],
  }
  const imported = await detectPuzzle(coachCode(source))
  assert.deepEqual(imported.sizedRules?.[0], { type: 'non-consecutive', except: whiteDots })
  assert.deepEqual(imported.sizedRules?.[1],
    { type: 'kropki', consecutive: { pairs: whiteDots, negative: false } })
  assert.deepEqual(imported.sizedRules?.slice(2), [
    { type: 'kropki', ratioTwo: { pairs: [[5, 11]], negative: false } },
    { type: 'thermometer', cells: [12, 13] },
  ])
  assert.equal(conflictsOf(solution, undefined, imported.grid, imported.sizedRules).size, 0)
  const game = { ...makeGame('coach-combo', 'Coach combination', solution, 'imported', 0, imported.grid),
    sized: { rules: imported.sizedRules!, solution } }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.sized, game.sized)
  const shared = await publishFixture(game)
  assert.deepEqual(shared.grid, imported.grid)
  assert.deepEqual(shared.sixRules, imported.sizedRules)
})

test('9uMo Race track round-trips its six-by-six Renban and exact Difference combination', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-race-track.json', import.meta.url), 'utf8')) as {
    code: string; solution: string; title: string
  }
  const imported = await decodeCoachSix(fixture.code)
  const game = { ...makeGame('coach-racetrack', fixture.title, imported.givens, 'imported', 0, imported.grid),
    sized: { rules: imported.rules, solution: fixture.solution } }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.sized, game.sized)
  const shared = await publishFixture(game)
  assert.deepEqual(shared.grid, imported.grid)
  assert.deepEqual(shared.sixRules, imported.rules)
})

test('sized share worker accepts Coach-compatible Between, Clone, Modular and XV combinations', async () => {
  const solution = '123456456123231564564231312645645312'
  const grid = { size: 6 as const, boxRows: 2 as const, boxColumns: 3 as const }
  const rules = [
    { type: 'between' as const, cells: [0, 1, 2] },
    { type: 'clone' as const, groups: [[0, 1], [6, 7]] },
    { type: 'modular' as const, cells: [0, 1, 2] },
    { type: 'xv' as const, five: { negative: true } },
  ]
  const game = { ...makeGame('coach-rule-share', 'Coach rule share', solution, 'imported', 0, grid),
    sized: { rules, solution } }
  const shared = await publishFixture(game)
  assert.deepEqual(shared.sixRules, rules)
})

test('sized share worker accepts engine-backed Coach rules missing from its allowlist', async () => {
  const solution = '123456456123231564564231312645645312'
  const grid = { size: 6 as const, boxRows: 2 as const, boxColumns: 3 as const }
  const house = [0, 1, 2, 3, 4, 5]
  const cases = [
    ['Anti-King', { type: 'anti-king' as const }],
    ['Anti-Knight', { type: 'anti-knight' as const }],
    ['Inequality', { type: 'inequality' as const, less: 0, greater: 1 }],
    ['Minimum', { type: 'minimum' as const, cells: [0, 1] }],
    ['Maximum', { type: 'maximum' as const, cells: [0, 1] }],
    ['Sandwich', { type: 'sandwich' as const, direction: 'east' as const, cells: house, sum: 0 }],
    ['X-Sum', { type: 'x-sum' as const, direction: 'east' as const, cells: house, sum: 1 }],
    ['Skyscrapers', { type: 'skyscrapers' as const, direction: 'east' as const, index: 0, count: 1 }],
    ['Little Killer', { type: 'little-killer' as const, direction: 'north-east' as const, cells: [30, 25, 20, 15, 10, 5], sum: 29 }],
    ['Palindrome', { type: 'palindrome' as const, cells: [0, 6] }],
    ['Parity Line', { type: 'parity-line' as const, cells: [0, 1] }],
    ['Digit Restriction', { type: 'digit-restriction' as const, cells: [0], digits: [1], shape: 'circle' as const }],
    ['Zipper', { type: 'zipper' as const, cells: [0, 1, 2] }],
    ['Entropic', { type: 'entropic' as const, cells: [0, 1, 2], groups: [[1, 2], [3, 4], [5, 6]] }],
    ['Slow Thermometer', { type: 'slow-thermometer' as const, cells: [0, 1] }],
    ['Corner Kropki', { type: 'corner-kropki' as const, consecutive: [0] }],
    ['Nonogram', { type: 'nonogram' as const, axis: 'row' as const, index: 0, digits: [1], runs: [1] }],
    ['Row Equation', { type: 'row-equation' as const, cells: [0, 1, 2], operators: ['add', 'equals'] as const }],
    ['X-Sum Dot', { type: 'x-sum-dot' as const, ends: [30, { direction: 'north' as const, index: 0 }] as const, relation: 'consecutive' as const }],
    ['Line Assignments', { type: 'line-assignments' as const, paths: [[0, 1, 2], [6, 7, 8]],
      types: [{ type: 'renban' as const }, { type: 'entropic' as const, groups: [[1, 2], [3, 4], [5, 6]] }] }],
  ] as const
  for (const [title, rule] of cases) {
    assert.ok(isSizedRuleList([rule], grid), `${title} should be a valid sized rule`)
    const game = { ...makeGame(`coach-share-${title}`, `Coach share ${title}`, solution, 'imported', 0, grid),
      sized: { rules: [rule], solution } }
    const shared = await publishFixture(game)
    assert.deepEqual(shared.sixRules, [rule], `${title} should survive sharing`)
  }
})

test('5 × 5 Coach Fractional Regions preserve their boxless grid and pieces through sharing', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/coach-fractional-regions.json', import.meta.url), 'utf8')) as {
    code: string; solution: string; title: string
  }
  const imported = await detectPuzzle(fixture.code)
  assert.ok(imported.grid && imported.sizedRules)
  const game = { ...makeGame('coach-fractional-share', fixture.title, imported.givens, 'imported', 0, imported.grid),
    sized: { rules: imported.sizedRules, solution: fixture.solution } }
  const shared = await publishFixture(game)
  assert.deepEqual(shared.grid, game.grid)
  assert.deepEqual(shared.sizedRules, game.sized?.rules)
})

test('published Coach Crust puzzles preserve outside clues and inferred-region rules through sharing', async () => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-crust.json', import.meta.url), 'utf8')) as {
    id: string; title: string; code: string; solution?: string
  }[]
  for (const source of sources) {
    const imported = await detectPuzzle(source.code)
    assert.ok(imported.grid && imported.sizedRules?.some(rule => rule.type === 'crust'), source.id)
    const game = { ...makeGame(`coach-crust-${source.id}`, source.title, imported.givens, 'imported', 0, imported.grid),
      sized: { rules: imported.sizedRules, solution: source.solution ?? imported.givens } }
    const shared = await publishFixture(game)
    assert.deepEqual(shared.grid, imported.grid, source.id)
    assert.deepEqual(shared.sizedRules, imported.sizedRules, source.id)
  }
})

test('sized Coach Difference and Ratio layers reject unknown fields when combined', async () => {
  for (const type of ['difference', 'ratio'] as const) {
    const amountKey = type
    const base = { type, settings: {}, segments: [{ cells: [0, 1], parameters: { [amountKey]: type === 'difference' ? 1 : 2 } }] }
    const invalid = [
      { ...base, futureRule: true },
      { ...base, segments: [{ ...base.segments[0], futureSegment: true }] },
    ]
    for (const layer of invalid) {
      await assert.rejects(detectPuzzle(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [
        layer, { type: 'thermometer', segments: [{ cells: [6, 7], parameters: {} }] },
      ] })), /Difference|Ratio|invalid/i)
    }
  }
})

test('a labeled Coach Difference layer keeps the explicit 1 alongside larger labels', async () => {
  const layer = {
    type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: [0, 1], parameters: { difference: 1 } },
      { cells: [1, 2], parameters: { difference: 3 } },
    ],
  }
  const code = () => coachCode({ gridSize: 4, givenConstraints: [layer] })
  const puzzle = await detectPuzzle(code())
  assert.deepEqual(puzzle.sizedRules, [
    { type: 'difference', cells: [0, 1], difference: 1 },
    { type: 'difference', cells: [1, 2], difference: 3 },
  ])
  layer.segments[1].parameters.difference = 4
  await assert.rejects(detectPuzzle(code()), /between 1 and 3/)
  layer.segments[1].parameters.difference = 3
  layer.settings.negativeConstraint = true
  assert.deepEqual((await detectPuzzle(code())).sizedRules, [
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 1 }, { cells: [1, 2], value: 3 }], negative: true },
  ])
})

test('sized Coach Arrow preserves the bulb, its ordered shaft and its companion rules', async () => {
  const arrow = { type: 'arrow', segments: [{ cells: [0, 5, 10], parameters: {} }] }
  const code = () => coachCode({ gridSize: 4, givenConstraints: [arrow,
    { type: 'renban', segments: [{ cells: [0, 1] }] }] })
  const result = await detectPuzzle(code())
  assert.deepEqual(result.sizedRules, [
    { type: 'arrow', circle: 0, cells: [5, 10] }, { type: 'renban', cells: [0, 1] },
  ])
  arrow.segments[0].cells = [0, 5, 0]
  await assert.rejects(detectPuzzle(code()), /invalid rules/)
})

test('Coach Region Sum preserves each box visit and coexists with other line clues', async () => {
  const path = [0, 4, 9, 13, 10, 5]
  const source = { gridSize: 4, givenConstraints: [
    { type: 'regionSumLine', segments: [{ cells: path }] },
    { type: 'renban', segments: [{ cells: [4, 0] }] },
  ] }
  assert.deepEqual((await detectPuzzle(coachCode(source))).sizedRules, [
    { type: 'region-sum', cells: path, groupByRegion: false },
    { type: 'renban', cells: [4, 0] },
  ])
  source.givenConstraints[0].segments[0].cells = [0, 1, 6, 7, 2, 5, 0]
  assert.deepEqual((await detectPuzzle(coachCode(source))).sizedRules?.[0], {
    type: 'region-sum', cells: [6, 7, 2, 5, 0, 1], groupByRegion: false, segments: [[0, 1, 6, 7, 2, 5, 0]],
  })
  source.givenConstraints[0].segments[0].cells = [0, 1, 5]
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('a 7 × 7 Coach Jigsaw preserves explicit regions beside Thermometer and exact Ratio rules', async () => {
  const labels = '0000111020011122233312223434555343456664445556666'
  const original = { gridSize: 7, givenDigits: '0'.repeat(49), regions: Array.from(labels, label => Number(label) + 1),
    givenConstraints: [
      { type: 'thermometer', segments: [{ cells: [8, 16, 24] }] },
      { type: 'ratio', settings: { negativeConstraint: true }, segments: [{ cells: [1, 2], parameters: { ratio: 3 } }] },
    ] }
  const puzzle = await detectPuzzle(coachCode(original))
  assert.equal(puzzle.grid?.size, 7)
  assert.deepEqual(puzzle.grid?.size === 7 && puzzle.grid.regions[0], [0, 1, 2, 3, 7, 9, 10])
  assert.deepEqual(puzzle.sizedRules, [
    { type: 'thermometer', cells: [8, 16, 24] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [1, 2], value: 3 }], negative: true },
  ])
  await assert.rejects(detectPuzzle(coachCode({ ...original, regions: Array(49).fill(0) })), /seven connected regions/)
})

test('Coach preserves repeated Quadruple digits and rejects malformed corners or digits', async () => {
  const imported = await detectPuzzle(tournamentQuadrupleCode())
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(imported.sizedRules, tournamentQuadrupleRules.map(([topLeft, digits]) => ({
    type: 'quadruple', topLeft, digits: Array.from(digits, Number),
  })))

  const shape = { ...six, regions: rectangularRegions(2, 3) }
  const code = (cell: number, digits: string) => coachCode({ ...shape, givenConstraints: [
    { type: 'quadruple', segments: [{ cells: [cell], parameters: { digits } }] },
    { type: 'even', segments: [{ cells: [0] }] },
  ] })
  assert.deepEqual((await detectPuzzle(code(8, '4556'))).sizedRules, [
    { type: 'quadruple', topLeft: 8, digits: [4, 5, 5, 6] },
    { type: 'parity', cells: [0], parity: 'even' },
  ])
  await assert.rejects(detectPuzzle(code(5, '4556')), /contains invalid rules/)
  await assert.rejects(detectPuzzle(code(8, '457')), /invalid Quadruple clue/)
  await assert.rejects(detectPuzzle(code(8, '')), /invalid Quadruple clue/)
})

test('9 × 9 Coach digit restriction shapes import as the published digit sets', async () => {
  const shapeLayer = {
    type: 'cosmeticShape', settings: { gridSnapToCentres: true }, segments: [
      { cells: [[0.5, 0.5]], parameters: { shape: 'circle' } },
      { cells: [[1.5, 0.5]], parameters: { shape: 'cross' } },
      { cells: [[2.5, 0.5]], parameters: { shape: 'square' } },
    ],
  }
  const imported = await detectPuzzle(coachCode({ gridSize: 9, givenDigits: '0'.repeat(81), givenConstraints: [shapeLayer] }))
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'digit-restriction', shape: 'circle', cells: [0], digits: [1, 2, 3] },
    { type: 'digit-restriction', shape: 'cross', cells: [1], digits: [4, 5, 6, 7] },
    { type: 'digit-restriction', shape: 'square', cells: [2], digits: [8, 9] },
  ])
  shapeLayer.segments[2].parameters.shape = 'triangle'
  await assert.rejects(detectPuzzle(coachCode({ gridSize: 9, givenConstraints: [shapeLayer] })), /unsupported or invalid digit restrictions/)
})

test('a progressed tournament Quadruple preserves repeated labels through reload and the share Worker', async () => {
  const { grid, givens, sizedRules: rules } = await detectPuzzle(tournamentQuadrupleCode())
  assert.ok(grid && rules)
  const game = { ...makeGame('quad-tournament', 'Tournament Quadruple', givens, 'imported', 0, grid),
    sized: { rules, solution: tournamentQuadrupleSolution } }
  const progressed = enter(game, [0], 'value', 3)
  assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.sized, game.sized)
  const shared = await publishFixture(progressed)
  assert.deepEqual(shared.sixRules, rules)
  assert.equal(shared.givens, givens)
})
