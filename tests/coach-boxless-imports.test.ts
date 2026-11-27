import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { solveLatin, checkLatin } from '../src/latin/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { encodeImportedNumberPuzzle } from '../src/number-puzzles/imported-codec.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import worker from '../cloudflare/pages/_worker.js'
import { coachCode } from './helpers/coach-code.ts'

const modular = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-modular.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
const noncon = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-noncon.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
const diagonal = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-boxless-diagonal.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#480/#481 import the original boxless 5×5 puzzle and preserve its exact answer', async () => {
  const imported = await detectPuzzle(modular.code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.exclusions, ['anti-king'])
  assert.deepEqual(imported.futoshiki.puzzle.lines, [
    { type: 'modular', cells: [0, 5, 11, 16, 15] },
    { type: 'modular', cells: [17, 18, 13, 7, 2] },
    { type: 'entropic', cells: [0, 1], groups: [[1, 2, 3], [4, 5]] },
    { type: 'entropic', cells: [7, 6], groups: [[1, 2, 3], [4, 5]] },
    { type: 'entropic', cells: [11, 12], groups: [[1, 2, 3], [4, 5]] },
    { type: 'entropic', cells: [21, 22], groups: [[1, 2, 3], [4, 5]] },
  ])
  const result = solveLatin(imported.futoshiki.puzzle)
  assert.equal(result.status, 'unique')
  assert.equal(result.solution?.join(''), modular.solution)
  const reloaded = readImportedFutoshiki(imported.futoshiki.id)
  assert.deepEqual(reloaded?.puzzle.lines, imported.futoshiki.puzzle.lines)
  assert.deepEqual(reloaded?.puzzle.exclusions, imported.futoshiki.puzzle.exclusions)
  assert.equal(checkLatin(imported.futoshiki.puzzle, [...modular.solution].map(Number)).complete, true)
})

test('boxless Futoshiki imports a Ratio clue into the Latin engine and portable definition', async () => {
  const dots = [
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'ratio', settings: {}, segments: [{ cells: [1, 2], parameters: {} }] },
  ]
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: dots }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.consecutive?.pairs, [[0, 1]])
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.ratioTwo?.pairs, [[1, 2]])
  const solved = solveLatin(imported.futoshiki.puzzle)
  assert.equal(solved.status, 'multiple')
  assert.ok(solved.solution)
  assert.equal(Math.max(solved.solution[1], solved.solution[2]), 2 * Math.min(solved.solution[1], solved.solution[2]))
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  assert.equal(checkLatin(imported.futoshiki.puzzle, [...'1234341221434321'].map(Number)).complete, false)
})

test('boxless Coach combines Futoshiki inequalities with both Kropki relations', async () => {
  const solution = [...'1234341221434321'].map(Number)
  const code = coachCode({ gridSize: 4, regions: [], givenDigits: solution.join(''), givenConstraints: [
    { type: 'greaterLess', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'ratio', settings: {}, segments: [{ cells: [1, 5], parameters: {} }] },
  ] })
  const imported = await detectPuzzle(code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.inequalities, [{ less: 0, greater: 1 }])
  assert.deepEqual(imported.futoshiki.puzzle.kropki, {
    consecutive: { pairs: [[0, 1]], negative: false }, ratioTwo: { pairs: [[1, 5]], negative: false },
  })
  assert.equal(solveLatin(imported.futoshiki.puzzle).status, 'unique')
  assert.equal(checkLatin(imported.futoshiki.puzzle, solution).complete, true)
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  const preview = await prepareImportedPuzzle(code)
  assert.deepEqual(preview.futoshiki?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
})

test('boxless Coach keeps coincident white and black dots as independent rules', async () => {
  const code = coachCode({ gridSize: 4, regions: [], givenDigits: '1234341221434321', givenConstraints: [
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'ratio', settings: {}, segments: [{ cells: [1, 0], parameters: {} }] },
  ] })
  const imported = await detectPuzzle(code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki, {
    consecutive: { pairs: [[0, 1]], negative: false },
    ratioTwo: { pairs: [[0, 1]], negative: false },
  })
  assert.equal(checkLatin(imported.futoshiki.puzzle, [...'1234341221434321'].map(Number)).complete, true)

  const incompatible = Array<number>(16).fill(0)
  incompatible[0] = 2
  incompatible[1] = 3
  const conflicts = checkLatin(imported.futoshiki.puzzle, incompatible).conflicts
  assert.equal(conflicts.filter(rule => rule.kind === 'kropki').length, 2)
  assert.ok(conflicts.filter(rule => rule.kind === 'kropki').every(rule => rule.cells.join(',') === '0,1'))
})

