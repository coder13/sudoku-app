import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinHint, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const kingX = JSON.parse(readFileSync(new URL('./fixtures/coach-boxless-king-x.json', import.meta.url), 'utf8'))
const main = { type: 'diagonalNegative', segments: [], settings: {} }
const anti = { type: 'diagonalPositive', segments: [], settings: {} }

test('published King X imports both diagonal directions, Anti-King, and Odd/Even', async () => {
  const preview = await preparePlayableImport(kingX.code)
  assert.ok('futoshiki' in preview)
  assert.match(preview.futoshiki.id, /\.j1\.g3$/)
  const restored = readImportedFutoshiki(preview.futoshiki.id)
  assert.ok(restored)
  const { puzzle } = restored
  assert.equal(puzzle.antiKing, true)
  assert.deepEqual(puzzle.diagonals, ['main', 'anti'])
  assert.equal(puzzle.parity?.length, 13)
  assert.deepEqual(puzzle.rules.filter(rule => rule.kind === 'diagonal').map(rule => rule.cells), [
    [0, 10, 20, 30, 40, 50, 60, 70, 80],
    [8, 16, 24, 32, 40, 48, 56, 64, 72],
  ])
  const answer = Array.from(kingX.solution, Number)
  for (const kind of ['anti-king', 'diagonal', 'parity']) {
    const rules = puzzle.rules.filter(rule => rule.kind !== kind)
    assert.equal(solveLatin({ ...puzzle, rules }).status, 'multiple', kind)
  }
  const exact = solveLatin(puzzle)
  assert.equal(exact.status, 'unique')
  assert.deepEqual(exact.solution, answer)

  const opening = findLatinHint(puzzle, [])
  assert.ok(opening?.trace?.length)
  assert.equal(opening.value, answer[opening.cell])
  assert.ok(opening.trace.some(branch => branch.steps.some(step => /diagonal|touch at a corner/.test(step))))
  const progressed = [...puzzle.givens]
  progressed[opening.cell] = opening.value
  assert.ok(findLatinHints(puzzle, progressed).some(hint => hint.rules.some(rule => rule.kind === 'diagonal')))

  const solution = numberSolution({
    check: values => checkLatin(puzzle, values),
    hints: values => findLatinHints(puzzle, values),
    solutionHints: values => findLatinSolutionHints(puzzle, values),
    solve: () => exact.solution,
  }, puzzle.givens.map(value => value === 0))
  assert.equal(solution.complete, true)
  assert.ok(solution.steps.some(step => step?.trace?.length))
  assert.ok(solution.steps.filter(Boolean).every(step => step && step.value === answer[step.cell]))
  assert.deepEqual(solution.positions.at(-1), answer)
})

test('Calcudoku keeps independent diagonal directions and numbered cages in portable links', async () => {
  const source = {
    gridSize: 5, regions: [], givenDigits: '0234534512512342345145123',
    givenConstraints: [{ type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }],
  }
  for (const [layer, direction, mask] of [[main, 'main', 1], [anti, 'anti', 2]] as const) {
    const preview = await preparePlayableImport(coachCode({ ...source, givenConstraints: [...source.givenConstraints, layer] }))
    assert.ok('calcudoku' in preview)
    assert.ok(preview.calcudoku.id.endsWith(`.g${mask}`))
    const restored = readImportedCalcudoku(preview.calcudoku.id)
    assert.ok(restored)
    assert.deepEqual(restored.puzzle.diagonals, [direction])
    assert.equal(restored.puzzle.cages[0].target, 3)
    assert.equal(checkLatin(restored.puzzle, Array.from('1234534512512342345145123', Number)).complete, true)
    assert.equal(readImportedCalcudoku(preview.calcudoku.id + '.g3'), undefined)
  }
})

test('boxless diagonal imports reject unsupported locations, settings, and tokens', async () => {
  const source = { gridSize: 5, regions: [] }
  for (const replacement of [{ segments: [{ cells: [0] }] }, { segments: null }, { settings: { mode: 'none' } }]) {
    await assert.rejects(detectPuzzle(coachCode({
      ...source, givenConstraints: [{ ...main, ...replacement }],
    })), /diagonal rule uses unsupported cells or settings/)
  }
  const input = await detectPuzzle(coachCode({ ...source, givenConstraints: [anti, main, main] }))
  assert.ok(input.futoshiki)
  assert.deepEqual(input.futoshiki.puzzle.diagonals, ['main', 'anti'])
  assert.equal(readImportedFutoshiki(input.futoshiki.id.replace('.g3', '.g0')), undefined)
})
