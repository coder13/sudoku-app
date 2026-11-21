import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { createFutoshiki } from '../src/futoshiki/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const { url, publication } = JSON.parse(readFileSync(new URL('./fixtures/coach-boxless-paths.json', import.meta.url), 'utf8'))

test('the published Too simple? short link has a unique solution and explains every placement', async ({ mock }) => {
  let page = publication
  mock.method(globalThis, 'fetch', (input: string) => input === url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: page }) + '</script>'))
    : worker.fetch(new Request(new URL(input, 'https://sudoku.example')), {}, {}))

  const imported = await preparePlayableImport(url)
  assert.ok('futoshiki' in imported)
  const { id, puzzle } = imported.futoshiki
  assert.equal(puzzle.pathClues?.filter(line => line.type === 'palindrome').length, 8)
  assert.equal(puzzle.pathClues?.filter(line => line.type === 'consecutive').length, 7)
  assert.deepEqual(readImportedFutoshiki(id)?.puzzle.pathClues, puzzle.pathClues)
  assert.equal(readImportedFutoshiki(id.slice(0, -1)), undefined)

  const exact = solveLatin(puzzle)
  assert.equal(exact.status, 'unique')
  assert.equal(exact.solution?.join(''), publication.solution)
  const digits = Array.from(publication.solution as string, Number)
  const values = Array<number>(81).fill(0)
  const [first] = findLatinSolutionHints(puzzle, values)
  assert.equal(first.cell, 66)
  assert.equal(first.value, 6)
  assert.deepEqual(first.trace?.map(branch => branch.assumption), [
    'If R8C4 is 4, the rules lead to a conflict.',
    'If R8C4 is 5, the rules lead to a conflict.',
  ])
  for (const branch of first.trace ?? []) {
    assert.ok(branch.steps.some(step => step.includes('Palindrome Line')))
    const wrong = values.slice()
    wrong[first.cell] = Number(branch.assumption.match(/is (\d)/)![1])
    assert.equal(solveLatin(puzzle, wrong).status, 'unsolvable')
  }
  for (let remaining = 80; remaining > 0;) {
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.length)
    for (const { cell, value } of hints) {
      assert.equal(values[cell], 0)
      assert.equal(value, digits[cell])
      values[cell] = value
      remaining--
    }
  }
  assert.ok(checkLatin(puzzle, values).complete)
  page = { ...publication, description: publication.description + '\nDigits on green lines may repeat.' }
  await assert.rejects(preparePlayableImport(url), /author instructions/)
})

const segment = (cells: number[]) => ({ cells, parameters: {} })
const line = (type: string, paths: number[][]) => ({ type, segments: paths.map(segment) })

test('Calcudoku composes connected paths with cages and preserves the authored segments in portable links', async () => {
  const source = coachCode({
    gridSize: 3, regions: [], givenDigits: '100000000', userDigits: '120000000',
    givenConstraints: [
      { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] },
      line('consecutiveLine', [[1, 0], [1, 2]]),
      line('palindromeLine', [[1, 8], [8, 3]]),
    ],
  })
  const imported = await preparePlayableImport(source)
  assert.ok('calcudoku' in imported)
  const saved = readImportedCalcudoku(imported.calcudoku.id)!
  assert.deepEqual(saved.puzzle.pathClues, [
    { type: 'consecutive', cells: [1, 0, 2], segments: [[1, 0], [1, 2]] },
    { type: 'palindrome', cells: [1, 8, 3], segments: [[1, 8], [8, 3]] },
  ])
  assert.equal(saved.initialPosition?.values[1], 2)
  assert.equal(solveLatin(saved.puzzle).solution?.join(''), '123231312')
  assert.ok(checkLatin(saved.puzzle, [1, 2, 1]).conflicts.some(rule => rule.kind === 'consecutive'))
  assert.ok(checkLatin(saved.puzzle, [1, 2, 3, 3]).conflicts.some(rule => rule.kind === 'palindrome'))
  assert.equal(readImportedCalcudoku(imported.calcudoku.id.replace('.l', '.q')), undefined)
})

