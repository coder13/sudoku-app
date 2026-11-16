import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import { replayStep, runEngine, runGeneration, type EngineRequest, type EngineResponse, type EngineResult } from '../src/sudoku/engine.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { applyDeduction, completeCandidateMasks, isSolved, restartGame, valuesOf, enter, hasCandidate, hintEliminations, makeGame, replaceCandidates, undo } from '../src/sudoku/game.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { generatePlayableVariant, playCandidates } from '../src/sudoku/variant-play.ts'
import { validVariantSave } from '../src/sudoku/variants.ts'
import { saveSolverProfile } from '../src/sudoku/solver-profile.ts'

const SPARSE = '345000000000200010000000000020100000000004500600000007800750000000060040000000300'
const TEMPLATE = '000500000600000309000008200000000000538000000000007001200090000001000007000300080'
const LOCKED_PAIR = '970500060000007103800040000000080900685000000100003002000000000000600057008090200'

function engineRequests() {
  let id = 0
  const handle = createEngineHandler(async () => {
    const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
    const { instance } = await WebAssembly.instantiate(bytes)
    return instance.exports as unknown as EngineExports
  })

  const raw = (request: EngineRequest) => handle({ id: ++id, request })
  async function run<Request extends EngineRequest>(request: Request): Promise<EngineResult<Request>> {
    const response = await raw(request)
    assert.ok('value' in response, JSON.stringify(response))
    return response.value as EngineResult<Request>
  }
  return { raw, run }
}

test('ranked hints count distinct moves and prefer the easier proof at a tied cost', async () => {
  const { run } = engineRequests()
  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  assert.deepEqual(await run({ type: 'hints', values: solved }), { choices: [], available: 0 })
  assert.deepEqual(await run({ type: 'hints', values: `0${solved.slice(1)}` }), {
    choices: [{
      technique: 'full-house',
      evidence: { house: { row: 0 } },
      actions: [{ place: { cell: 0, digit: Number(solved[0]) } }],
    }],
    available: 1,
  })
  assert.deepEqual(await run({ type: 'hints', values: `00${solved.slice(2)}` }), {
    choices: [0, 1].map(cell => ({
      technique: 'full-house',
      evidence: { house: { column: cell } },
      actions: [{ place: { cell, digit: Number(solved[cell]) } }],
    })),
    available: 2,
  })

  const { choices, available } = await run({ type: 'hints', values: LOCKED_PAIR })
  assert.equal(available, 10)
  assert.equal(choices.length, 10)
  assert.equal(new Set(choices.map(choice => JSON.stringify(choice.actions))).size, 10)
  const remove = (cell: number, digit: number) => ({ eliminate: { cell, digit } })
  assert.deepEqual(choices.slice(0, 6).map(({ technique, actions }) => [technique, actions]), [
    ['locked-pair', [remove(2, 4), remove(5, 8), remove(16, 4), remove(16, 8)]],
    ['pointing', [remove(19, 5)]],
    ['pointing', [remove(48, 9)]],
    ['pointing', [remove(55, 9), remove(56, 9)]],
    ['claiming', [remove(34, 3)]],
    ['pointing', [remove(30, 2), remove(32, 2)]],
  ])
})

test('hint diagrams use the current candidates and exclude previously removed candidates', async () => {
  const { run } = engineRequests()
  const values = LOCKED_PAIR
  const { choices, candidates } = await run({ type: 'hints', values, includePatterns: true })
  assert.equal(candidates?.length, 81)
  const first = choices[0]
  assert.equal(first.technique, 'locked-pair')
  assert.ok(first.pattern?.candidates.length)
  assert.ok(first.pattern.houses.length)
  const eliminations = Array(81).fill(0)
  for (const action of first.actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    eliminations[cell] |= 1 << (digit - 1)
    assert.equal(candidates![cell] & eliminations[cell], eliminations[cell])
  }
  const fresh = await run({ type: 'hints', values, eliminations, includePatterns: true, limit: 'all' })
  assert.ok(fresh.choices.length)
  assert.ok(fresh.candidates?.every((mask, cell) => (mask & eliminations[cell]) === 0))
  assert.ok(fresh.choices.every(({ actions }) => actions.every((action) =>
    'place' in action || !(eliminations[action.eliminate.cell] & (1 << (action.eliminate.digit - 1))))))
})

test('hints use a complete candidate grid after manual removals and respect undo', async () => {
  const { run } = engineRequests()
  const values = ['940020067', '756010002', '230067004', '890071256', '570206819',
    '612008743', '065782001', '029100678', '187600025'].join('')
  const request = { type: 'hints', values, includePatterns: true, limit: 10 } as const
  const original = await run(request)
  assert.deepEqual(original.choices[0].actions, [{ eliminate: { cell: 78, digit: 9 } }])
  assert.ok(original.candidates)
  const generated = replaceCandidates(makeGame('pointing-example', 'Pointing example', values, 'custom'), original.candidates)
  const manualRemovals = [[6, 3], [24, 9], [78, 9]] as const
  const edited = manualRemovals.reduce((game, [cell, digit]) => enter(game, [cell], 'candidate', digit), generated)
  const displayed = completeCandidateMasks(edited)
  assert.ok(displayed)
  const current = await run({ ...request, eliminations: hintEliminations(values, displayed) })

  assert.deepEqual(current.candidates, displayed)
  assert.ok(current.choices.length)
  for (const { actions } of current.choices) {
    for (const action of actions) {
      const { cell, digit } = 'eliminate' in action ? action.eliminate : action.place
      assert.ok(hasCandidate(displayed[cell], digit))
    }
  }

  const undone = await run({ ...request, eliminations: hintEliminations(values, completeCandidateMasks(undo(edited))) })
  assert.equal(hasCandidate(undone.candidates![78], 9), true)

  const partial = enter(edited, [2], 'candidate', 0)
  const applied = Array<number>(81).fill(0)
  applied[78] = 1 << 8
  assert.equal(hintEliminations(values, completeCandidateMasks(partial), applied), applied)
  const combined = hintEliminations(values, completeCandidateMasks(undo(edited)), applied)
  assert.ok(hasCandidate(combined![78], 9))
})

test('hint limits and disabled techniques apply before ranking and choosing a proof', async () => {
  const { run } = engineRequests()
  const values = STARTER
  const defaultHints = await run({ type: 'hints', values })
  assert.equal(defaultHints.choices.length, 10)
  assert.deepEqual(await run({ type: 'hints', values, limit: 0 }), { choices: [], available: 0 })
  assert.deepEqual(await run({ type: 'hints', values, limit: 1 }), { choices: defaultHints.choices.slice(0, 1), available: 1 })
  const more = await run({ type: 'hints', values, limit: 20 })
  assert.equal(more.choices.length, 20)
  assert.deepEqual(more.choices.slice(0, 10), defaultHints.choices)
  const all = await run({ type: 'hints', values, limit: 'all' })
  assert.ok(all.available > more.available)
  assert.equal(all.choices.length, all.available)
  assert.deepEqual(all.choices.slice(0, more.available), more.choices)
  assert.deepEqual(all.choices.slice(0, 10), defaultHints.choices)
  assert.equal(new Set(all.choices.map(({ actions }) => JSON.stringify(actions))).size, all.available)
  const { techniques } = await run({ type: 'techniques' })
  const tiers = ['easy', 'medium', 'hard', 'unfair', 'extreme']
  const ranks = more.choices.map(({ technique }) => {
    const info = techniques.find(({ id }) => id === technique)!
    return [tiers.indexOf(info.difficulty), info.cost]
  })
  assert.deepEqual(ranks, [...ranks].sort(([tierA, costA], [tierB, costB]) => tierA - tierB || costA - costB))

  const disabledTechniques = ['full-house', 'naked-single', 'hidden-single', 'pointing', 'claiming']
  const filtered = await run({ type: 'hints', values, disabledTechniques })
  assert.ok(filtered.choices.length)
  assert.ok(filtered.choices.every(({ technique }) => !disabledTechniques.includes(technique)))
  assert.deepEqual((await run({ type: 'next-deduction', values, disabledTechniques }))?.deduction, filtered.choices[0])

  const solved = await run({ type: 'solve', values })
  assert.ok(solved)
  const oneCell = `0${solved.slice(1)}`
  const alternateProof = await run({
    type: 'hints', values: oneCell, disabledTechniques: ['full-house', 'naked-single', 'retired-technique'],
  })
  assert.equal(alternateProof.available, 1)
  assert.equal(alternateProof.choices[0].technique, 'hidden-single')
  assert.deepEqual(alternateProof.choices[0].actions, [{ place: { cell: 0, digit: Number(solved[0]) } }])
  assert.deepEqual(await run({ type: 'hints', values: oneCell, disabledTechniques }), { choices: [], available: 0 })
  assert.equal(await run({ type: 'next-deduction', values: oneCell, disabledTechniques }), null)
})

