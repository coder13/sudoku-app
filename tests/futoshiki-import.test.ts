import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
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

test('an explicit boxless Latin square can be imported without inequality marks', async () => {
  const givens = '0234234134124123'
  for (const givenConstraints of [undefined, [], [{ type: 'greaterLess', segments: [], settings: {} }]]) {
    const preview = await preparePlayableImport(coachCode({ gridSize: 4, regions: [], givenDigits: givens, givenConstraints }))
    assert.ok('futoshiki' in preview)
    assert.deepEqual(preview.futoshiki.puzzle.inequalities, [])
    assert.equal(solveLatin(preview.futoshiki.puzzle).solution?.join(''), '1234234134124123')
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
    ...base, givenConstraints: [...withEdges([0, 1]).givenConstraints, { type: 'cage', segments: [{ cells: [2, 3], parameters: { sum: 3 } }] }],
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
