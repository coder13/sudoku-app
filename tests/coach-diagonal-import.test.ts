import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { checkLatin, solveLatin } from '../src/latin/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const kingXCode = 'SCv7_32_f2e9r4619r220446rtirptg05lnbffdq6s9m7ojhqc1ii8spkg5hn2h6rbqdr7demlnb72grd4gc1hu7vhig06u87j8jmgitck8d14jn7nafm9g39enugtj457p0d25jmrgisjtjiath5aqmjj37pdanh7mhfa36af05poce1f3a1iadcnr07441ba50pomri51o28bdnn9tr8vf57p7jljqmg3vof6u9ilhhiapbo6u766dnquf07ugtblvqv7hmm5n9jvs7anlgf3fphd1j865lqdmcpe9v98geve0h1grio61rcidta2bni707bffvh5u041ntnpv9gbn82qg8h3uvffh5agvdae4fi4jn084j76bujnqfcdaqabqfcfskdr95nnusvgpns83kka1n88'
const kingXSolution = '175984263428635917693271854316852479749163528582749631234518796857396142961427385'
const nonconBento = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-bento.json', import.meta.url), 'utf8'))
  .find((source: { url: string }) => source.url.endsWith('/FWUv')) as { coach: string; solution: string }

test('King X export and short link keep both diagonals, Anti-King, and parity', async ({ mock }) => {
  const path = '/api/v1/import/sudoku-coach/92wb'
  mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, path)
    return Response.json({ code: kingXCode, coach: { title: 'King X', hasAuthorInstructions: false } })
  })

  const pasted = await detectPuzzle(kingXCode)
  const linked = await detectPuzzle('https://sudoku.coach/en/s/92wb')
  assert.equal(pasted.format, 'Sudoku Coach')
  assert.deepEqual({
    size: linked.futoshiki?.puzzle.size, givens: linked.futoshiki?.puzzle.givens,
    diagonals: linked.futoshiki?.puzzle.diagonals, exclusions: linked.futoshiki?.puzzle.exclusions,
    parity: linked.futoshiki?.puzzle.parity,
  }, {
    size: pasted.futoshiki?.puzzle.size, givens: pasted.futoshiki?.puzzle.givens,
    diagonals: pasted.futoshiki?.puzzle.diagonals, exclusions: pasted.futoshiki?.puzzle.exclusions,
    parity: pasted.futoshiki?.puzzle.parity,
  })
  const puzzle = pasted.futoshiki!.puzzle
  assert.deepEqual(puzzle.diagonals, ['anti', 'main'])
  assert.ok(puzzle.exclusions.includes('anti-king'))
  assert.deepEqual([...new Set(puzzle.parity.map(rule => rule.parity))], ['odd', 'even'])
  const solved = solveLatin(puzzle)
  assert.equal(solved.status, 'unique')
  assert.equal(solved.solution?.join(''), kingXSolution)
  assert.equal(checkLatin(puzzle, solved.solution!).complete, true)
})

const diagonals = [
  { id: 'main', type: 'diagonalNegative', settings: {}, segments: [] },
  { id: 'anti', type: 'diagonalPositive', settings: {}, segments: [] },
]

test('Futoshiki Coach import and saved definition retain both diagonal directions', async () => {
  const code = coachCode({
    gridSize: 4, regions: [], givenDigits: '0000000000000000',
    givenConstraints: [
      ...diagonals,
      { id: 'inequality', type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    ],
  })
  const imported = await detectPuzzle(code)
  const entry = imported.futoshiki!
  assert.deepEqual(entry.puzzle.diagonals, ['main', 'anti'])
  assert.ok(entry.puzzle.rules.some(rule => rule.label === 'Main diagonal'))
  assert.ok(entry.puzzle.rules.some(rule => rule.label === 'Anti diagonal'))
  const values = Array(16).fill(0)
  values[0] = values[15] = 1
  assert.ok(checkLatin(entry.puzzle, values).conflicts.some(rule => rule.label === 'Main diagonal'))
  assert.deepEqual(readImportedFutoshiki(entry.id)?.puzzle.diagonals, ['main', 'anti'])
})

test('Calcudoku Coach import and saved definition retain both diagonal directions', async () => {
  const latin = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]
  const code = coachCode({
    gridSize: 4, regions: [], givenDigits: '0000000000000000',
    givenConstraints: [
      ...diagonals,
      { id: 'cages', type: 'cage', settings: {}, segments: latin.map((sum, cell) => ({ cells: [cell], parameters: { sum } })) },
    ],
  })
  const imported = await detectPuzzle(code)
  const entry = imported.calcudoku!
  assert.deepEqual(entry.puzzle.diagonals, ['main', 'anti'])
  assert.ok(entry.puzzle.rules.some(rule => rule.label === 'Main diagonal'))
  assert.ok(entry.puzzle.rules.some(rule => rule.label === 'Anti diagonal'))
  assert.deepEqual(readImportedCalcudoku(entry.id)?.puzzle.diagonals, ['main', 'anti'])
})