test('Consecutive Line refuses turns in value, branches, and out-of-range paths', async () => {
  const path = { type: 'consecutive' as const, cells: [0, 5, 10] }
  const puzzle = createFutoshiki(4, Array(16).fill(0), [], { pathClues: [path] })
  const values = (a: number, b: number, c: number) => [a, 0, 0, 0, 0, b, 0, 0, 0, 0, c]
  for (const valuesInOrder of [values(1, 2, 3), values(4, 3, 2)]) assert.deepEqual(checkLatin(puzzle, valuesInOrder).conflicts, [])
  for (const valuesOutOfOrder of [values(1, 2, 1), values(2, 1, 2), values(1, 3, 2)]) {
    assert.deepEqual(checkLatin(puzzle, valuesOutOfOrder).conflicts.map(rule => rule.kind), ['consecutive'])
  }
  const input = (paths: number[][]) => coachCode({
    gridSize: 4, regions: [], givenConstraints: [line('consecutiveLine', paths)],
  })
  await assert.rejects(preparePlayableImport(input([[0, 5], [5, 10], [5, 6]])), /no solution/)
  await assert.rejects(preparePlayableImport(input([[0, 16]])), /invalid line segment/)
  await assert.rejects(preparePlayableImport(input([[0, 0]])), /invalid line clues/)
})

test('strict Thermometers compose with inequality signs and arithmetic cages in native Coach exports', async () => {
  const thermometers = { ...line('thermometer', [[0, 1, 2], [0, 3]]), settings: { bulbSize: 0.72 } }
  const inequality = line('greaterLess', [[3, 4]])
  const cage = { type: 'cosmeticCage', segments: [{ cells: [3, 4], parameters: { sum: '5+' } }] }
  const code = (...givenConstraints: unknown[]) => coachCode({ gridSize: 3, regions: [], givenConstraints })
  const futoshiki = await preparePlayableImport(code(thermometers, inequality))
  const calcudoku = await preparePlayableImport(code(thermometers, cage))
  assert.ok('futoshiki' in futoshiki)
  assert.ok('calcudoku' in calcudoku)
  assert.deepEqual(readImportedFutoshiki(futoshiki.futoshiki.id)?.puzzle.pathClues, futoshiki.futoshiki.puzzle.pathClues)
  assert.deepEqual(readImportedCalcudoku(calcudoku.calcudoku.id)?.puzzle.pathClues, calcudoku.calcudoku.puzzle.pathClues)
  for (const { puzzle } of [futoshiki.futoshiki, calcudoku.calcudoku]) {
    assert.deepEqual(puzzle.pathClues, [
      { type: 'thermometer', cells: [0, 1, 2] },
      { type: 'thermometer', cells: [0, 3] },
    ])
    assert.equal(solveLatin(puzzle).status, 'unique')
    assert.equal(solveLatin(puzzle).solution?.join(''), '123231312')
    assert.deepEqual(checkLatin(puzzle, [3, 2]).conflicts.map(rule => rule.kind), ['thermometer', 'thermometer'])
    const first = findLatinSolutionHints(puzzle, [])
    assert.ok(first.some(hint => hint.rules[0].kind === 'thermometer'))
  }
  await assert.rejects(preparePlayableImport(code(thermometers)), /more than one solution/)
  await assert.rejects(preparePlayableImport(code(inequality)), /more than one solution/)
  await assert.rejects(preparePlayableImport(code(cage)), /more than one solution/)
  await assert.rejects(preparePlayableImport(code(line('thermometer', [[0, 3, 0]]))), /invalid line clues/)
  await assert.rejects(preparePlayableImport(code({ ...thermometers, settings: { allowEqual: true } })), /unsupported settings/)
})

test('Thermometer rule support matches every increasing triple for all 4-digit domains', () => {
  const cells = [0, 5, 10]
  const puzzle = createFutoshiki(4, Array(16).fill(0), [], { pathClues: [{ type: 'thermometer', cells }] })
  const rule = puzzle.rules.find(rule => rule.kind === 'thermometer')!
  const domains = Array<number>(16).fill(15)
  const triples = [[1, 2, 4], [1, 2, 8], [1, 4, 8], [2, 4, 8]]
  for (let a = 0; a <= 15; a++) for (let b = 0; b <= 15; b++) for (let c = 0; c <= 15; c++) {
    const masks = [a, b, c]
    cells.forEach((cell, index) => { domains[cell] = masks[index] })
    const supported = [0, 0, 0]
    for (const triple of triples) {
      if (!triple.every((digit, index) => digit & masks[index])) continue
      triple.forEach((digit, index) => { supported[index] |= digit })
    }
    assert.deepEqual(rule.support(domains), supported[0] ? supported : null, masks.join(','))
  }
})

