import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { importedFutoshikiToken, readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode, coachWholeProgress } from './helpers/coach-code.ts'

type Source = { code: string; givens: string; edges: [number, number][] }
const fixtures: Record<string, Source> = JSON.parse(readFileSync(new URL('./fixtures/futoshiki-coach.json', import.meta.url), 'utf8'))

for (const [name, { code, givens, edges }] of Object.entries(fixtures)) {
  test(`Sudoku Coach ${name} code and play link keep Futoshiki givens and inequality directions`, async () => {
    const { futoshiki } = await detectPuzzle(code)
    assert.ok(futoshiki)
    assert.equal(futoshiki.puzzle.givens.join(''), givens)
    assert.deepEqual(futoshiki.puzzle.inequalities, edges.map(([less, greater]) => ({ less, greater })))
    const preview = await preparePlayableImport(`https://sudoku.coach/en/play/${code}`)
    assert.ok('futoshiki' in preview)
    assert.equal(preview.futoshiki.id, futoshiki.id)
    const reopened = readImportedFutoshiki(futoshiki.id)
    assert.ok(reopened)
    const { solution, status } = solveLatin(reopened.puzzle)
    assert.equal(status, 'unique')
    assert.ok(solution)
    for (const [less, greater] of edges) assert.ok(solution[less] < solution[greater])
  })
}

for (const size of [3, 7, 8, 9]) {
  test(`${size} × ${size} Coach Futoshiki puzzles keep signs and progress in portable links`, async () => {
    const solved = Array.from({ length: size ** 2 }, (_, cell) => (cell % size + Math.floor(cell / size) + 1) % size + 1)
    const last = solved.length - 1
    const edges = [[last - 1, last], [last - size, last]]
    const code = coachCode({
      gridSize: size, regions: [], givenDigits: solved.slice(0, last).join('') + '0',
      givenConstraints: [{ type: 'greaterLess', segments: edges.map(cells => ({ cells })) }],
      userDigits: '0'.repeat(last) + solved[last],
      userCellCandidates: [...Array(last).fill(0), 1 << size].join('-'),
      colours: ['blue'], userColours: ','.repeat(last) + '0',
    })
    const preview = await preparePlayableImport(code)
    assert.ok('futoshiki' in preview)
    const { id, puzzle, initialPosition, annotations } = preview.futoshiki
    assert.equal(puzzle.size, size)
    assert.equal(id.split('.')[0], size > 6 ? 'f2' : 'f1')
    assert.deepEqual(puzzle.inequalities, edges.map(([less, greater]) => ({ less, greater })))
    assert.equal(solveLatin(puzzle).solution?.join(''), solved.join(''))
    assert.equal(initialPosition?.values[last], size)
    assert.equal(initialPosition?.notes[last], 1 << (size - 1))
    assert.deepEqual(annotations?.cellColors, { [last]: ['blue'] })
    assert.equal(importedFutoshikiToken(id), id)
    const reopened = readImportedFutoshiki(id)
    assert.deepEqual(reopened?.initialPosition, initialPosition)
    assert.deepEqual(reopened?.annotations, annotations)
    assert.deepEqual(solveLatin(reopened!.puzzle).solution, solved)
    assert.deepEqual(reopened?.puzzle.inequalities, [...puzzle.inequalities].reverse())
    const [version, givens, signs] = id.split('.')
    assert.equal(readImportedFutoshiki(`${version}.${givens}.${signs}0`), undefined)
    assert.equal(readImportedFutoshiki(`${size > 6 ? 'f1' : 'f2'}.${givens}.${signs}`), undefined)
  })
}

test('imports a 9 × 9 puzzle from the Sudoku Coach Whole Progress clipboard', async () => {
  const code = readFileSync(new URL('./fixtures/futoshiki-coach-9x9.txt', import.meta.url), 'utf8')
  const preview = await preparePlayableImport(code)
  assert.ok('futoshiki' in preview)
  const { id, puzzle } = preview.futoshiki
  assert.match(id, /^f2\./)
  assert.equal(puzzle.size, 9)
  assert.deepEqual(puzzle.inequalities, [{ less: 71, greater: 80 }, { less: 79, greater: 80 }])
  assert.equal(solveLatin(readImportedFutoshiki(id)!.puzzle).solution?.[80], 9)
})

