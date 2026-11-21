import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import { replayStep, runEngine, runGeneration, type EngineRequest, type EngineResponse, type EngineResult, type RankPattern, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { DIFFICULTY_LEVELS, difficultyIndex } from '../src/sudoku/difficulty.ts'
import { generateClassic } from '../src/sudoku/classic-generation.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { applyDeduction, completeCandidateMasks, isSolved, restartGame, valuesOf, enter, hasCandidate, hintEliminations, makeGame, replaceCandidates, singleFromCandidates, undo } from '../src/sudoku/game.ts'
import { lessonDiagram, lessonValues } from '../src/sudoku/lesson-diagram.ts'
import { practiceClueAnnotations, practiceSearch } from '../src/sudoku/lesson-guidance.ts'
import { lessonExample, variantLessonExercise, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { articles, lessonRoutes } from '../src/sudoku/lessons.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder, withMediumVariantTechniques } from '../src/sudoku/variant-generation.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { generatePlayableVariant, playCandidates } from '../src/sudoku/variant-play.ts'
import { WINDOKU_REGIONS, validVariantSave } from '../src/sudoku/variants.ts'
import { saveSolverProfile } from '../src/sudoku/solver-profile.ts'
import { workedExampleSeed } from '../src/sudoku/worked-examples.ts'

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

test('sized Classic requests use the structured worker protocol', async () => {
  const { raw, run } = engineRequests()
  const request = {
    type: 'sized-classic',
    position: { version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits: [...'0234341221434321'].map(Number) },
  } as const
  assert.equal(await run({ ...request, operation: 'analyze' }), 'unique')
  assert.equal((await run({ ...request, operation: 'candidates' }))?.[0], 1)
  const step = await run({ ...request, operation: 'next-deduction' })
  assert.deepEqual(step?.actions, [{ place: { cell: 0, digit: 1 } }])
  assert.equal((await run({ ...request, operation: 'solve' }))?.join(''), '1234341221434321')

  const invalid = await raw({ ...request, operation: 'next-deduction', eliminations: [16] })
  assert.ok('error' in invalid)
  assert.equal(invalid.code, 'invalid-eliminations')
  assert.equal(await run({ type: 'analyze', values: STARTER }), 'unique')
})

test('Mini Sudoku generation, hint alternatives, and trace share the verified answer', async () => {
  const { run } = engineRequests()
  const generation = { type: 'generate-mini', seed: 7, difficulty: 'medium' } as const
  const digits = await run(generation)
  const exclude = await run({ ...generation, exclude: [digits] })
  assert.notDeepEqual(exclude, digits)
  const request = {
    type: 'sized-classic', position: { version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits },
  } as const
  const hints = await run({ ...request, operation: 'hints', limit: 256 })
  assert.ok(hints?.choices.length)
  const trace = await run({ ...request, operation: 'trace' })
  assert.ok(trace)
  assert.equal(trace.length, digits.filter(digit => digit === 0).length + 1)
  assert.deepEqual(trace.at(-1)?.digits, await run({ ...request, operation: 'solve' }))
  assert.equal(trace.at(-1)?.deduction, null)
  assert.deepEqual(trace[0].deduction, hints.choices[0])
})

test('technique counts match full deductions before and after a candidate edit', async () => {
  const { raw, run } = engineRequests()
  const values = STARTER
  const techniques = ['hidden-single', 'pointing', 'aic', 'pattern-overlay', 'pairwise-pattern-overlay',
    'triple-pattern-overlay', 'quadruple-pattern-overlay', 'quintuple-pattern-overlay', 'nested-forcing-net']
  const edited = Array<number>(81).fill(0)
  edited[2] = 1 // Remove 1 from r1c3. Its solution digit is 4.

  for (const eliminations of [undefined, edited, undefined]) {
    for (const technique of techniques) {
      const matches = await run({ type: 'deductions', values, eliminations, techniqueOrder: [technique] })
      const targets = new Set(matches.filter(({ proofs }) => proofs.some((proof) => proof.technique === technique))
        .flatMap(({ affectedCandidates }) => affectedCandidates.map(({ cell, digit }) => `${cell}:${digit}`)))
      assert.equal(await run({ type: 'technique-count', values, eliminations, technique }), targets.size, technique)
    }
  }

  const invalid = edited.slice()
  invalid[2] = 1 << 3
  const result = await raw({ type: 'technique-count', values, eliminations: invalid, technique: 'hidden-single' })
  assert.ok('error' in result)
  assert.equal(result.code, 'invalid-eliminations')
})

test('multi-coloring exports both two-group deductions and drops a broken proof', async () => {
  const { run } = engineRequests()
  const technique = 'multi-coloring'
  const examples = await run({ type: 'practice-examples', technique })
  assert.equal(examples.length, 3)
  const expectedCells = [[37, 38], [46, 56, 68]]

  for (const [index, example] of examples.slice(0, 2).entries()) {
    const { deduction, eliminations, candidates, pattern } = example
    const { actions, evidence } = deduction
    assert.ok('multi-coloring' in evidence)
    const { groups, bridge, other_bridge } = evidence['multi-coloring']
    assert.equal(Boolean(other_bridge), index === 1)
    const groupCells = groups.map(group => group.flat().map(({ cell }) => cell))
    assert.ok(groupCells[0].includes(bridge.from.cell) && groupCells[1].includes(bridge.to.cell))
    assert.ok(groupCells[0].every(cell => !groupCells[1].includes(cell)))

    const values = lessonValues(example)
    const solution = await run({ type: 'solve', values })
    const removed = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
    assert.deepEqual(removed.map(({ cell }) => cell), expectedCells[index])
    assert.ok(removed.every(({ cell, digit }) => solution && Number(solution[cell]) !== digit))

    const request = { type: 'deductions', values, eliminations, techniqueOrder: [technique] } as const
    const matches = await run(request)
    const distinct = new Set(matches.flatMap(({ affectedCandidates }) => affectedCandidates.map(({ cell, digit }) => `${cell}:${digit}`)))
    assert.equal(await run({ type: 'technique-count', technique, values, eliminations }), distinct.size)

    const diagram = lessonDiagram({ deduction, candidates, pattern })
    assert.equal(diagram.annotations.links?.filter(link => link.dashed).length, index + 1)
    assert.match(diagram.reason, index === 0 ? /box 3/ : /both colors in the second group/)
    if (other_bridge) {
      assert.equal(diagram.annotations.cells?.get(bridge.from.cell)?.label, 'contradiction cell')
      const restored = eliminations.slice()
      restored[11] &= ~(1 << 2) // Restore 3 at R2C3. Row 2 loses a strong link for 3.
      const edited = await run({ ...request, eliminations: restored })
      assert.ok(edited.every(({ affectedCandidates }) =>
        affectedCandidates.every(({ cell, digit }) => digit !== 3 || !expectedCells[index].includes(cell))))
    }
  }
})

test('rank requests find and replay a pointing removal with a shared budget', async () => {
  const { run } = engineRequests()
  const values = LOCKED_PAIR
  const [pointing] = await run({ type: 'deductions', values, techniqueOrder: ['pointing'] })
  const { evidence } = pointing.proofs[0]
  const [action] = pointing.actions
  assert.ok('intersection' in evidence)
  assert.ok('eliminate' in action)
  const target = action.eliminate
  const { source, target: cover } = evidence.intersection
  const pattern: RankPattern = {
    bases: [{ 'house-digit': { house: source, digit: target.digit } }],
    covers: [{ 'house-digit': { house: cover, digit: target.digit } }],
  }
  const request = { type: 'prove-rank', values, pattern, target } as const
  assert.deepEqual(await run({ ...request, nodeBudget: 0 }), { status: 'search-limit' })
  const result = await run({ ...request, nodeBudget: 1 })
  assert.equal(result.status, 'proven')
  const scan = await run({ type: 'rank-deductions', values, pattern, nodeBudget: 100 })
  assert.ok(scan.complete)
  assert.deepEqual(scan.proofs.find(proof =>
    proof.target.cell === target.cell && proof.target.digit === target.digit
  ), result.proof)
  assert.equal(await run({ type: 'replay-rank-proof', values, proof: result.proof }), true)
  assert.equal(await run({ type: 'replay-rank-proof', values, proof: { ...result.proof, nodes: [] } }), false)
  const effort = await run({ type: 'rank-proof-effort', values, proof: result.proof })
  assert.ok(effort)
  assert.equal(effort.version, 1)
  assert.equal(effort.constraints, 2)
  assert.equal(effort.nodes, 1)
  assert.equal(effort.score, 5 + effort.cells + effort.candidates)
  assert.equal(await run({
    type: 'rank-proof-effort', values, proof: { ...result.proof, nodes: [] },
  }), null)
  const discovery = await run({ type: 'discover-rank', values, target, nodeBudget: 250 })
  assert.equal(discovery.outcome.status, 'proven')
  assert.ok(discovery.nodesVisited <= 250)
  assert.deepEqual(discovery.effort, await run({ type: 'rank-proof-effort', values, proof: discovery.outcome.proof }))
  assert.equal(await run({ type: 'replay-rank-proof', values, proof: discovery.outcome.proof }), true)
  const discovered = await run({
    type: 'discover-rank-deductions', values, nodeBudget: 5_000, maxNodesPerCandidate: 250,
  })
  assert.equal(discovered.proofs.length, 10)
  assert.equal(discovered.efforts.length, 10)
  assert.ok(discovered.nodesVisited <= 5_000)
  assert.equal(new Set(discovered.proofs.map(({ target }) => target.cell * 9 + target.digit)).size, 10)
  for (const proof of discovered.proofs) {
    assert.equal(await run({ type: 'replay-rank-proof', values, proof }), true)
  }
})

test('Senior Exocet exports single and paired targets through practice and deduction search', async () => {
  const { run } = engineRequests()
  const technique = 'senior-exocet'
  const catalog = await run({ type: 'techniques' })
  assert.equal(catalog.techniques.find(item => item.id === technique)?.cost, 550)
  const exercises = await run({ type: 'practice-examples', technique })
  assert.equal(exercises.length, 3)
  const expected = [[21, 51], [12, 75]]
  for (const [index, example] of exercises.slice(0, 2).entries()) {
    const { evidence } = example.deduction
    assert.ok('exocet' in evidence)
    const { bases, targets, crossLines, assignments } = evidence.exocet
    assert.deepEqual(bases, [0, 1])
    assert.deepEqual(targets, expected[index])
    assert.deepEqual(crossLines, [{ column: 2 }, { column: 3 }, { column: 6 }])
    assert.ok(assignments.every(({ bases, targets }) =>
      bases[0] !== bases[1] && bases.every(digit => targets.includes(digit))))
  }
  const grouped = exercises[2]
  const evidence = grouped.deduction.evidence
  assert.ok('grouped-exocet' in evidence)
  const { bases, targets, crossLines, covers } = evidence['grouped-exocet']
  assert.deepEqual(bases, [61, 62])
  const exoPair = { 'conjugate-pair': { digit: 9, link: { house: { column: 1 }, cells: [64, 73] } } }
  const endoPair = { 'conjugate-pair': { digit: 9, link: { house: { column: 3 }, cells: [39, 75] } } }
  assert.deepEqual(targets, [exoPair, endoPair])
  assert.deepEqual(crossLines, [{ column: 6 }, { column: 1 }, { column: 3 }])
  assert.deepEqual(covers.map(cover => cover.digit), [3, 4, 5])
  assert.deepEqual(grouped.deduction.actions, [[39, 1], [39, 8], [73, 2], [75, 1], [75, 2]]
    .map(([cell, digit]) => ({ eliminate: { cell, digit } })))
  for (const example of exercises) {
    const { givens, entries, eliminations } = example
    const proof = await run({
      type: 'check-practice-move', values: givens, entries, eliminations,
      technique, action: example.suggestion,
    })
    assert.equal(proof?.technique, technique)
  }
  const values = [...grouped.givens].map((digit, cell) => digit === '0' ? grouped.entries[cell] : digit).join('')
  const cases = [
    { targets: [exoPair, { cell: 24 }], removed: [[75, 3], [51, 4]], actions: [[24, 1], [24, 7], [24, 8], [73, 2]] },
    { targets: [{ cell: 64 }, endoPair], removed: [[73, 3], [73, 4], [73, 5]], actions: [[39, 1], [39, 8], [64, 9], [75, 1], [75, 2]] },
  ]
  for (const fixture of cases) {
    const eliminations = [...grouped.eliminations]
    for (const [cell, digit] of fixture.removed) eliminations[cell] |= 1 << (digit - 1)
    const moves = await run({ type: 'deductions', values, eliminations, techniqueOrder: [technique] })
    const actions = fixture.actions.map(([cell, digit]) => ({ eliminate: { cell, digit } }))
    const deduction = moves.find(move => JSON.stringify(move.actions) === JSON.stringify(actions))
    assert.ok(deduction?.proofs.some(({ evidence }) => 'grouped-exocet' in evidence &&
      JSON.stringify(evidence['grouped-exocet'].targets) === JSON.stringify(fixture.targets)))
    const proof = await run({ type: 'check-practice-move', values, eliminations, technique, action: actions[0] })
    assert.equal(proof?.technique, technique)
  }
})

test('Double Exocet exposes its two components and a replayable solve', async () => {
  const { run } = engineRequests()
  const technique = 'double-exocet'
  const [catalog, exercises] = await Promise.all([
    run({ type: 'techniques' }), run({ type: 'practice-examples', technique }),
  ])
  assert.equal(catalog.techniques.find(item => item.id === technique)?.cost, 600)
  assert.equal(exercises.length, 3)
  const first = exercises[0]
  const evidence = first.deduction.evidence
  assert.ok('double-exocet' in evidence)
  const { components, crossLines, jointCrossLineSupport, assignments } = evidence['double-exocet']
  assert.deepEqual(components.map(({ bases, targets }) => ({ bases, targets })), [
    { bases: [39, 41], targets: [47, 35] },
    { bases: [51, 52], targets: [38, 31] },
  ])
  assert.deepEqual(crossLines, [{ column: 2 }, { column: 4 }, { column: 8 }])
  assert.equal(jointCrossLineSupport, true)
  assert.equal(assignments.length, 8)
  assert.equal(first.deduction.actions.length, 84)
  assert.ok(first.deduction.actions.some(action => 'eliminate' in action && action.eliminate.cell === 27 && action.eliminate.digit === 4))
  const { givens, entries, eliminations } = first
  const proof = await run({ type: 'check-practice-move', values: givens, entries, eliminations, technique, action: first.suggestion })
  assert.deepEqual(proof, first.deduction)
  const trace = await run({ type: 'logical-solve', values: givens, techniqueOrder: [technique, ...catalog.defaultOrder], includePositions: true })
  assert.deepEqual(trace.steps[0], first.deduction)
  assert.deepEqual(trace.rating.status, { solved: 'extreme' })
  const step = replayStep(trace, 0)
  assert.ok(step)
  assert.equal(step.after.eliminations[27] & (1 << 3), 1 << 3)
})

test('Double Exocet exposes a paired target and its replay constraints', async () => {
  const { run } = engineRequests()
  const values = '082030970950000300730000005000005600590800003061090000003008040000007800870050006'
  const technique = 'double-exocet'
  const target = { cell: 42, digit: 7 }
  const moves = await run({ type: 'deductions', values, techniqueOrder: [technique] })
  const match = moves.find(({ actions }) => actions.some(action =>
    'eliminate' in action && action.eliminate.cell === target.cell && action.eliminate.digit === target.digit
  ))
  const evidence = match?.proofs.find(({ evidence }) => 'grouped-double-exocet' in evidence)?.evidence
  assert.ok(evidence && 'grouped-double-exocet' in evidence)
  const { components, crossLines, rankPattern } = evidence['grouped-double-exocet']
  const house = { row: 2 }
  assert.deepEqual(crossLines, [house, { row: 4 }, { row: 8 }])
  assert.deepEqual(components[1].targets, [
    { 'conjugate-pair': { digit: 9, link: { house, cells: [21, 23] } } },
    { cell: 41 },
  ])
  const request = { type: 'prove-rank', values, target, nodeBudget: 50_000 } as const
  const result = await run({ ...request, pattern: rankPattern })
  assert.equal(result.status, 'proven')
  assert.equal(await run({ type: 'replay-rank-proof', values, proof: result.proof }), true)
  const withoutReservation = rankPattern.bases.filter(base =>
    !('house-digit' in base && base['house-digit'].digit === 9 && 'row' in base['house-digit'].house &&
    base['house-digit'].house.row === house.row)
  )
  assert.deepEqual(await run({
    ...request, pattern: { ...rankPattern, bases: withoutReservation },
  }), { status: 'compatible' })
})

test('Fireworks exposes the published triple and quadruple through practice and solve replay', async () => {
  const { run } = engineRequests()
  const technique = 'fireworks'
  const catalog = await run({ type: 'techniques' })
  assert.equal(catalog.techniques.find(item => item.id === technique)?.cost, 240)
  const [triple, , quadruple] = await run({ type: 'practice-examples', technique })
  assert.deepEqual(triple.deduction.evidence, {
    firework: { wings: [0, 80], pivots: [{ cell: 8, digits: [1, 2, 3] }] },
  })
  assert.deepEqual(quadruple.deduction.evidence, {
    firework: { wings: [27, 77], pivots: [{ cell: 32, digits: [3, 4] }, { cell: 72, digits: [1, 2] }] },
  })
  const { givens, entries, eliminations, suggestion } = quadruple
  const proof = await run({ type: 'check-practice-move', values: givens, entries, eliminations, technique, action: suggestion })
  assert.deepEqual(proof, quadruple.deduction)
  const trace = await run({
    type: 'logical-solve', values: givens, techniqueOrder: [technique, ...catalog.defaultOrder],
    includePositions: true,
  })
  assert.deepEqual(trace.steps[0], quadruple.deduction)
  assert.deepEqual(trace.rating.status, { solved: 'master' })
  const step = replayStep(trace, 0)
  assert.ok(step)
  assert.equal(step.after.eliminations[48] & (1 << 3), 1 << 3)
})

test('ALS chains and both Nice Loops are selectable and expose replayable proofs', async () => {
  const { run } = engineRequests()
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  for (const technique of ['als-aic', 'als-discontinuous-nice-loop', 'als-continuous-nice-loop']) {
    assert.equal(techniques.find(item => item.id === technique)?.cost, 360)
    assert.ok(!defaultOrder.includes(technique))
    const exercises = await run({ type: 'practice-examples', technique })
    assert.equal(exercises.length, 3)
    const [exercise] = exercises
    const { givens: values, entries, eliminations, suggestion, deduction, candidates } = exercise
    assert.ok('inference' in deduction.evidence)
    assert.ok(deduction.evidence.inference.links.some(link => 'almost-locked-set' in link.source))
    const checked = await run({ type: 'check-practice-move', values, entries, eliminations, technique, action: suggestion })
    assert.equal(checked?.technique, technique)
    const trace = await run({ type: 'logical-solve', values, entries, eliminations, techniqueOrder: [technique] })
    assert.ok(trace.steps.length > 0)
    assert.equal(trace.rating.score.points, trace.steps.length * 360)
    if (technique === 'als-continuous-nice-loop') {
      assert.equal(deduction.actions.length, 15)
      assert.deepEqual(deduction.actions[0], { eliminate: { cell: 30, digit: 8 } })
      const diagram = lessonDiagram({ deduction, candidates })
      assert.match(diagram.reason, /exactly one of the two linked digits/)
      assert.equal(diagram.annotations.candidates?.get(49)?.get(8)?.mark, 'ring')
      assert.equal(diagram.annotations.candidates?.get(30)?.get(8)?.mark, 'strike')
    }
  }
})

test('ALS links prove outside placements and carry their locked candidates through a loop', async () => {
  const { run } = engineRequests()
  const [aic] = await run({ type: 'practice-examples', technique: 'als-aic' })
  const current = lessonValues(aic)
  const moves = await run({ type: 'deductions', values: current, eliminations: aic.eliminations, techniqueOrder: ['als-aic'] })
  const source = { set: { cells: [11, 74], digits: [1, 8, 9] }, cell: 38, blocked: 257 }
  const proof = moves.filter(move => move.actions.length === 3 && [36, 45, 65].every(cell =>
    move.actions.some(action => 'eliminate' in action && action.eliminate.cell === cell && action.eliminate.digit === 6)))
    .flatMap(move => move.proofs).find(({ evidence }) => 'inference' in evidence && evidence.inference.links.some(link =>
      'almost-locked-set-cell' in link.source && link.source['almost-locked-set-cell'].cell === 38 &&
      link.source['almost-locked-set-cell'].blocked === 257))
  assert.ok(proof && 'inference' in proof.evidence)
  const outside = proof.evidence.inference.links.find(link => 'almost-locked-set-cell' in link.source)
  assert.deepEqual(outside?.source, { 'almost-locked-set-cell': source })
  for (const digit of [1, 9]) {
    assert.ok(proof.pattern.candidates.some(candidate => candidate.cell === 38 && candidate.digit === digit))
  }

  const [, , loop] = await run({ type: 'practice-examples', technique: 'als-continuous-nice-loop' })
  const removal = { eliminate: { cell: 35, digit: 6 } }
  assert.ok(loop.deduction.actions.some(action => 'eliminate' in action && action.eliminate.cell === 35 && action.eliminate.digit === 6))
  const loops = await run({ type: 'deductions', values: lessonValues(loop), eliminations: loop.eliminations, techniqueOrder: ['als-continuous-nice-loop'] })
  const published = loops.filter(move => move.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 35 && action.eliminate.digit === 6)).flatMap(move => move.proofs)
    .find(({ evidence }) => 'inference' in evidence && evidence.inference.links.length === 8 &&
      evidence.inference.links.some(link => 'almost-locked-set-cell' in link.source &&
        link.source['almost-locked-set-cell'].cell === 61 && link.source['almost-locked-set-cell'].blocked === 130))
  assert.ok(published)
  const diagram = lessonDiagram({ candidates: loop.candidates, deduction: { ...published, actions: [removal] } })
  assert.match(diagram.reason, /set must use 6 in either case/)
  assert.match(diagram.reason, /forces 5 in R7C8/)
  for (const digit of [2, 8]) assert.equal(diagram.annotations.candidates?.get(61)?.get(digit)?.mark, 'ring')
})

test('Unique Rectangle chains and Nice Loops are opt-in and carry the swap premise', async () => {
  const { run } = engineRequests()
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  const ids = ['unique-rectangle-aic', 'unique-rectangle-discontinuous-nice-loop', 'unique-rectangle-continuous-nice-loop']
  for (const technique of ids) {
    const item = techniques.find(candidate => candidate.id === technique)
    assert.equal(item?.requiresUniqueSolution, true)
    assert.equal(item?.cost, 360)
    assert.ok(!defaultOrder.includes(technique))
    const examples = await run({ type: 'practice-examples', technique })
    assert.equal(examples.length, 3)
    const { givens: values, entries, eliminations, suggestion, deduction } = examples[0]
    assert.ok('inference' in deduction.evidence)
    assert.ok(deduction.evidence.inference.links.some(link => 'unique-rectangle' in link.source))
    const check = await run({ type: 'check-practice-move', technique, values, entries, eliminations, action: suggestion })
    assert.ok(check && check.actions.some(action => JSON.stringify(action) === JSON.stringify(suggestion)))
    const trace = await run({ type: 'logical-solve', values, entries, eliminations, techniqueOrder: [technique] })
    assert.ok(trace.steps.length > 0)
    assert.equal(trace.rating.score.points, trace.steps.length * 360)
  }
  const [example] = await run({ type: 'practice-examples', technique: ids[1] })
  const moves = await run({ type: 'deductions', values: lessonValues(example), eliminations: example.eliminations, techniqueOrder: [ids[1]] })
  const placement = moves.find(move => move.actions.some(action => 'place' in action && action.place.cell === 22 && action.place.digit === 2))
  assert.ok(placement)
  const proof = placement.proofs.find(({ evidence }) => 'inference' in evidence && evidence.inference.links.some(link =>
    'unique-rectangle' in link.source && JSON.stringify(link.source['unique-rectangle']) === JSON.stringify({ corners: [28, 34, 46, 52], digits: [6, 7] })))
  assert.ok(proof)
  for (const cell of [28, 34, 46, 52]) {
    for (const digit of [6, 7]) assert.ok(proof.pattern.candidates.some(candidate => candidate.cell === cell && candidate.digit === digit))
  }
})

test('Pattern Overlay through five digits offers replayable moves and completes an expert stall', async () => {
  const { run } = engineRequests()
  const ids = ['pattern-overlay', 'pairwise-pattern-overlay', 'triple-pattern-overlay',
    'quadruple-pattern-overlay', 'quintuple-pattern-overlay']
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  for (const [index, technique] of ids.entries()) {
    const metadata = techniques.find(candidate => candidate.id === technique)
    assert.equal(metadata?.cost, 500 + 150 * index)
    assert.ok(!defaultOrder.includes(technique))
    const examples = await run({ type: 'practice-examples', technique })
    assert.equal(examples.length, 3)
    const { givens: values, entries, eliminations, suggestion, deduction } = examples[0]
    assert.ok('pattern-overlay' in deduction.evidence)
    const proof = deduction.evidence['pattern-overlay']
    assert.equal(proof.scopes.length, index + 1)
    const checked = await run({ type: 'check-practice-move', technique, values, entries, eliminations, action: suggestion })
    assert.equal(checked?.technique, technique)
    if (index === 1) {
      assert.deepEqual(proof.scopes.map(scope => scope.digit), [3, 7])
      assert.deepEqual(deduction.actions, [16, 43].map(cell => ({ eliminate: { cell, digit: 7 } })))
      const seven = proof.scopes[1]
      for (const cell of [16, 43]) {
        assert.ok(seven.allowed.includes(cell))
        assert.ok(!seven.supported.includes(cell))
      }
    }
  }
  const [example] = await run({ type: 'practice-examples', technique: ids[4] })
  const values = example.givens
  const techniqueOrder = [...defaultOrder]
  techniqueOrder.splice(techniqueOrder.indexOf('forcing-chain'), 0,
    'unique-rectangle-aic', 'unique-rectangle-discontinuous-nice-loop', 'unique-rectangle-continuous-nice-loop')
  const stalled = await run({ type: 'rate', values, techniqueOrder })
  assert.equal(stalled.status, 'stalled')
  techniqueOrder.splice(techniqueOrder.indexOf('forcing-chain'), 0, ...ids)
  const solved = await run({ type: 'rate', values, techniqueOrder })
  assert.deepEqual(solved.status, { solved: 'impossible' })
})

test('Firework chains expose crossing-house links and replay a published removal', async () => {
  const { run } = engineRequests()
  const technique = 'firework-aic'
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  assert.equal(techniques.find(item => item.id === technique)?.cost, 360)
  assert.ok(!defaultOrder.includes(technique))
  const [published, , wide] = await run({ type: 'practice-examples', technique })
  const { givens: values, entries, eliminations, suggestion, deduction } = published
  assert.deepEqual(suggestion, { eliminate: { cell: 44, digit: 5 } })
  const proof = await run({ type: 'check-practice-move', values, entries, eliminations, technique, action: suggestion })
  assert.ok(proof && proof.technique === technique)
  assert.ok(proof.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 44 && action.eliminate.digit === 5))
  assert.ok('inference' in deduction.evidence)
  const { links } = deduction.evidence.inference
  const firework = links.find(link => 'firework' in link.source)
  assert.deepEqual(firework, {
    from: { candidate: { cell: 12, digit: 4 } },
    to: { group: { digit: 4, cells: [16, 57] } },
    source: { firework: 12 },
    strength: 'strong',
  })
  assert.ok(links.some(link => link.strength === 'weak' && 'peers' in link.source))
  const currentValues = [...values].map((digit, cell) => entries[cell] === '0' ? digit : entries[cell]).join('')
  const moves = await run({ type: 'deductions', values: currentValues, eliminations, techniqueOrder: [technique] })
  const diagram = moves.flatMap(move => move.proofs).find(proof => 'inference' in proof.evidence &&
    proof.evidence.inference.links.some(link => 'firework' in link.source && link.source.firework === 12 &&
      ('candidate' in link.from ? link.from.candidate.digit === 4 : 'group' in link.from && link.from.group.digit === 4)))
  assert.ok(diagram)
  assert.ok(diagram.pattern.houses.some(house => 'box' in house && house.box === 1))
  assert.ok(diagram.pattern.houses.some(house => 'column' in house && house.column === 3))
  assert.ok(diagram.pattern.houses.some(house => 'row' in house && house.row === 1))
  assert.ok(diagram.pattern.candidates.some(candidate => candidate.digit === 4 && candidate.cell === 13))
  const trace = await run({
    type: 'logical-solve', values, entries, eliminations, techniqueOrder: [technique], includePositions: true,
  })
  const index = trace.steps.findIndex(step => step.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 44 && action.eliminate.digit === 5))
  assert.ok(index >= 0)
  const step = replayStep(trace, index)
  assert.ok(step)
  assert.equal(step.before.eliminations[44] & (1 << 4), 0)
  assert.equal(step.after.eliminations[44] & (1 << 4), 1 << 4)
  assert.equal(trace.rating.score.points, trace.steps.length * 360)
  const evidence = wide.deduction.evidence
  assert.ok('inference' in evidence)
  assert.deepEqual(wide.suggestion, { eliminate: { cell: 74, digit: 1 } })
  assert.deepEqual(wide.deduction.actions, [wide.suggestion])
  const wideLinks = evidence.inference.links
  assert.equal(wideLinks[0].strength, 'strong')
  assert.equal(wideLinks.at(-1)?.strength, 'strong')
  for (let i = 1; i < wideLinks.length; i++) {
    assert.deepEqual(wideLinks[i - 1].to, wideLinks[i].from)
    assert.notEqual(wideLinks[i - 1].strength, wideLinks[i].strength)
  }
  // A shorter grouped Type 2 proof can come first. The authored wide-group
  // proof must still be available for exactly the same published removal.
  const wideValues = [...wide.givens].map((digit, cell) => wide.entries[cell] === '0' ? digit : wide.entries[cell]).join('')
  const wideMoves = await run({ type: 'deductions', values: wideValues, eliminations: wide.eliminations, techniqueOrder: [technique] })
  const sameRemoval = wideMoves.filter(move => move.actions.length === 1 &&
    'eliminate' in move.actions[0] && move.actions[0].eliminate.cell === 74 && move.actions[0].eliminate.digit === 1)
    .flatMap(move => move.proofs)
  assert.ok(sameRemoval.some(proof => 'inference' in proof.evidence &&
    proof.evidence.inference.links.some(link => 'firework' in link.source &&
      [link.from, link.to].some(node => 'group' in node && node.group.cells.length >= 5))))
})

