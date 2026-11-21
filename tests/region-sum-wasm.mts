import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { needsPuzzleGrade } from '../src/sudoku/puzzle-rating.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertRegionSumDistinctProof, assertRegionSumHouseProof } from './helpers/region-sum-distinct-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
useWasmWorker()

const published = JSON.parse(readFileSync(new URL('./fixtures/region-sum-newman.json', import.meta.url), 'utf8'))
const coach = JSON.parse(readFileSync(new URL('./fixtures/region-sum-coach.json', import.meta.url), 'utf8')).examples
const mixed = coach[0]
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

const distinctTechnique = 'region-sum-distinct'
const houseTechnique = 'region-sum-house'
const appResults = [
  [published, 986, 68, true, 0],
  [mixed, 3830, 156, true, 6],
  [coach[1], 2815, 219, true, 1],
  [coach[2], 3218, 146, true, 4],
  [coach[3], 3977, 108, true, 7],
] as const
for (const [source, points, steps, complete, newProofs] of appResults) {
  test(`complete source ${source.title} imports with checked rules, retained hints and an honest solution path`, async () => {
    const { game } = await prepareImportedPuzzle(source === published ? share(source.puzzle) : source.code)
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    const candidates = await playCandidates(game)
    candidates!.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)) })
    const hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1)
    if (source === coach[3]) {
      assert.deepEqual(hints.choices.map(hint => hint.technique),
        ['region-sum', distinctTechnique, distinctTechnique, houseTechnique, houseTechnique])
      const position = variantPosition(game.variant!)
      const previousOrder = (await getVariantPlayOrder(position.puzzle)).filter(technique => technique !== houseTechnique)
      const previous = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: previousOrder })
      assert.equal(previous.steps.length, 22)
      assert.equal(previous.rating.points, 881)
      assert.equal(previous.rating.status, 'stalled')
    }
    const solution = await puzzleSolution(game)
    assert.equal(solution.rating.scoringVersion, 21)
    assert.equal(solution.rating.score.points, points)
    assert.equal(solution.rating.score.counts[distinctTechnique] ?? 0, newProofs)
    assert.equal(solution.steps.length, steps)
    assert.equal(solution.rating.score.counts[houseTechnique] ?? 0, source === coach[3] ? 2 : 0)
    assert.equal(solution.rating.status === 'stalled', !complete)
    assert.equal(solution.board === source.solution, complete)
    let play = game
    const position = variantPosition(game.variant!)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: await getVariantPlayOrder(position.puzzle) })
    for (const step of trace.steps) {
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
      const before = play
      const values = valuesOf(play)
      const masks = variantHouseMasks(position.puzzle, values, play.position.eliminations)
      if (step.technique === distinctTechnique) assertRegionSumDistinctProof(position.puzzle, values, masks, step)
      if (step.technique === houseTechnique) assertRegionSumHouseProof(position.puzzle, values, masks, step)
      play = applyDeduction(play, step.actions, masks)
      assert.deepEqual(undo(play).position, before.position)
      assert.deepEqual(redo(undo(play)).position, play.position)
    }
    assert.equal(isSolved(play), complete)
    assert.equal(valuesOf(play), solution.board)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 20_000 }), source === coach[3] ? 'search-limit' : 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.solution)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
    assert.equal((await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] })).points, 0)
  })
}

test('an imported Region Sum puzzle refreshes its saved score after the logical profile changes', async () => {
  const { game } = await prepareImportedPuzzle(mixed.code)
  assert.equal(game.variantRatingVersion, 15)
  const legacy = { ...game, difficulty: null, score: null, variantRatingVersion: 14 }
  assert.equal(needsPuzzleGrade(legacy), true)
  const updated = await prepareImportedPuzzle(mixed.code, [legacy])
  assert.equal(updated.game.score, 3830)
  assert.equal(updated.game.difficulty, 'medium')
  assert.equal(needsPuzzleGrade(updated.game), false)
})