test('boxless Futoshiki and Calcudoku imports retain Anti-King, line families, and extrema', async () => {
  const layers = [
    ...diagonals,
    { id: 'antiKnight', type: 'antiKnight', settings: {}, segments: [] },
    { id: 'antiKing', type: 'antiKing', settings: {}, segments: [] },
    { id: 'nonconsecutive', type: 'nonconsecutive', settings: {}, segments: [] },
    { id: 'thermometer', type: 'thermometer', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
    { id: 'renban', type: 'renban', settings: {}, segments: [{ cells: [6, 7, 8], parameters: {} }] },
    { id: 'entropic', type: 'entropicLine', settings: {}, segments: [{ cells: [12, 13, 14], parameters: {} }] },
    { id: 'modular', type: 'modularLine', settings: {}, segments: [{ cells: [18, 19, 20], parameters: {} }] },
    { id: 'between', type: 'betweenLine', settings: {}, segments: [{ cells: [24, 25, 26], parameters: {} }] },
    { id: 'lockout', type: 'lockoutLine', settings: {}, segments: [{ cells: [30, 31, 32], parameters: {} }] },
    { id: 'arrow', type: 'arrow', settings: {}, segments: [{ cells: [3, 4, 5], parameters: {} }] },
    { id: 'minimum', type: 'minimum', settings: {}, segments: [{ cells: [8], parameters: {} }, { cells: [9], parameters: {} }] },
    { id: 'maximum', type: 'maximum', settings: {}, segments: [{ cells: [26], parameters: {} }] },
  ]
  const code = coachCode({
    gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
    givenConstraints: [
      ...layers,
      { id: 'inequality', type: 'greaterLess', settings: {}, segments: [{ cells: [33, 34], parameters: {} }] },
    ],
  })
  const imported = await detectPuzzle(code)
  const entry = imported.futoshiki!
  assert.deepEqual(entry.puzzle.diagonals, ['main', 'anti'])
  assert.deepEqual(entry.puzzle.exclusions, ['anti-knight', 'anti-king', 'nonconsecutive'])
  assert.deepEqual(entry.puzzle.lines?.map(line => line.type), [
    'thermometer', 'renban', 'entropic', 'modular', 'between', 'lockout', 'arrow',
  ])
  assert.deepEqual(entry.puzzle.extrema?.map(rule => [rule.type, rule.cells]), [
    ['minimum', [8, 9]], ['maximum', [26]],
  ])
  const restored = readImportedFutoshiki(entry.id)!.puzzle
  assert.deepEqual(restored.diagonals, entry.puzzle.diagonals)
  assert.deepEqual(restored.exclusions, entry.puzzle.exclusions)
  assert.deepEqual(restored.lines?.map(line => line.type), entry.puzzle.lines?.map(line => line.type))
  assert.deepEqual(restored.extrema, entry.puzzle.extrema)
  const knightConflict = Array(36).fill(0)
  knightConflict[0] = knightConflict[13] = 1
  assert.ok(checkLatin(entry.puzzle, knightConflict).conflicts.some(rule => rule.kind === 'anti-knight'))
})

test('Calcudoku imports retain boxless rule families through the shared number-puzzle codec', async () => {
  const cages = Array.from({ length: 36 }, (_, cell) => ({ cells: [cell], parameters: { sum: cell % 6 + 1 } }))
  const code = coachCode({
    gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
    givenConstraints: [
      ...diagonals,
      { id: 'antiKnight', type: 'antiKnight', settings: {}, segments: [] },
      { id: 'antiKing', type: 'antiKing', settings: {}, segments: [] },
      { id: 'nonconsecutive', type: 'nonconsecutive', settings: {}, segments: [] },
      { id: 'thermometer', type: 'thermometer', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
      { id: 'modular', type: 'modularLine', settings: {}, segments: [{ cells: [12, 13, 14], parameters: {} }] },
      { id: 'minimum', type: 'minimum', settings: {}, segments: [{ cells: [8], parameters: {} }] },
      { id: 'maximum', type: 'maximum', settings: {}, segments: [{ cells: [26], parameters: {} }] },
      { id: 'cages', type: 'cage', settings: {}, segments: cages },
    ],
  })
  const imported = await detectPuzzle(code)
  const entry = imported.calcudoku!
  assert.deepEqual(entry.puzzle.diagonals, ['main', 'anti'])
  assert.deepEqual(entry.puzzle.exclusions, ['anti-knight', 'anti-king', 'nonconsecutive'])
  assert.deepEqual(entry.puzzle.lines?.map(line => line.type), ['thermometer', 'modular'])
  assert.deepEqual(entry.puzzle.extrema?.map(rule => [rule.type, rule.cells]), [
    ['minimum', [8]], ['maximum', [26]],
  ])
  const restored = readImportedCalcudoku(entry.id)!.puzzle
  assert.deepEqual(restored.diagonals, entry.puzzle.diagonals)
  assert.deepEqual(restored.exclusions, entry.puzzle.exclusions)
  assert.deepEqual(restored.lines?.map(line => line.type), entry.puzzle.lines?.map(line => line.type))
  assert.deepEqual(restored.extrema, entry.puzzle.extrema)
})

test('a cosmetic Calcudoku label without an operation keeps a hidden-operation cage', async () => {
  const hiddenCells = [7, 13, 14]
  const code = coachCode({
    gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
    givenConstraints: [
      { id: 'cages', type: 'cage', settings: {}, segments: Array.from({ length: 36 }, (_, cell) => cell)
        .filter(cell => !hiddenCells.includes(cell)).map(cell => ({ cells: [cell], parameters: { sum: 1 } })) },
      { id: 'cosmeticCage', type: 'cosmeticCage', settings: {}, segments: [
        { cells: hiddenCells, parameters: { sum: '6' } },
      ] },
    ],
  })
  const imported = await detectPuzzle(code)
  assert.deepEqual(imported.calcudoku?.puzzle.cages.find(cage => cage.operator === 'hidden'), {
    cells: hiddenCells, target: 6, operator: 'hidden',
  })
})

test('the exact boxless 6×6 Coach Calcudoku preserves its blank cage operation, given, colors and unique completion', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/coach-calcudoku.json', import.meta.url), 'utf8')) as {
    code: string; solution: string
  }
  const imported = await detectPuzzle(source.code)
  const entry = imported.calcudoku!
  assert.equal(entry.puzzle.size, 6)
  assert.deepEqual(entry.puzzle.givens.flatMap((digit, cell) => digit ? [[cell, digit]] : []), [[34, 4]])
  assert.equal(entry.puzzle.cages.length, 14)
  assert.equal(entry.puzzle.cages.reduce((count, cage) => count + cage.cells.length, 0), 35)
  assert.deepEqual(entry.puzzle.cages.find(cage => cage.operator === 'hidden'), {
    cells: [8, 14, 15], target: 6, operator: 'hidden',
  })
  assert.equal(Object.keys(entry.givenCellColors ?? {}).length, 26)
  assert.deepEqual(entry.givenCellColors?.[3], ['grey'])
  assert.deepEqual(entry.givenCellColors?.[30], ['blue'])
  const restored = readImportedCalcudoku(entry.id)!
  assert.deepEqual(restored.givenCellColors, entry.givenCellColors)
  assert.deepEqual(restored.puzzle.cages, entry.puzzle.cages)
  const solved = solveLatin(entry.puzzle)
  assert.equal(solved.status, 'unique')
  assert.equal(solved.solution?.join(''), source.solution)
  assert.equal(checkLatin(entry.puzzle, solved.solution!).complete, true)
})

