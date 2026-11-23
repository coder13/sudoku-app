import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { latinAntiKingRules } from '../src/latin/chess-rules.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const givens = '0030004002002000000005023'
const answer = Array.from('1234534512512342345145123', Number)
const wrong = Array.from('1235434512532412143545123', Number)
const source = { gridSize: 5, regions: [], givenDigits: givens, userDigits: '1030004002002000000005023' }
const antiKing = { type: 'antiKing', segments: [], settings: {} }
const inequality = { type: 'greaterLess', segments: [{ cells: [0, 1] }] }
const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }

for (const [game, companion] of [['futoshiki', inequality], ['calcudoku', cage]] as const) {
  test(`boxless ${game} applies Anti-King alongside its own rules and restores progress`, async () => {
    const input = (givenConstraints: unknown[]) => coachCode({ ...source, givenConstraints })
    const before = await detectPuzzle(input([companion]))
    const without = game === 'futoshiki' ? before.futoshiki!.puzzle : createCalcudoku(
      5, [{ cells: [0, 1], target: 3, operator: 'add' }], Array.from(givens, Number), { allowUncaged: true },
    )
    assert.equal(solveLatin(without).status, 'multiple')
    assert.equal(checkLatin(without, wrong).complete, true)

    const preview = await preparePlayableImport(input([companion, antiKing]))
    const restored = 'futoshiki' in preview && game === 'futoshiki' ? readImportedFutoshiki(preview.futoshiki.id)
      : 'calcudoku' in preview && game === 'calcudoku' ? readImportedCalcudoku(preview.calcudoku.id) : undefined
    assert.ok(restored)
    assert.match(restored.id, /\.j1\.p/)
    assert.equal(restored.initialPosition?.values[0], 1)
    const { puzzle } = restored
    assert.equal(puzzle.antiKing, true)
    const result = solveLatin(puzzle)
    assert.equal(result.status, 'unique')
    assert.deepEqual(result.solution, answer)
    assert.equal(checkLatin(puzzle, answer).complete, true)
    const { conflicts } = checkLatin(puzzle, wrong)
    assert.ok(conflicts.length)
    assert.ok(conflicts.every(rule => rule.kind === 'anti-king'))

    const values = [...puzzle.givens]
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.some(hint => hint.rules.some(rule => rule.kind === 'anti-king' && /touch at a corner/.test(rule.label))))
    for (const { cell, value } of hints) {
      assert.equal(value, answer[cell])
      values[cell] = value
    }
    assert.deepEqual(values, answer)
  })
}

test('Anti-King compares all and only the corner neighbors on each supported size', () => {
  for (let size = 3; size <= 9; size++) {
    const expected = []
    for (let row = 0; row < size - 1; row++) {
      for (let column = 0; column < size - 1; column++) {
        const topLeft = row * size + column
        expected.push(`${topLeft},${topLeft + size + 1}`, `${topLeft + 1},${topLeft + size}`)
      }
    }
    const actual = latinAntiKingRules(size).map(rule => rule.cells.join(','))
    assert.deepEqual(actual.sort(), expected.sort())
  }
})

test('boxless Anti-King combines with Anti-Knight and refuses unknown rule settings', async () => {
  const input = (...givenConstraints: unknown[]) => coachCode({ ...source, givenConstraints })
  const { futoshiki } = await detectPuzzle(input(antiKing, { type: 'antiKnight', segments: [] }))
  assert.ok(futoshiki)
  assert.match(futoshiki.id, /\.k1\.j1\.p/)
  const restored = readImportedFutoshiki(futoshiki.id)
  assert.equal(restored?.puzzle.antiKing, true)
  assert.equal(restored?.puzzle.antiKnight, true)
  assert.equal(readImportedFutoshiki(futoshiki.id.replace('.j1', '.j2')), undefined)
  assert.equal(readImportedFutoshiki(futoshiki.id.replace('.j1', '.j1.j1')), undefined)
  for (const replacement of [{ segments: [{ cells: [0] }] }, { segments: null }, { settings: { reach: 3 } }]) {
    await assert.rejects(detectPuzzle(input({ ...antiKing, ...replacement })), /Anti-King rule uses unsupported cells or settings/)
  }
})