test('Firework chain practice exposes an almost locked set in the proof', async () => {
  const { run } = engineRequests()
  const technique = 'firework-aic'
  const [, exercise] = await run({ type: 'practice-examples', technique })
  const { givens: values, entries, eliminations, suggestion, deduction } = exercise
  assert.deepEqual(suggestion, { eliminate: { cell: 24, digit: 8 } })
  assert.ok('inference' in deduction.evidence)
  const { links } = deduction.evidence.inference
  assert.ok(links.some(link => link.strength === 'strong' && 'firework' in link.source))
  assert.ok(links.some(link => link.strength === 'strong' && 'almost-locked-set' in link.source))

  const moves = await run({ type: 'deductions', values, eliminations, techniqueOrder: [technique] })
  const mixed = moves.filter(move => move.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 24 && action.eliminate.digit === 8)).flatMap(move => move.proofs)
    .find(proof => 'inference' in proof.evidence && proof.evidence.inference.links.length === 5 &&
      proof.evidence.inference.links.some(link => 'firework' in link.source && link.source.firework === 15))
  assert.ok(mixed && 'inference' in mixed.evidence)
  const set = mixed.evidence.inference.links.find(link => 'almost-locked-set' in link.source)
  assert.ok(set && 'almost-locked-set' in set.source)
  assert.deepEqual(set.source['almost-locked-set'], { cells: [29, 31, 35], digits: [2, 4, 8, 9] })
  assert.ok(mixed.pattern.houses.some(house => 'row' in house && house.row === 3))
  assert.ok(mixed.pattern.candidates.some(candidate => candidate.cell === 31 && candidate.digit === 8))
  const checked = await run({ type: 'check-practice-move', values, entries, eliminations, technique, action: suggestion })
  assert.ok(checked?.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 24 && action.eliminate.digit === 8))
})