test('boxless Coach imports reject unknown fields on active clue layers and segments', async () => {
  const cases = [
    coachCode({
      gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
      givenConstraints: [{ type: 'greaterLess', settings: {}, futureRule: true,
        segments: [{ cells: [0, 1], parameters: {} }] }],
    }),
    coachCode({
      gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
      givenConstraints: [{ type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {}, futureRule: true }] }],
    }),
    coachCode({
      gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
      givenConstraints: [{ type: 'cage', settings: {}, segments: Array.from({ length: 36 }, (_, cell) => ({
        cells: [cell], parameters: { sum: 1 }, ...(cell === 0 ? { futureRule: true } : {}),
      })) }],
    }),
    coachCode({
      gridSize: 9, regions: Array.from({ length: 81 }, (_, cell) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)),
      givenDigits: '0'.repeat(81),
      givenConstraints: [{ type: 'diagonalNegative', settings: {}, segments: [], futureRule: true }],
    }),
  ]
  for (const code of cases) await assert.rejects(detectPuzzle(code), /unsupported|invalid/)
})

test('Non-con 🍱 keeps its Non-Consecutive exception, Minimum clues, cages, regions and completion', async () => {
  const imported = await detectPuzzle(nonconBento.coach)
  const puzzle = imported.variant!.puzzle
  const nonconsecutive = puzzle.rules?.find(rule => rule.type === 'non-consecutive')
  assert.deepEqual(nonconsecutive, { type: 'non-consecutive', except: [[2, 11]] })
  assert.deepEqual(puzzle.rules?.find(rule => rule.type === 'minimum'), {
    type: 'minimum', cells: [70, 60], ignoreMarkedNeighbors: true,
  })
  assert.equal(puzzle.regions?.type, 'partial')
  assert.equal(puzzle.rules?.some(rule => rule.type === 'killer-cages'), true)
  assertVariantCompletion(puzzle, nonconBento.solution)
  const portable = await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle })))
  assert.deepEqual(portable.variant?.puzzle, puzzle)
})