test('ten ranked hints match the full search after accounting for candidate removals and disabled techniques', async () => {
  const { run } = engineRequests()
  const { choices } = await run({ type: 'hints', values: LOCKED_PAIR, limit: 1 })
  assert.equal(choices[0].technique, 'locked-pair')
  const eliminations = Array<number>(81).fill(0)
  for (const action of choices[0].actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    eliminations[cell] |= 1 << (digit - 1)
  }
  const request = {
    type: 'hints' as const, values: LOCKED_PAIR, eliminations, includePatterns: true,
    disabledTechniques: ['full-house', 'naked-single', 'hidden-single'],
  }
  const bounded = await run({ ...request, limit: 10 })
  const full = await run({ ...request, limit: 'all' })
  assert.ok(full.choices.length > 10)
  assert.equal(bounded.available, 10)
  assert.deepEqual(bounded.choices, full.choices.slice(0, 10))
  assert.deepEqual(bounded.candidates, full.candidates)
  assert.equal(new Set(full.choices.map(({ actions }) => JSON.stringify(actions))).size, full.choices.length)
})

test('next deduction supports a single move and reveals the same proof in three levels', async () => {
  const { raw, run } = engineRequests()
  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  assert.equal(await run({ type: 'next-deduction', values: solved }), null)
  const lastMove = `0${solved.slice(1)}`
  const only = { place: { cell: 0, digit: Number(solved[0]) } }
  assert.deepEqual(await run({ type: 'next-deduction', values: lastMove }), {
    technique: 'full-house',
    pattern: { houses: [{ row: 0 }], cells: [], candidates: [] },
    deduction: { technique: 'full-house', evidence: { house: { row: 0 } }, actions: [only] },
  })
  assert.deepEqual((await run({ type: 'hints', values: lastMove })).choices[0].actions, [only])

  const { choices } = await run({ type: 'hints', values: LOCKED_PAIR })
  const stages = await run({ type: 'next-deduction', values: LOCKED_PAIR })
  assert.deepEqual(stages, {
    technique: 'locked-pair',
    pattern: {
      houses: [{ row: 0 }, { box: 2 }],
      cells: [6, 8],
      candidates: [{ cell: 6, digit: 4 }, { cell: 6, digit: 8 }, { cell: 8, digit: 4 }, { cell: 8, digit: 8 }],
    },
    deduction: choices[0],
  })

  const eliminations = Array<number>(81).fill(0)
  eliminations[2] = 0b11
  const withRemovals = await run({ type: 'next-deduction', values: STARTER, eliminations })
  assert.deepEqual(withRemovals, {
    technique: 'naked-single',
    pattern: { houses: [], cells: [2], candidates: [] },
    deduction: { technique: 'naked-single', evidence: { cell: 2 }, actions: [{ place: { cell: 2, digit: 4 } }] },
  })

  const invalid = await raw({ type: 'next-deduction', values: lastMove, eliminations: [1] })
  assert.ok('code' in invalid && invalid.code === 'invalid-eliminations')
  const conflict = await raw({ type: 'next-deduction', values: `${solved[1]}${solved.slice(1)}` })
  assert.ok('code' in conflict && conflict.code === 'conflict')
})

test('deduction search returns shared effects and distinct proofs for the selected techniques', async () => {
  const { raw, run } = engineRequests()
  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  const values = `0${solved.slice(1)}`
  const target = { cell: 0, digit: Number(solved[0]) }
  const techniques = ['hidden-single', 'full-house']
  const results = await run({ type: 'deductions', values, techniqueOrder: techniques })
  const houses = [{ row: 0 }, { column: 0 }, { box: 0 }]
  assert.deepEqual(results, [{
    actions: [{ place: target }],
    affectedCells: [0],
    affectedCandidates: [target],
    proofs: techniques.flatMap(technique => houses.map(house => ({
      technique, evidence: { house }, pattern: { houses: [house], cells: [0], candidates: [target] },
    }))),
  }])
  assert.deepEqual(await run({ type: 'deductions', values, techniqueOrder: [] }), [])
  const invalid = await raw({ type: 'deductions', values, techniqueOrder: ['unknown'] })
  assert.ok('code' in invalid && invalid.code === 'invalid-profile')
  const badRemovals = await raw({ type: 'deductions', values, eliminations: [1] })
  assert.ok('code' in badRemovals && badRemovals.code === 'invalid-eliminations')

  const pairs = await run({ type: 'deductions', values: LOCKED_PAIR, techniqueOrder: ['locked-pair'] })
  const locked = pairs.find(result => result.proofs.some(proof =>
    'subset' in proof.evidence && proof.evidence.subset.cells.join(',') === '6,8'))
  assert.ok(locked)
  assert.deepEqual(locked.affectedCells, [2, 5, 16])
  assert.deepEqual(locked.affectedCandidates, [{ cell: 2, digit: 4 }, { cell: 5, digit: 8 }, { cell: 16, digit: 4 }, { cell: 16, digit: 8 }])
  assert.deepEqual(locked.proofs[0].pattern, {
    houses: [{ row: 0 }, { box: 2 }],
    cells: [6, 8],
    candidates: [{ cell: 6, digit: 4 }, { cell: 6, digit: 8 }, { cell: 8, digit: 4 }, { cell: 8, digit: 8 }],
  })
})

test('solve traces replay placements and candidate removals with the recorded evidence', async () => {
  const { raw, run } = engineRequests()
  const request = {
    type: 'logical-solve',
    values: LOCKED_PAIR,
    techniqueOrder: ['locked-pair', 'naked-single', 'hidden-single'],
  } as const
  const trace = await run({ ...request, includePositions: true })
  const plain = await run(request)
  assert.equal(replayStep(plain, 0), null)
  assert.deepEqual(trace.steps, plain.steps)
  assert.deepEqual(trace.rating, plain.rating)
  assert.equal(trace.positions?.length, trace.steps.length + 1)

  const first = replayStep(trace, 0)
  assert.ok(first)
  const empty = '0'.repeat(81)
  assert.deepEqual(first.before, { givens: LOCKED_PAIR, entries: empty, eliminations: Array(81).fill(0) })
  const removals = [...first.before.eliminations]
  removals[2] = 1 << 3
  removals[5] = 1 << 7
  removals[16] = (1 << 3) | (1 << 7)
  assert.deepEqual(first.after, { ...first.before, eliminations: removals })
  assert.deepEqual(first.deduction.evidence, {
    subset: { house: { row: 0 }, cells: [6, 8], digits: [4, 8], lockedIn: { box: 2 } },
  })

  const second = replayStep(trace, 1)
  assert.ok(second)
  assert.deepEqual(second.before, first.after)
  assert.deepEqual(second.after, { ...first.after, entries: `${empty.slice(0, 12)}8${empty.slice(13)}` })
  assert.deepEqual(second.deduction, {
    technique: 'hidden-single', evidence: { house: { row: 1 } }, actions: [{ place: { cell: 12, digit: 8 } }],
  })
  const last = replayStep(trace, trace.steps.length - 1)
  assert.ok(last)
  const finalGrid = [...last.after.givens].map((digit, cell) => digit === '0' ? last.after.entries[cell] : digit).join('')
  assert.equal(finalGrid, trace.board)
  for (const index of [-1, 0.5, trace.steps.length]) assert.equal(replayStep(trace, index), null)

  const partial = await run({ ...request, techniqueOrder: ['locked-pair'], includePositions: true })
  assert.equal(partial.rating.status, 'stalled')
  assert.deepEqual(replayStep(partial, 0), first)
  assert.equal(replayStep(partial, 1), null)

  const preview = await run({ ...request, techniqueOrder: ['locked-pair'], includeStepDetails: true })
  const step = replayStep(preview, 0)
  assert.ok(step?.before.candidates && step.after.candidates)
  assert.deepEqual(step.before.pattern, {
    houses: [{ row: 0 }, { box: 2 }],
    cells: [6, 8],
    candidates: [{ cell: 6, digit: 4 }, { cell: 6, digit: 8 }, { cell: 8, digit: 4 }, { cell: 8, digit: 8 }],
  })
  assert.equal(step.before.candidates[16] & removals[16], removals[16])
  assert.equal(step.after.candidates[16] & removals[16], 0)
  assert.equal(step.after.pattern, undefined)

  const entries = `${empty.slice(0, 40)}5${empty.slice(41)}`
  const eliminations = Array<number>(81).fill(0)
  eliminations[2] = 0b11
  const continued = await run({
    type: 'logical-solve', values: STARTER, entries, eliminations, techniqueOrder: ['naked-single'], includePositions: true,
  })
  assert.deepEqual(replayStep(continued, 0), {
    before: { givens: STARTER, entries, eliminations },
    deduction: { technique: 'naked-single', evidence: { cell: 2 }, actions: [{ place: { cell: 2, digit: 4 } }] },
    after: { givens: STARTER, entries: `${entries.slice(0, 2)}4${entries.slice(3)}`, eliminations },
  })
  const invalid = await raw({ ...request, entries: '9' })
  assert.ok('code' in invalid && invalid.code === 'invalid-grid')
})