test('distinct-digit Region Sum previews retain every selected proof in paging and Finder', async () => {
  const { game } = await prepareImportedPuzzle(mixed.code)
  assert.ok(game.variant)
  const position = variantPosition(game.variant)
  const values = valuesOf(game)
  const masks = variantHouseMasks(position.puzzle, values)
  const raw = await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: [distinctTechnique], limit: 0xffff_ffff,
  })
  for (const proof of raw) assertRegionSumDistinctProof(position.puzzle, values, masks, proof)
  const full = await puzzleHints(game, 'all', distinctTechnique)
  assert.equal(full.choices.length, 9)
  const collection = 824
  const first = await puzzleHints(game, 'all', distinctTechnique, collection)
  assert.ok(first.choices.length < first.available)
  const next = await puzzleHintPage(game.variant, collection, first.choices.length)
  assert.deepEqual([...first.choices, ...next.choices], full.choices)
  const scan = watchTechniqueScan(values, game.position.eliminations, position)
  try {
    const keys = new Set(raw.flatMap(proof => proof.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count(distinctTechnique), keys.size)
  } finally {
    scan.close()
    await runEngine({ type: 'release-hints', collection })
  }
})

test('three practice positions and a fresh drill have independently valid distinct-digit totals', async () => {
  const technique = distinctTechnique
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({
    type: 'generate-practice-example', variant: true, technique, seed: 9137, exclude: examples[0].position.puzzle.givens,
  })
  assert.ok(fresh)
  assert.notEqual(fresh.position.puzzle.givens, examples[0].position.puzzle.givens)
  for (const exercise of [...examples, fresh]) {
    const { position, candidates, deduction, suggestion } = exercise
    assertRegionSumDistinctProof(position.puzzle, position.puzzle.givens, candidates, deduction)
    assert.deepEqual(await runEngine({
      type: 'variant', operation: 'check-practice-move', position, technique, action: suggestion,
    }), deduction)
  }
})

test('shared-region proofs include the original candidates in Finder and Play', async () => {
  const { game, grade } = await prepareImportedPuzzle(coach[3].code)
  assert.ok(game.variant)
  assert.equal(grade?.difficulty, 'master')
  const position = variantPosition(game.variant)
  const values = valuesOf(game)
  const masks = variantHouseMasks(position.puzzle, values)
  const proven = await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: [houseTechnique], limit: 0xffff_ffff,
  })
  assert.equal(proven.length, 2)
  for (const proof of proven) assertRegionSumHouseProof(position.puzzle, values, masks, proof)
  const application = await puzzleHints(game, 'all', houseTechnique)
  assert.equal(application.available, proven.length)
  const scan = watchTechniqueScan(values, game.position.eliminations, position)
  try {
    const actions = new Set(proven.flatMap(proof => proof.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count(houseTechnique), actions.size)
  } finally { scan.close() }
})

test('shared-region practice retains unique grids and includes a region with unused line cells', async () => {
  const technique = houseTechnique
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({
    type: 'generate-practice-example', variant: true, technique, seed: 3299, exclude: examples[0].position.puzzle.givens,
  })
  assert.ok(fresh)
  assert.notEqual(fresh.position.puzzle.givens, examples[0].position.puzzle.givens)
  for (const [index, exercise] of [...examples, fresh].entries()) {
    const { position, candidates, deduction, suggestion } = exercise
    assertRegionSumHouseProof(position.puzzle, position.puzzle.givens, candidates, deduction)
    if (index === 2) {
      assert.equal(deduction.evidence.type, 'region-sum-house')
      assert.equal(deduction.evidence.remainder.length, 3)
      assert.ok('eliminate' in suggestion && deduction.evidence.remainder.includes(suggestion.eliminate.cell))
    }
    assert.deepEqual(await runEngine({
      type: 'variant', operation: 'check-practice-move', position, technique, action: suggestion,
    }), deduction)
    assert.equal(countLineSolutions(position.puzzle).count, 1)
  }
})

test('shared-region deductions use Jigsaw geometry and grouped visits', async () => {
  const [example] = await runEngine({ type: 'practice-examples', variant: true, technique: houseTechnique })
  const regions = Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, cell) =>
    Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(cell / 3) * 9 + cell % 3))
  // Exchange boundary cells holding the same published digit.
  regions[0][regions[0].indexOf(2)] = 21
  regions[1][regions[1].indexOf(21)] = 2
  const puzzle: VariantPuzzle = {
    ...example.position.puzzle,
    regions: { type: 'jigsaw', regions },
    rules: example.position.puzzle.rules!.map((rule, index) => rule.type === 'region-sum'
      ? { ...rule, cells: index === 0 ? [20, 30, 60, 40, 50, 70, 80] : rule.cells, groupByRegion: true } : rule),
  }
  assertVariantCompletion(puzzle, coach[3].solution)
  const position = { puzzle }
  const proofs = await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: [houseTechnique], limit: 0xffff_ffff,
  })
  assert.ok(proofs.some(proof => proof.evidence.type === 'region-sum-house' &&
    'region' in proof.evidence.house && proof.evidence.house.region === 8))
  for (const proof of proofs) assertRegionSumHouseProof(puzzle, puzzle.givens, variantHouseMasks(puzzle, puzzle.givens), proof)
})

