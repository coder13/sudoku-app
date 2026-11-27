import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import type { DeductionAction, DeductionMatch, EngineRequest, EngineResponse, HintChoice } from '../src/sudoku/engine.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { ANALYSIS_GROUPS, ANALYSIS_TECHNIQUES, analysisGroupsForCatalog, classicBasicTechniqueCounts, filterAnalysisGroups, summarizeDeductions, summarizeGroup, techniqueHintsFromMatches } from '../src/sudoku/puzzle-analysis.ts'
import { cachedTechniqueCounts, watchTechniqueScan, techniqueScanKey } from '../src/sudoku/technique-scan.ts'

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

test('the technique finder includes every detector in the Rust engine catalog', () => {
  const source = readFileSync(new URL('../crates/engine/src/technique.rs', import.meta.url), 'utf8')
  const start = source.indexOf('catalog! {')
  const rustCatalog = source.slice(start, source.indexOf('\n}', start))
  const ids = [...rustCatalog.matchAll(/^\s*\w+:\s*"([^"]+)"/gm)].map((match) => match[1])
  assert.ok(ids.length >= 72)
  assert.equal(new Set(ANALYSIS_TECHNIQUES).size, ANALYSIS_TECHNIQUES.length)
  assert.deepEqual(new Set(ANALYSIS_TECHNIQUES), new Set(ids))

  const groups = analysisGroupsForCatalog(ids.map((id) => ({ id })))
  assert.equal(groups.length, ANALYSIS_GROUPS.filter(({ techniques }) => techniques.some((id) => ids.includes(id))).length)
  assert.deepEqual(groups.flatMap(({ techniques }) => techniques).sort(), [...ids].sort())
  assert.deepEqual(analysisGroupsForCatalog([...ids.map((id) => ({ id })), { id: 'future-technique' }])
    .at(-1), { title: 'Other techniques', techniques: ['future-technique'] })
})

test('variant deductions have a named section in the technique finder', () => {
  const groups = analysisGroupsForCatalog(['locked-candidates', 'anti-knight', 'anti-king', 'conditional-neighbor', 'future-technique']
    .map((id) => ({ id })))
  assert.deepEqual(groups, [
    { title: 'Variant techniques', techniques: ['locked-candidates', 'anti-knight', 'anti-king', 'conditional-neighbor'] },
    { title: 'Other techniques', techniques: ['future-technique'] },
  ])
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

test('attribute an overlapping single candidate to the first basic technique', () => {
  const solved = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const values = `0${solved.slice(1)}`
  assert.deepEqual(classicBasicTechniqueCounts(values), {
    'full-house': { count: 1 }, 'hidden-single-box': { count: 0 },
    'naked-single': { count: 0 }, 'hidden-single': { count: 0 },
  })
})

test('the technique finder caches zero counts, separates edits, and retries failures', async (t) => {
  let requests = 0
  let failNext = false
  class TestWorker {
    onmessage?: (event: { data: EngineResponse }) => void

    terminate() {}
    postMessage({ id, request }: { id: number; request: EngineRequest }) {
      assert.equal(request.type, 'technique-count')
      requests++
      const data = failNext ? { id, error: 'Scan failed' } : { id, value: request.eliminations?.[2] ?? 0 }
      failNext = false
      queueMicrotask(() => this.onmessage?.({ data }))
    }
  }
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true })
  t.after(() => {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })

  const first = watchTechniqueScan(STARTER)
  t.after(first.close)
  const original = first.count('pointing')
  assert.equal(first.count('pointing'), original)
  assert.equal(await original, 0)
  assert.equal(await first.count('pointing'), 0)
  assert.equal(requests, 1)

  const eliminations = Array<number>(81).fill(0)
  eliminations[2] = 1
  const edited = watchTechniqueScan(STARTER, eliminations)
  t.after(edited.close)
  failNext = true
  await assert.rejects(edited.count('pointing'), /Scan failed/)
  const editedKey = techniqueScanKey(STARTER, eliminations)
  assert.equal(cachedTechniqueCounts(editedKey).pointing, undefined)
  assert.equal(await edited.count('pointing'), 1)
  assert.deepEqual(cachedTechniqueCounts(editedKey).pointing, { count: 1 })
  assert.equal(await first.count('pointing'), 0)
  assert.equal(requests, 3)
})