test('boxless Calcudoku composes a Ratio clue with arithmetic cages in the Latin engine', async () => {
  const dots = [
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'ratio', settings: {}, segments: [{ cells: [1, 2], parameters: {} }] },
  ]
  const cages = Array.from({ length: 4 }, (_, row) => ({ cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
    parameters: { sum: 10 } }))
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16),
    givenConstraints: [...dots, { type: 'cage', settings: {}, segments: cages }] }))
  assert.ok(imported.calcudoku)
  assert.deepEqual(imported.calcudoku.puzzle.kropki?.consecutive?.pairs, [[0, 1]])
  assert.deepEqual(imported.calcudoku.puzzle.kropki?.ratioTwo?.pairs, [[1, 2]])
  const solved = solveLatin(imported.calcudoku.puzzle)
  assert.equal(solved.status, 'multiple')
  assert.ok(solved.solution)
  assert.equal(Math.max(solved.solution[1], solved.solution[2]), 2 * Math.min(solved.solution[1], solved.solution[2]))
  assert.deepEqual(readImportedCalcudoku(imported.calcudoku.id)?.puzzle.kropki, imported.calcudoku.puzzle.kropki)
  assert.equal(checkLatin(imported.calcudoku.puzzle, [...'1234341221434321'].map(Number)).complete, false)
  const preview = await prepareImportedPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '1243341243212134',
    givenConstraints: [...dots, { type: 'cage', settings: {}, segments: cages }] }))
  assert.deepEqual(preview.calcudoku?.puzzle.kropki, imported.calcudoku.puzzle.kropki)
})

test('boxless Coach negative Ratio excludes matching unmarked orthogonal edges', async () => {
  const ratio = { type: 'ratio', settings: { negativeConstraint: true },
    segments: [{ cells: [0, 1], parameters: {} }] }
  const solution = [...'1234341221434321'].map(Number)
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [ratio] }))
  assert.ok(imported.futoshiki)
  assert.equal(imported.futoshiki.puzzle.kropki?.ratioTwo?.negative, true)
  assert.equal(checkLatin(imported.futoshiki.puzzle, solution).complete, false)
  assert.ok(checkLatin(imported.futoshiki.puzzle, solution).conflicts.some(rule => rule.kind === 'kropki'))
})

test('boxless Coach preserves independent exclusions from split negative Kropki layers', async () => {
  const difference = (cells: number[]) => ({ type: 'difference', settings: { negativeConstraint: true },
    segments: [{ cells, parameters: {} }] })
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16),
    givenConstraints: [difference([0, 1]), difference([1, 2]), difference([2, 1])] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.layers, [
    { relation: 'consecutive', pairs: [[0, 1]], negative: true },
    { relation: 'consecutive', pairs: [[1, 2]], negative: true },
    { relation: 'consecutive', pairs: [[2, 1]], negative: true },
  ])
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  const assignment = Array<number>(16).fill(0)
  assignment[0] = 1
  assignment[1] = 2
  assert.ok(checkLatin(imported.futoshiki.puzzle, assignment).conflicts.some(rule => rule.kind === 'kropki'))
})

test('boxless Coach keeps positive and negative layers of the same Kropki relation independent', async () => {
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: {} }] },
    { type: 'difference', settings: { negativeConstraint: true }, segments: [{ cells: [1, 2], parameters: {} }] },
  ] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.layers, [
    { relation: 'consecutive', pairs: [[0, 1]], negative: false },
    { relation: 'consecutive', pairs: [[1, 2]], negative: true },
  ])
  const assignment = Array<number>(16).fill(0)
  assignment[0] = 1
  assignment[1] = 2
  assert.equal(checkLatin(imported.futoshiki.puzzle, assignment).conflicts.filter(rule => rule.kind === 'kropki').length, 1)
})

