import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const answer = Array.from('1234234134124123', Number)
const swapped = answer.map(digit => digit <= 2 ? 3 - digit : digit)
const givens = answer.map(digit => digit <= 2 ? 0 : digit).join('')
const example = { gridSize: 4, regions: [], givenDigits: givens }
const inequality = { type: 'greaterLess', segments: [{ cells: [1, 2] }] }
const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }
const odd = { type: 'odd', settings: { opacity: .2 }, segments: [{ cells: [0] }] }
const even = { type: 'even', segments: [{ cells: [1] }] }
const markers = [{ cell: 0, parity: 'odd' }, { cell: 1, parity: 'even' }]

for (const [game, companion] of [['futoshiki', inequality], ['calcudoku', cage]] as const) {
  test(`boxless ${game} imports and shares active Odd/Even clues with a companion rule`, async () => {
    const without = await detectPuzzle(coachCode({ ...example, givenConstraints: [companion] }))
    const preview = await preparePlayableImport(coachCode({
      ...example, givenConstraints: [even, companion, odd],
      userDigits: '0000000100000000',
    }))
    let restored
    if (game === 'futoshiki' && 'futoshiki' in preview) {
      assert.equal(solveLatin(without.futoshiki!.puzzle).status, 'multiple')
      restored = readImportedFutoshiki(preview.futoshiki.id)
      assert.deepEqual(restored?.puzzle.inequalities, [{ less: 1, greater: 2 }])
    } else if (game === 'calcudoku' && 'calcudoku' in preview) {
      assert.equal(without.calcudoku?.cages[0].label, '3+')
      assert.equal(solveLatin(createCalcudoku(4, [{ cells: [0, 1], target: 3, operator: 'add' }],
        Array.from(givens, Number), { allowUncaged: true })).status, 'multiple')
      restored = readImportedCalcudoku(preview.calcudoku.id)
      assert.equal(restored?.puzzle.cages[0].target, 3)
    }
    assert.ok(restored)
    assert.match(restored.id, /\.y1200000000000000\.p/)
    assert.equal(restored.initialPosition?.values[7], 1)
    const { puzzle } = restored
    assert.deepEqual(puzzle.parity, markers)
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique')
    assert.deepEqual(exact.solution, answer)
    assert.equal(checkLatin(puzzle, answer).complete, true)
    assert.deepEqual(checkLatin(puzzle, swapped).conflicts.map(rule => [rule.kind, rule.cells]), [['parity', [0]], ['parity', [1]]])

    const values = Array<number>(16).fill(0)
    const hints = findLatinSolutionHints(puzzle, values)
    assert.ok(hints.some(hint => hint.rules.some(rule => rule.kind === 'parity' && /odd digit|even digit/.test(rule.label))))
    for (const { cell, value } of hints) {
      assert.equal(value, answer[cell])
      values[cell] = value
    }
    assert.equal(checkLatin(puzzle, values).complete, true)
  })
}

test('boxless Odd/Even rejects malformed clues and preserves the existing 7 × 7 Sudoku route', async () => {
  const input = (...layers: unknown[]) => coachCode({ ...example, givenConstraints: layers })
  for (const cells of [[-1], [16], [0, 1], ['0']]) {
    await assert.rejects(detectPuzzle(input({ ...odd, segments: [{ cells }] })), /invalid Odd\/Even/)
  }
  await assert.rejects(detectPuzzle(input(odd, { ...even, segments: odd.segments })), /invalid Odd\/Even/)
  await assert.rejects(detectPuzzle(input({ ...odd, settings: { requiredDigits: [1] } })), /unsupported settings/)
  const { futoshiki } = await detectPuzzle(input(odd, even))
  assert.ok(futoshiki)
  for (const suffix of ['.y120000000', '.y3200000000000000', '.y' + '0'.repeat(16)]) {
    assert.equal(readImportedFutoshiki(futoshiki.id.replace(/\.y[012]+$/, suffix)), undefined)
  }
  const seven = await detectPuzzle(coachCode({ gridSize: 7, regions: [], givenConstraints: [odd, even] }))
  assert.deepEqual(seven.grid, { size: 7, noRegions: true })
  assert.deepEqual(seven.sizedRules, [
    { type: 'parity', cells: [0], parity: 'odd' }, { type: 'parity', cells: [1], parity: 'even' },
  ])
})

test('a 9 × 9 boxless link keeps an Odd/Even marker on the final cell', async () => {
  const solved = Array.from({ length: 81 }, (_, cell) => 1 + (cell % 9 + Math.floor(cell / 9)) % 9)
  const code = coachCode({
    gridSize: 9, regions: [], givenDigits: solved.slice(0, 80).join('') + '0',
    givenConstraints: [odd, { ...even, segments: [{ cells: [80] }] }],
  })
  const preview = await preparePlayableImport(code)
  assert.ok('futoshiki' in preview)
  const { id } = preview.futoshiki
  assert.match(id, /^f2\./)
  const reopened = readImportedFutoshiki(id)
  assert.ok(reopened)
  assert.deepEqual(reopened.puzzle.parity, [{ cell: 0, parity: 'odd' }, { cell: 80, parity: 'even' }])
  assert.deepEqual(solveLatin(reopened.puzzle).solution, solved)
})