test('technique scan keys include the candidate attribution order', () => {
  assert.notEqual(
    techniqueScanKey(STARTER, undefined, undefined, undefined, ['pointing', 'claiming']),
    techniqueScanKey(STARTER, undefined, undefined, undefined, ['claiming', 'pointing']),
  )
})

test('hide-zero filter retains pending techniques and scan failures', () => {
  const groups = [
    { title: 'Singles', techniques: ['naked-single', 'hidden-single'] },
    { title: 'Fish', techniques: ['x-wing', 'swordfish'] },
    { title: 'Wings', techniques: ['xy-wing'] },
  ]
  const results = {
    'naked-single': { count: 3 },
    'hidden-single': { count: 0 },
    'x-wing': { count: 0 },
    'swordfish': { error: 'Scan unavailable' },
  }
  assert.deepEqual(filterAnalysisGroups(groups, results, false), groups)
  assert.deepEqual(filterAnalysisGroups(groups, results, true), [
    { title: 'Singles', techniques: ['naked-single'] },
    { title: 'Fish', techniques: ['swordfish'] },
    { title: 'Wings', techniques: ['xy-wing'] },
  ])
  assert.deepEqual(filterAnalysisGroups(groups, results, true, true), [])
  assert.deepEqual(filterAnalysisGroups(groups, {
    'naked-single': { count: 0 }, 'hidden-single': { count: 0 },
    'x-wing': { count: 0 }, 'swordfish': { count: 0 }, 'xy-wing': { count: 0 },
  }, true), [])
})

test('technique hint navigation groups all eliminations from one pointing pattern', () => {
  const first: HintChoice['evidence'] = {
    intersection: { source: { box: 0 }, target: { row: 0 }, cells: [0, 1] },
  }
  const second: HintChoice['evidence'] = {
    intersection: { source: { box: 1 }, target: { row: 1 }, cells: [12, 13] },
  }
  function withEvidence(actions: DeductionAction[], evidence: HintChoice['evidence'], technique = 'pointing'): DeductionMatch {
    const found = match(actions, [technique])
    return { ...found, proofs: found.proofs.map((proof) => ({ ...proof, evidence })) }
  }
  const matches = [
    withEvidence([{ eliminate: { cell: 3, digit: 2 } }], first),
    withEvidence([{ eliminate: { cell: 4, digit: 2 } }], first),
    withEvidence([{ eliminate: { cell: 3, digit: 2 } }], first),
    withEvidence([{ eliminate: { cell: 17, digit: 5 } }], second),
    match([{ place: { cell: 34, digit: 8 } }], ['naked-single']),
  ]
  const hints = techniqueHintsFromMatches(matches, 'pointing')
  assert.equal(hints.length, 2)
  assert.equal(hints[0].technique, 'pointing')
  assert.deepEqual(hints[0].evidence, first)
  assert.deepEqual(hints[0].actions, [
    { eliminate: { cell: 3, digit: 2 } },
    { eliminate: { cell: 4, digit: 2 } },
  ])
  assert.deepEqual(hints[1].evidence, second)
  assert.deepEqual(hints[1].actions, [{ eliminate: { cell: 17, digit: 5 } }])
  assert.deepEqual(techniqueHintsFromMatches(matches, 'xy-wing'), [])

  const alsEvidence: HintChoice['evidence'] = { 'als-xz': {
    sets: [
      { cells: [1, 2, 3, 4], digits: [1, 2, 3, 4] },
      { cells: [10, 11, 12, 13], digits: [1, 2, 3, 4] },
    ],
    links: [1],
  } }
  const alsMatches = [
    withEvidence([{ eliminate: { cell: 30, digit: 5 } }], alsEvidence, 'als-xz'),
    withEvidence([{ eliminate: { cell: 38, digit: 5 } }], alsEvidence, 'als-xz'),
  ]
  assert.deepEqual(techniqueHintsFromMatches(alsMatches, 'als-xz').map(({ actions }) => actions), [[
    { eliminate: { cell: 30, digit: 5 } }, { eliminate: { cell: 38, digit: 5 } },
  ]])
})