test('boxless Coach merges positive numbered layers and keeps negative layers independent', async () => {
  const difference = (cells: number[], amount: number, negativeConstraint = false) => ({ type: 'difference', settings: negativeConstraint ? { negativeConstraint } : {},
    segments: [{ cells, parameters: { difference: amount } }] })
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    difference([0, 1], 3), difference([2, 3], 2),
  ] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.difference, {
    pairs: [{ cells: [0, 1], value: 3 }, { cells: [2, 3], value: 2 }], negative: false,
  })
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki?.difference,
    imported.futoshiki.puzzle.kropki?.difference)
  await assert.rejects(detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    difference([0, 1], 2), difference([1, 0], 3),
  ] })), /assigns conflicting numbered Difference values to one edge/)
  const layered = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    difference([0, 1], 2), difference([2, 3], 3, true),
  ] }))
  assert.ok(layered.futoshiki)
  assert.deepEqual(layered.futoshiki.puzzle.kropki?.layers, [
    { relation: 'difference', pairs: [{ cells: [0, 1], value: 2 }], negative: false },
    { relation: 'difference', pairs: [{ cells: [2, 3], value: 3 }], negative: true },
  ])
})

test('boxless Coach retains an empty negative Ratio layer beside numbered marks', async () => {
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: [] },
    { type: 'ratio', settings: {}, segments: [{ cells: [0, 1], parameters: { ratio: 3 } }] },
  ] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.layers, [
    { relation: 'ratio', pairs: [], negative: true },
    { relation: 'ratio', pairs: [{ cells: [0, 1], value: 3 }], negative: false },
  ])
  const ratioThree = Array<number>(16).fill(0)
  ratioThree[0] = 1
  ratioThree[1] = 3
  assert.equal(checkLatin(imported.futoshiki.puzzle, ratioThree).conflicts.some(rule => rule.kind === 'labeled-dots'), false)
  const ratioTwo = [...ratioThree]
  ratioTwo[1] = 2
  assert.ok(checkLatin(imported.futoshiki.puzzle, ratioTwo).conflicts.some(rule => rule.kind === 'labeled-dots'))

  const cages = Array.from({ length: 4 }, (_, row) => ({ cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
    parameters: { sum: 10 } }))
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: [] },
    { type: 'ratio', settings: {}, segments: [{ cells: [0, 1], parameters: { ratio: 3 } }] },
    { type: 'cage', settings: {}, segments: cages },
  ] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.kropki?.layers, imported.futoshiki.puzzle.kropki?.layers)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.kropki, calcudoku.calcudoku.puzzle.kropki)
})

test('boxless Coach retains an empty negative Difference layer beside numbered marks', async () => {
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: true }, segments: [] },
    { type: 'difference', settings: {}, segments: [{ cells: [0, 1], parameters: { difference: 3 } }] },
  ] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.layers, [
    { relation: 'difference', pairs: [], negative: true },
    { relation: 'difference', pairs: [{ cells: [0, 1], value: 3 }], negative: false },
  ])

  const differenceOne = Array<number>(16).fill(0)
  differenceOne[2] = 1
  differenceOne[3] = 4
  differenceOne[4] = 2
  differenceOne[5] = 3
  assert.ok(checkLatin(imported.futoshiki.puzzle, differenceOne).conflicts.some(rule => rule.kind === 'labeled-dots'))

  const markedDifferenceThree = [...differenceOne]
  markedDifferenceThree[4] = 0
  markedDifferenceThree[5] = 0
  assert.equal(checkLatin(imported.futoshiki.puzzle, markedDifferenceThree).conflicts.some(rule => rule.kind === 'labeled-dots'), false)
})