test('Firework W-Wing reports grouped wings and bills once for two removals', async () => {
  const { run } = engineRequests()
  const technique = 'firework-w-wing'
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  assert.equal(techniques.find(item => item.id === technique)?.cost, 320)
  assert.ok(!defaultOrder.includes(technique))
  const [published, grouped, double] = await run({ type: 'practice-examples', technique })
  assert.deepEqual(published.suggestion, { eliminate: { cell: 8, digit: 9 } })
  assert.deepEqual(published.deduction.evidence, {
    'firework-w-wing': { pivot: 72, digits: [1, 9], wings: [[80], [0]], bivalue: [44, 4] },
  })
  assert.deepEqual(grouped.deduction.evidence, {
    'firework-w-wing': { pivot: 72, digits: [4, 9], wings: [[79, 80], [0]], bivalue: [71, 1] },
  })
  const { givens: values, entries, eliminations, suggestion } = grouped
  assert.deepEqual(await run({
    type: 'check-practice-move', values, entries, eliminations, technique, action: suggestion,
  }), grouped.deduction)
  const trace = await run({
    type: 'logical-solve', values: double.givens, techniqueOrder: [technique], includeStepDetails: true,
  })
  assert.deepEqual(trace.steps[0], double.deduction)
  const step = replayStep(trace, 0)
  assert.ok(step)
  const removed = (1 << 3) | (1 << 8)
  assert.equal(step.after.eliminations[8] & removed, removed)
  assert.equal(step.before.eliminations[8] & removed, 0)
  assert.ok(step.before.pattern?.houses.some(house => 'box' in house && house.box === 6))
  assert.equal(trace.rating.score.points, 320 * trace.steps.length)
})

test('Firework L-Wing records the conjugate link and ALS-Wing replays all its removals', async () => {
  const { run } = engineRequests()
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  for (const [id, cost] of [['firework-l-wing', 320], ['firework-als-wing', 350]] as const) {
    assert.equal(techniques.find(technique => technique.id === id)?.cost, cost)
    assert.ok(!defaultOrder.includes(id))
  }
  const [l] = await run({ type: 'practice-examples', technique: 'firework-l-wing' })
  assert.deepEqual(l.suggestion, { eliminate: { cell: 53, digit: 5 } })
  assert.deepEqual(l.deduction.evidence, {
    'firework-l-wing': { pivot: 48, digits: [4, 6], wings: [53, 3], linked_digit: 5,
      link: { house: { row: 0 }, cells: [3, 8] } },
  })
  const [als] = await run({ type: 'practice-examples', technique: 'firework-als-wing' })
  assert.deepEqual(als.deduction.evidence, {
    'firework-als-wing': { pivots: [8, 72], digits: [2, 8], wings: [[[4], [44]], [[76], [36]]], bivalue: 40 },
  })
  const { givens: values, entries, eliminations } = als
  const trace = await run({
    type: 'logical-solve', values, entries, eliminations, techniqueOrder: ['firework-als-wing'], includeStepDetails: true,
  })
  assert.deepEqual(trace.steps, [als.deduction])
  assert.equal(trace.rating.score.points, 350)
  const step = replayStep(trace, 0)
  assert.ok(step)
  assert.equal(als.deduction.actions.length, 12)
  for (const action of als.deduction.actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    const mask = 1 << (digit - 1)
    assert.equal(step.before.eliminations[cell] & mask, 0)
    assert.equal(step.after.eliminations[cell] & mask, mask)
  }
  assert.ok(step.before.pattern?.houses.some(house => 'row' in house && house.row === 4))
  assert.ok(step.before.pattern?.houses.some(house => 'column' in house && house.column === 4))
})

