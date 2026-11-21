import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const { url, publication } = JSON.parse(readFileSync(
  new URL('./fixtures/coach-boxless-extra-regions.json', import.meta.url), 'utf8',
))
const region = (cells: number[][]) => ({
  type: 'region', segments: cells.map(cells => ({ cells, parameters: {} })),
})
const fourByFour = '0034341200434321'
const solution = '1234341221434321'

test('the published Sudoku Enigma keeps all seventeen overlapping regions and their center colors', async ({ mock }) => {
  let page = publication
  mock.method(globalThis, 'fetch', (input: string) => input === url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: page }) + '</script>'))
    : worker.fetch(new Request(new URL(input, 'https://sudoku.example')), {}, {}))
  const imported = await preparePlayableImport(url)
  assert.ok('futoshiki' in imported)
  const { id, puzzle, annotations } = imported.futoshiki
  const centers = Object.entries(annotations!.givenColors!).map(([cell, colors]) => {
    assert.deepEqual(colors, ['grey'])
    return Number(cell)
  })
  const squares = centers.map(center => [-10, -9, -8, -1, 0, 1, 8, 9, 10].map(offset => center + offset).join(','))
  const authored = puzzle.extraRegions!.map(cells => cells.slice().sort((a, b) => a - b).join(','))
  assert.equal(squares.length, 17)
  assert.deepEqual(authored.sort(), squares.sort())
  const pasted = await detectPuzzle(publication.sudoku)
  assert.equal(pasted.futoshiki?.id, id)
  const restored = readImportedFutoshiki(id)!
  assert.deepEqual(restored.puzzle.extraRegions, puzzle.extraRegions)
  assert.deepEqual(restored.annotations, annotations)
  assert.equal(solveLatin(restored.puzzle).solution?.join(''), publication.solution)

  const values = Array<number>(81).fill(0)
  const digits = Array.from(publication.solution as string, Number)
  let regionProofs = 0
  for (let remaining = puzzle.givens.filter(value => !value).length; remaining > 0;) {
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.length)
    for (const { cell, value, rules } of hints) {
      assert.equal(values[cell], 0)
      assert.equal(value, digits[cell])
      values[cell] = value
      remaining--
      if (rules.some(rule => rule.kind === 'extra-region')) regionProofs++
    }
  }
  assert.ok(regionProofs > 0)
  assert.ok(checkLatin(puzzle, values).complete)

  page = { ...publication, description: publication.description + '\nDigits in red regions can repeat.' }
  await assert.rejects(preparePlayableImport(url), /author instructions/)
  page = { ...publication, sudoku: coachCode({ gridSize: 4, regions: [], givenDigits: fourByFour,
    givenConstraints: [region([[0, 7]])] }) }
  await assert.rejects(preparePlayableImport(url), /author instructions/)
})

test('a smaller extra region combines with full regions, cages, a Thermometer and saved digits', async () => {
  const cells = [[0, 4, 5, 7], [0, 7], [4, 10]]
  const code = coachCode({
    gridSize: 4, regions: [], givenDigits: fourByFour, userDigits: '1000000000000000',
    givenConstraints: [
      { type: 'cosmeticCage', segments: [{ cells: [2, 6], parameters: { sum: '4+' } }] },
      { type: 'thermometer', segments: [{ cells: [4, 5] }] },
      region(cells),
    ],
  })
  const imported = await preparePlayableImport(code)
  assert.ok('calcudoku' in imported)
  const restored = readImportedCalcudoku(imported.calcudoku.id)!
  assert.equal(restored.initialPosition?.values[0], 1)
  assert.deepEqual(restored.puzzle.extraRegions, cells)
  assert.deepEqual(restored.puzzle.pathClues, [{ type: 'thermometer', cells: [4, 5] }])
  assert.equal(solveLatin(restored.puzzle).solution?.join(''), solution)
  const wrong = [2, ...Array<number>(15).fill(0)]
  const check = checkLatin(restored.puzzle, wrong)
  assert.deepEqual(check.conflicts.map(rule => rule.cells), cells.slice(0, 2))
  assert.equal(readImportedCalcudoku(imported.calcudoku.id.replace(/\.r[0-9a-z]+/, '.r20000')), undefined)
})

test('a partial 7 × 7 region forbids repeats without requiring all seven digits', async () => {
  const cells = [0, 8]
  const code = coachCode({ gridSize: 7, regions: [], givenConstraints: [region([cells])] })
  const { futoshiki } = await detectPuzzle(code)
  assert.ok(futoshiki)
  const puzzle = readImportedFutoshiki(futoshiki.id)!.puzzle
  const values = Array<number>(49).fill(0)
  assert.deepEqual(checkLatin(puzzle, values).conflicts, [])
  values[0] = 1
  values[8] = 1
  assert.deepEqual(checkLatin(puzzle, values).conflicts.map(rule => rule.cells), [cells])
  values[8] = 7
  assert.deepEqual(checkLatin(puzzle, values).conflicts, [])
  assert.equal(readImportedFutoshiki(futoshiki.id.slice(0, -1)), undefined)
  const unsupported = coachCode({ gridSize: 7, regions: [], givenConstraints: [{ ...region([cells]), settings: { allowRepeats: true } }] })
  await assert.rejects(detectPuzzle(unsupported), /extra region uses unsupported settings/)
  for (const cells of [[0, 0], [0, 49], [0, 1, 2, 3, 4, 5, 6, 7]]) {
    await assert.rejects(detectPuzzle(coachCode({ gridSize: 7, regions: [], givenConstraints: [region([cells])] })), /invalid extra region/)
  }
})