test('solve-path availability counts distinct enabled easy moves and marks unfinished bottlenecks', async () => {
  const { run } = engineRequests()
  const trace = await run({ type: 'logical-solve', values: STARTER, includeMoveAvailability: true })
  const availability = trace.moveAvailability
  assert.ok(availability)
  assert.equal(availability.length, trace.steps.length + 1)
  assert.deepEqual(availability[0], { easyMoves: 16, bottleneck: false })
  assert.deepEqual(availability.at(-2), { easyMoves: 1, bottleneck: true })
  assert.deepEqual(availability.at(-1), { easyMoves: 0, bottleneck: false })

  const stalled = await run({
    type: 'logical-solve', values: STARTER, techniqueOrder: [], includeMoveAvailability: true,
  })
  assert.equal(stalled.rating.status, 'stalled')
  assert.deepEqual(stalled.moveAvailability, [{ easyMoves: 0, bottleneck: true }])
})

test('comparison keeps the same start and uses the versioned score for each enabled profile', async () => {
  const { run } = engineRequests()
  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  const result = await run({
    type: 'compare-solve-paths', values: `0${solved.slice(1)}`, technique: 'hidden-single',
    techniqueOrder: ['hidden-single', 'naked-single'],
  })
  const catalog = await run({ type: 'techniques' })
  assert.equal(result.withTechnique.board, solved)
  assert.equal(result.withoutTechnique.board, solved)
  assert.equal(result.withTechnique.rating.scoringVersion, catalog.scoringVersion)
  assert.equal(result.withoutTechnique.rating.scoringVersion, catalog.scoringVersion)
  assert.deepEqual(result.withTechnique.rating.score.counts, { 'hidden-single': 1 })
  assert.deepEqual(result.withoutTechnique.rating.score.counts, { 'naked-single': 1 })
  assert.equal(result.withTechnique.rating.score.points, 14)
  assert.equal(result.withoutTechnique.rating.score.points, 4)

  const enabledByComparison = await run({
    type: 'compare-solve-paths', values: `0${solved.slice(1)}`, technique: 'hidden-single', techniqueOrder: [],
  })
  assert.deepEqual(enabledByComparison.withTechnique.rating.techniqueOrder, ['hidden-single'])
  assert.equal(enabledByComparison.withTechnique.board, solved)
  assert.equal(enabledByComparison.withoutTechnique.rating.status, 'stalled')
})

test('alternate solve paths report found, exhausted, and inconclusive outcomes within the supplied budget', async () => {
  const { run } = engineRequests()
  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  const request = {
    type: 'alternate-solve-path' as const, values: `00${solved.slice(2)}`, technique: 'hidden-single',
    techniqueOrder: ['hidden-single', 'naked-single'],
  }
  assert.deepEqual(await run({ ...request, maxPositions: 1 }), {
    status: 'inconclusive', positionsSearched: 1, path: null,
  })
  const found = await run({ ...request, maxPositions: 2 })
  assert.equal(found.status, 'found')
  assert.equal(found.positionsSearched, 2)
  assert.equal(found.path?.board, solved)
  assert.deepEqual(found.path?.rating.techniqueOrder, ['naked-single'])
  assert.equal(found.path?.rating.score.points, 8)
  assert.ok(found.path?.steps.every(({ technique }) => technique === 'naked-single'))
  assert.deepEqual(await run({ ...request, maxPositions: 2, techniqueOrder: ['hidden-single'] }), {
    status: 'no-path', positionsSearched: 1, path: null,
  })
  assert.equal((await run({ ...request, values: solved, maxPositions: 0 })).status, 'found')
})

test('practice opens before the requested technique with the full position', async () => {
  const { raw, run } = engineRequests()
  const request = {
    type: 'practice-position',
    values: LOCKED_PAIR,
    technique: 'naked-single',
    techniqueOrder: ['locked-pair', 'naked-single', 'hidden-single'],
  } as const
  const practice = await run(request)
  assert.ok(practice)
  const { candidates, ...snapshot } = practice
  const entries = Array<string>(81).fill('0')
  entries[12] = '8'
  entries[16] = '9'
  const eliminations = Array<number>(81).fill(0)
  eliminations[2] = 1 << 3
  eliminations[5] = 1 << 7
  eliminations[16] = (1 << 3) | (1 << 7)
  assert.deepEqual(snapshot, { givens: LOCKED_PAIR, entries: entries.join(''), eliminations })
  const values = [...LOCKED_PAIR].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
  const legal = await run({ type: 'notes', values })
  assert.ok(legal)
  assert.deepEqual(candidates, legal.map((mask, cell) => mask & ~eliminations[cell]))
  assert.equal(candidates[26], 1 << 4)
  assert.equal(await run({ ...request, techniqueOrder: ['locked-pair', 'hidden-single'] }), null)
  assert.equal(await run({ ...request, technique: 'x-wing', techniqueOrder: [...request.techniqueOrder, 'x-wing'] }), null)
  const unknown = await raw({ ...request, technique: 'unknown' })
  assert.ok('code' in unknown && unknown.code === 'invalid-technique')

  const prefilled = Array<string>(81).fill('0')
  prefilled[40] = '5'
  const established = Array<number>(81).fill(0)
  established[2] = 0b11
  const continuation = await run({
    ...request, values: STARTER, entries: prefilled.join(''), eliminations: established, techniqueOrder: ['naked-single'],
  })
  assert.ok(continuation)
  assert.equal(continuation.entries, prefilled.join(''))
  assert.deepEqual(continuation.eliminations, established)
  assert.equal(continuation.candidates[2], 1 << 3)
})

test('practice checking accepts alternatives only when the selected technique proves the action', async () => {
  const { raw, run } = engineRequests()
  const request = {
    type: 'check-practice-move', values: LOCKED_PAIR, technique: 'pointing', action: { eliminate: { cell: 32, digit: 2 } },
  } as const
  assert.deepEqual(await run(request), {
    technique: 'pointing',
    evidence: { intersection: { source: { box: 3 }, target: { row: 3 }, cells: [27, 28, 29] } },
    actions: [{ eliminate: { cell: 30, digit: 2 } }, request.action],
  })
  assert.equal(await run({ ...request, technique: 'locked-pair' }), null)
  assert.equal(await run({ ...request, action: { place: request.action.eliminate } }), null)
  const eliminations = Array<number>(81).fill(0)
  eliminations[32] = 1 << 1
  assert.equal(await run({ ...request, eliminations }), null)
  const badTechnique = await raw({ ...request, technique: 'unknown' })
  assert.ok('code' in badTechnique && badTechnique.code === 'invalid-technique')

  const entries = Array<string>(81).fill('0')
  entries[40] = '5'
  const established = Array<number>(81).fill(0)
  established[2] = 0b11
  const placement = {
    type: 'check-practice-move', values: STARTER, entries: entries.join(''),
    technique: 'naked-single', action: { place: { cell: 2, digit: 4 } },
  } as const
  assert.equal(await run(placement), null)
  assert.deepEqual(await run({ ...placement, eliminations: established }), {
    technique: 'naked-single', evidence: { cell: 2 }, actions: [placement.action],
  })
  established[2] |= 1 << 3
  const invalidPosition = await raw({ ...placement, eliminations: established })
  assert.ok('code' in invalidPosition && invalidPosition.code === 'invalid-eliminations')
})

