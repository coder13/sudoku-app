import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

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
