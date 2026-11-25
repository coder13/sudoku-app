import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { solveLatin, checkLatin } from '../src/latin/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
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

test('boxless Coach cell colors reject explicitly until the Latin-square flow can retain them', async () => {
  const givenColours = Array(16).fill('').map((value, cell) => cell === 0 ? '0' : value).join(',')
  await assert.rejects(detectPuzzle(coachCode({
    gridSize: 4, regions: [], givenDigits: '1234341221434321',
    colours: ['red'], givenColours,
  })), /cell colors that the Latin-square import cannot preserve/)
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
