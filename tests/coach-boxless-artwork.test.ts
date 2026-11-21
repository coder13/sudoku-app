import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, solveLatin } from '../src/latin/engine.ts'
import { hasPlayerNumberAnnotations } from '../src/number-puzzles/imported-annotations.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'

const bento = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8')).examples
  .find((example: { url: string }) => example.url.endsWith('/FLAb'))
const paths = [
  [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [6, 4], [6, 5], [6, 6], [6, 7], [6, 8], [6, 9]],
  [[6, 0], [6, 1], [6, 2], [6, 3], [7, 3], [8, 3], [9, 3]],
  [[3, 3], [3, 2], [3, 1], [3, 0]],
]
const line = {
  type: 'cosmeticLine',
  settings: { colour: '#2255aa', opacity: 102, lineThickness: 14, borderColour: '#ffffff', borderThickness: 4 },
  segments: [{ cells: [[0, 2], [2, 2], [2, 4]], parameters: {} }],
}
const givens = '1234214334124321'
const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }
const source = (givenConstraints: unknown[]) => coachCode({ gridSize: 4, regions: [], givenDigits: givens, givenConstraints })

test('the live publication fixture uses every Bento layer through the short-link worker and portable Play', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const publication = {
    sudoku_id: 'FLAb', sudoku: bento.code, name: bento.title, description: bento.description, custom_constraints: false, blocked: false,
  }
  mock.method(globalThis, 'fetch', (input: string, init?: RequestInit) => input === bento.url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: publication }) + '</script>'))
    : fetcher(input, init))
  try {
    const original = await preparePlayableImport(bento.url)
    assert.ok('futoshiki' in original)
    const raw = await preparePlayableImport(bento.code)
    assert.ok('futoshiki' in raw)
    assert.equal(original.futoshiki.id, raw.futoshiki.id)
    const restored = readImportedFutoshiki(original.futoshiki.id)!
    assert.deepEqual(restored.annotations?.authoredPaths,
      paths.map(points => ({ type: 'corner-path', points, thickness: .08, color: '#000000', opacity: 1 })))
    assert.equal(hasPlayerNumberAnnotations(restored.annotations), false)
    const exact = solveLatin(restored.puzzle)
    assert.equal(exact.status, 'unique')
    assert.equal(exact.solution?.join(''), bento.solution)

    const description = publication.description
    publication.description += '\nDigits touching an outline must be odd.'
    await assert.rejects(preparePlayableImport(bento.url), /has author instructions/)
    publication.description = description
    publication.sudoku = source([line])
    await assert.rejects(preparePlayableImport(bento.url), /has author instructions/)
  } finally { sqlite.close() }
})

test('styled corner paths round-trip in Calcudoku and leave the typed rules intact', async () => {
  const original = await preparePlayableImport(source([cage, line]))
  assert.ok('calcudoku' in original)
  const restored = readImportedCalcudoku(original.calcudoku.id)!
  assert.deepEqual(restored.annotations, {
    authoredPaths: [{
      type: 'corner-path', points: [[0, 2], [2, 2], [2, 4]], thickness: .14, color: '#2255aa', opacity: .4,
      border: { color: '#ffffff', thickness: .04 },
    }],
  })
  assert.equal(restored.puzzle.cages[0].target, 3)
  assert.equal(checkLatin(restored.puzzle, []).complete, true)
  assert.equal(restored.initialPosition, undefined)
  const badData = [null, null, null, null, null, [{ ...restored.annotations!.authoredPaths![0], points: [[0, 2], [5, 2]] }]]
  const badToken = btoa(JSON.stringify(badData)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  assert.equal(readImportedCalcudoku(restored.id.replace(/\.a[^.]+$/, '.a' + badToken)), undefined)
})

test('authored line import rejects unsupported geometry and settings', async () => {
  for (const cells of [[[0, 0], [5, 2]], [[.5, .5], [2, 2]], [[1, 1]]]) {
    await assert.rejects(detectPuzzle(source([{ ...line, segments: [{ cells }] }])), /grid corners inside the grid/)
  }
  await assert.rejects(detectPuzzle(source([{ ...line, settings: { ...line.settings, lineEndOffset: 10 } }])), /unsupported authored line settings/)
})
