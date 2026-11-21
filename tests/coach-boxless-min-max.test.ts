import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { prepareImportedCalcudoku, readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { latinMinMaxRules, minMaxNeighbors } from '../src/latin/min-max.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-boxless-noncon-bento.json', import.meta.url), 'utf8'))
const answer = Array.from(source.solution as string, Number)
const layer = (type: 'minimum' | 'maximum', cells: number[]) => ({ type, segments: cells.map(cell => ({ cells: [cell] })) })

test('Non-con bento preserves the global rule, Minimum cells and the complete published combination', async ({ mock }) => {
  const publication = { sudoku_id: 'FWUv', sudoku: source.code, name: source.title,
    description: source.description, blocked: false, custom_constraints: false }
  let specificSudoku = publication
  mock.method(globalThis, 'fetch', (url: string) => url === source.url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example')), {}, {}))

  const short = await preparePlayableImport(source.url)
  const raw = await preparePlayableImport(source.code)
  assert.ok('calcudoku' in short && 'calcudoku' in raw)
  assert.equal(short.calcudoku.id, raw.calcudoku.id)
  const restored = readImportedCalcudoku(short.calcudoku.id)!
  assert.ok(restored)
  const { puzzle } = restored
  assert.equal(puzzle.givens.join(''), '0'.repeat(81))
  assert.equal(puzzle.adjacentClues?.nonConsecutive, true)
  assert.ok(puzzle.adjacentClues?.marks.some(mark =>
    mark.type === 'difference' && mark.value === 1 && mark.cells.join() === '2,11'))
  assert.equal(puzzle.rules.filter(rule => rule.kind === 'non-consecutive').length, 143)
  assert.deepEqual(puzzle.minMax, [{ cells: [70, 60] }])
  assert.equal(puzzle.extraRegions?.length, 5)
  assert.equal(puzzle.pathClues?.length, 9)
  assert.equal(puzzle.cages.length, 3)
  assert.equal(puzzle.quadruples?.length, 4)
  assert.equal(restored.annotations?.authoredPaths?.length, 4)

  const exact = solveLatin(puzzle)
  assert.equal(exact.status, 'unique')
  assert.deepEqual(exact.solution, answer)
  const { calcudoku } = await detectPuzzle(source.code)
  assert.ok(calcudoku?.adjacentClues)
  assert.throws(() => prepareImportedCalcudoku({
    ...calcudoku, adjacentClues: { ...calcudoku.adjacentClues!, nonConsecutive: undefined },
  }), /more than one solution/)
  const withoutMinimum = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'minimum') }
  assert.equal(solveLatin(withoutMinimum).status, 'unique')
  assert.ok(findLatinSolutionHints(withoutMinimum, []).length < 81)

  const values = Array<number>(81).fill(0)
  values[60] = 7
  values[59] = 4
  assert.ok(checkLatin(puzzle, values).conflicts.some(rule =>
    rule.kind === 'minimum' && rule.cells.join() === '60,59'))
  const replay = numberSolution({
    check: values => checkLatin(puzzle, values),
    hints: (values, limit) => findLatinHints(puzzle, values, limit),
    solutionHints: values => findLatinSolutionHints(puzzle, values),
    solve: () => null,
  }, Array(81).fill(true))
  assert.equal(replay.complete, true)
  assert.deepEqual(replay.positions.at(-1), answer)
  assert.equal(replay.steps.length, 81)
  assert.ok(replay.steps.every(Boolean))
  for (const kind of ['minimum', 'non-consecutive']) {
    assert.ok(replay.steps.some(step => step?.rules.some(rule => rule.kind === kind)))
  }
  for (const changed of [
    { description: source.description + '\nUse only odd digits in row one.' },
    { custom_constraints: true },
    { sudoku: coachCode({ gridSize: 5, regions: [], givenDigits: '0'.repeat(25) }) },
  ]) {
    specificSudoku = { ...publication, ...changed }
    await assert.rejects(detectPuzzle(source.url), /author instructions/)
  }
})

test('Minimum and Maximum compare edge neighbors and skip only the same group', async () => {
  const groups = [{ cells: [0, 1] }, { cells: [8], maximum: true }] as const
  const rules = latinMinMaxRules(3, groups)
  assert.deepEqual(minMaxNeighbors(3, 0, new Set([0, 1])), [3])
  assert.deepEqual(minMaxNeighbors(3, 8, new Set([8])), [5, 7])
  assert.ok(!rules.some(rule => rule.cells.includes(0) && rule.cells.includes(1)))
  const directed = latinMinMaxRules(3, [{ cells: [0] }, { cells: [1], maximum: true }])
  assert.ok(directed.some(rule => rule.kind === 'minimum' && rule.cells.join() === '0,1'))
  assert.ok(directed.some(rule => rule.kind === 'maximum' && rule.cells.join() === '0,1'))
  for (const rule of [...rules, ...directed]) {
    for (let left = 1; left <= 3; left++) for (let right = 1; right <= 3; right++) {
      const masks = Array(9).fill(7)
      masks[rule.cells[0]] = bit(left)
      masks[rule.cells[1]] = bit(right)
      assert.equal(Boolean(rule.support(masks)), left < right)
    }
  }

  const data = { gridSize: 3, regions: [], givenDigits: '023231310' }
  const imported = await preparePlayableImport(coachCode({ ...data, givenConstraints: [
    layer('minimum', [0, 1]), layer('maximum', [8]),
  ] }))
  assert.ok('futoshiki' in imported)
  const entry = readImportedFutoshiki(imported.futoshiki.id)
  assert.deepEqual(entry?.puzzle.minMax, [{ cells: [0, 1] }, { cells: [8], maximum: true }])
  assert.equal(solveLatin(entry!.puzzle).solution?.join(''), '123231312')
  assert.equal(readImportedFutoshiki(imported.futoshiki.id.replace('.bn', '.bq')), undefined)
  for (const invalid of [
    { ...layer('minimum', [0]), settings: { unknown: true } },
    layer('maximum', [9]),
    layer('minimum', [0, 0]),
    { type: 'minimum', segments: [{ cells: [0, 1] }] },
  ]) {
    await assert.rejects(preparePlayableImport(coachCode({ ...data, givenConstraints: [invalid] })), /Minimum|Maximum/)
  }
})