test('a fully marked 9 × 9 board fits in a portable Futoshiki link', async () => {
  const size = 9
  const solved = Array.from({ length: size ** 2 }, (_, cell) => (cell % size + Math.floor(cell / size)) % size + 1)
  const edges = solved.flatMap((digit, cell) => [
    ...(cell % size < size - 1 ? [cell + 1] : []),
    ...(cell < size * (size - 1) ? [cell + size] : []),
  ].map(other => digit < solved[other] ? [cell, other] : [other, cell]))
  const { futoshiki } = await detectPuzzle(coachCode({
    gridSize: size, regions: [], givenDigits: '0'.repeat(size ** 2),
    givenConstraints: [{ type: 'greaterLess', segments: edges.map(cells => ({ cells })) }],
  }))
  assert.ok(futoshiki)
  const reopened = readImportedFutoshiki(futoshiki.id)
  assert.equal(reopened?.puzzle.inequalities.length, 144)
  assert.equal(solveLatin(reopened!.puzzle).solution?.join(''), solved.join(''))
  const [version, givens, signs] = futoshiki.id.split('.')
  assert.equal(readImportedFutoshiki(`${version}.${givens}.${signs}0001`), undefined)
})

test('an existing 7 × 7 boxless Sudoku keeps its route', async () => {
  const puzzle = await detectPuzzle(coachCode({
    gridSize: 7, regions: [], givenDigits: '0'.repeat(49), givenConstraints: [],
  }))
  assert.equal(puzzle.futoshiki, undefined)
  assert.deepEqual(puzzle.grid, { size: 7, noRegions: true })
})

test('an explicit boxless Latin square can be imported without inequality marks', async () => {
  for (const size of [3, 4, 5, 6, 7, 8, 9]) {
    const solved = Array.from({ length: size ** 2 }, (_, cell) => (cell % size + Math.floor(cell / size)) % size + 1).join('')
    const givens = '0' + solved.slice(1)
    const givenConstraints = [{ type: 'greaterLess', segments: [], settings: {} }]
    const preview = await preparePlayableImport(coachCode({ gridSize: size, regions: [], givenDigits: givens, givenConstraints }))
    assert.ok('futoshiki' in preview)
    assert.deepEqual(preview.futoshiki.puzzle.inequalities, [])
    assert.equal(solveLatin(preview.futoshiki.puzzle).solution?.join(''), solved)
  }
})

test('the standalone importer rejects invalid, ambiguous and unhandled rules', async () => {
  const size = 4
  const base = { gridSize: size, regions: [], givenDigits: '0'.repeat(size * size) }
  const withEdges = (...edges: [number, number][]) => ({
    ...base, givenConstraints: [{ type: 'greaterLess', segments: edges.map(cells => ({ cells })) }],
  })
  await assert.rejects(preparePlayableImport(coachCode(base)), /more than one solution/)
  await assert.rejects(preparePlayableImport(coachCode(withEdges([3, 4]))), /adjacent cells/)
  await assert.rejects(preparePlayableImport(coachCode(withEdges([0, 1], [1, 0]))), /one inequality per cell edge/)
  await assert.rejects(preparePlayableImport(coachCode({ ...base, givenDigits: '1150000000000000' })), /invalid givens/)
  await assert.rejects(preparePlayableImport(coachCode({ ...base, givenDigits: '1100000000000000' })), /no solution/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...base, givenConstraints: [
      ...withEdges([0, 1]).givenConstraints,
      { type: 'cage', segments: [{ cells: [2, 3], parameters: { sum: 3 } }] },
      { type: 'antiKing', segments: [] },
    ],
  })), /unsupported rule/)
})

test('Current State keeps placed digits and both pencil mark styles in a separate portable attempt', async () => {
  const source = {
    gridSize: 4, regions: [], givenDigits: '0034234134124123',
    givenConstraints: [{ type: 'greaterLess', segments: [{ cells: [0, 1] }] }],
  }
  const progress = {
    userDigits: '1034000000000000',
    userCellCandidates: [0, 4, 0, ...Array(13).fill(0)].join('-'),
    userBoxCandidates: [0, 10, 0, ...Array(13).fill(0)].join('-'),
  }
  const plain = await preparePlayableImport(coachCode(source))
  const preview = await preparePlayableImport(coachWholeProgress([source, { ...source, ...progress }, source], 1))
  assert.ok('futoshiki' in plain && 'futoshiki' in preview)
  assert.notEqual(preview.futoshiki.id, plain.futoshiki.id)
  const initial = preview.futoshiki.initialPosition
  assert.ok(initial)
  assert.equal(initial.values.join(''), '1000000000000000')
  assert.equal(initial.notes[1], 2)
  assert.equal(initial.cornerNotes?.[1], 5)
  assert.deepEqual(readImportedFutoshiki(preview.futoshiki.id)?.initialPosition, initial)
  assert.equal(readImportedFutoshiki(preview.futoshiki.id + '00'), undefined)
  assert.deepEqual(preview.futoshiki.puzzle.givens, plain.futoshiki.puzzle.givens)
  await assert.rejects(preparePlayableImport(coachCode({ ...source, userDigits: '1040000000000000' })), /replaces a given/)
  await assert.rejects(preparePlayableImport(coachCode({ ...source, userCellCandidates: '0-2' })), /invalid candidate marks/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...source, userBoxCandidates: [32, ...Array(15).fill(0)].join('-'),
  })), /invalid candidate marks/)
})

