import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { latinPathRules } from '../src/latin/path-clues.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const answer = Array.from({ length: 81 }, (_, cell) => 1 + (cell % 9 + Math.floor(cell / 9)) % 9)
const swapped = answer.map(value => value === 3 || value === 4 ? 7 - value : value)
const givens = answer.map(value => value === 3 || value === 4 ? 0 : value).join('')
const paths = [[2, 12, 22], [22, 13]]
const layer = { type: 'entropicLine', settings: { lineThickness: 0.2 }, segments: paths.map(cells => ({ cells })) }
const knight = { type: 'antiKnight', segments: [] }
const inequality = { type: 'greaterLess', segments: [{ cells: [1, 2] }] }
const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }

for (const [game, companion] of [['futoshiki', inequality], ['calcudoku', cage]] as const) {
  test(`boxless ${game} keeps touching Entropic Lines independent with Anti-Knight`, async () => {
    const source = { gridSize: 9, regions: [], givenDigits: givens }
    const baseline = game === 'futoshiki' ?
      (await detectPuzzle(coachCode({ ...source, givenConstraints: [companion, knight] }))).futoshiki!.puzzle :
      createCalcudoku(9, [{ cells: [0, 1], target: 3, operator: 'add' }], Array.from(givens, Number), { allowUncaged: true, antiKnight: true })
    assert.equal(solveLatin(baseline).status, 'multiple')
    assert.equal(checkLatin(baseline, swapped).complete, true)

    const userDigits = givens.slice(0, 3) + '4' + givens.slice(4)
    const preview = await preparePlayableImport(coachCode({ ...source, userDigits, givenConstraints: [companion, knight, layer] }))
    const restored = 'futoshiki' in preview && game === 'futoshiki' ? readImportedFutoshiki(preview.futoshiki.id)
      : 'calcudoku' in preview && game === 'calcudoku' ? readImportedCalcudoku(preview.calcudoku.id) : undefined
    assert.ok(restored)
    assert.equal(restored.initialPosition?.values[3], 4)
    const { puzzle } = restored
    assert.equal(puzzle.antiKnight, true)
    assert.deepEqual(puzzle.pathClues, paths.map(cells => ({ type: 'entropic', cells })))
    assert.equal(solveLatin(puzzle).status, 'unique')
    assert.deepEqual(solveLatin(puzzle).solution, answer)
    assert.equal(checkLatin(puzzle, answer).complete, true)
    const conflicts = checkLatin(puzzle, swapped).conflicts
    assert.deepEqual(conflicts.map(({ kind, cells }) => ({ kind, cells })), [{ kind: 'entropic', cells: paths[0] }])

    const hints = findLatinSolutionHints(puzzle, Array.from(givens, Number))
    assert.ok(hints.some(hint => hint.rules.some(rule => rule.kind === 'entropic' && /three successive positions/.test(rule.label))))
    const values = Array.from(givens, Number)
    for (const { cell, value } of hints) values[cell] = value
    assert.deepEqual(values, answer)
  })
}

test('Entropic Line support agrees with direct digit enumeration for short and repeated paths', () => {
  const group = (digit: number) => Math.floor((digit - 1) / 3)
  const representativeDigits = [1, 4, 7]
  const choices = Array.from({ length: 8 }, (_, mask) => representativeDigits.filter((_, index) => mask & (1 << index)))

  for (const cells of [[0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 0], [0, 1, 2, 1], [0, 0]]) {
    const [rule] = latinPathRules(9, [{ type: 'entropic', cells }])
    const distinct = [...new Set(cells)]
    assert.deepEqual(rule.cells, distinct)
    for (let mask = 0; mask < 8 ** distinct.length; mask++) {
      const digits = distinct.map((_, index) => choices[(mask >> (3 * index)) & 7])
      const domains = digits.map(list => list.reduce((result, digit) => result | bit(digit), 0))
      const supported = domains.map(() => 0)
      const visit = (selected: number[]) => {
        if (selected.length < distinct.length) {
          for (const digit of digits[selected.length]) visit([...selected, digit])
          return
        }
        const groups = cells.map(cell => group(selected[distinct.indexOf(cell)]))
        if (groups.some((value, index) => groups[index + 1] === value || groups[index + 2] === value)) return
        selected.forEach((digit, index) => { supported[index] |= bit(digit) })
      }
      visit([])
      assert.deepEqual(rule.support(domains), supported[0] ? supported : null)
    }
  }
  assert.deepEqual(latinPathRules(3, [{ type: 'entropic', cells: [0] }]), [])
  const [pair] = latinPathRules(6, [{ type: 'entropic', cells: [0, 1] }])
  assert.deepEqual(pair.support([bit(2) | bit(6), bit(3)]), [bit(6), bit(3)])
  const [triple] = latinPathRules(6, [{ type: 'entropic', cells: [0, 1, 2] }])
  assert.equal(triple.support([63, 63, 63]), null)
})

test('a boxless 7 × 7 import accepts typed Entropic paths and rejects unknown data', async () => {
  const grid = Array.from({ length: 49 }, (_, cell) => 1 + (cell % 7 + Math.floor(cell / 7)) % 7)
  const input = (constraint: unknown) => coachCode({
    gridSize: 7, regions: [], givenDigits: '0' + grid.slice(1).join(''), givenConstraints: [constraint],
  })
  const segments = [{ cells: [2, 3] }, { cells: [0] }]
  const preview = await preparePlayableImport(input({ ...layer, segments }))
  assert.ok('futoshiki' in preview)
  const restored = readImportedFutoshiki(preview.futoshiki.id)!
  assert.deepEqual(restored.puzzle.pathClues, segments.map(({ cells }) => ({ type: 'entropic', cells })))
  assert.deepEqual(solveLatin(restored.puzzle).solution, grid)
  for (const replacement of [{ segments: [{ cells: [0, 49] }] }, { segments: [{ cells: [0, 1], parameters: { groups: 2 } }] }]) {
    await assert.rejects(detectPuzzle(input({ ...layer, ...replacement })), /invalid Entropic path/)
  }
  await assert.rejects(detectPuzzle(input({ ...layer, settings: { groups: 2 } })), /Entropic line uses unsupported settings/)
  await assert.rejects(detectPuzzle(input({ ...layer, segments: [] })), /no Entropic cells/)
})
