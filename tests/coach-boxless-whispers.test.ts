import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { prepareImportedCalcudoku, readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { createImportedFutoshiki, readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-thorny-carapace.json', import.meta.url), 'utf8'))
const expected = '854637219937182645128473956781925364362749581619254837546391728295816473473568192'

test('the published Thorny Carapace short link keeps its paths, inequalities, and solution', async ({ mock }) => {
  let publication = source
  mock.method(globalThis, 'fetch', (url: string) => url === 'https://sudoku.coach/en/s/9GTz'
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: publication }) + '</script>'))
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example')), {}, {}))
  const url = 'https://sudoku.coach/en/s/9GTz'
  const imported = await preparePlayableImport(url)
  assert.ok('futoshiki' in imported)
  const { puzzle, id } = imported.futoshiki
  assert.equal(puzzle.whispers?.length, 14)
  assert.equal(puzzle.inequalities.length, 20)
  assert.ok(puzzle.whispers?.some(line => line.cells[0] === line.cells.at(-1)))
  assert.deepEqual(readImportedFutoshiki(id)?.puzzle.whispers, puzzle.whispers)
  assert.equal(readImportedFutoshiki(id + '0'), undefined)
  const result = solveLatin(puzzle)
  assert.equal(result.status, 'unique')
  assert.equal(result.solution?.join(''), expected)
  const digits = Array.from(expected, Number)
  assert.equal(checkLatin(puzzle, digits).complete, true)
  for (const line of puzzle.whispers ?? []) {
    assert.ok(line.cells.slice(1).every((cell, index) => Math.abs(digits[cell] - digits[line.cells[index]]) >= line.minDifference))
  }
  const [first] = findLatinHints(puzzle, [])
  assert.deepEqual([first.cell, first.value], [22, 7])
  assert.equal(first.rules[0].kind, 'contradiction')
  assert.ok(first.trace?.[0].steps.some(step => step.includes('Whispers')))
  assert.match(first.trace?.[0].conclusion ?? '', /Row 4 has no cell for 3/)
  assert.equal(solveLatin(puzzle, Array.from({ length: 23 }, (_, cell) => cell === 22 ? 8 : 0)).status, 'unsolvable')
  const values = Array<number>(81).fill(0)
  for (let remaining = 79; remaining > 0;) {
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.length)
    for (const { cell, value } of hints) {
      assert.equal(values[cell], 0)
      assert.equal(value, digits[cell])
      values[cell] = value
      remaining--
    }
  }
  assert.equal(checkLatin(puzzle, values).complete, true)

  for (const changed of [
    { custom_constraints: true },
    { description: source.description + '\nDigits count twice in purple cells.' },
  ]) {
    publication = { ...source, ...changed }
    await assert.rejects(preparePlayableImport(url), /author instructions/)
  }
})

test('a custom Whispers minimum can combine with a cage, inequality, dot, and source progress', async () => {
  const layers = [
    { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3' } }] },
    { type: 'greaterLess', segments: [{ cells: [0, 1] }] },
    { type: 'ratio', segments: [{ cells: [0, 1], parameters: { ratio: 2 } }] },
    { type: 'whisper', settings: { difference: 2 }, segments: [{ cells: [0, 6] }] },
  ]
  // The cage and sign fix the first row. Whispers sets the order of the other rows.
  const input = (givenConstraints: unknown[]) => coachCode({
    gridSize: 3, regions: [], givenDigits: '000000000',
    userDigits: '100000000', colours: ['green'], userColours: '0,,,,,,,,',
    givenConstraints,
  })
  const imported = await preparePlayableImport(input(layers))
  assert.ok('calcudokuSource' in imported)
  const entry = prepareImportedCalcudoku(imported.calcudokuSource, { 0: 'add' })
  const saved = readImportedCalcudoku(entry.id)!
  assert.equal(solveLatin(saved.puzzle).solution?.join(''), '123231312')
  assert.equal(saved.initialPosition?.values[0], 1)
  assert.deepEqual(saved.annotations?.cellColors, { 0: ['green'] })
  assert.deepEqual(saved.puzzle.whispers, [{ cells: [0, 6], minDifference: 2 }])
  assert.equal(saved.puzzle.adjacentClues?.marks[0].type, 'ratio')
  assert.equal(readImportedCalcudoku(entry.id.replace('.w', '.q')), undefined)
  assert.ok(checkLatin(saved.puzzle, [1, 0, 0, 0, 0, 0, 2]).conflicts.some(rule => rule.kind === 'whispers'))
  assert.ok(findLatinHints(saved.puzzle, [1]).some(hint => hint.rules[0].kind === 'whispers'))

  const without = await preparePlayableImport(input(layers.slice(0, -1)))
  assert.ok('calcudokuSource' in without)
  assert.throws(() => prepareImportedCalcudoku(without.calcudokuSource, { 0: 'add' }), /more than one solution/)
})

test('boxless Whispers rejects malformed paths and differences outside the grid range', async () => {
  for (const [cells, difference] of [[[], 1], [[0], 1], [[0, 0], 1], [[0, 16], 1], [[0, 1], 4], [[0, 1], 0]]) {
    const code = coachCode({
      gridSize: 4, regions: [], givenDigits: '0'.repeat(16),
      givenConstraints: [{ type: 'whisper', settings: { difference }, segments: [{ cells }] }],
    })
    await assert.rejects(preparePlayableImport(code), /Whispers line/)
  }
  const entry = createImportedFutoshiki(4, '1234234134124123', [], { whispers: [{ cells: [0, 1], minDifference: 1 }] })
  assert.equal(readImportedFutoshiki(entry.id + '.w1020001'), undefined)
})