test('boxless Coach preserves large repeated negative Difference layer sets', async () => {
  const layers = Array.from({ length: 128 }, () => ({
    type: 'difference', settings: { negativeConstraint: true }, segments: [],
  }))
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: layers }))
  assert.ok(imported.futoshiki)
  assert.equal(imported.futoshiki.puzzle.kropki?.layers?.length, layers.length)
  assert.equal(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki?.layers?.length, layers.length)
  assert.equal(imported.futoshiki.puzzle.rules.filter(rule => rule.label.startsWith('The unmarked edge')).length, 24)

  const forbiddenEdge = Array<number>(16).fill(0)
  forbiddenEdge[0] = 1
  forbiddenEdge[1] = 2
  assert.ok(checkLatin(imported.futoshiki.puzzle, forbiddenEdge).conflicts.some(rule => rule.kind === 'kropki'))
})

test('boxless Coach numbered Difference and Ratio clues use their exact values in the Latin engine', async () => {
  const solution = [...'1324324124134132'].map(Number)
  const constraints = [
    { type: 'ratio', settings: {}, segments: [{ cells: [1, 0], parameters: { ratio: 3 } }] },
    { type: 'difference', settings: {}, segments: [{ cells: [2, 3], parameters: { difference: 2 } }] },
  ]
  const code = coachCode({ gridSize: 4, regions: [], givenDigits: solution.join(''), givenConstraints: constraints })
  const imported = await detectPuzzle(code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.kropki, {
    difference: { pairs: [{ cells: [2, 3], value: 2 }], negative: false },
    ratio: { pairs: [{ cells: [0, 1], value: 3 }], negative: false },
  })
  assert.equal(checkLatin(imported.futoshiki.puzzle, solution).complete, true)
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  const preview = await prepareImportedPuzzle(code)
  assert.deepEqual(preview.futoshiki?.puzzle.kropki, imported.futoshiki.puzzle.kropki)

  const cages = Array.from({ length: 4 }, (_, row) => ({ cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
    parameters: { sum: 10 } }))
  const calcudokuCode = coachCode({ gridSize: 4, regions: [], givenDigits: solution.join(''), givenConstraints: [
    ...constraints, { type: 'cage', settings: {}, segments: cages },
  ] })
  const calcudoku = await detectPuzzle(calcudokuCode)
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, solution).complete, true)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.kropki, imported.futoshiki.puzzle.kropki)
  const calcudokuPreview = await prepareImportedPuzzle(calcudokuCode)
  assert.deepEqual(calcudokuPreview.calcudoku?.puzzle.kropki, imported.futoshiki.puzzle.kropki)

  const blank = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [constraints[0]] }))
  assert.ok(blank.futoshiki)
  const markedRatio = Array<number>(16).fill(0)
  markedRatio[0] = 1
  markedRatio[1] = 3
  assert.equal(checkLatin(blank.futoshiki.puzzle, markedRatio).conflicts.filter(rule => rule.kind === 'labeled-dots').length, 0)
  const wrongRatio = [...markedRatio]
  wrongRatio[1] = 2
  assert.ok(checkLatin(blank.futoshiki.puzzle, wrongRatio).conflicts.some(rule => rule.kind === 'labeled-dots'))

  const negative = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: true }, segments: [{ cells: [2, 3], parameters: { difference: 2 } }] },
  ] }))
  assert.ok(negative.futoshiki)
  const wrongNegative = Array<number>(16).fill(0)
  wrongNegative[6] = 1
  wrongNegative[7] = 2
  assert.ok(checkLatin(negative.futoshiki.puzzle, wrongNegative).conflicts.some(rule => rule.kind === 'labeled-dots'))
  wrongNegative[7] = 3
  assert.equal(checkLatin(negative.futoshiki.puzzle, wrongNegative).conflicts.some(rule => rule.kind === 'labeled-dots'), false)
})

