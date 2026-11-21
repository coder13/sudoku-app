import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertPalindromeProof } from './helpers/palindrome-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/palindrome-${name}.json`, import.meta.url), 'utf8'))
const clover = load('clover') as { puzzle: VariantPuzzle; solution: string }
const share = (puzzle: VariantPuzzle, id = 'palindrome') => '#variant=' + encodeURIComponent(JSON.stringify({ id, puzzle }))

test('published Palindromes import, replay complete app-order solves and reach their printed completions', async () => {
  for (const name of ['clover', 'newman']) {
    const { puzzle, solution } = load(name) as typeof clover
    const { game } = await prepareImportedPuzzle(share(puzzle, name === 'newman' ? 'mixed' : 'palindrome'))
    assert.equal(game.variant?.solution, solution)
    const masks = await playCandidates(game); assert.ok(masks)
    masks.forEach((mask, cell) => { if (puzzle.givens[cell] === '0') assert.ok(mask & (1 << (Number(solution[cell]) - 1))) })
    const techniqueOrder = await getVariantPlayOrder(), position = variantPosition(game.variant!)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
    assert.notEqual(trace.rating.status, 'stalled'); assert.equal(trace.rating.scoringVersion, 15)
    assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
    assert.ok(trace.steps.some(step => step.technique === 'palindrome'))
    let played = game
    for (const step of trace.steps) {
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      if (step.technique === 'palindrome') assertPalindromeProof(variantPosition(played.variant!, played.position), step)
      played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
    }
    assert.equal(isSolved(played), true); assert.equal(valuesOf(played), solution)
    assert.deepEqual(redo(undo(played)).position, played.position)
    assert.equal((await puzzleSolution(game)).board, solution)
    for (const stepIndex of [0, trace.steps.findIndex(step => step.technique === 'palindrome'), trace.steps.length - 1]) {
      const replay = await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex })
      assert.deepEqual(replay!.deduction, trace.steps[stepIndex])
    }
  }
})

test('multiple Palindrome hints, every page and Finder counts retain independent proofs', async () => {
  const { game } = await prepareImportedPuzzle(share(clover.puzzle))
  const selected = await puzzleHints(game, 'all', 'palindrome')
  assert.ok(selected.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'palindrome', 1949), all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 1949, all.length)).choices)
  assert.deepEqual(all, selected.choices)
  await runEngine({ type: 'release-hints', collection: 1949 })
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try { assert.equal(await scan.count('palindrome'), new Set(selected.choices.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close() }
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(technique => technique.id === 'palindrome')!
  assert.equal(technique.cost, 21); assert.equal(technique.difficulty, 'easy')
  const examples = await runEngine({ type: 'practice-examples', technique: 'palindrome', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    const counted = countLineSolutions(example.position.puzzle)
    assert.equal(counted.count, 1); assertVariantCompletion(example.position.puzzle, counted.solution!)
    assertPalindromeProof(example.position, example.deduction)
    const hint = variantHintChoice(example.deduction, example.position.puzzle)
    assert.ok('variant' in hint.evidence); assert.match(hint.evidence.variant.description, /must match/)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'palindrome', action: example.suggestion }), example.deduction)
  }
  const generated = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'palindrome', seed: 227, exclude: examples[0].position.puzzle.givens })
  assert.notEqual(generated.position.puzzle.givens, examples[0].position.puzzle.givens)
  assert.equal(countLineSolutions(generated.position.puzzle).count, 1)
  assertPalindromeProof(generated.position, generated.deduction)
})

test('disabled techniques retain equality and caches distinguish logical order from drawing geometry', async () => {
  for (const cells of [[0, 10, 40, 50], [0, 10, 50, 40], [0, 10, 40, 50]]) {
    const puzzle: VariantPuzzle = { version: 1, givens: '4' + '0'.repeat(80), rules: [
      { type: 'palindrome', cells, segments: [[0, 10, 40], [40, 50, 0]] },
    ] }
    const position = { puzzle }
    const masks = await runEngine({ type: 'variant', operation: 'candidates', position })
    assert.equal(masks[cells.at(-1)!], 1 << 3)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
    assert.equal(trace.steps.length, 0); assert.equal(trace.rating.status, 'stalled')
    assert.deepEqual(trace.start.puzzle.rules, puzzle.rules)
    const entries = Array<string>(81).fill('0'); entries[cells.at(-1)!] = '5'
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries: entries.join('') } }), 'conflict')
  }
})