test('lesson examples preserve the candidates and deduction for each technique', async () => {
  const { run } = engineRequests()
  const catalog = await run({ type: 'techniques' })
  const lessons = await run({ type: 'lesson-examples' })
  assert.deepEqual(Object.keys(lessons).sort(), catalog.techniques.map(({ id }) => id).sort())
  for (const [id, { givens, entries, eliminations, candidates, deduction, practice }] of Object.entries(lessons)) {
    assert.equal(deduction.technique, id)
    assert.match(givens, /^[0-9]{81}$/)
    assert.match(entries, /^[0-9]{81}$/)
    const values = [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
    const legal = await run({ type: 'notes', values })
    assert.ok(legal)
    assert.equal(eliminations.length, 81)
    assert.deepEqual(candidates, legal.map((mask, cell) => mask & ~eliminations[cell]))
    assert.ok(deduction.actions.length)
    for (const action of deduction.actions) {
      const { cell, digit } = 'place' in action ? action.place : action.eliminate
      assert.ok((candidates[cell] & (1 << (digit - 1))) !== 0)
    }
    assert.notEqual(practice.givens, givens)
    const practiceValues = [...practice.givens].map((digit, cell) => digit === '0' ? practice.entries[cell] : digit).join('')
    const practiceLegal = await run({ type: 'notes', values: practiceValues })
    assert.ok(practiceLegal)
    assert.equal(practice.eliminations.length, 81)
    assert.deepEqual(practice.candidates, practiceLegal.map((mask, cell) => mask & ~practice.eliminations[cell]))
    assert.ok(practice.answers.some((action) => JSON.stringify(action) === JSON.stringify(practice.suggestion)))
    for (const action of practice.answers) {
      const { cell, digit } = 'place' in action ? action.place : action.eliminate
      assert.ok((practice.candidates[cell] & (1 << (digit - 1))) !== 0)
    }
  }
  assert.equal(lessons['hidden-quadruple'].candidates[50] & (1 << 6), 0)
  const transposed = Array<number>(81).fill(0)
  transposed[50] = 1 << 0
  transposed[60] = 1 << 5
  transposed[61] = 1 << 2
  assert.deepEqual(lessons['hidden-quadruple'].practice.eliminations, transposed)
})

test('practice exercises expose three independent grids and a checkable suggestion for a technique', async () => {
  const { raw, run } = engineRequests()
  for (const technique of ['naked-single', 'locked-pair', 'sk-loop', 'mutant-fish']) {
    const exercises = await run({ type: 'practice-examples', technique })
    assert.equal(exercises.length, 3)
    assert.equal(new Set(exercises.map(({ givens }) => givens)).size, 3)
    for (const exercise of exercises) {
      assert.equal(exercise.deduction.technique, technique)
      assert.deepEqual(exercise.suggestion, exercise.deduction.actions[0])
      assert.ok(exercise.answers.some((action) => JSON.stringify(action) === JSON.stringify(exercise.suggestion)))
      const result = await run({
        type: 'check-practice-move', technique, values: exercise.givens, entries: exercise.entries,
        eliminations: exercise.eliminations, action: exercise.suggestion,
      })
      assert.equal(result?.technique, technique)
    }
  }
  const invalid = await raw({ type: 'practice-examples', technique: 'unknown-technique' })
  assert.ok('error' in invalid)
  assert.equal(invalid.code, 'invalid-technique')
})

test('generation combines clue, rating, and technique targets in the requested order', async () => {
  const { raw, run } = engineRequests()
  const options = {
    type: 'generate-constrained', seed: 42, maxAttempts: 1, clues: [79, 80],
    technique: 'hidden-single', techniqueOrder: ['hidden-single'],
  } as const
  const withScore = await run({ ...options, score: [28, 28] })
  assert.equal(withScore.replaceAll('0', '').length, 79)
  const scored = await run({ type: 'rate', values: withScore, techniqueOrder: options.techniqueOrder })
  assert.equal(scored.score.points, 28)
  assert.deepEqual(scored.score.counts, { 'hidden-single': 2 })
  assert.deepEqual(scored.techniqueOrder, options.techniqueOrder)

  const withDifficulty = await run({ ...options, difficulty: 'easy' })
  assert.equal(withDifficulty.replaceAll('0', '').length, 80)
  const rated = await run({ type: 'rate', values: withDifficulty, techniqueOrder: options.techniqueOrder })
  assert.deepEqual(rated.status, { solved: 'easy' })
  assert.deepEqual(rated.score.counts, { 'hidden-single': 1 })
  const disabled = await raw({ ...options, techniqueOrder: ['naked-single'], score: [4, 8] })
  assert.ok('code' in disabled && disabled.code === 'incompatible-targets')

  const reversed = await raw({ ...options, clues: [80, 79] })
  assert.ok('code' in reversed && reversed.code === 'invalid-clue-count')
  const conflicting = await raw({ ...options, score: [28, 28], difficulty: 'easy' } as unknown as EngineRequest)
  assert.ok('code' in conflicting && conflicting.code === 'invalid-rating-target')
})

test('generation distinguishes the first configured step from an exclusive opening', async () => {
  const { raw, run } = engineRequests()
  const options = {
    type: 'generate-constrained', seed: 42, maxAttempts: 1, clues: 80,
    techniqueOrder: ['hidden-single'], score: [14, 14],
  } as const
  const board = await run({ ...options, technique: { id: 'hidden-single', mode: 'first' } })
  const trace = await run({ type: 'logical-solve', values: board, techniqueOrder: options.techniqueOrder })
  assert.equal(trace.steps[0].technique, 'hidden-single')
  assert.equal(trace.rating.score.points, 14)
  const moves = await run({ type: 'deductions', values: board, techniqueOrder: ['naked-single', 'hidden-single'] })
  assert.equal(moves.length, 1)
  assert.deepEqual(moves[0].proofs.map(proof => proof.technique), ['naked-single', 'hidden-single', 'hidden-single', 'hidden-single'])
  assert.deepEqual(moves[0].actions, trace.steps[0].actions)
  const exclusive = await raw({ ...options, technique: { id: 'hidden-single', mode: 'exclusive-opening' } })
  assert.ok('code' in exclusive && exclusive.code === 'search-limit')
})

test('generation reports incompatible targets before the attempt budget is used', async () => {
  const { raw } = engineRequests()
  const requests = [
    {
      type: 'generate-constrained', seed: 42, maxAttempts: 0, clues: [17, 80],
      technique: { id: 'full-house', mode: 'exclusive-opening' },
    },
    {
      type: 'generate-targeted', seed: 42, maxAttempts: 0,
      target: { type: 'opening', technique: 'full-house' },
    },
  ] as const
  for (const request of requests) {
    const result = await raw(request)
    assert.ok('code' in result && result.code === 'incompatible-targets')
    assert.match(result.error, /Full House.*Naked Single/)
  }
  const options = { type: 'generate-constrained', seed: 42, maxAttempts: 0, clues: 80 } as const
  const lowScore = await raw({ ...options, technique: 'hidden-single', score: [0, 13] })
  assert.ok('code' in lowScore && lowScore.code === 'incompatible-targets')
  const valid = await raw({ ...options, technique: { id: 'full-house', mode: 'first' } })
  assert.ok('code' in valid && valid.code === 'search-limit')
})

test('the built-in pool returns rated sparse and expert puzzles', async () => {
  const { run } = engineRequests()
  const request = { type: 'generate-from-pool', seed: 42, maxAttempts: 64 } as const
  const sparse = await run({ ...request, clues: 17, difficulty: 'medium' })
  assert.equal(sparse.board.replaceAll('0', '').length, 17)
  assert.deepEqual(sparse.rating.status, { solved: 'medium' })
  assert.deepEqual(sparse.rating, await run({ type: 'rate', values: sparse.board }))

  const expert = await run({ ...request, clues: 20, difficulty: 'extreme', technique: 'multi-sector-locked-sets' })
  assert.equal(expert.board.replaceAll('0', '').length, 20)
  assert.deepEqual(expert.rating.status, { solved: 'extreme' })
  assert.ok(expert.rating.score.counts['multi-sector-locked-sets'] > 0)
  assert.deepEqual(expert.rating, await run({ type: 'rate', values: expert.board }))
})

test('the browser client reports attempts and cancels one active search independently', async (t) => {
  const { raw, run } = engineRequests()
  const sent: EngineRequest[] = []
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const saved = new Map<string, string>()
  class TestWorker {
    onmessage?: (event: { data: EngineResponse }) => void

    postMessage({ id, request }: { id: number; request: EngineRequest }) {
      sent.push(request)
      void raw(request).then(response => this.onmessage?.({ data: { ...response, id } }))
    }
  }
  Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
    configurable: true,
  })
  t.after(() => {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })

  assert.ok(saveSolverProfile(['hidden-single']))
  const options = { type: 'generate-constrained', clues: 80, seed: 42, maxAttempts: 3, score: [0, 0] } as const
  const invalid = await runGeneration({ ...options, clues: 16 })
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.attempts, 0)
  assert.ok('code' in invalid && invalid.code === 'invalid-clue-count')
  assert.deepEqual(sent.map(request => request.type), ['generation-start'])
  assert.deepEqual(await runGeneration({ ...options, maxAttempts: 0 }), { status: 'exhausted', attempts: 0 })
  const configured = await runGeneration({ ...options, score: [14, 14] })
  assert.ok(configured.status === 'matched')
  const rating = await runEngine({ type: 'rate', values: configured.puzzle })
  assert.deepEqual(rating.techniqueOrder, ['hidden-single'])
  assert.equal(rating.score.points, 14)

  const progress: number[] = []
  const controller = new AbortController()
  const { defaultOrder: techniqueOrder } = await run({ type: 'techniques' })
  const [cancelled, matched] = await Promise.all([
    runGeneration(options, {
      signal: controller.signal,
      onProgress: attempts => {
        progress.push(attempts)
        controller.abort()
      },
    }),
    runGeneration({ type: 'generate-from-pool', seed: 42, maxAttempts: 64, clues: 17, difficulty: 'medium', techniqueOrder }),
  ])
  assert.deepEqual(progress, [1])
  assert.deepEqual(cancelled, { status: 'cancelled', attempts: 1 })
  assert.ok(matched.status === 'matched')
  assert.deepEqual(matched.puzzle.rating, await runEngine({ type: 'rate', values: matched.puzzle.board, techniqueOrder }))

  const cancelledRequest = sent.find(request => request.type === 'generation-cancel')
  assert.ok(cancelledRequest && 'job' in cancelledRequest)
  assert.equal(sent.filter(request => request.type === 'generation-advance' && request.job === cancelledRequest.job).length, 1)
  await assert.rejects(runEngine({ type: 'generation-advance', job: cancelledRequest.job }), { code: 'unknown-generation' })

  const attempted: number[] = []
  const exhausted = await runGeneration(options, { onProgress: attempts => attempted.push(attempts) })
  assert.deepEqual(exhausted, { status: 'exhausted', attempts: 3 })
  assert.deepEqual(attempted, [1, 2, 3])

  const beforeFailure = sent.length
  await assert.rejects(runGeneration(options, { onProgress: () => { throw new Error('progress callback failed') } }), /progress callback failed/)
  assert.deepEqual(sent.slice(beforeFailure).map(request => request.type), ['generation-start', 'generation-advance', 'generation-cancel'])

  const generated = await generatePlayableVariant('arrow', 'extreme', 0, [])
  assert.deepEqual(generated.rating.status, { solved: 'extreme' })
  const game = {
    ...makeGame('generated-arrow', 'Arrow puzzle', generated.puzzle.givens, 'generated'),
    variant: { id: 'arrow' as const, puzzle: generated.puzzle, solution: generated.solution },
  }
  const masks = await playCandidates(game)
  assert.ok(masks)
  for (const [cell, digit] of [...generated.solution].entries()) {
    if (game.givens[cell] === '0') assert.ok(hasCandidate(masks[cell], Number(digit)))
  }
  const next = await generatePlayableVariant('arrow', 'extreme', 0, [game])
  assert.notEqual(next.puzzle.givens, generated.puzzle.givens)
})

