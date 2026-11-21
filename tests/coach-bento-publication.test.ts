import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { checkLatin, solveLatin } from '../src/latin/engine.ts'
import { regionsInsideArtwork } from '../src/number-puzzles/authored-region-borders.ts'
import type { AuthoredCornerPath } from '../src/sudoku/authored-artwork.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const { url, publication } = JSON.parse(readFileSync(new URL('./fixtures/coach-funky-bento-ii.json', import.meta.url), 'utf8'))
const squareAt = (first: number) => Array.from({ length: 9 }, (_, index) => first + Math.floor(index / 3) * 9 + index % 3)
const expectedRegions = [0, 3, 6, 28, 31, 56, 59].map(squareAt)

test('FUN-ky Bento II uses all seven typed regions and all eight outlines from its short link', async ({ mock }) => {
  let page = publication
  mock.method(globalThis, 'fetch', (input: string) => input === url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: page }) + '</script>'))
    : worker.fetch(new Request(new URL(input, 'https://sudoku.example')), {}, {}))
  const short = await preparePlayableImport(url)
  const raw = await preparePlayableImport(publication.sudoku)
  assert.ok('calcudoku' in short && 'calcudoku' in raw)
  assert.equal(short.calcudoku.id, raw.calcudoku.id)
  const restored = readImportedCalcudoku(short.calcudoku.id)!
  const { puzzle, annotations } = restored
  const typedRegions = (puzzle.extraRegions ?? []).map(cells => [...cells].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
  assert.deepEqual(typedRegions, expectedRegions)
  assert.equal(annotations?.authoredPaths?.length, 8)
  const compartments = regionsInsideArtwork(9, annotations!.authoredPaths!)
  assert.deepEqual(compartments.filter(cells => expectedRegions.some(square => square[0] === cells[0])), expectedRegions)
  assert.deepEqual(compartments.filter(cells => !expectedRegions.some(square => square[0] === cells[0])), [
    [27, 36, 45, 54, 55, 63, 64, 72, 73],
    [34, 35, 43, 44, 52, 53, 62, 71, 80],
  ])
  assert.deepEqual(puzzle.cages.map(cage => cage.target).sort((a, b) => a - b), [5, 10, 11, 15])
  assert.equal(puzzle.quadruples?.length, 4)
  assert.equal(puzzle.adjacentClues?.marks.length, 8)
  assert.deepEqual(new Set(puzzle.pathClues?.map(clue => clue.type)), new Set(['lockout', 'pill-arrow', 'renban', 'thermometer']))

  const partial = Array<number>(81).fill(0)
  partial[0] = partial[10] = 4
  partial[27] = partial[55] = 2
  assert.deepEqual(checkLatin(puzzle, partial).conflicts.filter(rule => rule.kind === 'extra-region').map(rule => rule.cells),
    [puzzle.extraRegions![0]])

  const digits = Array.from(publication.solution as string, Number)
  assert.equal(checkLatin(puzzle, digits).complete, true)
  const result = solveLatin(puzzle)
  assert.equal(result.status, 'unique')
  assert.deepEqual(result.solution, digits)

  page = { ...publication, description: publication.description + '\nThe other areas also have distinct digits.' }
  await assert.rejects(preparePlayableImport(url), /has author instructions/)
  page = { ...publication, sudoku: coachCode({ gridSize: 4, regions: [], givenDigits: '1234341221434321' }) }
  await assert.rejects(preparePlayableImport(url), /has author instructions/)
  page = { ...publication, custom_constraints: false }
  await assert.rejects(preparePlayableImport(url), /has author instructions/)
})

test('partial, diagonal and transparent art leaves the normal region outline available', () => {
  const art = (points: AuthoredCornerPath['points'], opacity = 1): AuthoredCornerPath =>
    ({ type: 'corner-path', points, opacity, color: '#000000', thickness: .05 })
  const region = [0, 1, 4, 5]
  const first = art([[2, 0], [2, 2]])
  for (const second of [art([[2, 2], [1, 2]]), art([[2, 2], [0, 1]]), art([[2, 2], [0, 2]], 0)]) {
    assert.ok(!regionsInsideArtwork(4, [first, second]).some(cells => cells.join(',') === region.join(',')))
  }
  assert.deepEqual(regionsInsideArtwork(4, [first, art([[2, 2], [0, 2]])])[0], region)
})