test('real mixed Coach import retains its exact completion and both line families', async () => {
  const source = load('coach').examples[0]
  const { game } = await prepareImportedPuzzle(source.code)
  assert.equal(game.variant?.id, 'mixed'); assert.equal(game.variant.solution, source.solution)
  assert.equal(game.variant.puzzle.rules!.length, 8)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: variantPosition(game.variant), maxNodes: 1 }), 'search-limit')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: variantPosition(game.variant), maxNodes: 20_000 }), 'unique')
  const hints = await puzzleHints(game, 10)
  assert.ok(hints.choices.length > 1)
  for (const proof of hints.choices) for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
  }
})

test('segmented definitions and player history survive save/reload, undo and redo', async () => {
  const puzzle: VariantPuzzle = { ...clover.puzzle, rules: clover.puzzle.rules!.map((rule, i) =>
    i === 0 ? { ...rule, segments: [[0, 10, 20], [20, 30, 31, 32]] } : rule) }
  const { game } = await prepareImportedPuzzle(share(puzzle))
  const techniqueOrder = await getVariantPlayOrder()
  const [plain, drawn] = await Promise.all([clover.puzzle, puzzle].map(puzzle =>
    runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder })))
  assert.deepEqual(drawn.steps, plain.steps)
  assert.deepEqual({ ...drawn.rating, rules: plain.rating.rules }, plain.rating)
  assert.deepEqual(drawn.start.puzzle.rules, puzzle.rules)
  assert.equal((await puzzleSolution(game)).board, clover.solution)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const storage = '../src/sudoku/storage.ts?palindrome-save', { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); roomStore.update(game.id, saved => enter(saved, [0], 'value', 8))
    const reload = '../src/sudoku/storage.ts?palindrome-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[0], '8')
    assert.equal(undo(restored).position.entries[0], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('native generation retains drawing geometry, clue targets and independent Palindrome dependence', async () => {
  const template: VariantPuzzle = { ...clover.puzzle, givens: '0'.repeat(81), rules: clover.puzzle.rules!.map((rule, i) =>
    i === 0 ? { ...rule, segments: [[0, 10, 20], [20, 30, 31, 32]] } : rule) }
  for (const seed of [17, 43]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000,
      template, givens: 30, requiredRule: 'palindrome' })
    assert.equal(generated.givens, 30); assert.deepEqual(generated.puzzle.rules, template.rules)
    const counted = countLineSolutions(generated.puzzle)
    assert.equal(counted.count, 1); assert.equal(counted.solution, generated.solution)
    assert.equal(countLineSolutions({ ...generated.puzzle, rules: [] }).count, 2)
  }
})