test('boxless Calcudoku merges default and numbered marks within the same relation', async () => {
  const solution = [...'1234341221434321'].map(Number)
  const cages = Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), parameters: { sum: 10 },
  }))
  const constraints = [
    { type: 'difference', settings: {}, segments: [
      { cells: [0, 1], parameters: { difference: 1 } },
      { cells: [0, 4], parameters: { difference: 2 } },
    ] },
    { type: 'ratio', settings: {}, segments: [
      { cells: [3, 7], parameters: { ratio: 2 } },
      { cells: [0, 4], parameters: { ratio: 3 } },
    ] },
  ]
  const code = coachCode({ gridSize: 4, regions: [], givenDigits: solution.join(''), givenConstraints: [
    ...constraints, { type: 'cage', settings: {}, segments: cages },
  ] })
  const imported = await detectPuzzle(code)
  assert.ok(imported.calcudoku)
  assert.deepEqual(imported.calcudoku.puzzle.kropki, {
    difference: { pairs: [{ cells: [0, 1], value: 1 }, { cells: [0, 4], value: 2 }], negative: false },
    ratio: { pairs: [{ cells: [3, 7], value: 2 }, { cells: [0, 4], value: 3 }], negative: false },
  })
  assert.equal(checkLatin(imported.calcudoku.puzzle, solution).complete, true)
  assert.deepEqual(readImportedCalcudoku(imported.calcudoku.id)?.puzzle.kropki, imported.calcudoku.puzzle.kropki)
  const preview = await prepareImportedPuzzle(code)
  assert.deepEqual(preview.calcudoku?.puzzle.kropki, imported.calcudoku.puzzle.kropki)

  const blank = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    ...constraints, { type: 'cage', settings: {}, segments: cages },
  ] }))
  assert.ok(blank.calcudoku)
  const solved = solveLatin(blank.calcudoku.puzzle).solution
  assert.ok(solved)
  assert.equal(checkLatin(blank.calcudoku.puzzle, solved).complete, true)
})

test('boxless Coach keeps default Difference exceptions with numbered Difference and Non-Consecutive', async () => {
  const imported = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: '0'.repeat(16), givenConstraints: [
    { type: 'nonconsecutive', settings: {}, segments: [] },
    { type: 'difference', settings: {}, segments: [
      { cells: [0, 1], parameters: { difference: 1 } },
      { cells: [2, 3], parameters: { difference: 3 } },
    ] },
  ] }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.exclusions, [{ type: 'nonconsecutive', except: [[0, 1]] }])
  assert.deepEqual(imported.futoshiki.puzzle.kropki?.difference, {
    pairs: [{ cells: [0, 1], value: 1 }, { cells: [2, 3], value: 3 }], negative: false,
  })
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.exclusions, imported.futoshiki.puzzle.exclusions)
})

test('#483/#484 import the original Non-con exception and both Minimum cells', async () => {
  const imported = await detectPuzzle(noncon.code)
  assert.ok(imported.variant)
  const rules = imported.variant.puzzle.rules ?? []
  assert.deepEqual(rules.find(rule => rule.type === 'non-consecutive'), {
    type: 'non-consecutive', except: [[2, 11]],
  })
  assert.deepEqual(rules.find(rule => rule.type === 'minimum'), {
    type: 'minimum', cells: [70, 60], ignoreMarkedNeighbors: true,
  })
  assert.equal(rules.filter(rule => rule.type === 'pill-arrow').length, 3)
  assert.equal(rules.filter(rule => rule.type === 'arrow').length, 4)
  assert.equal(rules.filter(rule => rule.type === 'entropic').length, 2)
  assert.equal(rules.filter(rule => rule.type === 'quadruple').length, 4)
  assert.equal(rules.filter(rule => rule.type === 'killer-cages').flatMap(rule => rule.type === 'killer-cages' ? rule.cages : []).length, 3)
  assert.equal(noncon.solution.length, 81)
})

test('#483/#484 open the published Non-con short link without dropping its full rule set', async ({ mock }) => {
  const url = 'https://sudoku.coach/en/s/FWUv'
  let description = 'In bento puzzles, the regions (boxes containing 9 cells with numbers 1 to 9) are defined by the box outlines. For more info about bento puzzles, see my profile.'
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'FWUv', sudoku: noncon.code, name: 'Non-con 🍱', blocked: false,
    custom_constraints: false,
    get description() { return description },
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === url
    ? Promise.resolve(new Response(page()))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(url)
  const pasted = await detectPuzzle(noncon.code)
  assert.equal(linked.title, 'Non-con 🍱')
  assert.deepEqual(linked.variant?.puzzle.rules, pasted.variant?.puzzle.rules)
  description += ' The center row must contain exactly two shaded cells.'
  await assert.rejects(detectPuzzle(url), /author instructions/i)
})