test('Tridagon chains expose guardian, almost locked set, and Firework links', async () => {
  const { run } = engineRequests()
  const technique = 'tridagon-aic'
  const { techniques, defaultOrder } = await run({ type: 'techniques' })
  assert.equal(techniques.find(item => item.id === technique)?.cost, 540)
  assert.ok(!defaultOrder.includes(technique))
  const [mission, grouped, combined] = await run({ type: 'practice-examples', technique })
  assert.deepEqual(mission.suggestion, { eliminate: { cell: 42, digit: 9 } })
  const scan = async (values: string) => {
    const moves = await run({ type: 'deductions', values, techniqueOrder: [technique] })
    return moves.flatMap(move => move.proofs.flatMap(({ evidence, pattern }) =>
      'inference' in evidence ? [{ actions: move.actions, links: evidence.inference.links, pattern }] : []))
  }
  const missionProofs = await scan(mission.givens)
  const companion = missionProofs.find(({ actions, links }) => links.length === 5 &&
    links.some(link => 'almost-locked-set' in link.source) &&
    actions.some(action => 'eliminate' in action && action.eliminate.cell === 30 && action.eliminate.digit === 7))
  assert.ok(companion)
  const guardian = companion.links.find(link => 'tridagon' in link.source)
  assert.ok(guardian && 'tridagon' in guardian.source)
  assert.deepEqual(guardian.source.tridagon, {
    cells: [[0, 10, 20], [3, 13, 23], [27, 37, 47], [32, 40, 48]], digits: [1, 2, 3],
  })
  assert.ok(companion.pattern.cells.includes(20))
  const groupedProofs = await scan(grouped.givens)
  assert.ok(groupedProofs.some(({ links }) => links.some(link => 'tridagon' in link.source &&
    ('group' in link.from || 'group' in link.to))))
  const combinedProofs = await scan(combined.givens)
  assert.ok(combinedProofs.some(({ actions, links }) => links.length === 3 &&
    links.some(link => 'tridagon' in link.source) && links.some(link => 'firework' in link.source) &&
    actions.some(action => 'eliminate' in action && action.eliminate.cell === 26 && action.eliminate.digit === 3)))
  const trace = await run({
    type: 'logical-solve', values: mission.givens, techniqueOrder: [technique, ...defaultOrder], includePositions: true,
  })
  assert.deepEqual(trace.rating.status, { solved: 'extreme' })
  const first = replayStep(trace, 0)
  assert.ok(first)
  assert.equal(first.deduction.technique, technique)
  for (const action of first.deduction.actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    assert.equal(first.after.eliminations[cell] & (1 << (digit - 1)), 1 << (digit - 1))
  }
})

test('Tridagon chains expose all digits in a mixed guardian group', async () => {
  const { run } = engineRequests()
  const values = '003056709007109006009070150201000500340000601970013000090000360730000015000000907'
  const technique = 'tridagon-aic'
  const moves = await run({ type: 'deductions', values, techniqueOrder: [technique] })
  const expected = [2, 4, 8].map(digit => ({ eliminate: { cell: 75, digit } }))
  const move = moves.find(({ actions }) => actions.length === expected.length &&
    actions.every((action, i) => 'eliminate' in action && action.eliminate.cell === 75 &&
      action.eliminate.digit === expected[i].eliminate.digit))
  assert.deepEqual(move?.actions, expected)
  const proof = move?.proofs.find(({ evidence }) => 'inference' in evidence &&
    evidence.inference.links.length === 3 && evidence.inference.links.some(link => 'firework' in link.source) &&
    evidence.inference.links.some(link => 'tridagon' in link.source && 'mixed-group' in link.to))
  assert.ok(proof && 'inference' in proof.evidence)
  const guardian = proof.evidence.inference.links.find(link => 'tridagon' in link.source)
  assert.ok(guardian && 'mixed-group' in guardian.to)
  const members = [3, 5, 6].map(digit => ({ cell: 75, digit }))
  assert.deepEqual(guardian.to['mixed-group'], members)
  for (const { cell, digit } of members) {
    assert.ok(proof.pattern.candidates.some(candidate => candidate.cell === cell && candidate.digit === digit))
  }
  const { candidates } = await run({ type: 'hints', values, techniqueOrder: [technique], limit: 1, includePatterns: true })
  assert.ok(candidates)
  const diagram = lessonDiagram({ candidates, deduction: { ...proof, actions: expected } }, proof.pattern)
  assert.deepEqual(diagram.annotations.links?.[2]?.to, { candidates: members })
})

test('opt-in rank solve records the rank removal, score, and replay positions', async () => {
  const { run } = engineRequests()
  const named = await run({ type: 'logical-solve', values: LOCKED_PAIR, techniqueOrder: ['pointing'], includePositions: true })
  assert.equal(named.rating.status, 'stalled')
  const trace = await run({
    type: 'logical-solve-with-rank', values: LOCKED_PAIR, techniqueOrder: ['pointing'],
    rankOptions: { maxSteps: 1, nodeBudget: 5_000 }, includePositions: true,
  })
  assert.equal(trace.status, 'rank-step-limit')
  assert.deepEqual(trace.techniqueOrder, ['pointing'])
  assert.equal(trace.rankOptions.maxNodesPerScan, 40_000)
  const index = named.steps.length
  assert.deepEqual(trace.steps.slice(0, index), named.steps.map(step => ({ ...step, type: 'technique' })))
  const step = trace.steps[index]
  assert.equal(step.type, 'rank')
  assert.ok(trace.positions)
  assert.equal(trace.positions.length, trace.steps.length + 1)
  const replay = replayStep(trace, index)
  assert.ok(replay)
  assert.deepEqual(replay.deduction, step)
  assert.equal(replayStep(trace, trace.steps.length), null)
  const { before, after } = replay
  assert.deepEqual(before, named.positions?.at(-1))
  const { cell, digit } = step.proof.target
  assert.deepEqual(step.actions, [{ eliminate: { cell, digit } }])
  assert.equal(after.eliminations[cell], before.eliminations[cell] | (1 << (digit - 1)))
  assert.equal(trace.rankNodesVisited, step.search.nodesVisited)
  assert.ok(step.search.nodesVisited <= step.search.nodeBudget)
  const start = { values: before.givens, entries: before.entries, eliminations: before.eliminations }
  assert.deepEqual(await run({ type: 'rank-proof-effort', ...start, proof: step.proof }), step.effort)
  assert.ok(trace.steps.every(item => item.type === 'rank' || item.technique === 'pointing'))
})

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

test('technique attribution chooses the simplest proof for each candidate across different action sets', async () => {
  const { run } = engineRequests()
  const remove = (cell: number, digit: number) => ({ eliminate: { cell, digit } })
  const overlap = remove(2, 4)
  const { choices } = await run({ type: 'hints', values: LOCKED_PAIR, limit: 'all' })
  const provesOverlap = (action: unknown) => JSON.stringify(action) === JSON.stringify(overlap)
  assert.ok(choices.some(({ technique, actions }) => technique === 'naked-pair' && actions.length === 2 && actions.some(provesOverlap)))
  assert.ok(choices.some(({ technique, actions }) => technique === 'locked-pair' && actions.length === 4 && actions.some(provesOverlap)))
  assert.deepEqual(await run({
    type: 'classify-actions', values: LOCKED_PAIR, actions: [overlap, remove(34, 3), remove(19, 5), remove(81, 1), remove(0, 9)],
  }), ['locked-pair', 'claiming', 'pointing', null, null])

  const solved = await run({ type: 'solve', values: STARTER })
  assert.ok(solved)
  assert.deepEqual(await run({
    type: 'classify-actions', values: `0${solved.slice(1)}`, actions: [{ place: { cell: 0, digit: Number(solved[0]) } }],
  }), ['full-house'])
})

test('play hint ranking prefers useful progress within difficulty and preserves all alternatives', async () => {
  const { run } = engineRequests()
  const { techniques } = await run({ type: 'techniques' })
  const disabledTechniques = techniques.map(({ id }) => id).filter(id => !['pointing', 'naked-pair'].includes(id))
  const request = { type: 'hints', values: LOCKED_PAIR, disabledTechniques, includePatterns: true } as const
  const old = await run({ ...request, limit: 'all' })
  assert.equal(old.choices[0].technique, 'pointing')
  const easy = await run({ ...request, preferProgress: true, difficulty: 'easy', limit: 1 })
  assert.equal(easy.choices[0].technique, 'pointing')
  const useful = await run({ ...request, preferProgress: true, difficulty: 'medium', limit: 1 })
  assert.equal(useful.choices[0].technique, 'naked-pair')
  assert.ok(useful.choices[0].pattern)
  assert.deepEqual(useful.candidates, old.candidates)
  const all = await run({ ...request, preferProgress: true, difficulty: 'medium', limit: 'all' })
  assert.deepEqual(all.choices[0], useful.choices[0])
  const identities = (choices: typeof all.choices) => choices.map(({ actions }) => JSON.stringify(actions)).sort()
  assert.deepEqual(identities(all.choices), identities(old.choices))
  assert.deepEqual(await run({ ...request, preferProgress: true, limit: 0 }), {
    choices: [], available: 0, candidates: old.candidates,
  })
  const eliminations = Array(81).fill(0)
  for (const action of useful.choices[0].actions) {
    if ('eliminate' in action) eliminations[action.eliminate.cell] |= 1 << (action.eliminate.digit - 1)
  }
  const followup = await run({ type: 'hints', values: LOCKED_PAIR, eliminations, preferProgress: true, difficulty: 'medium' })
  assert.ok(followup.choices[0].actions.some(action => 'place' in action))
})