test('the worker protocol reaches the compiled browser engine', async () => {
  const { raw, run } = engineRequests()
  assert.equal(await run({ type: 'analyze', values: STARTER }), 'unique')
  assert.ok('code' in await raw({ type: 'analyze', values: '0' }))
  assert.equal(await run({ type: 'analyze', values: '.'.repeat(81) }), 'multiple')
  assert.equal((await run({ type: 'notes', values: STARTER }))?.length, 81)
  assert.match((await run({ type: 'solve', values: STARTER }))!, /^[1-9]{81}$/)
  assert.match(await run({ type: 'generate', seed: 42 }), /^[0-9]{81}$/)

  const catalog = await run({ type: 'techniques' })
  assert.ok(catalog.techniques.some(technique => technique.id === 'x-wing'))
  const costs = new Map(catalog.techniques.map(technique => [technique.id, technique.cost]))
  assert.deepEqual(
    ['locked-pair', 'locked-triple', 'naked-triple', 'hidden-triple', 'naked-quadruple', 'hidden-quadruple']
      .map(technique => costs.get(technique)),
    [40, 60, 80, 100, 120, 150],
  )
  const subset = await run({ type: 'logical-solve', values: LOCKED_PAIR, techniqueOrder: ['locked-pair'] })
  assert.deepEqual(subset.steps[0], {
    technique: 'locked-pair',
    evidence: { subset: { house: { row: 0 }, cells: [6, 8], digits: [4, 8], lockedIn: { box: 2 } } },
    actions: [
      { eliminate: { cell: 2, digit: 4 } },
      { eliminate: { cell: 5, digit: 8 } },
      { eliminate: { cell: 16, digit: 4 } },
      { eliminate: { cell: 16, digit: 8 } },
    ],
  })
  assert.equal(subset.rating.score.points, 40 * subset.steps.length)

  const patternCases = [
    {
      technique: 'xy-wing',
      values: '008200570705400008009857000451729863276583941983614752692345187537168000814972635',
      evidence: { wing: { pivot: 25, pincers: [15, 18], digits: [2, 1, 3] } },
      eliminate: { cell: 24, digit: 3 },
      cost: 160,
    },
    {
      technique: 'w-wing',
      values: '908040603063900004154638927045163009689000431301489006817296345492315768536874192',
      evidence: { 'w-wing': { wings: [1, 41], link: { house: { row: 1 }, cells: [9, 14] }, linkedDigit: 7, digit: 2 } },
      eliminate: { cell: 5, digit: 2 },
      cost: 150,
    },
    {
      technique: 'two-string-kite',
      values: '156874932047620185280000476000080590730000618805000320000000003070500049000048701',
      evidence: { 'single-digit-chain': {
        digit: 3,
        links: [{ house: { row: 1 }, cells: [9, 14] }, { house: { column: 4 }, cells: [22, 67] }],
        bridge: [14, 22],
      } },
      eliminate: { cell: 63, digit: 3 },
      cost: 150,
    },
    {
      technique: 'empty-rectangle',
      values: '724956138168423597935718624500300810040081750081070240013000072000100085050007061',
      evidence: { 'empty-rectangle': {
        digit: 2, row: 4, column: 2, cells: [29, 36, 38],
        link: { house: { column: 3 }, cells: [39, 75] },
      } },
      eliminate: { cell: 74, digit: 2 },
      cost: 120,
    },
  ]
  for (const { technique, values, evidence, eliminate, cost } of patternCases) {
    const result = await run({ type: 'logical-solve', values, techniqueOrder: [technique] })
    assert.deepEqual(result.steps[0], { technique, evidence, actions: [{ eliminate }] })
    assert.equal(result.rating.score.points, cost * result.steps.length)
  }
  assert.equal(costs.get('skyscraper'), 130)
  assert.equal(costs.get('xyz-wing'), 180)

  const fishCosts = [
    ['swordfish', 150], ['jellyfish', 160], ['finned-x-wing', 130], ['sashimi-x-wing', 150],
    ['finned-swordfish', 200], ['sashimi-swordfish', 240], ['finned-jellyfish', 250], ['sashimi-jellyfish', 260],
  ] as const
  for (const [technique, cost] of fishCosts) {
    assert.equal(costs.get(technique), cost)
  }
  const fishValues = '091500300562318974340000100189000630473000001256183497610237049924865713030001260'
  const finned = await run({
    type: 'logical-solve',
    values: fishValues,
    techniqueOrder: ['finned-x-wing'],
    includeStepDetails: true,
  })
  assert.deepEqual(finned.steps[0], {
    technique: 'finned-x-wing',
    evidence: { fish: { digit: 8, bases: [{ column: 0 }, { column: 8 }], covers: [{ row: 0 }, { row: 8 }], fins: [26] } },
    actions: [{ eliminate: { cell: 7, digit: 8 } }],
  })
  assert.equal(finned.rating.score.points, 130 * finned.steps.length)

  const [fishMove] = await run({ type: 'deductions', values: fishValues, techniqueOrder: ['finned-x-wing'] })
  const pattern = {
    houses: [{ row: 0 }, { row: 8 }, { column: 0 }, { column: 8 }, { box: 2 }],
    cells: [0, 8, 26, 72, 80],
    candidates: [0, 8, 26, 72, 80].map(cell => ({ cell, digit: 8 })),
  }
  assert.deepEqual(fishMove.proofs[0].pattern, pattern)
  const fishReplay = replayStep(finned, 0)
  assert.ok(fishReplay)
  assert.deepEqual(fishReplay.before.pattern, pattern)
  assert.ok(fishReplay.before.candidates && fishReplay.after.candidates)
  assert.equal(fishReplay.before.candidates[7] & (1 << 7), 1 << 7)
  assert.equal(fishReplay.after.candidates[7] & (1 << 7), 0)
  const fishHint = await run({
    type: 'next-deduction',
    values: fishValues,
    disabledTechniques: catalog.techniques.map(({ id }) => id).filter(id => id !== 'finned-x-wing'),
  })
  assert.deepEqual(fishHint, { technique: 'finned-x-wing', pattern, deduction: finned.steps[0] })

  const examples = await run({ type: 'lesson-examples' })
  const medusa = examples['3d-medusa'].deduction
  assert.deepEqual(medusa.actions, [{ eliminate: { cell: 19, digit: 8 } }])
  assert.ok('coloring' in medusa.evidence)
  assert.equal(medusa.evidence.coloring.reason, 'both-colors')
  assert.ok(medusa.evidence.coloring.links.some(link => 'cell' in link.source))
  for (const [technique, cost, steps] of [['x-chain', 260, 5], ['xy-chain', 260, 7]] as const) {
    const { deduction } = examples[technique]
    assert.equal(costs.get(technique), cost)
    assert.ok('chain' in deduction.evidence)
    assert.deepEqual(
      deduction.evidence.chain.links.map(link => link.strength),
      Array.from({ length: steps }, (_, index) => index % 2 === 0 ? 'strong' : 'weak'),
    )
  }
  assert.equal(costs.get('simple-coloring'), 150)
  assert.equal(costs.get('3d-medusa'), 240)
  const grouped = examples['grouped-aic'].deduction
  assert.equal(costs.get('grouped-aic'), 300)
  assert.ok('inference' in grouped.evidence)
  assert.ok(grouped.evidence.inference.links.some(link => 'group' in link.from || 'group' in link.to))
  assert.deepEqual(grouped.actions, [{ eliminate: { cell: 0, digit: 3 } }, { eliminate: { cell: 1, digit: 3 } }])
  const continuous = examples['continuous-nice-loop'].deduction
  assert.equal(costs.get('continuous-nice-loop'), 280)
  assert.ok('inference' in continuous.evidence)
  const loop = continuous.evidence.inference.links
  assert.deepEqual(loop[0].from, loop.at(-1)?.to)
  assert.notEqual(loop[0].strength, loop.at(-1)?.strength)

  const uniqueness = ['bug-plus-one', 'hidden-rectangle', ...Array.from({ length: 6 }, (_, index) => `unique-rectangle-${index + 1}`)]
  for (const id of uniqueness) {
    const technique = catalog.techniques.find(technique => technique.id === id)
    assert.ok(technique)
    assert.equal(technique.requiresUniqueSolution, true)
    assert.equal(technique.cost, 100)
  }
  const rectangle = examples['unique-rectangle-1'].deduction
  assert.deepEqual(rectangle.actions, [{ eliminate: { cell: 43, digit: 2 } }, { eliminate: { cell: 43, digit: 9 } }])
  assert.ok('unique-rectangle' in rectangle.evidence)
  assert.deepEqual(rectangle.evidence['unique-rectangle'].corners, [7, 8, 43, 44])
  assert.deepEqual(examples['bug-plus-one'].deduction, {
    technique: 'bug-plus-one',
    evidence: { 'bug-plus-one': { cell: 4, candidates: [5, 7, 9], houses: [{ row: 0 }, { column: 4 }, { box: 1 }] } },
    actions: [{ place: { cell: 4, digit: 9 } }],
  })
  const wing = examples['wxyz-wing'].deduction
  assert.equal(costs.get('wxyz-wing'), 220)
  assert.deepEqual(wing.actions, [{ eliminate: { cell: 28, digit: 9 } }])
  assert.ok('wxyz-wing' in wing.evidence)
  assert.equal(wing.evidence['wxyz-wing'].unrestricted, 9)

  for (const [technique, cost, joins] of [['forcing-chain', 500, false], ['forcing-net', 700, true]] as const) {
    const proof = examples[technique].deduction
    assert.equal(costs.get(technique), cost)
    assert.ok('forcing' in proof.evidence)
    const { branches } = proof.evidence.forcing
    assert.ok(branches.length > 0)
    assert.equal(branches.some(branch => branch.steps.some(step => step.causes.length > 1)), joins)
    for (const branch of branches) {
      assert.ok(branch.steps.every((step, index) => step.causes.every(cause => cause <= index)))
    }
  }

  for (const [technique, cost] of [['als-xz', 300], ['als-xy-wing', 320], ['als-chain', 340], ['sue-de-coq', 250], ['death-blossom', 360]] as const) {
    assert.equal(costs.get(technique), cost)
    assert.ok(catalog.defaultOrder.includes(technique))
  }
  const als = examples['als-xz'].deduction
  assert.ok('als-xz' in als.evidence)
  assert.deepEqual(als.evidence['als-xz'].links, [3])
  assert.deepEqual(als.actions, [{ eliminate: { cell: 16, digit: 1 } }])
  const chain = examples['als-chain'].deduction
  assert.ok('als-chain' in chain.evidence)
  const { links, sets } = chain.evidence['als-chain']
  assert.ok(sets.length >= 4)
  assert.equal(links.length, sets.length - 1)
  assert.ok(links.every((digit, index) => digit !== links[index - 1]))
  assert.ok(sets.every(set => set.digits.length === set.cells.length + 1))
  const blossom = examples['death-blossom'].deduction
  assert.ok('death-blossom' in blossom.evidence)
  assert.deepEqual(blossom.evidence['death-blossom'].petals.map(petal => petal.digit), [1, 5, 7])
  const sue = examples['sue-de-coq'].deduction
  assert.ok('sue-de-coq' in sue.evidence)
  assert.deepEqual(sue.evidence['sue-de-coq'].intersection, [54, 56])
  assert.deepEqual(sue.evidence['sue-de-coq'].line.house, { row: 6 })
  assert.deepEqual(sue.evidence['sue-de-coq'].block.house, { box: 6 })

  for (const [technique, cost] of [['exocet', 450], ['sk-loop', 400], ['multi-sector-locked-sets', 480]] as const) {
    assert.equal(costs.get(technique), cost)
    assert.ok(catalog.defaultOrder.includes(technique))
  }
  const exocet = examples.exocet.deduction
  assert.ok('exocet' in exocet.evidence)
  assert.deepEqual(exocet.evidence.exocet.bases, [0, 1])
  assert.deepEqual(exocet.evidence.exocet.targets, [12, 24])
  assert.deepEqual(exocet.evidence.exocet.crossLines, [{ column: 2 }, { column: 3 }, { column: 6 }])
  assert.ok(exocet.evidence.exocet.covers.every(cover => cover.houses.length <= 2))
  assert.ok(exocet.evidence.exocet.assignments.every(({ bases, targets }) =>
    bases[0] !== bases[1] && bases.every(digit => targets.includes(digit))))
  const sk = examples['sk-loop'].deduction
  assert.ok('sk-loop' in sk.evidence)
  assert.equal(sk.evidence['sk-loop'].arms.length, 8)
  assert.equal(sk.evidence['sk-loop'].links.reduce((sum, link) => sum + link.digits.length, 0), 16)
  assert.equal(sk.actions.length, 13)
  const msls = examples['multi-sector-locked-sets'].deduction
  assert.ok('multi-sector-locked-sets' in msls.evidence)
  const mslsProof = msls.evidence['multi-sector-locked-sets']
  assert.equal(mslsProof.core.length, 16)
  assert.equal(mslsProof.links.reduce((sum, link) => sum + link.digits.length, 0), mslsProof.core.length + mslsProof.attachments.length)
  assert.equal(msls.actions.length, 24)
  const ambiguous = '135748600746329185289651743900080067867030000400067008392476851514893276678215934'
  const rejected = await raw({ type: 'logical-solve', values: ambiguous, techniqueOrder: ['unique-rectangle-1'] })
  assert.ok('code' in rejected && rejected.code === 'multiple')

  const rating = await run({ type: 'rate', values: SPARSE })
  assert.equal(rating.score.points, 766)
  assert.deepEqual(rating.status, { solved: 'medium' })
  assert.deepEqual(rating.techniqueOrder, catalog.defaultOrder)
  assert.equal(rating.scoringVersion, catalog.scoringVersion)
  const trace = await run({ type: 'logical-solve', values: SPARSE })
  assert.deepEqual(trace.rating, rating)
  assert.match(trace.board, /^[1-9]{81}$/)
  assert.ok(trace.steps.some(step => step.actions.some(action => 'eliminate' in action)))
  const hints = await run({ type: 'hints', values: SPARSE })
  assert.ok(hints.choices.length >= 2 && hints.choices.length <= 10)
  const openers = await run({ type: 'opening-techniques', values: SPARSE })
  assert.ok(hints.choices.every(hint => openers.includes(hint.technique)))

  const disabled = await run({ type: 'rate', values: STARTER, techniqueOrder: [] })
  assert.equal(disabled.status, 'stalled')
  assert.deepEqual(disabled.techniqueOrder, [])
  const badProfile = await raw({ type: 'rate', values: STARTER, techniqueOrder: ['missing'] })
  assert.ok('code' in badProfile && badProfile.code === 'invalid-profile')

  const competingProofs = '020900000490000830008000005000003070080020400370410009006085000050000100000360000'
  const competingOpeners = await run({ type: 'opening-techniques', values: competingProofs })
  for (const technique of ['hidden-single', 'forcing-chain', 'forcing-net']) {
    assert.ok(competingOpeners.includes(technique))
  }
  const targeted = await raw({ type: 'generate-targeted', seed: 795_642_738, maxAttempts: 1, target: { type: 'opening', technique: 'hidden-single' } })
  assert.ok('code' in targeted && targeted.code === 'search-limit')
  const matched = await run({ type: 'generate-constrained', seed: 42, maxAttempts: 1, clues: 17, score: [766, 766], templates: [TEMPLATE] })
  assert.equal(matched.replaceAll('0', '').length, 17)
  assert.equal((await run({ type: 'rate', values: matched })).score.points, 766)
})

