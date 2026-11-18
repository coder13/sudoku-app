import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { countWhispersSolutions } from './helpers/whispers-oracle.ts'
import { assertLineHouseProof } from './helpers/line-house-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const source = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'whispers', puzzle: fixture.puzzle }))

test('an exhausted uniqueness check preserves the exact status and rule-specific hints', async () => {
  const position = { puzzle: fixture.puzzle }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 4096 }), 'search-limit')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 100_000 }), 'unique')
  for (const technique of ['unique-rectangle-aic', 'unique-rectangle-continuous-nice-loop', 'unique-rectangle-discontinuous-nice-loop']) {
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff }), [])
  }
  const proofs = await runEngine({ type: 'variant', operation: 'hints', position,
    techniqueOrder: ['whispers-house-support'], limit: 0xffff_ffff })
  assert.ok(proofs.length > 0)
  for (const proof of proofs) assertLineHouseProof(position, proof)
})

test('Brain Zaps imports, rates, replays every deduction and reaches the published completion', async () => {
  const { game } = await prepareImportedPuzzle(source)
  assert.equal(game.variant?.solution, fixture.solution)
  const masks = await playCandidates(game); assert.ok(masks)
  masks.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1)) })
  const techniqueOrder = await getVariantPlayOrder(), position = variantPosition(game.variant!)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.notEqual(trace.rating.status, 'stalled'); assert.equal(trace.rating.scoringVersion, 8)
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  assert.ok(trace.steps.some(step => step.technique === 'whispers-house-support'))
  let played = game
  for (let index = 0; index < trace.steps.length; index++) {
    const step = trace.steps[index]
    for (const action of step.actions) assert.equal('place' in action ? fixture.solution[action.place.cell] === String(action.place.digit) : fixture.solution[action.eliminate.cell] !== String(action.eliminate.digit), true)
    if (step.evidence.type === 'line-houses') assertLineHouseProof(variantPosition(played.variant!, played.position), step)
    played = applyDeduction(played, step.actions, variantHouseMasks(fixture.puzzle, valuesOf(played)))
  }
  assert.equal(isSolved(played), true); assert.equal(valuesOf(played), fixture.solution)
  assert.deepEqual(redo(undo(played)).position, played.position)
  assert.equal((await puzzleSolution(game)).board, fixture.solution)
  const old = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: techniqueOrder.filter(id => id !== 'whispers-house-support') })
  assert.equal(old.rating.status, 'stalled'); assert.equal(old.steps.length, 4)
})

test('Whispers proofs, every page and Finder count preserve distinct actions and their house evidence', async () => {
  const { game } = await prepareImportedPuzzle(source)
  const selected = await puzzleHints(game, 'all', 'whispers-house-support')
  assert.ok(selected.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'whispers-house-support', 950)
  const all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 950, all.length)).choices)
  assert.deepEqual(all, selected.choices); await runEngine({ type: 'release-hints', collection: 950 })
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try { assert.equal(await scan.count('whispers-house-support'), new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close() }
  for (const technique of ['whispers', 'whispers-house-support']) {
    const examples = await runEngine({ type: 'practice-examples', technique, variant: true }); assert.equal(examples.length, 3)
    for (const example of examples) {
      assert.equal(countWhispersSolutions(example.position.puzzle).count, 1)
      const view = lessonExample({ ...example, practice: example }); assert.ok('variant' in view.deduction.evidence)
      assert.match(view.deduction.evidence.variant.description, /differ by at least/)
      if (technique === 'whispers-house-support') {
        assertLineHouseProof(example.position, example.deduction)
        const hint = variantHintChoice(example.deduction, example.position.puzzle)
        assert.ok('variant' in hint.evidence)
        assert.match(hint.evidence.variant.description, /share/)
      }
      assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position, technique, action: example.suggestion }), example.deduction)
    }
  }
})

test('disabled explanations never disable difference rules and compiled caches include the minimum', async () => {
  for (const gap of [5, 4, 5]) {
    const puzzle: VariantPuzzle = { version: 1, givens: '4' + '0'.repeat(80), rules: [{ type: 'whispers', cells: [0, 10], minDifference: gap }] }
    const masks = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    assert.equal(Boolean(masks[10] & 1 << 7), gap === 4)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: [] })
    assert.equal(trace.steps.length, 0); assert.equal(trace.rating.status, 'stalled')
    const entries = Array<string>(81).fill('0'); entries[10] = '8'
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries: entries.join('') } }), gap === 5 ? 'conflict' : 'multiple')
  }
})