test('variant play hints support useful progress without changing the default ranking', async () => {
  const { run } = engineRequests()
  const request = {
    type: 'variant', operation: 'hints',
    position: { puzzle: { version: 1, givens: LOCKED_PAIR, rules: [] } },
    techniqueOrder: ['pointing', 'naked-pair'], limit: 1,
  } as const
  const old = await run(request)
  assert.equal(old[0].technique, 'pointing')
  const useful = await run({ ...request, preferProgress: true, difficulty: 'medium' })
  assert.equal(useful[0].technique, 'naked-pair')
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
  const tiers: readonly string[] = DIFFICULTY_LEVELS
  const ranks = more.choices.map(({ technique }) => {
    const info = techniques.find(({ id }) => id === technique)!
    return [tiers.indexOf(info.difficulty), info.cost]
  })
  assert.deepEqual(ranks, [...ranks].sort(([tierA, costA], [tierB, costB]) => tierA - tierB || costA - costB))

  const disabledTechniques = ['full-house', 'hidden-single-box', 'naked-single', 'hidden-single', 'pointing', 'claiming']
  const filtered = await run({ type: 'hints', values, disabledTechniques })
  assert.ok(filtered.choices.length)
  assert.ok(filtered.choices.every(({ technique }) => !disabledTechniques.includes(technique)))
  assert.deepEqual((await run({ type: 'next-deduction', values, disabledTechniques }))?.deduction, filtered.choices[0])

  const solved = await run({ type: 'solve', values })
  assert.ok(solved)
  const oneCell = `0${solved.slice(1)}`
  const alternateProof = await run({
    type: 'hints', values: oneCell, disabledTechniques: ['full-house', 'hidden-single-box', 'naked-single', 'retired-technique'],
  })
  assert.equal(alternateProof.available, 1)
  assert.equal(alternateProof.choices[0].technique, 'hidden-single')
  assert.deepEqual(alternateProof.choices[0].actions, [{ place: { cell: 0, digit: Number(solved[0]) } }])
  const overlayProof = await run({ type: 'next-deduction', values: oneCell, disabledTechniques })
  assert.equal(overlayProof?.deduction.technique, 'pattern-overlay')
  assert.deepEqual(overlayProof?.deduction.actions, alternateProof.choices[0].actions)
  const noProof = [...disabledTechniques, 'pattern-overlay']
  assert.deepEqual(await run({ type: 'hints', values: oneCell, disabledTechniques: noProof }), { choices: [], available: 0 })
  assert.equal(await run({ type: 'next-deduction', values: oneCell, disabledTechniques: noProof }), null)
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
  const withRemovals = await run({ type: 'next-deduction', values: STARTER, eliminations, disabledTechniques: ['hidden-single-box'] })
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
    assert.equal(practice.deduction.technique, id)
    assert.deepEqual(practice.deduction.actions[0], practice.suggestion)
    assert.ok(practice.deduction.actions.every((action) =>
      practice.answers.some((answer) => JSON.stringify(answer) === JSON.stringify(action))))
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

test('every hint technique links to a Learn article with a starting scan and a working drill', async () => {
  const { run } = engineRequests()
  const examples: Record<string, EngineLessonExample> = await run({ type: 'lesson-examples' })
  const { techniques } = await run({ type: 'techniques', variant: true })
  for (const { id } of techniques) {
    assert.ok(lessonRoutes.has(id), id)
    if (examples[id]) continue
    const [diagram, practice] = await run({ type: 'practice-examples', variant: true, technique: id })
    examples[id] = { ...diagram, practice }
  }
  for (const article of articles) {
    assert.ok(article.blocks.some((block) => block.type === 'heading' && block.id === 'where-to-start'), article.id)
    for (const block of article.blocks) {
      if (block.type === 'diagram') {
        const diagram = lessonDiagram(lessonExample(examples[block.example]))
        assert.ok(diagram.results.length, block.example)
        assert.ok(diagram.description.trim(), block.example)
        assert.ok(diagram.reason.trim(), block.example)
      }
      if (block.type !== 'practice') continue
      for (const { example } of block.drills) {
        const { practice } = lessonExample(examples[example])
        const { start, check, follow } = practiceSearch(practice, block.guide)
        for (const clue of [start, check]) {
          assert.ok(clue.text, example)
          const annotations = practiceClueAnnotations(clue)
          assert.ok(annotations.cells?.size || annotations.candidates?.size, example)
          for (const [cell, marks] of annotations.candidates ?? []) {
            for (const [digit] of marks) assert.ok(hasCandidate(practice.candidates[cell], digit), example)
          }
        }
        if (follow) {
          const { annotations } = lessonDiagram(practice, undefined, { showActions: false })
          assert.ok([...annotations.candidates?.values() ?? []].every(marks =>
            [...marks.values()].every(mark => mark.mark !== 'strike' && mark.label !== 'to place')), example)
        }
      }
    }
  }
})

test('each Classic Learn drill generates a different grid with a verified walkthrough for its technique', async () => {
  const { run } = engineRequests()
  const examples = await run({ type: 'lesson-examples' })
  const drills = new Set(articles.flatMap(article => article.blocks.flatMap(block =>
    block.type === 'practice' ? block.drills.map(({ example }) => example) : [])))
  for (const technique of drills) {
    if (!examples[technique]) continue
    let exclude = lessonValues(examples[technique].practice)
    for (let repeat = 0; repeat < 2; repeat++) {
      const generated = await run({ type: 'generate-practice-example', technique, seed: workedExampleSeed(technique, repeat + 1), exclude })
      const values = lessonValues(generated)
      assert.notEqual(values, exclude, technique)
      assert.equal(generated.deduction.technique, technique)
      assert.deepEqual(generated.deduction.actions[0], generated.suggestion)
      assert.ok(generated.answers.some(action => JSON.stringify(action) === JSON.stringify(generated.suggestion)), technique)
      const legal = await run({ type: 'notes', values })
      assert.deepEqual(generated.candidates, legal?.map((mask, cell) => mask & ~generated.eliminations[cell]), technique)
      const proof = await run({ type: 'check-practice-move', technique, values: generated.givens,
        entries: generated.entries, eliminations: generated.eliminations, action: generated.suggestion })
      assert.equal(proof?.technique, technique)
      const { start, check } = practiceSearch(generated)
      assert.ok(start.text && check.text, technique)
      assert.ok(lessonDiagram(generated).results.length, technique)
      exclude = values
    }
  }
})

test('a fixed worked-example sequence gives the same verified boards to each player', async () => {
  const { run } = engineRequests()
  const technique = 'wxyz-wing'
  const [initial] = await run({ type: 'practice-examples', technique })
  const sequence = async () => {
    const examples: string[] = []
    let exclude = lessonValues(initial)
    for (const number of [1, 2, 3]) {
      const exercise = await run({ type: 'generate-practice-example', technique, seed: workedExampleSeed(technique, number), exclude })
      assert.equal(exercise.deduction.technique, technique)
      const grid = lessonValues(exercise)
      assert.notEqual(grid, exclude)
      examples.push(grid)
      exclude = grid
    }
    return examples
  }
  const firstPlayer = await sequence()
  assert.equal(new Set(firstPlayer).size, 3)
  assert.deepEqual(await sequence(), firstPlayer)
})

test('variant Learn drills offer distinct boards with checkable moves and rule clues', async () => {
  const { run } = engineRequests()
  const classic = await run({ type: 'lesson-examples' })
  const { techniques } = await run({ type: 'techniques', variant: true })
  for (const { id } of techniques.filter(({ id }) => !classic[id])) {
    const exercises = await run({ type: 'practice-examples', variant: true, technique: id })
    const drills = exercises.map(variantLessonExercise)
    assert.equal(new Set(drills.map(lessonValues)).size, 3, id)
    for (const [index, drill] of drills.entries()) {
      assert.ok(drill.variantPuzzle?.rules?.length, id)
      assert.equal(drill.deduction.technique, id)
      assert.ok(lessonDiagram(drill).results.length, id)
      const proof = await run({ type: 'variant', operation: 'check-practice-move', position: exercises[index].position,
        technique: id, action: drill.suggestion })
      assert.equal(proof?.technique, id)
    }
  }
})

test('variant Learn examples continue beyond the first three with seeded, checkable boards', async () => {
  const { run } = engineRequests()
  const classic = await run({ type: 'lesson-examples' })
  const { techniques } = await run({ type: 'techniques', variant: true })
  for (const { id } of techniques.filter(({ id }) => !classic[id])) {
    const fixed = await run({ type: 'practice-examples', technique: id, variant: true })
    const seen = new Set(fixed.map(({ position }) => position.puzzle.givens))
    let exclude = fixed[1].position.puzzle.givens

    for (let number = 3; number <= (id === 'between' ? 14 : 3); number++) {
      const request = { type: 'generate-practice-example', variant: true, technique: id,
        seed: workedExampleSeed(id, number), exclude } as const
      const example = await run(request)
      const { position, deduction, suggestion } = example
      assert.equal(deduction.technique, id)
      assert.ok(deduction.actions.some(action => JSON.stringify(action) === JSON.stringify(suggestion)), id)
      assert.ok(!seen.has(position.puzzle.givens), id)
      assert.equal(await run({ type: 'variant', operation: 'analyze', position }), 'unique', id)
      const proof = await run({ type: 'variant', operation: 'check-practice-move', position, technique: id, action: suggestion })
      assert.equal(proof?.technique, id)
      if (id === 'locked-candidates') {
        assert.equal(deduction.evidence.type, 'intersection')
        assert.ok('diagonal' in deduction.evidence.source || 'diagonal' in deduction.evidence.target)
      }
      if (id === 'between') assert.deepEqual(await run(request), example)
      seen.add(position.puzzle.givens)
      exclude = position.puzzle.givens
    }
  }
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

  // A difficulty request cannot return a grid with only one or two gaps.
  const tooShort = await raw({ ...options, difficulty: 'easy' })
  assert.ok('code' in tooShort && tooShort.code === 'search-limit')
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

test('generation can target a Hard Classic puzzle with X-Wing', async () => {
  const { run } = engineRequests()
  const { defaultOrder: techniqueOrder } = await run({ type: 'techniques' })
  const values = await run({ type: 'generate-constrained', seed: 4, maxAttempts: 96, clues: [24, 36],
    difficulty: 'hard', technique: 'x-wing', techniqueOrder })
  const rating = await run({ type: 'rate', values, techniqueOrder })
  assert.deepEqual(rating.status, { solved: 'hard' })
  assert.ok(rating.score.counts['x-wing'] > 0)
  assert.equal(await run({ type: 'analyze', values }), 'unique')
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
  assert.deepEqual(sparse.rating, await run({ type: 'rate', values: sparse.board, techniqueOrder: sparse.rating.techniqueOrder }))

  const expert = await run({ ...request, clues: 20, difficulty: 'extreme', technique: 'multi-sector-locked-sets' })
  assert.equal(expert.board.replaceAll('0', '').length, 20)
  assert.deepEqual(expert.rating.status, { solved: 'extreme' })
  assert.ok(expert.rating.score.counts['multi-sector-locked-sets'] > 0)
  assert.deepEqual(expert.rating, await run({ type: 'rate', values: expert.board, techniqueOrder: expert.rating.techniqueOrder }))
})

test('classic generation excludes equivalent saved puzzles on every search route', async () => {
  const { run, raw } = engineRequests()
  const bank = await run({ type: 'impossible-templates' })
  assert.equal(bank.length, 768)
  assert.equal(new Set(bank).size, bank.length)
  assert.deepEqual(await run({ type: 'canonical-puzzles', values: [] }), [])
  const invalid = await raw({ type: 'canonical-puzzles', values: [TEMPLATE, '0'] })
  assert.ok('code' in invalid && invalid.code === 'invalid-grid')
  const renamed = [...TEMPLATE].map(digit => digit === '0' ? '0' : String(10 - Number(digit))).join('')
  const transposed = Array.from({ length: 81 }, (_, cell) => TEMPLATE[cell % 9 * 9 + Math.floor(cell / 9)]).join('')
  const [key, renamedKey, transposedKey, otherKey] = await run({
    type: 'canonical-puzzles', values: [TEMPLATE, renamed, transposed, STARTER],
  })
  assert.equal(key, renamedKey)
  assert.equal(key, transposedKey)
  assert.notEqual(key, otherKey)

  // Every transformed draw from this one-template search is the same puzzle.
  const fixed = { type: 'generate-constrained', seed: 42, maxAttempts: 3,
    clues: TEMPLATE.replaceAll('0', '').length, templates: [TEMPLATE] } as const
  const allowed = await run(fixed)
  assert.deepEqual(await run({ type: 'canonical-puzzles', values: [allowed] }), [key])
  const exhausted = await raw({ ...fixed, exclude: [transposed] })
  assert.ok('code' in exhausted && exhausted.code === 'search-limit')

  const targeted = { type: 'generate-targeted', seed: 42, maxAttempts: 512,
    target: { type: 'difficulty', level: 'medium' } } as const
  const first = await run(targeted)
  const next = await run({ ...targeted, exclude: [first] })
  const keys = await run({ type: 'canonical-puzzles', values: [first, next] })
  assert.notEqual(keys[0], keys[1])

  const pool = { type: 'generate-from-pool', seed: 42, maxAttempts: 256,
    clues: [17, 40], difficulty: 'medium' } as const
  const pooled = await run(pool)
  const another = await run({ ...pool, exclude: [pooled.board] })
  const poolKeys = await run({ type: 'canonical-puzzles', values: [pooled.board, another.board] })
  assert.notEqual(poolKeys[0], poolKeys[1])
})

test('the browser client reports attempts and cancels one active search independently', async (t) => {
  const { raw, run } = engineRequests()
  const sent: EngineRequest[] = []
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const saved = new Map<string, string>()
  class TestWorker {
    onmessage?: (event: { data: EngineResponse }) => void

    terminate() {}

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
  assert.deepEqual(matched.puzzle.rating, await runEngine({ type: 'rate', values: matched.puzzle.board, techniqueOrder: matched.puzzle.rating.techniqueOrder }))

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

  const generated = await generatePlayableVariant('arrow', 'expert', 0, [])
  assert.deepEqual(generated.rating.status, { solved: 'expert' })
  const game = {
    ...makeGame('generated-arrow', 'Arrow puzzle', generated.puzzle.givens, 'generated'),
    variant: { id: 'arrow' as const, puzzle: generated.puzzle, solution: generated.solution },
  }
  const masks = await playCandidates(game)
  assert.ok(masks)
  for (const [cell, digit] of [...generated.solution].entries()) {
    if (game.givens[cell] === '0') assert.ok(hasCandidate(masks[cell], Number(digit)))
  }
  const next = await generatePlayableVariant('arrow', 'expert', 0, [game])
  assert.notEqual(next.puzzle.givens, generated.puzzle.givens)

  // The normal generation path ignores the saved singles-only analysis profile.
  const catalog = await run({ type: 'techniques' })
  for (const level of DIFFICULTY_LEVELS) {
    const { board, rating } = await generateClassic(level, 42)
    assert.deepEqual(rating.status, { solved: level })
    assert.equal(await run({ type: 'analyze', values: board }), 'unique')
    assert.ok(board.replaceAll('0', '').length <= 40)
    const lower = catalog.difficultyOrder.filter(id => difficultyIndex(catalog.techniques.find(t => t.id === id)!.difficulty) < difficultyIndex(level))
    assert.equal((await run({ type: 'rate', values: board, techniqueOrder: lower })).status, 'stalled', level)
    if (difficultyIndex(level) >= difficultyIndex('medium')) {
      const reasoning = Object.entries(rating.score.counts).filter(([id]) =>
        difficultyIndex(catalog.techniques.find(t => t.id === id)!.difficulty) >= difficultyIndex('medium'))
      assert.ok(reasoning.reduce((sum, [, count]) => sum + count, 0) >= 4, level)
      if (level === 'medium') assert.ok(reasoning.length >= 2)
    }
  }
  assert.deepEqual((await generateClassic('medium', 43, [])).rating.status, { solved: 'medium' })
  assert.deepEqual((await generateClassic('impossible', 43)).rating.status, { solved: 'impossible' })

  for (const difficulty of ['medium', 'impossible'] as const) {
    const first = await generateClassic(difficulty, 42)
    const next = await generateClassic(difficulty, 42, undefined, [first.board])
    const keys = await run({ type: 'canonical-puzzles', values: [first.board, next.board] })
    assert.notEqual(keys[0], keys[1], `${difficulty} must honor saved history`)
  }
  const bank = await run({ type: 'impossible-templates' })
  const lastUnseen = await generateClassic('impossible', 42, undefined, bank.slice(0, -1))
  assert.deepEqual(await run({ type: 'canonical-puzzles', values: [lastUnseen.board] }), [bank.at(-1)])

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
  const dynamicNet = examples['dynamic-forcing-net'].deduction
  assert.equal(costs.get('dynamic-forcing-net'), 800)
  assert.ok(!catalog.defaultOrder.includes('dynamic-forcing-net'))
  assert.ok('forcing' in dynamicNet.evidence)
  assert.ok(dynamicNet.evidence.forcing.branches.some(branch => branch.steps.some(step => typeof step.scope === 'object' && 'intersection' in step.scope)))
  const nestedNet = examples['nested-forcing-net'].deduction
  assert.equal(costs.get('nested-forcing-net'), 950)
  assert.ok(!catalog.defaultOrder.includes('nested-forcing-net'))
  assert.ok('forcing' in nestedNet.evidence)
  const nestedConflict = nestedNet.evidence.forcing.branches[0].conflict
  assert.ok(nestedConflict && 'cases' in nestedConflict)
  assert.deepEqual(nestedConflict.cases.map(({ branch }) => branch.assumption.truth), [true, false])

  for (const [id, cost] of [['tridagon', 410], ['tridagon-forcing-net', 850]] as const) {
    assert.equal(costs.get(id), cost)
    const { deduction } = examples[id]
    assert.ok('tridagon' in deduction.evidence)
    const { cells, digits, guardians, branches } = deduction.evidence.tridagon
    assert.equal(cells.length, 4)
    assert.equal(new Set(cells.flat()).size, 12)
    assert.equal(new Set(digits).size, 3)
    if (id === 'tridagon') {
      assert.equal(guardians.length, 1)
      assert.equal(branches.length, 0)
      assert.deepEqual(deduction.actions, [{ place: guardians[0] }])
    } else {
      assert.ok(guardians.length >= 2)
      assert.deepEqual(branches.map(branch => branch.assumption), guardians.map(candidate => ({ candidate, truth: true })))
      assert.ok(branches.some(branch => branch.steps.length > 0))
    }
  }

  for (const [id, cost, width] of [['aligned-pair-exclusion', 310, 2], ['aligned-triplet-exclusion', 370, 3]] as const) {
    assert.equal(costs.get(id), cost)
    const example = examples[id]
    const { deduction: { evidence, actions }, candidates } = example
    assert.ok('aligned-exclusion' in evidence)
    const { cells, cases } = evidence['aligned-exclusion']
    const [action] = actions
    assert.ok('eliminate' in action)
    assert.equal(cells.length, width)
    const choices = cells.filter(cell => cell !== action.eliminate.cell).map(cell =>
      candidates[cell].toString(2).split('1').length - 1)
    assert.equal(cases.length, choices.reduce((product, n) => product * n, 1))
    assert.ok(cases.every(({ digits }) => digits[cells.indexOf(action.eliminate.cell)] === action.eliminate.digit))
    assert.ok(cases.some(({ reason }) => 'empty-cell' in reason))
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

  assert.equal(await run({ type: 'analyze', values: SPARSE }), 'unique')
  const rating = await run({ type: 'rate', values: SPARSE })
  assert.equal(rating.score.points, 846)
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
  const matched = await run({ type: 'generate-constrained', seed: 42, maxAttempts: 1, clues: 17, score: [846, 846], templates: [TEMPLATE] })
  assert.equal(matched.replaceAll('0', '').length, 17)
  assert.equal((await run({ type: 'rate', values: matched })).score.points, 846)
})

test('a custom solving profile can continue past the default AI Escargot stall', async () => {
  const { run } = engineRequests()
  const values = '100007090030020008009600500005300900010080002600004000300000010041000007007000300'
  const baseline = await run({ type: 'logical-solve', values, includePositions: true })
  assert.equal(baseline.rating.status, 'stalled')
  assert.equal(baseline.steps.length, 1)

  const techniqueOrder = [...baseline.rating.techniqueOrder, 'dynamic-forcing-net']
  const extended = await run({ type: 'logical-solve', values, techniqueOrder })
  const first = extended.steps[baseline.steps.length]
  assert.deepEqual(extended.steps.slice(0, baseline.steps.length), baseline.steps)
  assert.equal(first.technique, 'dynamic-forcing-net')
  assert.deepEqual(first.actions, [{ eliminate: { cell: 68, digit: 2 } }])
  assert.ok('forcing' in first.evidence)
  assert.ok(first.evidence.forcing.branches.some(branch => branch.steps.some(step => typeof step.scope === 'object' && 'intersection' in step.scope)))

  const stall = baseline.positions?.at(-1)
  assert.ok(stall)
  const request = { type: 'hints', values: baseline.board, eliminations: stall.eliminations } as const
  const hints = await run(request)
  assert.ok(hints.choices.filter(hint => hint.technique === 'dynamic-forcing-net').length >= 2)
  const disabled = await run({ ...request, disabledTechniques: ['dynamic-forcing-net'] })
  assert.ok(disabled.choices.every(hint => hint.technique !== 'dynamic-forcing-net'))
})

test('dynamic forcing can complete a published puzzle with a replayable logical trace', async () => {
  const { run } = engineRequests()
  // The first advanced forcing example in Sudoku Explainer's published collection.
  const values = '708000300000201000500000000040000026300080000000100090090600004000070500000000000'
  const baseline = await run({ type: 'rate', values })
  assert.equal(baseline.status, 'stalled')
  const techniqueOrder = [...baseline.techniqueOrder, 'dynamic-forcing-net']
  const trace = await run({ type: 'logical-solve', values, techniqueOrder, includePositions: true })
  assert.deepEqual(trace.rating.status, { solved: 'extreme' })
  assert.equal(trace.board, await run({ type: 'solve', values }))
  const index = trace.steps.findIndex(step => step.technique === 'dynamic-forcing-net')
  const step = replayStep(trace, index)
  assert.ok(step)
  const before = [...step.before.givens].map((digit, cell) => digit === '0' ? step.before.entries[cell] : digit).join('')
  const moves = await run({
    type: 'deductions', values: before, eliminations: step.before.eliminations, techniqueOrder: ['dynamic-forcing-net'],
  })
  const proof = moves.find(move => JSON.stringify(move.actions) === JSON.stringify(step.deduction.actions))
  assert.ok(proof)
  assert.deepEqual(proof.proofs[0].evidence, step.deduction.evidence)
})

test('nested forcing completes Easter Monster and exports the two cases of its proof', async () => {
  const { run } = engineRequests()
  const values = '100000002090400050006000700050903000000070000000850040700000600030009080002000001'
  const catalog = await run({ type: 'techniques' })
  const dynamic = [...catalog.defaultOrder, 'dynamic-forcing-net']
  const baseline = await run({ type: 'logical-solve', values, techniqueOrder: dynamic })
  assert.equal(baseline.rating.status, 'stalled')
  const techniqueOrder = [...dynamic, 'nested-forcing-net']
  const trace = await run({ type: 'logical-solve', values, techniqueOrder })
  assert.deepEqual(trace.rating.status, { solved: 'impossible' })
  assert.equal(trace.board, await run({ type: 'solve', values }))
  const first = trace.steps[baseline.steps.length]
  assert.deepEqual(trace.steps.slice(0, baseline.steps.length), baseline.steps)
  assert.equal(first.technique, 'nested-forcing-net')
  assert.ok('forcing' in first.evidence)
  const [outer] = first.evidence.forcing.branches
  assert.ok(outer.conflict && 'cases' in outer.conflict)
  const [positive, negative] = outer.conflict.cases
  assert.deepEqual(positive.branch.assumption.candidate, negative.branch.assumption.candidate)
  assert.equal(positive.branch.assumption.truth, true)
  assert.equal(negative.branch.assumption.truth, false)
  for (const { premises, branch } of [positive, negative]) {
    assert.ok(premises.every(index => index <= outer.steps.length))
    assert.ok(branch.conflict && !('cases' in branch.conflict))
    assert.ok(branch.steps.every((step, index) => step.causes.every(cause => cause <= index + premises.length)))
  }
})

test('Tridagon practice exposes the guardian constraint in a refutation', async () => {
  const { run } = engineRequests()
  const technique = 'tridagon-forcing-net'
  const [, exercise] = await run({ type: 'practice-examples', technique })
  assert.deepEqual(exercise.suggestion, { eliminate: { cell: 26, digit: 1 } })
  const { evidence } = exercise.deduction
  assert.ok('tridagon' in evidence)
  const { guardians, branches } = evidence.tridagon
  assert.equal(guardians.length, 4)
  assert.equal(branches.length, 1)
  const [branch] = branches
  assert.deepEqual(branch.assumption, { candidate: { cell: 26, digit: 1 }, truth: true })
  const conflict = branch.conflict
  assert.ok(conflict)
  assert.ok(branch.steps.some(step => step.scope === 'guardians')
    || ('exhausted' in conflict && conflict.exhausted.scope === 'guardians'))
  assert.deepEqual(await run({
    type: 'check-practice-move', technique, values: exercise.givens, entries: exercise.entries,
    eliminations: exercise.eliminations, action: exercise.suggestion,
  }), exercise.deduction)
})

test('Advanced Forcing Net practice exports the branch premises of an X-Wing', async () => {
  const { run } = engineRequests()
  const technique = 'advanced-forcing-net'
  const [, , exercise] = await run({ type: 'practice-examples', technique })
  assert.deepEqual(exercise.suggestion, { place: { cell: 28, digit: 3 } })
  assert.ok('forcing' in exercise.deduction.evidence)
  let found = false
  for (const branch of exercise.deduction.evidence.forcing.branches) {
    for (const [index, step] of branch.steps.entries()) {
      if (typeof step.scope === 'object' && 'x-wing' in step.scope) {
        assert.equal(step.effect.truth, false)
        assert.ok(step.causes.length > 0)
        assert.ok(step.causes.every(cause => cause <= index))
        found = true
      }
    }
  }
  assert.ok(found)
  assert.deepEqual(await run({
    type: 'check-practice-move', technique, values: exercise.givens, entries: exercise.entries,
    eliminations: exercise.eliminations, action: exercise.suggestion,
  }), exercise.deduction)
})

test('Kraken Fish practice returns a branch for every alternative', async () => {
  const { run } = engineRequests()
  for (const [technique, target] of [
    ['kraken-fish-1', { cell: 69, digit: 2 }],
    ['kraken-fish-2', { cell: 44, digit: 7 }],
  ] as const) {
    const [exercise] = await run({ type: 'practice-examples', technique })
    assert.deepEqual(exercise.suggestion, { eliminate: target })
    assert.ok('kraken-fish' in exercise.deduction.evidence)
    const { fins, cover, branches } = exercise.deduction.evidence['kraken-fish']
    assert.equal(cover === null, technique === 'kraken-fish-1')
    const starts = branches.map(chain => {
      assert.deepEqual(chain.at(-1)?.to, { candidate: target })
      assert.equal(chain[0].reason, 'exclusion')
      assert.ok('candidate' in chain[0].from)
      return chain[0].from.candidate.cell
    })
    assert.ok(fins.every(cell => starts.includes(cell)))
    assert.ok(branches.flat().some(link => typeof link.reason === 'object' && 'almost-locked-set' in link.reason))
    assert.deepEqual(await run({
      type: 'check-practice-move', technique, values: exercise.givens, entries: exercise.entries,
      eliminations: exercise.eliminations, action: exercise.suggestion,
    }), exercise.deduction)
  }
})

test('Unique Loop practice returns the alternating sides and supporting link', async () => {
  const { run } = engineRequests()
  const technique = 'unique-loop'
  const [single, shared, linked] = await run({ type: 'practice-examples', technique })
  assert.ok('unique-loop' in single.deduction.evidence)
  assert.equal(single.deduction.evidence['unique-loop'].sides.flat().length, 10)
  assert.ok('unique-loop' in shared.deduction.evidence)
  assert.deepEqual(shared.deduction.evidence['unique-loop'].support, {
    'extra-candidates': [{ cell: 30, digit: 4 }, { cell: 38, digit: 4 }],
  })
  assert.ok('unique-loop' in linked.deduction.evidence)
  const proof = linked.deduction.evidence['unique-loop']
  assert.deepEqual(proof.sides, [[0, 13, 71, 75], [3, 9, 67, 80]])
  assert.deepEqual(proof.support, { 'strong-links': { houses: [{ column: 3 }], digit: 8 } })
  assert.deepEqual(await run({
    type: 'check-practice-move', technique, values: linked.givens, entries: linked.entries,
    eliminations: linked.eliminations, action: linked.suggestion,
  }), linked.deduction)
})

test('aligned triplet exclusion can replace a longer chain profile path', async () => {
  const { run } = engineRequests()
  const values = '560040000000130000000000670000200500008001209900000800140060050007010000380000400'
  const baseline = await run({ type: 'logical-solve', values })
  const techniqueOrder = [...baseline.rating.techniqueOrder]
  techniqueOrder.splice(techniqueOrder.indexOf('aic'), 0, 'aligned-pair-exclusion', 'aligned-triplet-exclusion')
  const trace = await run({ type: 'logical-solve', values, techniqueOrder, includePositions: true })
  assert.deepEqual(baseline.rating.status, { solved: 'master' })
  assert.deepEqual(trace.rating.status, { solved: 'extreme' })
  assert.equal(trace.board, await run({ type: 'solve', values }))
  assert.ok(trace.rating.score.points < baseline.rating.score.points)
  assert.ok(trace.steps.length < baseline.steps.length)
  const index = trace.steps.findIndex(({ technique }) => technique === 'aligned-triplet-exclusion')
  const step = replayStep(trace, index)
  assert.ok(step && 'aligned-exclusion' in step.deduction.evidence)
  assert.equal(step.deduction.evidence['aligned-exclusion'].cases.length, 4)

  const catalog = await run({ type: 'techniques' })
  const enabled = ['aligned-triplet-exclusion', 'forcing-chain', 'forcing-net']
  const disabledTechniques = catalog.techniques.map(({ id }) => id).filter(id => !enabled.includes(id))
  const grid = [...step.before.givens].map((digit, cell) => digit === '0' ? step.before.entries[cell] : digit).join('')
  const { choices } = await run({ type: 'hints', values: grid, eliminations: step.before.eliminations, disabledTechniques, limit: 'all' })
  const explanations = choices.filter(hint => hint.actions.some(action => 'eliminate' in action && action.eliminate.cell === 64 && action.eliminate.digit === 9))
  assert.deepEqual(explanations.map(hint => hint.technique), ['aligned-triplet-exclusion'])
})

test('variant requests round-trip the rules and solve under those rules', async () => {
  const { raw, run } = engineRequests()
  const solution = '658492731974316582132875694461523978387149256295768143849251367726934815513687429'
  const givens = [...solution].map((digit, cell) => [1, 6, 10, 15].includes(cell) ? '.' : digit).join('')
  const request = { type: 'variant', position: { puzzle: { version: 1, givens } } } as const
  assert.equal(await run({ ...request, operation: 'analyze' }), 'multiple')
  assert.deepEqual(await run({ ...request, operation: 'solve-unique' }), { status: 'multiple' })
  // Five nodes find the first completion. The second branch still needs work.
  assert.ok(await run({ ...request, operation: 'solve', maxNodes: 5 }))
  assert.deepEqual(await run({ ...request, operation: 'solve-unique', maxNodes: 5 }), { status: 'search-limit' })

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
  assert.deepEqual(await run({ ...variant, operation: 'solve-unique' }), { status: 'unique', solution })

  const progressed = [...entries]
  progressed[1] = solution[1]
  assert.deepEqual(await run({ ...variant, operation: 'solve-unique',
    position: { ...position, entries: progressed.join('') } }), { status: 'unique', solution })
  progressed[1] = solution[0]
  assert.deepEqual(await run({ ...variant, operation: 'solve-unique',
    position: { ...position, entries: progressed.join('') } }), { status: 'conflict' })

  const blocked = eliminations.slice()
  blocked[10] = 511
  assert.deepEqual(await run({ ...variant, operation: 'solve-unique',
    position: { ...position, eliminations: blocked } }), { status: 'unsolvable' })

  const invalidMasks = eliminations.slice()
  invalidMasks[10] = 512
  const invalid = await raw({ ...variant, operation: 'solve-unique',
    position: { ...position, eliminations: invalidMasks } })
  assert.ok('error' in invalid)
  assert.equal(invalid.code, 'invalid-eliminations')

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

test('fog play, hints, and replay use only the revealed rules and player knowledge', async () => {
  const { run, raw } = engineRequests()
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
  const candidates = await run({ ...request, operation: 'candidates', visibility })
  assert.deepEqual(candidates, await run({ ...request, operation: 'candidates', position: revealed }))
  const knownRemovals = Array<number>(81).fill(0)
  const evenDigit = 1 << 1
  knownRemovals[50] = evenDigit
  const limited = await run({ ...request, operation: 'candidates', visibility: { ...visibility, knownRemovals } })
  assert.equal(candidates[50] & evenDigit, evenDigit)
  assert.equal(limited[50] & evenDigit, 0)
  assert.equal(await run({ ...request, operation: 'solve-singles', visibility }),
    await run({ ...request, operation: 'solve-singles', position: revealed }))
  for (const operation of ['analyze', 'solve', 'solve-unique'] as const) {
    const error = await raw({ ...request, operation, visibility })
    assert.ok('error' in error)
    assert.equal(error.code, 'invalid-visibility')
  }
  for (const operation of ['candidates', 'solve-singles'] as const) {
    const error = await raw({ ...request, operation, visibility: { cells: [81], rules: [] } })
    assert.ok('error' in error)
    assert.equal(error.code, 'invalid-visibility')
  }
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

test('Jigsaw Pattern Overlay exposes its own regions and replays the published move', async () => {
  const { run } = engineRequests()
  const technique = 'pattern-overlay'
  const [exercise] = await run({ type: 'practice-examples', variant: true, technique })
  const { position, suggestion } = exercise
  const { regions } = position.puzzle
  assert.ok(regions?.type === 'jigsaw')
  const expected = { eliminate: { cell: 76, digit: 7 } }
  assert.deepEqual(suggestion, expected)
  const request = { type: 'variant', position, techniqueOrder: [technique] } as const
  const hints = await run({ ...request, operation: 'hints', limit: 10 })
  const published = hints.find(hint => hint.actions.some(action =>
    'eliminate' in action && action.eliminate.cell === 76 && action.eliminate.digit === 7))
  assert.ok(published?.evidence.type === 'classic' && 'pattern-overlay' in published.evidence.proof)
  const proof = published.evidence.proof['pattern-overlay']
  assert.deepEqual(proof.geometry?.houses.slice(18), regions.regions)
  assert.deepEqual(proof.geometry?.excludedPairs, [])
  assert.equal(proof.scopes[0].digit, 7)
  assert.ok(proof.scopes[0].allowed.includes(76) && !proof.scopes[0].supported.includes(76))
  const replay = await run({ ...request, operation: 'replay-step', stepIndex: 0 })
  assert.deepEqual(replay?.deduction, published)
  assert.deepEqual(replay?.before, position)
  assert.ok((replay?.after.eliminations[76] ?? 0) & (1 << 6))

  const { defaultOrder } = await run({ type: 'techniques', variant: true })
  const fromGivens = { type: 'variant', position: { puzzle: position.puzzle }, operation: 'rate' } as const
  const baseline = await run({ ...fromGivens, techniqueOrder: defaultOrder })
  assert.equal(baseline.status, 'stalled')
  const techniqueOrder = [...defaultOrder, technique, 'pairwise-pattern-overlay', 'triple-pattern-overlay',
    'quadruple-pattern-overlay', 'quintuple-pattern-overlay']
  const rated = await run({ ...fromGivens, techniqueOrder })
  assert.deepEqual(rated.status, { solved: 'impossible' })
  assert.ok(rated.counts['triple-pattern-overlay'] > 0)
})

test('the variant catalog exposes calibrated costs and practice proofs', async () => {
  const { raw, run } = engineRequests()
  const [catalog, classic] = await Promise.all([run({ type: 'techniques', variant: true }), run({ type: 'techniques' })])
  assert.equal(catalog.scoringVersion, 21)
  assert.ok(!catalog.defaultOrder.includes('little-killer-house-support'))
  assert.ok(!catalog.defaultOrder.includes('renban-sum-ray-houses'))
  assert.ok(!catalog.defaultOrder.includes('renban-locked-digit'))
  assert.ok(!catalog.defaultOrder.includes('renban-house-support'))
  assert.ok(!catalog.defaultOrder.includes('renban-group-counts'))
  assert.ok(!catalog.defaultOrder.includes('renban-sum'))
  assert.ok(!catalog.defaultOrder.includes('renban-sum-house'))
  assert.ok(!catalog.defaultOrder.includes('group-line-house-support'))
  assert.ok(!catalog.defaultOrder.includes('group-order-contradiction'))
  assert.ok(!catalog.defaultOrder.includes('kropki-house-support'))
  assert.ok(!catalog.defaultOrder.includes('matching-digit-contradiction'))
  assert.ok(!catalog.defaultOrder.includes('matching-layout-forcing'))
  const expectedIds = new Set([...catalog.defaultOrder, 'region-sum-distinct', 'region-sum-house', 'thermometer-house-support', 'kropki-house-support', 'linked-clue-contradiction', 'matching-digit-contradiction', 'matching-layout-forcing', 'group-line-house-support', 'group-order-contradiction', 'little-killer-house-support', 'renban-sum-ray-houses', 'renban-locked-digit', 'renban-house-support', 'renban-group-counts', 'renban-sum', 'renban-sum-house', ...classic.techniques.map(technique => technique.id)])
  assert.equal(catalog.techniques.length, expectedIds.size)
  assert.deepEqual(new Set(catalog.techniques.map(technique => technique.id)), expectedIds)
  const costs = new Map(catalog.techniques.map(technique => [technique.id, technique.cost]))
  assert.equal(costs.get('quadruple'), 27)
  assert.equal(costs.get('parity'), 6)
  assert.equal(costs.get('non-consecutive-locked-candidates-2'), 20)
  assert.equal(costs.get('non-consecutive-locked-candidates-3'), 24)
  assert.equal(costs.get('non-consecutive-bivalue'), 22)
  assert.equal(costs.get('non-consecutive-trivalue'), 24)
  assert.equal(costs.get('cage-house-sum'), 67)
  assert.equal(costs.get('region-sum-distinct'), 67)
  assert.equal(costs.get('region-sum-house'), 133)
  assert.equal(costs.get('thermometer-house-support'), 64)
  assert.equal(costs.get('kropki-house-support'), 48)
  assert.equal(costs.get('linked-clue-contradiction'), 78)
  assert.equal(costs.get('matching-digit-contradiction'), 80)
  assert.equal(costs.get('matching-layout-forcing'), 246)
  assert.equal(costs.get('little-killer-house-support'), 64)
  assert.equal(costs.get('renban-sum-ray-houses'), 79)
  assert.equal(costs.get('renban-locked-digit'), 40)
  assert.equal(costs.get('renban-house-support'), 62)
  assert.equal(costs.get('renban-group-counts'), 89)
  assert.equal(costs.get('renban-sum'), 66)
  assert.equal(costs.get('renban-sum-house'), 88)
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

test('Windoku reproduces the public Sudoku Coach example with all four extra houses', async () => {
  // Sudoku Coach's built-in Windoku example, decoded from its SCv4 givens.
  // A separate MRV solver verified the unique solution against all 31 houses.
  const givens = '000000070700000056000590000000000300040001090016000000000000800003254000007100000'
  const solution = '495613278731842956862597413579426381248371695316985724154769832983254167627138549'
  const puzzle = { version: 1 as const, givens,
    rules: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })) }
  const { run } = engineRequests()
  const position = { puzzle }
  assert.equal(await run({ type: 'variant', operation: 'analyze', position }), 'unique')
  assert.equal(await run({ type: 'variant', operation: 'solve', position }), solution)
  assert.equal(await run({ type: 'analyze', values: givens }), 'multiple')
  const [variant, classic] = await Promise.all([run({ type: 'techniques', variant: true }), run({ type: 'techniques' })])
  const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder, Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
  const trace = await run({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(variantSolutionPath(trace).board, solution)
  for (const cells of WINDOKU_REGIONS) assert.equal(new Set(cells.map(cell => solution[cell])).size, 9)
})

test('every playable variant generates its supported difficulties with a unique solution and usable hints', async (t) => {
  const { run } = engineRequests()
  const [variant, classic] = await Promise.all([run({ type: 'techniques', variant: true }), run({ type: 'techniques' })])
  const tiers = Object.fromEntries([...classic.techniques, ...variant.techniques].map((t) => [t.id, t.difficulty]))
  const defaultOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder, tiers)

  for (const id of Object.keys(variantSeeds) as (keyof typeof variantSeeds)[]) {
    const techniqueOrder = id === 'thermometer' ? withMediumVariantTechniques(defaultOrder, tiers, ['thermometer-house-support'])
      : id === 'kropki' ? withMediumVariantTechniques(defaultOrder, tiers, ['kropki-house-support']) : defaultOrder
    const levels = variantSeeds[id]
    for (const difficulty of Object.keys(levels) as (keyof typeof levels)[]) {
      await t.test(`${id} / ${difficulty}`, async () => {
        const recipes = levels[difficulty]
        assert.ok(recipes && recipes.length >= 1)
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
        // Jigsaw generation checks uniqueness without regions in Rust. The public puzzle format always has regions.
        if (id !== 'jigsaw') {
          assert.equal(await run({
            type: 'variant', position: { puzzle: { ...puzzle, rules: [] } }, operation: 'analyze',
          }), 'multiple')
        }

        const trace = await run({ type: 'variant', position, operation: 'trace', techniqueOrder: rating.techniqueOrder })
        const path = variantSolutionPath(trace)
        assert.equal(path.board, solution)
        assert.deepEqual(trace.rating, rating)

        const ruleStep = trace.steps.findIndex(({ evidence }) => {
          if (id !== 'diagonal' && id !== 'jigsaw' && id !== 'windoku') {
            return evidence.type === 'constraint' || evidence.type === 'cage-sum' || evidence.type === 'sum-pair'
          }
          const house = id === 'jigsaw' ? 'region' : id === 'windoku' ? 'extra' : 'diagonal'
          return evidence.type === 'single' && evidence.house && house in evidence.house ||
            evidence.type === 'intersection' && (house in evidence.source || house in evidence.target)
        })
        if (id === 'windoku' && difficulty === 'beginner') {
          // Given digits in the extra houses can narrow the initial candidates
          // enough to finish with box singles, without a later extra-house step.
          const classicCandidates = await run({ type: 'notes', values: puzzle.givens })
          assert.notDeepEqual(path.positions![0].candidates, classicCandidates)
        } else {
          assert.ok(ruleStep >= 0, 'The logical path uses the variant rule.')
          const { entries: ruleEntries, eliminations: ruleRemovals } = path.positions![ruleStep]
          const ruleHints = await run({
            type: 'variant', operation: 'hints', position: { puzzle, entries: ruleEntries, eliminations: ruleRemovals },
            techniqueOrder: [trace.steps[ruleStep].technique], limit: 40,
          })
          assert.ok(ruleHints.some(({ actions }) => JSON.stringify(actions) === JSON.stringify(trace.steps[ruleStep].actions)))
          assert.ok('variant' in variantHintChoice(trace.steps[ruleStep], puzzle).evidence)
        }
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

test('exhaustive hint pages preserve order and evidence and release only their own result', async () => {
  const { run, raw } = engineRequests()
  const request = { type: 'hints', values: STARTER, includePatterns: true, limit: 'all',
    preferProgress: true, disabledTechniques: ['naked-single'] } as const
  const full = await run(request)
  const first = await run({ ...request, collection: 11 })
  assert.ok(first.choices.length > 0 && first.choices.length < full.available)
  assert.equal(first.available, full.available)
  assert.deepEqual(first.candidates, full.candidates)
  const choices = [...first.choices]
  await run({ ...request, limit: 0 })
  while (choices.length < full.available) {
    const page = await run({ type: 'hint-page', collection: 11, index: choices.length })
    assert.equal(page.offset, choices.length)
    assert.equal(page.candidates, undefined)
    choices.push(...page.choices)
  }
  assert.deepEqual(choices, full.choices)
  const backwards = await run({ type: 'hint-page', collection: 11, index: 1 })
  assert.deepEqual(backwards.choices, first.choices)
  const invalid = await raw({ type: 'hint-page', collection: 11, index: full.available })
  assert.ok('code' in invalid && invalid.code === 'invalid-hint-index')

  const variant = { type: 'variant', operation: 'hints', position: { puzzle: { version: 1, givens: STARTER } },
    techniqueOrder: ['hidden-single', 'naked-single'], limit: 100 } as const
  const expected = await run(variant)
  const next = await run({ ...variant, collection: 12 })
  await run({ type: 'release-hints', collection: 11 })
  assert.deepEqual(next.choices, expected.slice(0, next.choices.length))
  assert.equal(next.available, expected.length)
  const last = await run({ type: 'hint-page', collection: 12, index: expected.length - 1, variant: true })
  assert.deepEqual(last.choices, expected.slice(last.offset))
  await run({ type: 'release-hints', collection: 12 })
  const expired = await raw({ type: 'hint-page', collection: 12, index: 0 })
  assert.ok('code' in expired && expired.code === 'expired-hints')
})

test('one singles request follows displayed candidates, removals and alternate houses', async () => {
  const { run, raw } = engineRequests()
  const fixtures: { name: string; position: VariantPuzzle }[] = JSON.parse(await readFile(
    new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url), 'utf8'))
  for (const { name, position: puzzle } of fixtures.filter(f => ['classic', 'jigsaw-killer', 'killer', 'x-sudoku', 'windoku'].includes(f.name))) {
    let values = puzzle.givens
    const classic = name === 'classic'
    const solution = await run({ type: 'variant', operation: 'solve', position: { puzzle } })
    const displayed = Array<number>(81).fill(511)
    const removed = Array<number>(81).fill(0)
    for (const [cell, digit] of [...solution].entries()) {
      if (cell % 3 === 0) displayed[cell] = 1 << (Number(digit) - 1)
      if (cell % 4 === 0) removed[cell] = 1 << (Number(digit) % 9)
    }
    const actual = classic
      ? await run({ type: 'solve-singles', values, displayedCandidates: displayed, eliminations: removed })
      : await run({ type: 'variant', operation: 'solve-singles', position: { puzzle, eliminations: removed }, displayedCandidates: displayed })
    while (true) {
      const legal = classic ? await run({ type: 'notes', values }) : await run({
        type: 'variant', operation: 'candidates', position: { puzzle, entries: values, eliminations: removed },
      })
      assert.ok(legal)
      const move = singleFromCandidates(values, legal.map((mask, cell) => mask & displayed[cell]), removed, classic ? undefined : puzzle)
      if (!move) break
      const [cell, digit] = move
      values = values.slice(0, cell) + digit + values.slice(cell + 1)
    }
    assert.equal(actual, values, name)
    assert.notEqual(actual, puzzle.givens, name)
  }
  assert.equal(await run({ type: 'solve-singles', values: STARTER, displayedCandidates: Array(81).fill(0) }), STARTER)
  const bad = await raw({ type: 'solve-singles', values: '11' + '0'.repeat(79) })
  assert.ok('code' in bad && bad.code === 'conflict')
  const mask = await raw({ type: 'solve-singles', values: STARTER, displayedCandidates: [0] })
  assert.ok('code' in mask && mask.code === 'invalid-eliminations')
})

test('compiled variant candidates follow the whole puzzle definition as positions alternate', async () => {
  const { run } = engineRequests()
  const givens = '0'.repeat(81)
  const plain = { version: 1, givens } as const
  const odd = { ...plain, rules: [{ type: 'parity', cells: [0], parity: 'odd' }] } as const
  const entries = '0' + '2' + '0'.repeat(79)
  const candidates = (puzzle: VariantPuzzle, placed?: string) =>
    run({ type: 'variant', operation: 'candidates', position: { puzzle, entries: placed } })
  assert.equal((await candidates(odd))[0], 0b101010101)
  assert.equal((await candidates(plain, entries))[0], 511 & ~2)
  assert.equal((await candidates(odd))[0], 0b101010101)
  assert.equal((await candidates({ ...odd, givens: '1' + givens.slice(1) }))[0], 0)
  assert.equal((await candidates(plain))[0], 511)
})

test('generation returns its accepted score and preserves grid-only and stepped requests', async () => {
  const { run } = engineRequests()
  const targeted = { type: 'generate-targeted', seed: 2, maxAttempts: 128, target: { type: 'difficulty', level: 'medium' } } as const
  const constrained = { type: 'generate-constrained', seed: 1, maxAttempts: 1, clues: 80,
    score: [14, 14], techniqueOrder: ['hidden-single'] } as const
  for (const request of [targeted, constrained]) {
    const board = await run(request)
    const rated = await run({ ...request, includeRating: true })
    assert.equal(rated.board, board)
    assert.deepEqual(rated.rating, await run({ type: 'rate', values: board, techniqueOrder: rated.rating.techniqueOrder }))
  }
  const request = { ...constrained, includeRating: true } as const
  const expected = await run(request)
  await run({ type: 'generation-start', job: 9, request })
  const step = await run({ type: 'generation-advance', job: 9 })
  assert.deepEqual(step, { status: 'matched', attempts: 1, puzzle: expected })
})