test('variant requests round-trip the rules and solve under those rules', async () => {
  const { raw, run } = engineRequests()
  const solution = '658492731974316582132875694461523978387149256295768143849251367726934815513687429'
  const givens = [...solution].map((digit, cell) => [1, 6, 10, 15].includes(cell) ? '.' : digit).join('')
  const request = { type: 'variant', position: { puzzle: { version: 1, givens } } } as const
  assert.equal(await run({ ...request, operation: 'analyze' }), 'multiple')

  const entries = '0'.repeat(81)
  const eliminations = Array<number>(81).fill(0)
  eliminations[10] = 1 << 2
  const position = {
    puzzle: { version: 1, givens, rules: [
      { type: 'diagonal', diagonal: 'main' },
      { type: 'diagonal', diagonal: 'anti' },
    ] },
    entries,
    eliminations,
  } as const
  const variant = { ...request, position }
  const normalized = await run(variant)
  assert.equal(normalized.entries, entries)
  assert.deepEqual(normalized.eliminations, eliminations)
  assert.equal(normalized.puzzle.givens, givens.replaceAll('.', '0'))
  assert.deepEqual(normalized.puzzle.regions, { type: 'boxes' })
  assert.deepEqual(normalized.puzzle.rules, position.puzzle.rules)
  assert.deepEqual(await run({ ...variant, position: normalized }), normalized)
  const masks = await run({ ...variant, operation: 'candidates' })
  assert.equal(masks[10], 1 << (Number(solution[10]) - 1))
  assert.equal(await run({ ...variant, operation: 'analyze' }), 'unique')
  assert.equal(await run({ ...variant, operation: 'analyze', maxNodes: 0 }), 'search-limit')
  assert.equal(await run({ ...variant, operation: 'solve' }), solution)

  for (const [puzzle, code] of [
    [{ version: 2, givens }, 'unsupported-variant-version'],
    [{ version: 1, givens, rules: [{ type: 'thermo', cells: [0, 1] }] }, 'unsupported-rule'],
    [{ version: 1, givens, rules: [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 2 }] }] }, 'invalid-cage-sum'],
  ] as const) {
    const result = await raw({ ...request, position: { puzzle } } as unknown as EngineRequest)
    assert.ok('error' in result)
    assert.equal(result.code, code)
  }
})