test('grouped repeat visits retain their distinct-digit proof when interleaved', async () => {
  const [exercise] = await runEngine({ type: 'practice-examples', variant: true, technique: distinctTechnique })
  assert.ok(exercise)
  const rule = exercise.position.puzzle.rules![0]
  assert.equal(rule.type, 'region-sum')
  const [first, second, third, ...rest] = rule.cells
  const puzzle: VariantPuzzle = {
    ...exercise.position.puzzle,
    rules: [{ type: 'region-sum', cells: [first, third, second, ...rest], groupByRegion: true }],
  }
  const position = { puzzle }
  const proofs = await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: [distinctTechnique], limit: 10,
  })
  assert.equal(proofs.length, 1)
  assert.deepEqual(proofs[0].actions, exercise.deduction.actions)
  assertRegionSumDistinctProof(puzzle, puzzle.givens, exercise.candidates, proofs[0])
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position }),
    await runEngine({ type: 'variant', operation: 'solve-unique', position: exercise.position }))
})

test('all eight square transformations move every line and companion with its printed completion', async () => {
  for (const source of [published, ...coach]) {
    const original = structuredClone(source.puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry)
      const solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
      assert.deepEqual(source.puzzle, original)
    }
  }
})

test('Region Sum selection and Finder counts retain all actions before and after an entry changes', async () => {
  const { game } = await prepareImportedPuzzle(share(published.puzzle))
  for (const current of [game, enter(game, [0], 'value', Number(published.solution[0]))]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['region-sum'], limit: 0xffff_ffff })
    assert.ok(full.length)
    for (const deduction of full) for (const action of deduction.actions) {
      assert.ok('eliminate' in action)
      assert.notEqual(action.eliminate.digit, Number(published.solution[action.eliminate.cell]))
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try {
      const actions = new Set(full.flatMap(deduction => deduction.actions.map(action => JSON.stringify(action))))
      assert.equal(await scan.count('region-sum'), actions.size)
    } finally { scan.close() }
  }
})

test('closed drawing geometry survives native round trips, transforms and generation without changing the source solution', async () => {
  const loop = { type: 'region-sum' as const, cells: [34, 33, 24, 25], groupByRegion: false,
    segments: [[25, 34, 33, 24, 25]] }
  const puzzle: VariantPuzzle = { ...published.puzzle, rules: [...published.puzzle.rules, loop] }
  const original = structuredClone(puzzle)
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const changed = reflectVariant(puzzle, symmetry)
    const { game } = await prepareImportedPuzzle(share(changed))
    assert.deepEqual(game.variant!.puzzle, JSON.parse(JSON.stringify(changed)))
    assert.equal(game.variant!.solution, transformedBoard(published.solution, symmetry))
    const result = await runEngine({ type: 'variant', operation: 'rate', position: { puzzle: changed }, techniqueOrder: [] })
    assert.deepEqual(result.rules, changed.rules)
    assert.equal(result.points, 0)
  }
  const order = await getVariantPlayOrder(published.puzzle)
  const request = variantGenerationRequest('region-sum', 'medium', variantSeeds['region-sum'].medium![0], order, 1)
  const generated = await runEngine({ ...request, template: { ...request.template, rules: puzzle.rules } })
  assert.deepEqual(generated.puzzle.rules!.at(-1), loop)
  assertVariantCompletion(generated.puzzle, generated.solution)
  assert.equal(countLineSolutions(generated.puzzle).count, 1)
  assert.deepEqual(puzzle, original)
})

test('the real New Puzzle generation path offers a unique Medium puzzle that needs Region Sum Lines', async () => {
  const order = await getVariantPlayOrder(published.puzzle)
  const distinct = new Set<string>()
  for (const seed of [1, 7, 15]) {
    const generated = await generatePlayableVariant('region-sum', 'medium', seed, [])
    assert.equal(generated.rating.status === 'stalled' ? 'stalled' : generated.rating.status.solved, 'medium')
    assert.equal(generated.givens, 30)
    assert.ok(generated.rating.counts['region-sum'])
    const counted = countLineSolutions(generated.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, generated.solution)
    assert.equal(countLineSolutions({ ...generated.puzzle, rules: generated.puzzle.rules!.filter(rule => rule.type !== 'region-sum') }).count, 2)
    assertVariantCompletion(generated.puzzle, generated.solution)
    const request = variantGenerationRequest('region-sum', 'medium', variantSeeds['region-sum'].medium![0], order, seed)
    const repeat = await runEngine(request)
    assert.deepEqual(repeat.puzzle, generated.puzzle)
    distinct.add(generated.puzzle.givens)
  }
  assert.equal(distinct.size, 3)
})

