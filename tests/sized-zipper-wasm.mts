import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type SizedConstraintPosition } from '../src/sudoku/engine.ts'
import { isSizedRuleList } from '../src/sudoku/sized-rule-game.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker(process.env.SIZED_RULES_WASM)

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
