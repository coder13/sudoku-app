import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { latinAntiKnightRules } from '../src/latin/anti-knight.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const answer = Array.from('1234234134124123', Number)
const wrong = Array.from('1234234141233412', Number)
const givens = '0000004100000000'
const source = { gridSize: 4, regions: [], givenDigits: givens, userDigits: '1000004100000000' }
const antiKnight = { type: 'antiKnight', segments: [], settings: {} }
const inequality = { type: 'greaterLess', segments: [{ cells: [1, 2] }] }
const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }

for (const [game, companion] of [['futoshiki', inequality], ['calcudoku', cage]] as const) {
  test(`boxless ${game} combines Anti-Knight with its own rules and saves the source position`, async () => {
    const before = await detectPuzzle(coachCode({ ...source, givenConstraints: [companion] }))
    const withoutRule = game === 'futoshiki' ? before.futoshiki!.puzzle : createCalcudoku(
      4, [{ cells: [0, 1], target: 3, operator: 'add' }], Array.from(givens, Number), { allowUncaged: true },
    )
    assert.equal(solveLatin(withoutRule).status, 'multiple')
    assert.equal(checkLatin(withoutRule, wrong).complete, true)

    const preview = await preparePlayableImport(coachCode({ ...source, givenConstraints: [companion, antiKnight] }))
    const restored = 'futoshiki' in preview && game === 'futoshiki' ? readImportedFutoshiki(preview.futoshiki.id)
      : 'calcudoku' in preview && game === 'calcudoku' ? readImportedCalcudoku(preview.calcudoku.id) : undefined
    assert.ok(restored)
    assert.match(restored.id, /\.k1\.p/)
    assert.equal(restored.initialPosition?.values[0], 1)
    const { puzzle } = restored
    assert.equal(puzzle.antiKnight, true)
    assert.deepEqual(solveLatin(puzzle).solution, answer)
    assert.equal(solveLatin(puzzle).status, 'unique')
    assert.equal(checkLatin(puzzle, answer).complete, true)
    const errors = checkLatin(puzzle, wrong).conflicts
    assert.ok(errors.length)
    assert.ok(errors.every(rule => rule.kind === 'anti-knight'))
    assert.ok(errors.some(rule => rule.cells.join() === '6,8'))

    const values = [...puzzle.givens]
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.some(hint => hint.rules.some(rule => rule.kind === 'anti-knight' && /knight’s move/.test(rule.label))))
    for (const { cell, value } of hints) {
      assert.equal(value, answer[cell])
      values[cell] = value
    }
    assert.deepEqual(values, answer)
  })
}

test('Anti-Knight compares exactly the pairs a knight can move between on each supported grid', () => {
  for (let size = 3; size <= 9; size++) {
    const pairs = latinAntiKnightRules(size).map(rule => rule.cells.join(','))
    const expected = Array.from({ length: size ** 2 }, (_, cell) => {
      const row = Math.floor(cell / size), column = cell % size
      return [[1, 2], [1, -2], [2, 1], [2, -1]].flatMap(([down, across]) => {
        const nextRow = row + down, nextColumn = column + across
        if (nextRow >= size || nextColumn < 0 || nextColumn >= size) return []
        return [`${cell},${nextRow * size + nextColumn}`]
      })
    }).flat()
    assert.deepEqual([...pairs].sort(), expected.sort())
  }
})

test('boxless Anti-Knight works on a 7 × 7 grid and rejects unknown Coach data', async () => {
  const grid = Array.from({ length: 49 }, (_, cell) => 1 + (cell % 7 + Math.floor(cell / 7)) % 7)
  const input = (layer: unknown) => coachCode({
    gridSize: 7, regions: [], givenDigits: grid.slice(0, -1).join('') + '0', givenConstraints: [layer],
  })
  const preview = await preparePlayableImport(input(antiKnight))
  assert.ok('futoshiki' in preview)
  const { id } = preview.futoshiki
  assert.match(id, /^f2\..*\.k1$/)
  assert.deepEqual(solveLatin(readImportedFutoshiki(id)!.puzzle).solution, grid)
  assert.equal(readImportedFutoshiki(id.replace('.k1', '.k2')), undefined)
  assert.equal(readImportedFutoshiki(id + '.k1'), undefined)
  for (const replacement of [{ segments: [{ cells: [0] }] }, { segments: null }, { settings: { reach: 3 } }]) {
    await assert.rejects(detectPuzzle(input({ ...antiKnight, ...replacement })), /Anti-Knight rule uses unsupported cells or settings/)
  }
})