test('Whispers rules and player history survive the real save and reload service', async () => {
  const { game } = await prepareImportedPuzzle(source), keys = ['window', 'localStorage', 'sessionStorage'] as const
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?whispers-save'; const { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); roomStore.update(game.id, saved => enter(saved, [0], 'value', 4))
    const reload = '../src/sudoku/storage.ts?whispers-reload'; const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[0], '4'); assert.equal(undo(restored).position.entries[0], '0')
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('real Coach exports retain Whispers settings while unsupported companion rules still reject', async () => {
  const examples = JSON.parse(readFileSync(new URL('./fixtures/whispers-coach.json', import.meta.url), 'utf8')).examples as { code: string; deferred: string }[]
  for (const example of examples) await assert.rejects(detectPuzzle(example.code), /unsupported|not supported/)
})

test('seeded Whispers exercises remain distinct, unique and checkable', async () => {
  for (const technique of ['whispers', 'whispers-house-support']) {
    const [fixed] = await runEngine({ type: 'practice-examples', technique, variant: true })
    const example = await runEngine({ type: 'generate-practice-example', variant: true, technique, seed: 227, exclude: fixed.position.puzzle.givens })
    assert.notEqual(example.position.puzzle.givens, fixed.position.puzzle.givens)
    const result = countWhispersSolutions(example.position.puzzle)
    assert.equal(result.count, 1); assertVariantCompletion(example.position.puzzle, result.solution!)
    if (technique === 'whispers-house-support') assertLineHouseProof(example.position, example.deduction)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position, technique, action: example.suggestion }), example.deduction)
  }
})

test('native generation matches 30 givens and independently verified dependence on Whispers', async () => {
  for (const seed of [17, 29, 43]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 30, maxNodes: 50_000,
      template: { ...fixture.puzzle, givens: '0'.repeat(81) }, givens: 30, requiredRule: 'whispers' })
    assert.equal(generated.givens, 30)
    const independent = countWhispersSolutions(generated.puzzle)
    assert.equal(independent.count, 1); assert.equal(independent.solution, generated.solution)
    assert.equal(countWhispersSolutions({ ...generated.puzzle, rules: [] }).count, 2)
  }
})

test('all 4096 family selections preserve Whispers and validate the selected fixed clues', async () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-combined.json', import.meta.url), 'utf8')) as { cases: {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }[] }
  const lines = data.cases.map(sample => {
    const neighbors = (a: number, b: number) => a !== b && Math.max(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), Math.abs(a % 9 - b % 9)) === 1
    for (let a = 0; a < 81; a++) for (let b = 0; b < 81; b++) for (let c = 0; c < 81; c++) {
      if (a !== c && neighbors(a, b) && neighbors(b, c) && Math.abs(Number(sample.solution[a]) - Number(sample.solution[b])) >= 5 && Math.abs(Number(sample.solution[b]) - Number(sample.solution[c])) >= 5) return [a, b, c]
    }
    throw new Error('No eligible Whispers path in the fixed completion')
  })
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight', 'quadruple', 'parity', 'anti-king', 'non-consecutive']
  const sourceFamily: Record<string, string> = { nonconsecutive: 'non-consecutive', antiKing: 'anti-king', cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki', region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight', quadruple: 'quadruple', odd: 'parity', even: 'parity' }
  let valid = 0, conflicting = 0
  for (let mask = 0; mask < 4096; mask++) {
    const enabled = new Set(families.filter((_, bit) => mask & 1 << bit))
    const both = enabled.has('diagonal') && enabled.has('anti-knight'), index = enabled.has('anti-knight') && !both ? 1 : 0
    const sample = data.cases[index], cells = lines[index]
    const puzzle: VariantPuzzle = { ...sample.puzzle, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), rules: [
      ...sample.puzzle.rules!.filter(rule => enabled.has(rule.type)), ...(both ? [{ type: 'anti-knight' as const }] : []), { type: 'whispers', cells, minDifference: 5 },
    ] }
    const input = coachCode({ ...sample.coachData, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
      ...sample.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])), ...(both ? [{ type: 'antiKnight', segments: [], settings: {} }] : []), { type: 'whisper', settings: {}, segments: [{ cells, parameters: {} }] },
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
  assert.deepEqual({ valid, conflicting }, { valid: 3072, conflicting: 1024 })
})

test('closed line rules survive the Wasm roundtrip and constrain the last edge', async () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'whispers', cells: [0,10,20,0], minDifference: 4 }] }
  const normalized = await runEngine({ type: 'variant', operation: 'normalize', position: { puzzle } })
  assert.deepEqual(normalized.puzzle.rules, puzzle.rules)
  const proofs = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle }, techniqueOrder: ['whispers-house-support'], limit: 100 })
  assert.equal(proofs.length, 1); assertLineHouseProof({ puzzle }, proofs[0])
  assert.equal(proofs[0].evidence.type, 'line-houses')
  assert.deepEqual(proofs[0].evidence.cells, [0,10,20]); assert.deepEqual(proofs[0].evidence.supported, [273,273,273])
  const entries = [...puzzle.givens]; entries[0] = '2'; entries[10] = '9'; entries[20] = '5'
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries: entries.join('') } }), 'conflict')
})
