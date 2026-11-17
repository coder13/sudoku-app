import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DeductionAction, DeductionMatch } from '../src/sudoku/engine.ts'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, summarizeDeductions, summarizeGroup } from '../src/sudoku/puzzle-analysis.ts'

function match(actions: DeductionAction[], techniques: string[]): DeductionMatch {
  const affectedCandidates = actions.map((action) => 'place' in action ? action.place : action.eliminate)
  return {
    actions,
    affectedCandidates,
    affectedCells: [...new Set(affectedCandidates.map(({ cell }) => cell))],
    proofs: techniques.map((technique) => ({
      technique,
      evidence: { cell: 0 },
      pattern: { houses: [], cells: [], candidates: [] },
    })),
  }
}

test('quick scan covers common singles, pointing, wings and fish without repeated detectors', () => {
  assert.equal(new Set(ANALYSIS_TECHNIQUES).size, ANALYSIS_TECHNIQUES.length)
  for (const technique of ['naked-single', 'hidden-single', 'pointing', 'xy-wing', 'x-wing', 'swordfish', 'bug-plus-one']) {
    assert.ok(ANALYSIS_TECHNIQUES.includes(technique), technique)
  }
  assert.ok(!ANALYSIS_TECHNIQUES.includes('forcing-net'))
  assert.equal(ANALYSIS_GROUPS.length, 7)
  assert.deepEqual(ANALYSIS_GROUPS.find((group) => group.title === 'Uniqueness')?.techniques, ['bug-plus-one'])
  assert.equal(ANALYSIS_GROUPS.find((group) => group.title === 'Uniqueness')?.kind, 'placements')
})

test('count distinct action targets for each technique even with overlapping proofs and moves', () => {
  const findings = summarizeDeductions([
    match([{ place: { cell: 0, digit: 1 } }], ['naked-single', 'full-house']),
    match([{ place: { cell: 0, digit: 1 } }], ['naked-single']),
    match([
      { eliminate: { cell: 20, digit: 2 } },
      { eliminate: { cell: 21, digit: 2 } },
    ], ['pointing', 'claiming']),
    match([{ eliminate: { cell: 20, digit: 2 } }], ['pointing']),
    match([{ eliminate: { cell: 18, digit: 3 } }], ['xy-wing']),
    match([{ place: { cell: 4, digit: 9 } }], ['bug-plus-one']),
  ])
  assert.deepEqual(findings.find(({ technique }) => technique === 'naked-single'), {
    technique: 'naked-single', patterns: 2, placements: [{ cell: 0, digit: 1 }], removals: [],
  })
  assert.deepEqual(findings.find(({ technique }) => technique === 'pointing'), {
    technique: 'pointing', patterns: 2, placements: [], removals: [{ cell: 20, digit: 2 }, { cell: 21, digit: 2 }],
  })
  assert.deepEqual(summarizeGroup(findings.filter(({ technique }) => ['naked-single', 'full-house'].includes(technique))),
    { placements: 1, removals: 0 })
  assert.deepEqual(summarizeGroup(findings.filter(({ technique }) => ['pointing', 'claiming'].includes(technique))),
    { placements: 0, removals: 2 })
  assert.deepEqual(findings.find(({ technique }) => technique === 'bug-plus-one'), {
    technique: 'bug-plus-one', patterns: 1, placements: [{ cell: 4, digit: 9 }], removals: [],
  })
  assert.deepEqual(summarizeGroup([]), { placements: 0, removals: 0 })
})
