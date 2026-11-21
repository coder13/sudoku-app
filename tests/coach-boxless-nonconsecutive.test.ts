import assert from 'node:assert/strict'
import test from 'node:test'
import { createFutoshiki } from '../src/futoshiki/engine.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { adjacentClueRules, encodeAdjacentClues, readAdjacentClues } from '../src/latin/adjacent-clues.ts'
import { bit, checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const givens = '0025000000053040000230020'
const solution = '1425342531253145314231425'
const layer = { type: 'nonconsecutive', segments: [] }

test('a boxless Coach export keeps the global rule in Check, hints, and the portable link', async () => {
  const source = (givenConstraints: unknown[]) => coachCode({ gridSize: 5, regions: [], givenDigits: givens, givenConstraints })
  const imported = await preparePlayableImport(source([layer]))
  assert.ok('futoshiki' in imported)
  const restored = readImportedFutoshiki(imported.futoshiki.id)
  assert.ok(restored)
  assert.match(restored.id, /\.d4$/)
  assert.equal(restored.puzzle.adjacentClues?.nonConsecutive, true)
  const result = solveLatin(restored.puzzle)
  assert.equal(result.status, 'unique')
  assert.equal(result.solution?.join(''), solution)
  assert.equal(solveLatin(createFutoshiki(5, [...givens].map(Number), [])).status, 'multiple')
  assert.ok(checkLatin(restored.puzzle, [1, 2]).conflicts.some(rule =>
    rule.kind === 'non-consecutive' && rule.cells.join() === '0,1'))
  const hints = findLatinSolutionHints(restored.puzzle, [])
  assert.equal(hints.length, 17)
  assert.ok(hints.some(hint => hint.rules.some(rule => rule.kind === 'non-consecutive')))
  const replay = Array<number>(25).fill(0)
  for (const { cell, value } of hints) replay[cell] = value
  assert.equal(checkLatin(restored.puzzle, replay).complete, true)
  assert.equal(readImportedFutoshiki(restored.id.replace('.d4', '.d8')), undefined)

  for (const invalid of [{ ...layer, settings: { mode: 'wrap' } }, { ...layer, segments: [{ cells: [0, 1] }] }]) {
    await assert.rejects(preparePlayableImport(source([invalid])), /Non-Consecutive rule uses unsupported/)
  }
})

test('only a difference-one dot exempts an edge, while other markings stay active', () => {
  const clues = readAdjacentClues('4060102')
  assert.equal(clues.nonConsecutive, true)
  assert.equal(encodeAdjacentClues(clues), '.d4060102')
  assert.equal(encodeAdjacentClues(readAdjacentClues('3')), '.d3')
  const rules = adjacentClueRules(5, {
    nonConsecutive: true,
    marks: [
      { type: 'difference', value: 1, cells: [0, 1] },
      { type: 'ratio', value: 2, cells: [1, 2] },
      { type: 'difference', value: 3, cells: [2, 3] },
    ],
  })
  assert.equal(rules.length, 40)
  assert.ok(!rules.some(rule => rule.cells.join() === '4,5'))
  const pairs = [
    [0, 1, (a: number, b: number) => Math.abs(a - b) === 1],
    [1, 2, (a: number, b: number) => Math.abs(a - b) !== 1 && (a === b * 2 || b === a * 2)],
    [2, 3, (a: number, b: number) => Math.abs(a - b) === 3],
    [3, 4, (a: number, b: number) => a !== b && Math.abs(a - b) !== 1],
  ] as const
  for (const [a, b, valid] of pairs) {
    const rule = rules.find(rule => rule.cells[0] === a && rule.cells[1] === b)!
    for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) {
      const domains = Array<number>(25).fill(31)
      domains[a] = bit(left)
      domains[b] = bit(right)
      assert.equal(Boolean(rule.support(domains)), valid(left, right), `${a},${b}: ${left},${right}`)
    }
  }
})