test('a 7 × 7 boxless puzzle with Thermometers and Arrows keeps the Sudoku route', async () => {
  const givens = Array.from({ length: 49 }, (_, cell) => (cell % 7 + Math.floor(cell / 7)) % 7 + 1).join('')
  const puzzle = await detectPuzzle(coachCode({
    gridSize: 7, regions: [], givenDigits: givens,
    givenConstraints: [line('thermometer', [[0, 1, 2]]), line('arrow', [[2, 1, 0]])],
  }))
  assert.equal(puzzle.grid?.size, 7)
  assert.deepEqual(puzzle.sizedRules, [
    { type: 'thermometer', cells: [0, 1, 2] }, { type: 'arrow', circle: 2, cells: [1, 0] },
  ])
})

test('native Coach Arrows combine with Thermometers, inequality signs, and arithmetic cages', async () => {
  const arrow = {
    ...line('arrow', [[2, 1, 0]]),
    settings: { bulbSize: 0.65, bulbBorderThickness: 2, arrowHeadLength: 10 },
  }
  const thermometer = line('thermometer', [[0, 1]])
  const inequality = line('greaterLess', [[3, 4]])
  const cage = { type: 'cosmeticCage', segments: [{ cells: [3, 4], parameters: { sum: '5+' } }] }
  const code = (...givenConstraints: unknown[]) => coachCode({ gridSize: 3, regions: [], givenConstraints })
  const futo = await preparePlayableImport(code(arrow, thermometer, inequality))
  const calc = await preparePlayableImport(code(arrow, thermometer, cage))
  assert.ok('futoshiki' in futo)
  assert.ok('calcudoku' in calc)
  const alternatives = [
    readImportedFutoshiki(futo.futoshiki.id),
    readImportedCalcudoku(calc.calcudoku.id),
  ]
  for (const entry of alternatives) {
    assert.ok(entry)
    const { puzzle } = entry
    assert.deepEqual(puzzle.pathClues, [
      { type: 'arrow', cells: [2, 1, 0] },
      { type: 'thermometer', cells: [0, 1] },
    ])
    const result = solveLatin(puzzle)
    assert.equal(result.status, 'unique')
    assert.equal(result.solution?.join(''), '123231312')
    assert.ok(checkLatin(puzzle, [0, 0, 1]).conflicts.some(rule => rule.kind === 'arrow'))
    const hint = findLatinSolutionHints(puzzle, []).find(hint => hint.cell === 2)
    assert.equal(hint?.value, 3)
    assert.ok(hint?.rules.some(rule => rule.kind === 'arrow'))
  }
  for (const extra of [inequality, cage]) {
    await assert.rejects(preparePlayableImport(code(thermometer, extra)), /more than one solution/)
    await assert.rejects(preparePlayableImport(code(arrow, extra)), /more than one solution/)
  }
  await assert.rejects(preparePlayableImport(code(line('arrow', [[2]]))), /invalid line clues/)
  await assert.rejects(preparePlayableImport(code(line('arrow', [[2, 1, 1]]))), /invalid line clues/)
  await assert.rejects(preparePlayableImport(code(line('arrow', [[2, 1, 9]]))), /invalid line clues/)
  await assert.rejects(preparePlayableImport(code({ ...arrow, settings: { base: 0 } })), /unsupported settings/)
})

test('Arrows allow repeated digits in cells that share neither a row nor a column', async () => {
  const solution = '1234234134124123'
  const imported = await preparePlayableImport(coachCode({
    gridSize: 4, regions: [], givenDigits: '1034234134124123',
    givenConstraints: [line('arrow', [[1, 7, 10]])],
  }))
  assert.ok('futoshiki' in imported)
  const puzzle = imported.futoshiki.puzzle
  assert.equal(solveLatin(puzzle).solution?.join(''), solution)
  assert.ok(checkLatin(puzzle, [...solution].map(Number)).complete)
})

test('Arrow rule support matches every assignment for all 4-digit domains', () => {
  const cells = [0, 5, 10]
  const puzzle = createFutoshiki(4, Array(16).fill(0), [], { pathClues: [{ type: 'arrow', cells }] })
  const rule = puzzle.rules.find(rule => rule.kind === 'arrow')!
  const domains = Array<number>(16).fill(15)
  const allowed = [
    [2, 1, 1], [4, 1, 2], [4, 2, 1], [8, 1, 4], [8, 2, 2], [8, 4, 1],
  ]
  for (let a = 0; a <= 15; a++) for (let b = 0; b <= 15; b++) for (let c = 0; c <= 15; c++) {
    const masks = [a, b, c]
    cells.forEach((cell, index) => { domains[cell] = masks[index] })
    const supported = [0, 0, 0]
    for (const assignment of allowed) {
      if (!assignment.every((digit, index) => digit & masks[index])) continue
      assignment.forEach((digit, index) => { supported[index] |= digit })
    }
    assert.deepEqual(rule.support(domains), supported[0] ? supported : null, masks.join(','))
  }
})