test('variant wire format preserves marker defaults, path order, and clue direction', async () => {
  const { raw, run } = engineRequests()
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const row = Array.from({ length: 9 }, (_, cell) => cell)
  const position = {
    puzzle: {
      version: 1,
      givens: `${solution.slice(0, 2)}0${solution.slice(3)}`,
      rules: [
        { type: 'arrow', circle: 4, cells: [1, 2] },
        { type: 'kropki', consecutive: { pairs: [[1, 2]] } },
        { type: 'parity', cells: [2], parity: 'even' },
        { type: 'skyscrapers', cells: row, direction: 'east', count: 5 },
        { type: 'little-killer', cells: [4, 14, 24, 34, 44], direction: 'south-east', sum: 20 },
      ],
    },
  } as const
  const request = { type: 'variant', position } as const
  const normalized = await run(request)
  assert.deepEqual(normalized.puzzle.rules?.[1], {
    type: 'kropki',
    consecutive: { pairs: [[1, 2]], negative: false },
    ratioTwo: { pairs: [], negative: false },
  })
  assert.deepEqual(normalized.puzzle.rules?.[4], position.puzzle.rules[4])
  assert.deepEqual(await run({ ...request, position: normalized }), normalized)
  assert.equal((await run({ ...request, operation: 'candidates' }))[2], 1 << 3)
  assert.equal(await run({ ...request, operation: 'solve' }), solution)

  const result = await raw({
    type: 'variant',
    position: { puzzle: { ...position.puzzle, rules: [
      { ...position.puzzle.rules[3], direction: 'west' },
    ] } },
  })
  assert.ok('error' in result)
  assert.equal(result.code, 'invalid-rule')
})

test('variant seeded solving reproduces completions that satisfy the selected rules', async () => {
  const { run } = engineRequests()
  const position = {
    puzzle: {
      version: 1,
      givens: '2' + '0'.repeat(80),
      rules: [
        { type: 'diagonal', diagonal: 'main' },
        { type: 'diagonal', diagonal: 'anti' },
      ],
    },
  } as const
  const request = { type: 'variant', position, operation: 'solve', maxNodes: 10_000 } as const
  const first = await run({ ...request, seed: 41 })
  assert.equal(await run({ ...request, seed: 41 }), first)
  const second = await run({ ...request, seed: 42 })
  assert.notEqual(first, second)
  for (const entries of [first, second]) {
    assert.equal(await run({ type: 'variant', operation: 'analyze', position: { ...position, entries } }), 'unique')
    assert.equal(new Set(Array.from({ length: 9 }, (_, i) => entries[i * 10])).size, 9)
    assert.equal(new Set(Array.from({ length: 9 }, (_, i) => entries[i * 8 + 8])).size, 9)
  }
})

test('variant generation matches targeted givens, cage sizes, and the rated opening', async () => {
  const { raw, run } = engineRequests()
  const request = {
    type: 'generate-variant',
    seed: 41,
    maxAttempts: 1,
    template: { version: 1, givens: '0'.repeat(81) },
    derivedClues: [{ type: 'killer-cage-sizes', sizes: Array<number>(27).fill(3), coverGrid: true }],
    givens: 80,
    variantClues: [27, 27],
    score: [4, 4],
    technique: { id: 'naked-single', mode: 'first' },
    techniqueOrder: ['naked-single'],
  } as const
  const generated = await run(request)
  assert.deepEqual(await run(request), generated)
  assert.equal(generated.seed, 41)
  assert.equal(generated.givens, 80)
  assert.equal(generated.puzzle.givens.replaceAll('0', '').length, 80)
  assert.equal(generated.variantClues, 27)
  assert.equal(generated.rating.points, 4)
  assert.deepEqual(generated.rating.techniqueOrder, request.techniqueOrder)
  assert.deepEqual(generated.rating.rules, generated.puzzle.rules)
  const cages = generated.puzzle.rules?.find(rule => rule.type === 'killer-cages')
  assert.equal(cages?.cages.length, 27)
  for (const { cells, sum } of cages?.cages ?? []) {
    assert.equal(cells.length, 3)
    assert.equal(cells.map(cell => Number(generated.solution[cell])).reduce((a, b) => a + b), sum)
  }

  const position = { puzzle: generated.puzzle }
  assert.equal(await run({ type: 'variant', position, operation: 'analyze' }), 'unique')
  const trace = await run({ type: 'variant', position, operation: 'trace', techniqueOrder: request.techniqueOrder })
  assert.equal(trace.steps[0].technique, 'naked-single')
  assert.deepEqual(trace.rating, generated.rating)

  const excluded = await raw({ ...request, exclude: [generated.puzzle] })
  assert.ok('code' in excluded)
  assert.equal(excluded.code, 'search-limit')
  assert.deepEqual(await run({ type: 'generation-start', job: 41, request: { ...request, maxAttempts: 3, maxNodes: 0 } }),
    { status: 'pending', attempts: 0 })
  assert.deepEqual(await run({ type: 'generation-advance', job: 41 }), { status: 'pending', attempts: 1 })
  assert.deepEqual(await run({ type: 'generation-cancel', job: 41 }), { status: 'cancelled', attempts: 1 })
  const closed = await raw({ type: 'generation-advance', job: 41 })
  assert.ok('code' in closed)
  assert.equal(closed.code, 'unknown-generation')
})

