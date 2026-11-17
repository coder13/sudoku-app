import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import type { DeductionAction, DeductionMatch } from '../src/sudoku/engine.ts'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, analysisGroupsForCatalog, summarizeDeductions, summarizeGroup, techniqueTargetCount } from '../src/sudoku/puzzle-analysis.ts'

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

test('available techniques include every detector in the Rust engine catalog', () => {
  const source = readFileSync(new URL('../crates/engine/src/technique.rs', import.meta.url), 'utf8')
  const rustCatalog = source.slice(source.indexOf('catalog! {'), source.indexOf('impl Technique {'))
  const ids = [...rustCatalog.matchAll(/^\s*\w+:\s*"([^"]+)"/gm)].map((match) => match[1])
  assert.ok(ids.length >= 72)
  assert.equal(new Set(ANALYSIS_TECHNIQUES).size, ANALYSIS_TECHNIQUES.length)
  assert.deepEqual(new Set(ANALYSIS_TECHNIQUES), new Set(ids))

  const groups = analysisGroupsForCatalog(ids.map((id) => ({ id })))
  assert.equal(groups.length, ANALYSIS_GROUPS.length)
  assert.deepEqual(groups.flatMap(({ techniques }) => techniques).sort(), [...ids].sort())
  assert.deepEqual(analysisGroupsForCatalog([...ids.map((id) => ({ id })), { id: 'future-technique' }])
    .at(-1), { title: 'Other techniques', techniques: ['future-technique'] })
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

test('candidate target counts include both placements and removals without double-counting proofs', () => {
  const moves = [
    match([{ place: { cell: 14, digit: 8 } }], ['forcing-chain']),
    match([{ eliminate: { cell: 20, digit: 2 } }, { eliminate: { cell: 21, digit: 2 } }], ['forcing-chain', 'aic']),
    match([{ eliminate: { cell: 20, digit: 2 } }], ['forcing-chain']),
    match([{ eliminate: { cell: 30, digit: 7 } }], ['aic']),
  ]
  assert.equal(techniqueTargetCount(moves, 'forcing-chain'), 3)
  assert.equal(techniqueTargetCount(moves, 'aic'), 3)
  assert.equal(techniqueTargetCount(moves, 'xy-wing'), 0)
})
