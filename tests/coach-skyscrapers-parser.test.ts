import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachSkyscrapersRules } from '../src/sudoku/coach-skyscrapers.ts'
import { skyscrapersCount, validSizedSkyscrapersRule } from '../src/sudoku/sized-skyscrapers.ts'
import { isSizedRuleList } from '../src/sudoku/sized-rule-game.ts'
import { SEVEN_BOXLESS_GRID } from '../src/sudoku/grid.ts'
import { coachCode } from './helpers/coach-code.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-coach-9W3o.json', import.meta.url), 'utf8')) as {
  metadata: { sudoku: string; description: string; solution: string }
  decoded: { givenConstraints: unknown[]; gridSize: number }
}

test('#382 parses the published Coach Skyscrapers counts on all four sides', async () => {
  const payload = await decodeSudokuCoachPayload(source.metadata.sudoku)
  assert.equal(payload.gridSize, 7)
  const rules = coachSkyscrapersRules(source.decoded.givenConstraints, source.decoded.gridSize, source.metadata.description)
  assert.equal(rules.length, 12)
  assert.ok(rules.every(rule => validSizedSkyscrapersRule(rule, 7)))
  assert.ok(isSizedRuleList(rules, SEVEN_BOXLESS_GRID))
  assert.deepEqual(rules.map(({ direction, index, count }) => [direction, index, count]), [
    ['north', 3, 3], ['north', 5, 2], ['east', 4, 4], ['west', 2, 5], ['north', 4, 2],
    ['east', 1, 3], ['east', 2, 3], ['east', 6, 5], ['south', 5, 4], ['south', 0, 4],
    ['west', 5, 5], ['west', 0, 3],
  ])
  assert.deepEqual(rules.map(rule => skyscrapersCount(source.metadata.solution, rule, 7)), rules.map(rule => rule.count))
})

test('outside text needs the published Skyscrapers rule and valid unique edge positions', () => {
  assert.deepEqual(coachSkyscrapersRules([], 7), [])
  assert.throws(() => coachSkyscrapersRules(source.decoded.givenConstraints, 7), /published puzzle link/)
  assert.throws(() => coachSkyscrapersRules(source.decoded.givenConstraints, 7, 'Decorative labels.'), /cannot verify/)

  const constraints = structuredClone(source.decoded.givenConstraints) as { type: string; segments: { cells: number[][]; parameters: { text: string } }[] }[]
  const layer = constraints[0]
  layer.segments[0].cells[0][1] = 0
  assert.throws(() => coachSkyscrapersRules(constraints, 7, source.metadata.description), /beside a grid row or column/)
  const duplicate = structuredClone(source.decoded.givenConstraints) as typeof constraints
  duplicate[0].segments.push(structuredClone(duplicate[0].segments[0]))
  assert.throws(() => coachSkyscrapersRules(duplicate, 7, source.metadata.description), /share one side/)
})

test('#382 keeps its Skyscrapers clues with an appended Ratio rule', async () => {
  const payload = await decodeSudokuCoachPayload(source.metadata.sudoku)
  const solution = source.metadata.solution
  const pair = Array.from({ length: 49 }, (_, cell) => cell).flatMap(cell => {
    const row = Math.floor(cell / 7), column = cell % 7
    return [row < 6 ? cell + 7 : -1, column < 6 ? cell + 1 : -1]
      .filter(other => other >= 0 && (Number(solution[cell]) === 2 * Number(solution[other]) ||
        Number(solution[other]) === 2 * Number(solution[cell])))
      .map(other => [cell, other] as [number, number])
  })[0]
  assert.ok(pair)
  const ratio = { type: 'ratio', segments: [{ cells: pair, parameters: {} }] }
  const imported = await detectPuzzle(coachCode({ ...payload, givenConstraints: [...payload.givenConstraints, ratio] }))
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'skyscrapers').length, 12)
  assert.ok(imported.sizedRules?.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
})