test('Medium generation excludes played puzzles and their square symmetries', async () => {
  const first = await generatePlayableVariant('region-sum', 'medium', 2, [])
  const prior = { ...makeGame('played-region-sum', 'Region Sum Lines', first.puzzle.givens, 'generated'),
    variant: { id: 'region-sum' as const, puzzle: first.puzzle, solution: first.solution } }
  for (const id of ['region-sum', 'mixed'] as const) {
    const next = await generatePlayableVariant('region-sum', 'medium', 2, [{ ...prior, variant: { ...prior.variant, id } }])
    for (let symmetry = 0; symmetry < 8; symmetry++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
    assert.deepEqual(next.rating.status, { solved: 'medium' })
    const counted = countLineSolutions(next.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, next.solution)
  }
  const explicitDrawing = { ...prior, variant: { ...prior.variant, puzzle: { ...first.puzzle,
    rules: first.puzzle.rules!.map(rule => rule.type === 'region-sum' ? { ...rule, segments: [rule.cells] } : rule) } } }
  const next = await generatePlayableVariant('region-sum', 'medium', 2, [explicitDrawing])
  for (let symmetry = 0; symmetry < 8; symmetry++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
})

test('selected Region Sum proofs retain every page and release only their own collection', async () => {
  const puzzle: VariantPuzzle = { ...published.puzzle, rules: [...published.puzzle.rules] }
  for (let cell = 0; cell < 81; cell++) if (published.puzzle.givens[cell] === '0') {
    // These authored one-cell parts share a total, retaining the whole source.
    const anchor = [...published.puzzle.givens].findIndex(digit => digit !== '0' && digit === published.solution[cell])
    assert.ok(anchor >= 0)
    puzzle.rules = [...puzzle.rules!, { type: 'region-sum', cells: [anchor, cell] }]
  }
  const { game } = await prepareImportedPuzzle(share(puzzle))
  const full = await puzzleHints(game, 'all', 'region-sum')
  assert.ok(full.choices.length > 32)
  const first = await puzzleHints(game, 'all', 'region-sum', 763)
  const choices = [...first.choices]
  while (choices.length < first.available) {
    const page = await puzzleHintPage(game.variant, 763, choices.length)
    assert.equal(page.offset, choices.length)
    assert.ok(page.choices.length)
    choices.push(...page.choices)
  }
  assert.deepEqual(choices, full.choices)
  const other = await puzzleHints(game, 'all', 'region-sum', 764)
  await runEngine({ type: 'release-hints', collection: 763 })
  assert.deepEqual((await puzzleHintPage(game.variant, 764, 0)).choices, other.choices)
  await runEngine({ type: 'release-hints', collection: 764 })
  assert.deepEqual((await puzzleHints(game, 'all', 'region-sum')).choices, full.choices)
})

test('three practice positions and a fresh drill preserve the existing cost and independently unique grids', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(item => item.id === 'region-sum')!
  assert.equal(technique.cost, 48)
  assert.equal(technique.difficulty, 'medium')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'region-sum' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'region-sum', seed: 63,
    exclude: examples[0].position.puzzle.givens })
  for (const exercise of [...examples, fresh]) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'region-sum', action: exercise.suggestion }), exercise.deduction)
    const action = exercise.suggestion
    const cell = 'place' in action ? action.place.cell : action.eliminate.cell
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'region-sum', action: { eliminate: { cell, digit: Number(counted.solution![cell]) } } }), null)
  }
})

test('actual storage reload preserves mixed rules, placed digits, history and shared data', async () => {
  const { game } = await prepareImportedPuzzle(mixed.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const first = '../src/sudoku/storage.ts?region-sum-save'
    const { roomStore } = await import(first) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(mixed.solution[0])))
    const next = '../src/sudoku/storage.ts?region-sum-reload'
    const restored = (await import(next) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], mixed.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, mixed.puzzle)
  } finally {
    keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})