test('a boxless Coach Latin puzzle with only anti-moves and lines uses the Futoshiki engine', async () => {
  const code = coachCode({
    gridSize: 5, regions: [], givenDigits: '0'.repeat(25),
    givenConstraints: [
      { id: 'antiKing', type: 'antiKing', settings: {}, segments: [] },
      { id: 'entropic', type: 'entropicLine', settings: {}, segments: [
        { cells: [0, 1], parameters: {} }, { cells: [5, 6], parameters: {} },
        { cells: [12, 13], parameters: {} }, { cells: [18, 19], parameters: {} },
      ] },
      { id: 'modular', type: 'modularLine', settings: {}, segments: [
        { cells: [2, 3], parameters: {} }, { cells: [20, 21], parameters: {} },
      ] },
    ],
  })
  const imported = await detectPuzzle(code)
  const puzzle = imported.futoshiki!.puzzle
  assert.equal(puzzle.size, 5)
  assert.deepEqual(puzzle.exclusions, ['anti-king'])
  assert.deepEqual(puzzle.lines?.map(line => line.type), ['entropic', 'entropic', 'entropic', 'entropic', 'modular', 'modular'])
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki!.id)?.puzzle.lines?.map(line => line.type), puzzle.lines?.map(line => line.type))
})

test('boxless Non-Consecutive imports preserve white-dot exceptions through save and reload', async () => {
  const code = coachCode({
    gridSize: 6, regions: [], givenDigits: '0'.repeat(36),
    givenConstraints: [
      { id: 'nonconsecutive', type: 'nonconsecutive', settings: {}, segments: [] },
      { id: 'white-dot', type: 'difference', settings: {}, segments: [{ cells: [2, 8], parameters: {} }] },
      { id: 'inequality', type: 'greaterLess', settings: {}, segments: [{ cells: [12, 13], parameters: {} }] },
    ],
  })
  const imported = await detectPuzzle(code)
  const entry = imported.futoshiki!
  assert.deepEqual(entry.puzzle.exclusions, [{ type: 'nonconsecutive', except: [[2, 8]] }])
  const values = Array(36).fill(0)
  values[2] = 1
  values[8] = 2
  assert.equal(checkLatin(entry.puzzle, values).conflicts.some(rule => rule.label.includes('R1C3 and R2C3')), false)
  values[0] = 1
  values[1] = 2
  assert.equal(checkLatin(entry.puzzle, values).conflicts.some(rule => rule.label.includes('Non-Consecutive: R1C1 and R1C2')), true)
  assert.deepEqual(readImportedFutoshiki(entry.id)?.puzzle.exclusions, entry.puzzle.exclusions)
})