test('#479 imports the original boxless King X diagonals and companion clues', async () => {
  const imported = await detectPuzzle(diagonal.code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.diagonals, ['anti', 'main'])
  assert.deepEqual(imported.futoshiki.puzzle.exclusions, ['anti-king'])
  assert.equal(imported.futoshiki.puzzle.parity.filter(rule => rule.parity === 'odd').length, 3)
  assert.equal(imported.futoshiki.puzzle.parity.filter(rule => rule.parity === 'even').length, 10)
  assert.equal(solveLatin(imported.futoshiki.puzzle).status, 'unique')
  assert.equal(checkLatin(imported.futoshiki.puzzle, [...diagonal.solution].map(Number)).complete, true)
  const preview = await prepareImportedPuzzle(diagonal.code)
  assert.equal(preview.futoshiki?.puzzle.size, 9)
  assert.deepEqual(preview.futoshiki?.puzzle.diagonals, ['anti', 'main'])
  assert.equal(diagonal.solution.length, 81)
})

test('#479 opens the published King X short link with the same imported rules', async ({ mock }) => {
  const url = 'https://sudoku.coach/en/s/92wb'
  const page = '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: '92wb', sudoku: diagonal.code, name: 'King X', blocked: false,
    custom_constraints: false, description: '',
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === url
    ? Promise.resolve(new Response(page))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(url)
  const pasted = await detectPuzzle(diagonal.code)
  assert.equal(linked.title, 'King X')
  assert.ok(linked.futoshiki && pasted.futoshiki)
  assert.deepEqual({
    size: linked.futoshiki.puzzle.size, givens: linked.futoshiki.puzzle.givens,
    diagonals: linked.futoshiki.puzzle.diagonals, exclusions: linked.futoshiki.puzzle.exclusions,
    parity: linked.futoshiki.puzzle.parity,
  }, {
    size: pasted.futoshiki.puzzle.size, givens: pasted.futoshiki.puzzle.givens,
    diagonals: pasted.futoshiki.puzzle.diagonals, exclusions: pasted.futoshiki.puzzle.exclusions,
    parity: pasted.futoshiki.puzzle.parity,
  })
})

test('#286 imports boxless Latin squares without requiring an extra clue layer', async () => {
  for (const size of [4, 6, 7, 9]) {
    const solution = Array.from({ length: size ** 2 }, (_, cell) =>
      (Math.floor(cell / size) + cell % size) % size + 1).join('')
    const code = coachCode({
      gridSize: size, regions: [], givenDigits: solution, givenConstraints: [],
    })
    const imported = await detectPuzzle(code)
    assert.ok(imported.futoshiki, `expected ${size} × ${size} boxless Coach input to use Latin-square rules`)
    assert.equal(imported.variant, undefined)
    assert.equal(imported.futoshiki.puzzle.size, size)
    assert.equal(solveLatin(imported.futoshiki.puzzle).status, 'unique')
    assert.equal(readImportedFutoshiki(imported.futoshiki.id)?.puzzle.size, size)
    const preview = await prepareImportedPuzzle(code)
    assert.equal(preview.futoshiki?.puzzle.size, size)
    assert.deepEqual(preview.futoshiki?.puzzle.givens, [...solution].map(Number))
  }
})

test('#286 routes boxless parity-only puzzles through the Latin-square engine', async () => {
  const solution = Array.from({ length: 36 }, (_, cell) => (Math.floor(cell / 6) + cell % 6) % 6 + 1).join('')
  const imported = await detectPuzzle(coachCode({
    gridSize: 6, regions: [], givenDigits: solution,
    givenConstraints: [{ type: 'even', settings: {}, segments: [{ cells: [1], parameters: {} }] }],
  }))
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.puzzle.parity, [{ parity: 'even', cell: 1 }])
  assert.equal(solveLatin(imported.futoshiki.puzzle).status, 'unique')
})