test('native Coach Renban connects segments and combines with an inequality or arithmetic cage', async () => {
  const renban = { ...line('renban', [[1, 0], [0, 4]]), settings: { lineThickness: 14 } }
  const inequality = line('greaterLess', [[1, 2]])
  const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }
  const code = (...givenConstraints: unknown[]) => coachCode({ gridSize: 3, regions: [], givenDigits: '100000000', givenConstraints })
  const futoshiki = await preparePlayableImport(code(renban, inequality))
  const calcudoku = await preparePlayableImport(code(renban, cage))
  assert.ok('futoshiki' in futoshiki)
  assert.ok('calcudoku' in calcudoku)
  for (const entry of [readImportedFutoshiki(futoshiki.futoshiki.id), readImportedCalcudoku(calcudoku.calcudoku.id)]) {
    assert.ok(entry)
    const { puzzle } = entry
    assert.deepEqual(puzzle.pathClues, [{ type: 'renban', cells: [1, 0, 4], segments: [[1, 0], [0, 4]] }])
    const result = solveLatin(puzzle)
    assert.equal(result.status, 'unique')
    // The line reads 2, 1, 3 in drawing order.
    assert.equal(result.solution?.join(''), '123231312')
    assert.ok(checkLatin(puzzle, result.solution!).complete)
    assert.ok(checkLatin(puzzle, [0, 0, 0, 0, 1]).conflicts.some(rule => rule.kind === 'renban'))
    const hint = findLatinSolutionHints(puzzle, []).find(move => move.cell === 4)
    assert.equal(hint?.value, 3)
    assert.equal(hint?.rules[0].kind, 'renban')
  }
  const separate = await preparePlayableImport(code(renban, line('renban', [[1, 2]]), inequality))
  assert.ok('futoshiki' in separate)
  assert.deepEqual(separate.futoshiki.puzzle.pathClues?.map(rule => rule.cells), [[1, 0, 4], [1, 2]])
  for (const layer of [renban, inequality, cage]) {
    await assert.rejects(preparePlayableImport(code(layer)), /more than one solution/)
  }
  await assert.rejects(preparePlayableImport(code(line('renban', [[0, 9]]))), /invalid line segment/)
  await assert.rejects(preparePlayableImport(code({ ...renban, settings: { allowRepeats: true } })), /unsupported settings/)
})

test('Renban rule support matches every ordering of a consecutive set on all 4-digit domains', () => {
  const cells = [0, 5, 10]
  const puzzle = createFutoshiki(4, Array(16).fill(0), [], { pathClues: [{ type: 'renban', cells }] })
  const rule = puzzle.rules.find(rule => rule.kind === 'renban')!
  const domains = Array<number>(16).fill(15)
  const assignments = [[1, 2, 4], [2, 4, 8]].flatMap(set =>
    set.flatMap(first => set.filter(second => second !== first).map(second =>
      [first, second, set.find(third => third !== first && third !== second)!])))
  for (let a = 0; a <= 15; a++) for (let b = 0; b <= 15; b++) for (let c = 0; c <= 15; c++) {
    const masks = [a, b, c]
    cells.forEach((cell, index) => { domains[cell] = masks[index] })
    const supported = [0, 0, 0]
    for (const assignment of assignments) {
      if (!assignment.every((digit, index) => digit & masks[index])) continue
      assignment.forEach((digit, index) => { supported[index] |= digit })
    }
    assert.deepEqual(rule.support(domains), supported[0] ? supported : null, masks.join(','))
  }
})

test('a 7 × 7 boxless puzzle with Renban keeps the existing Sudoku route', async () => {
  const givens = Array.from({ length: 49 }, (_, cell) => (cell % 7 + Math.floor(cell / 7)) % 7 + 1).join('')
  const puzzle = await detectPuzzle(coachCode({
    gridSize: 7, regions: [], givenDigits: givens, givenConstraints: [line('renban', [[1, 0], [0, 2]])],
  }))
  assert.equal(puzzle.grid?.size, 7)
  assert.deepEqual(puzzle.sizedRules, [{ type: 'renban', cells: [1, 0, 2], segments: [[1, 0], [0, 2]] }])
})