test('variant hints, ratings, replay, and practice use the same cage proofs', async () => {
  const { raw, run } = engineRequests()
  const position = {
    puzzle: {
      version: 1,
      givens: '0'.repeat(81),
      rules: [{
        type: 'killer-cages',
        cages: [
          { cells: Array.from({ length: 8 }, (_, cell) => cell), sum: 43 },
          { cells: [8, 17], sum: 10 },
        ],
        coverGrid: false,
      }],
    },
  } as const
  const techniqueOrder = ['cage-house-sum', 'naked-single']
  const request = { type: 'variant', position, techniqueOrder } as const
  const hints = await run({ ...request, operation: 'hints', limit: 2 })
  assert.equal(hints.length, 2)
  const trace = await run({ ...request, operation: 'trace' })
  assert.deepEqual(trace.rating, await run({ ...request, operation: 'rate' }))
  assert.equal(trace.rating.status, 'stalled')
  assert.deepEqual(trace.rating.counts, { 'cage-house-sum': 4, 'naked-single': 2 })
  assert.equal(trace.rating.points, 276)
  assert.deepEqual(trace.rating.rules, position.puzzle.rules)
  const step = await run({ ...request, operation: 'replay-step', stepIndex: 0 })
  assert.ok(step)
  assert.deepEqual(step.deduction, hints[0])
  assert.equal(step.before.eliminations[8], 0)
  assert.equal(step.after.eliminations[8], 0x1ff & ~(1 << 1))

  const technique = 'naked-single'
  const practice = await run({ ...request, operation: 'practice-position', technique })
  assert.ok(practice)
  const proof = await run({
    type: 'variant',
    operation: 'check-practice-move',
    position: practice,
    technique,
    action: { place: { cell: 8, digit: 2 } },
  })
  assert.equal(proof?.technique, technique)
  assert.equal((await run({ ...request, operation: 'rate', techniqueOrder: [] })).points, 0)
  const invalid = await raw({ ...request, operation: 'rate', techniqueOrder: ['unsupported-technique'] })
  assert.ok('error' in invalid)
  assert.equal(invalid.code, 'invalid-technique')
})

test('fog hints and replay use only the revealed rules and player knowledge', async () => {
  const { run } = engineRequests()
  const givens = Array<string>(81).fill('0')
  givens[12] = '6'
  givens[40] = '2'
  const entries = Array<string>(81).fill('0')
  entries[40] = '8'
  const eliminations = Array<number>(81).fill(0)
  eliminations[10] = 1 << 7
  const position = {
    puzzle: {
      version: 1,
      givens: givens.join(''),
      rules: [
        { type: 'parity', cells: [10], parity: 'odd' },
        { type: 'thermometer', cells: [12, 11, 10] },
        { type: 'parity', cells: [50], parity: 'even' },
      ],
    },
    entries: entries.join(''),
    eliminations,
  } as const
  const visibility = { cells: [12], rules: [2, 1] }
  const request = { type: 'variant', position } as const
  assert.equal(await run({ ...request, operation: 'analyze' }), 'conflict')
  const revealed = await run({ ...request, visibility })
  assert.equal(revealed.puzzle.givens[40], '0')
  assert.equal(revealed.entries[40], '8')
  assert.equal(revealed.eliminations[10], 0)
  assert.deepEqual(revealed.puzzle.rules, position.puzzle.rules.slice(1))
  const hints = await run({ ...request, visibility, operation: 'hints', techniqueOrder: ['thermometer', 'parity'] })
  assert.deepEqual(hints, await run({ ...request, operation: 'hints', position: revealed, techniqueOrder: ['thermometer', 'parity'] }))
  assert.equal(hints.length, 2)
  assert.deepEqual(hints[1].evidence, {
    type: 'constraint', rules: [0], cells: [12, 11, 10], domains: [1 << 5, 0x1df, 0x1df],
  })
  const replay = await run({ ...request, visibility, operation: 'replay-step', stepIndex: 0, techniqueOrder: ['thermometer'] })
  assert.deepEqual(replay?.before, revealed)
  assert.deepEqual(replay?.deduction, hints[1])
})

test('the variant catalog exposes calibrated costs and practice proofs', async () => {
  const { raw, run } = engineRequests()
  const catalog = await run({ type: 'techniques', variant: true })
  assert.equal(catalog.scoringVersion, 4)
  assert.equal(catalog.techniques.length, 81)
  assert.equal(new Set(catalog.techniques.map(technique => technique.id)).size, 81)
  const costs = new Map(catalog.techniques.map(technique => [technique.id, technique.cost]))
  assert.equal(costs.get('parity'), 6)
  assert.equal(costs.get('cage-house-sum'), 67)
  assert.equal(costs.get('x-sum'), 80)

  for (const technique of catalog.defaultOrder) {
    const examples = await run({ type: 'practice-examples', variant: true, technique })
    assert.equal(examples.length, 3, technique)
    assert.equal(new Set(examples.map(example => example.position.puzzle.givens)).size, 3, technique)
    for (const { position, candidates, answers, suggestion, deduction } of examples) {
      assert.equal(candidates.length, 81)
      const candidate = 'eliminate' in suggestion ? suggestion.eliminate : suggestion.place
      assert.ok(candidates[candidate.cell] & (1 << (candidate.digit - 1)))
      assert.ok(answers.some(answer => JSON.stringify(answer) === JSON.stringify(suggestion)))
      assert.equal(deduction.technique, technique)
      assert.deepEqual(await run({
        type: 'variant', operation: 'check-practice-move', position, technique, action: suggestion,
      }), deduction)
    }
  }

  const malformed = await raw({ type: 'practice-examples', variant: true, technique: 'unknown-technique' })
  assert.ok('code' in malformed)
  assert.equal(malformed.code, 'invalid-technique')
})

test('every playable variant generates each difficulty with a unique solution and usable hints', async (t) => {
  const { run } = engineRequests()
  const [variant, classic] = await Promise.all([run({ type: 'techniques', variant: true }), run({ type: 'techniques' })])
  const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.defaultOrder)

  for (const id of Object.keys(variantSeeds) as (keyof typeof variantSeeds)[]) {
    const levels = variantSeeds[id]
    for (const difficulty of Object.keys(levels) as (keyof typeof levels)[]) {
      await t.test(`${id} / ${difficulty}`, async () => {
        const recipes = levels[difficulty]
        assert.ok(recipes.length > 1)
        const puzzles = new Set<string>()
        for (const recipe of recipes) {
          const generated = await run(variantGenerationRequest(id, difficulty, recipe, techniqueOrder))
          assert.deepEqual(generated.rating.status, { solved: difficulty })
          puzzles.add(generated.puzzle.givens)
        }
        assert.equal(puzzles.size, recipes.length)

        const { puzzle, solution, rating } = await run(variantGenerationRequest(id, difficulty, recipes[0], techniqueOrder))
        const position = { puzzle }
        assert.equal(await run({ type: 'variant', position, operation: 'analyze' }), 'unique')
        assert.equal(await run({
          type: 'variant', position: { puzzle: { ...puzzle, rules: [] } }, operation: 'analyze',
        }), 'multiple')

        const trace = await run({ type: 'variant', position, operation: 'trace', techniqueOrder })
        const path = variantSolutionPath(trace)
        assert.equal(path.board, solution)
        assert.deepEqual(trace.rating, rating)

        const ruleStep = trace.steps.findIndex(({ evidence }) => id === 'diagonal'
          ? evidence.type === 'single' && evidence.house && 'diagonal' in evidence.house ||
            evidence.type === 'intersection' && ('diagonal' in evidence.source || 'diagonal' in evidence.target)
          : evidence.type === 'constraint' || evidence.type === 'cage-sum')
        assert.ok(ruleStep >= 0, 'The logical path uses the variant rule.')
        const { entries: ruleEntries, eliminations: ruleRemovals } = path.positions![ruleStep]
        const ruleHints = await run({
          type: 'variant', operation: 'hints', position: { puzzle, entries: ruleEntries, eliminations: ruleRemovals },
          techniqueOrder: [trace.steps[ruleStep].technique], limit: 40,
        })
        assert.ok(ruleHints.some(({ actions }) => JSON.stringify(actions) === JSON.stringify(trace.steps[ruleStep].actions)))
        assert.ok('variant' in variantHintChoice(trace.steps[ruleStep], puzzle).evidence)
        let game = { ...makeGame('variant', 'Variant puzzle', puzzle.givens, 'generated'), variant: { id, puzzle, solution } }
        assert.ok(validVariantSave(game.variant, game.givens))
        const [firstHint] = await run({ type: 'variant', position, operation: 'hints', techniqueOrder, limit: 1 })
        assert.ok(firstHint)
        assert.notEqual(applyDeduction(game, variantHintChoice(firstHint, puzzle).actions, path.positions![0].candidates!), game)

        for (const [index, step] of path.steps.entries()) {
          const previous = game
          game = { ...game, ...applyDeduction(game, step.actions, path.positions![index].candidates!) }
          assert.notEqual(game.position, previous.position)
          if (index < path.steps.length - 1) assert.equal(isSolved(game), false)
        }
        assert.equal(valuesOf(game), solution)
        assert.ok(isSolved(game))
        assert.deepEqual(restartGame(game).variant, game.variant)

        const cell = puzzle.givens.indexOf('0')
        const entries = [...solution].map((digit, i) => i === cell || puzzle.givens[i] !== '0' ? '0' : digit).join('')
        const hints = await run({ type: 'variant', position: { puzzle, entries }, operation: 'hints', techniqueOrder })
        assert.equal(hints.length, 1)
        assert.deepEqual(hints[0].actions, [{ place: { cell, digit: Number(solution[cell]) } }])
      })
    }
  }
})