test('#477 enforces two-cell Entropic Lines in boxless Futoshiki and Calcudoku puzzles', async () => {
  const lines = [{ type: 'entropicLine', settings: {}, segments: [
    { cells: [0, 1], parameters: {} }, { cells: [12, 15], parameters: {} },
  ] }]
  const givens = '0'.repeat(16)
  const code = coachCode({ gridSize: 4, regions: [], givenDigits: givens, givenConstraints: lines })
  const futoshiki = await detectPuzzle(code)
  assert.ok(futoshiki.futoshiki)
  const expectedLines = [
    { type: 'entropic', cells: [0, 1], groups: [[1, 2, 3], [4]] },
    { type: 'entropic', cells: [12, 15], groups: [[1, 2, 3], [4]] },
  ]
  assert.deepEqual(futoshiki.futoshiki.puzzle.lines, expectedLines)

  const invalidLatin = [...'1234341221434321'].map(Number)
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, invalidLatin).complete, false)
  const futoshikiSolution = solveLatin(futoshiki.futoshiki.puzzle).solution
  assert.ok(futoshikiSolution)
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, futoshikiSolution).complete, true)

  const cages = Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
    parameters: { sum: 10 },
  }))
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: givens,
    givenConstraints: [...lines, { type: 'cage', segments: cages }] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.lines, expectedLines)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, invalidLatin).complete, false)
  const calcudokuSolution = solveLatin(calcudoku.calcudoku.puzzle).solution
  assert.ok(calcudokuSolution)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, calcudokuSolution).complete, true)
})

test('#476 enforces Anti-Knight with boxless Futoshiki and Calcudoku rules', async () => {
  const antiKnight = [{ type: 'antiKnight', settings: {}, segments: [] }]
  const givens = '0'.repeat(16)
  const futoshiki = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: givens, givenConstraints: antiKnight }))
  assert.ok(futoshiki.futoshiki)
  assert.deepEqual(futoshiki.futoshiki.puzzle.exclusions, ['anti-knight'])

  const equalKnightDigits = [...'1234341221434321'].map(Number)
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, equalKnightDigits).complete, false)
  const futoshikiSolution = solveLatin(futoshiki.futoshiki.puzzle).solution
  assert.ok(futoshikiSolution)
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, futoshikiSolution).complete, true)

  const cages = Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column),
    parameters: { sum: 10 },
  }))
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: givens,
    givenConstraints: [...antiKnight, { type: 'cage', segments: cages }] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.exclusions, ['anti-knight'])
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, equalKnightDigits).complete, false)
  const calcudokuSolution = solveLatin(calcudoku.calcudoku.puzzle).solution
  assert.ok(calcudokuSolution)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, calcudokuSolution).complete, true)
})

test('boxless Coach Futoshiki cell colors survive import and saved-definition reload', async () => {
  const givenColours = Array(16).fill('').map((value, cell) => cell === 0 ? '0' : cell === 1 ? '1' : value).join(',')
  const code = coachCode({
    gridSize: 4, regions: [], givenDigits: '1234341221434321',
    colours: ['red', 'blue'], givenColours,
  })
  const imported = await detectPuzzle(code)
  assert.ok(imported.futoshiki)
  assert.deepEqual(imported.futoshiki.givenCellColors, { 0: ['red'], 1: ['blue'] })
  assert.deepEqual(readImportedFutoshiki(imported.futoshiki.id)?.givenCellColors, imported.futoshiki.givenCellColors)
  const preview = await prepareImportedPuzzle(code)
  assert.deepEqual(preview.futoshiki?.givenCellColors, imported.futoshiki.givenCellColors)
  assert.equal(readImportedFutoshiki(encodeImportedNumberPuzzle('f1', {
    size: 4, givens: '1234341221434321', inequalities: [], parity: [], givenCellColors: { 16: ['red'] },
  })), undefined)
})

