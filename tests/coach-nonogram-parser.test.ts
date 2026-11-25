import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { coachNonogramRules } from '../src/sudoku/coach-nonogram.ts'
import { nonogramState, validNonogramRule } from '../src/sudoku/sized-nonogram.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-nonogram.json', import.meta.url), 'utf8')) as {
  sudoku: string; description: string
}

test('the published Coach Nonogram text establishes ordered even-digit run clues', async () => {
  const payload = await decodeSudokuCoachPayload(source.sudoku)
  assert.equal(payload.gridSize, 6)
  const constraints = payload.givenConstraints as unknown[]
  assert.deepEqual(coachNonogramRules(constraints, 6, source.description), [
    ...[[1, 1, 1], [1, 1, 1], [2, 1], [3], [2, 1], [1, 1, 1]].map((runs, index) => ({
      type: 'nonogram', axis: 'row', index, digits: [2, 4, 6], runs,
    })),
    ...[[2, 1], [1, 1, 1], [1, 2], [1, 2], [1, 1, 1], [1, 2]].map((runs, index) => ({
      type: 'nonogram', axis: 'column', index, digits: [2, 4, 6], runs,
    })),
  ])
  const rules = coachNonogramRules(constraints, 6, source.description)
  assert.ok(rules.every(rule => validNonogramRule(rule, 6)))
  assert.deepEqual(nonogramState(rules, source.solution, 6)?.conflicts, new Set())
})

test('Coach text and decorative labels do not become guessed Nonogram rules', async () => {
  const payload = await decodeSudokuCoachPayload(source.sudoku)
  const constraints = payload.givenConstraints as unknown[]
  assert.throws(() => coachNonogramRules(constraints, 6), /published puzzle link/)
  assert.throws(() => coachNonogramRules(constraints, 6, 'Text overlay labels are decorative.'), /authored text/)

  const unsupportedDigitGroup = source.description.replace('(2, 4, 6)', '(1, 3, 5)')
  assert.throws(() => coachNonogramRules(constraints, 6, unsupportedDigitGroup), /unsupported digit group/)

  const misplaced = structuredClone(constraints) as { type?: string; segments?: { cells: number[][]; parameters: { text: string } }[] }[]
  const clue = misplaced.find(layer => layer.type === 'cosmeticText')?.segments?.find(segment => segment.parameters.text === '1')
  assert.ok(clue)
  clue.cells[0][0] = -1.25
  assert.throws(() => coachNonogramRules(misplaced, 6, source.description), /count must be a positive whole number/)

  for (const change of [
    (layer: Record<string, unknown>) => { (layer.settings as Record<string, unknown>).unrecognized = true },
    (layer: Record<string, unknown>) => { layer.authoredMeaning = 'unknown' },
    (layer: Record<string, unknown>) => { (layer.segments as Record<string, unknown>[])[0].authoredMeaning = 'unknown' },
  ]) {
    const changed = structuredClone(constraints) as Record<string, unknown>[]
    change(changed.find(layer => layer.type === 'cosmeticText')!)
    assert.throws(() => coachNonogramRules(changed, 6, source.description), /unsupported settings|unsupported segment fields/)
  }
})
