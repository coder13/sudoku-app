import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { runEngine, type SizedConstraintPosition } from '../src/sudoku/engine.ts'
import { isSizedRuleList, sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { sizedRuleHintChoices } from '../src/sudoku/sized-rule-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker(process.env.SIZED_RULES_WASM)

const zipperRegionSumFixture = JSON.parse(readFileSync(
  new URL('./fixtures/zipper-region-sum.json', import.meta.url), 'utf8',
)) as { code: string; solution: string }

test('odd and even Zipper Lines compose with the sized engine', async () => {
  const base = {
    version: 2 as const,
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    digits: Array(16).fill(0),
  }
  const odd: SizedConstraintPosition = {
    ...base,
    rules: [{ type: 'zipper', cells: [0, 1, 2] }],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: odd })
  assert.equal(candidates?.[0] & 0b1000, 0)
  assert.equal(candidates?.[2] & 0b1000, 0)
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position: odd, limit: 10 })
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0 &&
    choice.actions.some(action => action.eliminate?.cell === 0 && action.eliminate.digit === 4)))

  const even: SizedConstraintPosition = {
    ...base,
    rules: [
      { type: 'zipper', cells: [0, 1, 2, 3] },
      { type: 'thermometer', cells: [0, 1, 2, 3] },
    ],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...even,
    digits: Array.from('1234' + '3412' + '2143' + '4321', Number),
  } }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...even,
    digits: Array.from('1243' + '3412' + '2134' + '4321', Number),
  } }), 'conflict')
  const solved = await runEngine({ type: 'sized-variant', operation: 'solve', position: even })
  assert.ok(solved)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...even,
    digits: solved.digits,
  } }), 'unique')
})

test('Zipper and Region Sum share totals in propagation and hints', async () => {
  const position: SizedConstraintPosition = {
    version: 2,
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    digits: Array(16).fill(0),
    rules: [
      { type: 'zipper', cells: [0, 5, 6, 3] },
      { type: 'region-sum', cells: [0, 5, 6, 3], groupByRegion: false },
    ],
  }
  let jointHint
  let jointEliminations: number[] | undefined
  for (let seed = 1; seed < 256 && !jointHint; seed++) {
    const eliminations = Array(16).fill(0)
    for (const [index, cell] of [0, 5, 6, 3].entries()) {
      const packed = (Math.imul(seed, 1_057) + 4_161) & 0xffff
      const shift = index * 5
      const rotated = shift === 0 ? packed : ((packed << shift) | (packed >>> (16 - shift))) & 0xffff
      const allowed = (rotated & 15) | 1
      eliminations[cell] = 15 & ~allowed
    }
    const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, eliminations, limit: 64 })
    jointHint = hints?.choices.find(choice => choice.type === 'coupled-sums')
    if (jointHint) jointEliminations = eliminations
  }
  assert.ok(jointHint, 'expected a deduction which compares both equal-total rules')
  assert.deepEqual(jointHint.rules, [0, 1])
  assert.ok(jointHint.actions.length > 0)
  const mapped = await sizedRuleHintChoices({ rules: position.rules, solution: '1'.repeat(16) }, position.grid, '0'.repeat(16), jointEliminations)
  const explanation = mapped?.choices.find(choice => choice.technique === 'sized-coupled-sums')?.evidence.variant
  assert.match(explanation?.description ?? '', /R1C1/)
  assert.match(explanation?.reason ?? '', /compatible totals are/)
})

test('the published 6×6 Zipper and Region Sum export imports and solves with all authored rules', async () => {
  const imported = await detectPuzzle(zipperRegionSumFixture.code)
  assert.ok(imported.grid && imported.sizedRules)
  assert.equal(imported.authoredSolution, zipperRegionSumFixture.solution)
  const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, imported.givens)

  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  const solved = await runEngine({ type: 'sized-variant', operation: 'solve', position })
  assert.deepEqual(solved?.digits, Array.from(zipperRegionSumFixture.solution, Number))

  const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
  assert.deepEqual(trace?.at(-1)?.digits, Array.from(zipperRegionSumFixture.solution, Number))
})

test('sized digit restrictions filter candidates and provide a rule hint', async () => {
  const position: SizedConstraintPosition = {
    version: 2,
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    digits: Array(16).fill(0),
    rules: [{ type: 'digit-restriction', cells: [0], digits: [1, 4], shape: 'square' }],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(candidates?.[0], 0b1001)
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 10 })
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0 &&
    choice.actions.some(action => action.eliminate?.cell === 0 && action.eliminate.digit === 2)))
})

test('Zipper Lines compose with existing rules on boxless and irregular grids', async () => {
  const boxless = {
    version: 2 as const,
    grid: { size: 5, noRegions: true as const },
    digits: Array.from('1234523451345124512351234', Number),
    rules: [
      { type: 'zipper' as const, cells: [0, 2, 1] },
      { type: 'thermometer' as const, cells: [0, 1, 2, 3, 4] },
    ],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: boxless }), 'unique')

  const irregular = {
    version: 2 as const,
    grid: {
      size: 4 as const,
      regions: [[0, 1, 5, 9], [2, 3, 7, 11], [4, 8, 12, 13], [6, 10, 14, 15]],
    },
    digits: Array.from('1234234134124123', Number),
    rules: [
      { type: 'zipper' as const, cells: [0, 2, 1] },
      { type: 'renban' as const, cells: [0, 1, 2] },
    ],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: irregular }), 'unique')
})

test('Zipper paths reject repeated cells and paths shorter than three cells', () => {
  const grid = { size: 4, boxRows: 2, boxColumns: 2 } as const
  assert.equal(isSizedRuleList([{ type: 'zipper', cells: [0, 1, 0] }], grid), false)
  assert.equal(isSizedRuleList([{ type: 'zipper', cells: [0, 1] }], grid), false)
  assert.equal(isSizedRuleList([{ type: 'zipper', cells: [0, 1, 16] }], grid), false)
})