test('imports the visible board from Coach’s native Whole Progress clipboard text', async () => {
  const code = readFileSync(new URL('./fixtures/futoshiki-coach-progress.txt', import.meta.url), 'utf8')
  const preview = await preparePlayableImport(code)
  assert.ok('futoshiki' in preview)
  assert.equal(preview.futoshiki.puzzle.givens.join(''), '0000001000000000')
  assert.equal(preview.futoshiki.initialPosition?.values.join(''), '2000000000000000')
  assert.equal(solveLatin(preview.futoshiki.puzzle).status, 'unique')
  await assert.rejects(preparePlayableImport(coachWholeProgress([], 0)), /invalid puzzle snapshot/)
  await assert.rejects(preparePlayableImport(coachWholeProgress([{ version: 8 }], 0)), /invalid puzzle snapshot/)
})

test('Futoshiki copies authored fills and player annotations into a portable attempt', async () => {
  const definition = {
    gridSize: 4, regions: [], givenDigits: '0034234134124123',
    givenConstraints: [{ type: 'greaterLess', segments: [{ cells: [0, 1] }] }],
    colours: ['green', 'blueHeavy', 'orange', '#c0ffee'],
    givenColours: '0' + ','.repeat(15),
  }
  const source = {
    ...definition, userColours: '12' + ','.repeat(15),
    userCellCandidates: [0, 4, ...Array(14).fill(0)].join('-'),
    userCellCandidatesColours: '1+2+1',
    quickDrawLineSegments: { '0.5/0.5=>1.5/1.5': { colour: 'blueHeavy' } },
    quickDrawSymbols: { '1/0.5': { shape: 'cross', colour: 'blueHeavy' } },
    cells: { 15: { quickSymbol: { shape: 'circle', colour: '#c0ffee' } } },
  }
  const original = await preparePlayableImport(coachCode(definition))
  assert.ok('futoshiki' in original)
  assert.equal(original.futoshiki.initialPosition, undefined)
  const preview = await preparePlayableImport(coachWholeProgress([definition, source], 1))
  assert.ok('futoshiki' in preview)
  const { futoshiki } = preview
  assert.deepEqual(futoshiki.annotations?.givenColors, { 0: ['green'] })
  assert.deepEqual(futoshiki.annotations?.cellColors, { 0: ['blueHeavy', 'orange'] })
  assert.deepEqual(futoshiki.annotations?.candidateColors, { 1: { 2: 'blueHeavy' } })
  assert.deepEqual(futoshiki.annotations?.drawings, [
    { shape: 'line', from: [.5, .5], to: [1.5, 1.5], color: 'blueHeavy' },
    { shape: 'cross', at: [1, .5], color: 'blueHeavy' },
    { shape: 'circle', at: [3.5, 3.5], color: '#c0ffee' },
  ])
  assert.equal(futoshiki.initialPosition?.annotationsHidden, false)
  const reopened = readImportedFutoshiki(futoshiki.id)
  assert.equal(reopened?.id, futoshiki.id)
  assert.deepEqual(reopened?.annotations, futoshiki.annotations)
  assert.deepEqual(reopened?.initialPosition, futoshiki.initialPosition)
  assert.notEqual(futoshiki.id, original.futoshiki.id)
  await assert.rejects(preparePlayableImport(coachCode({ ...source, userCellCandidatesColours: '16+2+1' })), /invalid or unsupported candidate colors/)
  await assert.rejects(preparePlayableImport(coachCode({ ...source, cells: { 16: source.cells[15] } })), /unsupported Quick Draw/)
})

test('Coach’s native Whole Progress export keeps two cell colors and a Quick Draw circle', async () => {
  const code = readFileSync(new URL('./fixtures/futoshiki-coach-annotations.txt', import.meta.url), 'utf8')
  const preview = await preparePlayableImport(code)
  assert.ok('futoshiki' in preview)
  assert.equal(preview.futoshiki.initialPosition?.values[0], 2)
  assert.deepEqual(preview.futoshiki.annotations, {
    cellColors: { 0: ['blue', 'green'] },
    drawings: [{ shape: 'circle', at: [.5, 1.5], color: 'blueHeavy' }],
  })
})
