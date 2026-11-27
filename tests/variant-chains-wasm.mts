import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeChains, candidateId, makeChainGraph } from '../src/sudoku/chains.ts'
import { runEngine, type Candidate, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const examples: { rule: VariantRule; path: [Candidate, Candidate, Candidate, Candidate]; target: Candidate }[] = [
  {
    rule: { type: 'anti-knight' },
    path: [{ cell: 2, digit: 1 }, { cell: 2, digit: 2 }, { cell: 13, digit: 2 }, { cell: 13, digit: 1 }],
    target: { cell: 4, digit: 1 },
  },
  {
    rule: { type: 'anti-king' },
    path: [{ cell: 2, digit: 1 }, { cell: 2, digit: 2 }, { cell: 12, digit: 2 }, { cell: 12, digit: 1 }],
    target: { cell: 3, digit: 1 },
  },
  {
    rule: { type: 'non-consecutive' },
    path: [{ cell: 0, digit: 2 }, { cell: 0, digit: 6 }, { cell: 1, digit: 5 }, { cell: 1, digit: 1 }],
    target: { cell: 2, digit: 2 },
  },
  {
    rule: { type: 'kropki', consecutive: { pairs: [[0, 1], [1, 2]] } },
    path: [{ cell: 0, digit: 2 }, { cell: 0, digit: 6 }, { cell: 1, digit: 1 }, { cell: 1, digit: 5 }],
    target: { cell: 2, digit: 2 },
  },
]

for (const { rule, path, target } of examples) {
  test(`${rule.type} links work in drawn chains and automatic chain hints`, async () => {
    const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [rule] }
    const masks = Array<number>(81).fill(0x1ff)
    for (const [left, right] of [[path[0], path[1]], [path[2], path[3]]]) {
      masks[left.cell] = (1 << (left.digit - 1)) | (1 << (right.digit - 1))
    }
    const [first, second, third, fourth] = path.map(candidateId)
    const actions = analyzeChains(makeChainGraph(masks, puzzle),
      [[first, second], [second, third], [third, fourth]])[0].actions
    const eliminatesTarget = (action: (typeof actions)[number]) => 'eliminate' in action
      && action.eliminate.cell === target.cell && action.eliminate.digit === target.digit
    assert.ok(actions.some(eliminatesTarget))
    assert.equal(makeChainGraph(masks, { ...puzzle, rules: [] }).strength(second, third), undefined)
    if (rule.type === 'non-consecutive') {
      const exempt = { ...puzzle, rules: [{ ...rule, except: [[0, 1] as const] }] }
      assert.equal(makeChainGraph(masks, exempt).strength(second, third), undefined)
    }

    const position = { puzzle, eliminations: masks.map(mask => 0x1ff & ~mask) }
    const deductions = await runEngine({ type: 'variant', operation: 'hints', position,
      techniqueOrder: ['aic'], limit: 0xffff_ffff })
    const found = deductions.find(({ actions, evidence }) =>
      actions.some(eliminatesTarget) && evidence.type === 'classic' && 'inference' in evidence.proof
      && evidence.proof.inference.links.some(({ source }) => 'variant-rule' in source && source['variant-rule'] === rule.type))
    assert.ok(found)
    const deduction = variantHintChoice(found, puzzle)
    const diagram = lessonDiagram({ deduction, candidates: masks, pattern: deduction.pattern })
    assert.ok(diagram.reasonSteps?.some(step => step.includes('from both being true.')))
  })
}