test('#456/#459/#460 keep Coach Thermometers, Arrows, and Renban rules in boxless Futoshiki and Calcudoku', async () => {
  const givens = '1234341221434321'
  const lines = [
    { type: 'thermometer', segments: [{ cells: [0, 1, 2], parameters: {} }] },
    { type: 'thermometer', segments: [{ cells: [0, 5], parameters: {} }] },
    { type: 'renban', segments: [{ cells: [0, 1, 2], parameters: {} }] },
    { type: 'arrow', segments: [{ cells: [2, 1, 0], parameters: {} }] },
  ]
  const futoshiki = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: givens,
    givenConstraints: [...lines, { type: 'greaterLess', segments: [{ cells: [0, 1], parameters: {} }] }] }))
  assert.ok(futoshiki.futoshiki)
  assert.deepEqual(futoshiki.futoshiki.puzzle.lines, [
    { type: 'thermometer', cells: [0, 1, 2] },
    { type: 'thermometer', cells: [0, 5] },
    { type: 'renban', cells: [0, 1, 2] },
    { type: 'arrow', circle: 2, cells: [1, 0] },
  ])
  assert.equal(solveLatin(futoshiki.futoshiki.puzzle).status, 'unique')
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, [...givens].map(Number)).complete, true)
  assert.deepEqual(readImportedFutoshiki(futoshiki.futoshiki.id)?.puzzle.lines, futoshiki.futoshiki.puzzle.lines)

  const cages = [...givens].map((digit, cell) => ({ cells: [cell], parameters: { sum: Number(digit) } }))
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 4, regions: [], givenDigits: givens,
    givenConstraints: [...lines, { type: 'cage', segments: cages }] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.lines, futoshiki.futoshiki.puzzle.lines)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, [...givens].map(Number)).complete, true)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.lines, calcudoku.calcudoku.puzzle.lines)
})

test('#461/#462 keep boxless Lockout and Between paths active with inequality and cage rules', async () => {
  const givens = '123456456123234561561234345612612345'
  const lines = [
    { type: 'lockoutLine', segments: [{ cells: [15, 16, 17], parameters: {} }] },
    { type: 'betweenLine', segments: [{ cells: [0, 1, 2], parameters: {} }] },
  ]
  const futoshiki = await detectPuzzle(coachCode({ gridSize: 6, regions: [], givenDigits: givens,
    givenConstraints: [...lines, { type: 'greaterLess', segments: [{ cells: [0, 1], parameters: {} }] }] }))
  assert.ok(futoshiki.futoshiki)
  assert.deepEqual(futoshiki.futoshiki.puzzle.lines, [
    { type: 'lockout', cells: [15, 16, 17], minDifference: 4 },
    { type: 'between', cells: [0, 1, 2] },
  ])
  assert.equal(solveLatin(futoshiki.futoshiki.puzzle).status, 'unique')
  assert.equal(checkLatin(futoshiki.futoshiki.puzzle, [...givens].map(Number)).complete, true)
  assert.deepEqual(readImportedFutoshiki(futoshiki.futoshiki.id)?.puzzle.lines, futoshiki.futoshiki.puzzle.lines)

  const cages = [...givens].map((digit, cell) => ({ cells: [cell], parameters: { sum: Number(digit) } }))
  const calcudoku = await detectPuzzle(coachCode({ gridSize: 6, regions: [], givenDigits: givens,
    givenConstraints: [...lines, { type: 'cage', segments: cages }] }))
  assert.ok(calcudoku.calcudoku)
  assert.deepEqual(calcudoku.calcudoku.puzzle.lines, futoshiki.futoshiki.puzzle.lines)
  assert.equal(checkLatin(calcudoku.calcudoku.puzzle, [...givens].map(Number)).complete, true)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.lines, calcudoku.calcudoku.puzzle.lines)
})

test('#480/#481 open the original modular 5×5 short link with all its lines', async ({ mock }) => {
  const url = 'https://sudoku.coach/en/s/7hzU'
  let description = 'Thin lines = entropic, thick = modular'
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: '7hzU', sudoku: modular.code, name: 'kicking modular lines while they\'re down',
    blocked: false, custom_constraints: false, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === url
    ? Promise.resolve(new Response(page()))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(url)
  const pasted = await detectPuzzle(modular.code)
  assert.equal(linked.title, 'kicking modular lines while they\'re down')
  assert.deepEqual(linked.futoshiki?.puzzle.lines, pasted.futoshiki?.puzzle.lines)
  assert.deepEqual(linked.futoshiki?.puzzle.exclusions, pasted.futoshiki?.puzzle.exclusions)
  description += '\nThe center digit must be odd.'
  await assert.rejects(detectPuzzle(url), /5 × 5 Jigsaw grid|author instructions/i)
})