test('all 65536 family selections preserve Palindrome and every selected fixed clue', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-combined.json', import.meta.url), 'utf8')) as { cases: {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }[] }
  const paths = fixture.cases.map(sample => {
    const neighbors = (a: number, b: number) => a !== b && Math.max(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), Math.abs(a % 9 - b % 9)) === 1
    let palindrome: number[] | undefined, whispers: number[] | undefined
    for (let a = 0; a < 81; a++) for (let b = 0; b < 81; b++) for (let c = 0; c < 81; c++) {
      if (a === c || !neighbors(a, b) || !neighbors(b, c)) continue
      if (!palindrome && sample.solution[a] === sample.solution[c]) palindrome = [a, b, c]
      if (!whispers && Math.abs(Number(sample.solution[a]) - Number(sample.solution[b])) >= 5 && Math.abs(Number(sample.solution[b]) - Number(sample.solution[c])) >= 5) whispers = [a, b, c]
      if (palindrome && whispers) return { palindrome, whispers }
    }
    throw new Error('The fixed completion needs both eligible line clues')
  })
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight', 'quadruple', 'parity', 'anti-king', 'non-consecutive', 'whispers', 'inequality', 'xv', 'adjacent-total']
  const sourceFamily: Record<string, string> = { nonconsecutive: 'non-consecutive', antiKing: 'anti-king', cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki', region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight', quadruple: 'quadruple', odd: 'parity', even: 'parity' }
  let valid = 0, conflicting = 0
  for (let mask = 0; mask < 1 << families.length; mask++) {
    const enabled = new Set(families.filter((_, bit) => mask & 1 << bit))
    const both = enabled.has('diagonal') && enabled.has('anti-knight'), index = enabled.has('anti-knight') && !both ? 1 : 0
    const sample = fixture.cases[index], line = paths[index]
    const [less, greater] = Number(sample.solution[0]) < Number(sample.solution[1]) ? [0, 1] : [1, 0]
    const edges = Array.from({ length: 81 }, (_, a) => [
      ...(a % 9 < 8 ? [[a, a + 1] as const] : []), ...(a < 72 ? [[a, a + 9] as const] : []),
    ]).flat()
    const sumPair = (sum: number) => edges.find(([a, b]) => Number(sample.solution[a]) + Number(sample.solution[b]) === sum)!
    const v = sumPair(5), x = sumPair(10), total = sumPair(15)
    const puzzle: VariantPuzzle = { ...sample.puzzle, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), rules: [
      ...sample.puzzle.rules!.filter(rule => enabled.has(rule.type)), ...(both ? [{ type: 'anti-knight' as const }] : []),
      { type: 'palindrome', cells: line.palindrome },
      ...(enabled.has('whispers') ? [{ type: 'whispers' as const, cells: line.whispers, minDifference: 5 }] : []),
      ...(enabled.has('inequality') ? [{ type: 'inequality' as const, less, greater }] : []),
      ...(enabled.has('xv') ? [{ type: 'xv' as const, five: { pairs: [v] }, ten: { pairs: [x] } }] : []),
      ...(enabled.has('adjacent-total') ? [{ type: 'adjacent-total' as const, cells: total, sum: 15 }] : []),
    ] }
    const input = coachCode({ ...sample.coachData, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
      ...sample.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])), ...(both ? [{ type: 'antiKnight', segments: [], settings: {} }] : []),
      { type: 'palindromeLine', settings: {}, segments: [{ cells: line.palindrome, parameters: {} }] },
      ...(enabled.has('whispers') ? [{ type: 'whisper', settings: {}, segments: [{ cells: line.whispers, parameters: {} }] }] : []),
      ...(enabled.has('inequality') ? [{ type: 'greaterLess', settings: {}, segments: [{ cells: [less, greater], parameters: {} }] }] : []),
      ...(enabled.has('xv') ? [{ type: 'twoCellSum', settings: {}, segments: [{ cells: v, parameters: { sum: 5 } }, { cells: x, parameters: { sum: 10 } }] }] : []),
      ...(enabled.has('adjacent-total') ? [{ type: 'twoCellSum', settings: {}, segments: [{ cells: total, parameters: { sum: 15 } }] }] : []),
    ] })
    assert.deepEqual((await detectPuzzle(input)).variant?.puzzle, JSON.parse(JSON.stringify(puzzle)))
    if (both) { await assert.rejects(prepareImportedPuzzle(input), /conflicting givens or rules/); conflicting++; continue }
    assertVariantCompletion(puzzle, sample.solution)
    const { game } = await prepareImportedPuzzle(input)
    assert.equal(game.variant?.solution, sample.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    assert.notEqual((await runEngine({ type: 'variant', operation: 'rate', position: variantPosition(game.variant!) })).status, 'stalled')
    valid++
  }
  assert.deepEqual({ valid, conflicting }, { valid: 49152, conflicting: 16384 })
})
