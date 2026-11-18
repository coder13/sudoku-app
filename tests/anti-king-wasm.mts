import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const fixture = JSON.parse(readFileSync(new URL('./fixtures/anti-king-newman.json', import.meta.url), 'utf8')) as {
  puzzle: VariantPuzzle; solution: string; coachConstraint: Record<string, unknown>
}
const source = coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: [fixture.coachConstraint] })

test('King of Diamonds has exact candidates, multiple hints, a reproducible rating and complete logical Play', async () => {
  const { game } = await prepareImportedPuzzle(source)
  assert.equal(game.variant?.solution, fixture.solution)
  assertVariantCompletion(fixture.puzzle, fixture.solution)
  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1)) })
  const choices = await puzzleHints(game)
  assert.ok(choices.choices.length > 1 && choices.choices.length <= 10)
  const position = variantPosition(game.variant!)
  const techniqueOrder = await getVariantPlayOrder()
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.notEqual(trace.rating.status, 'stalled')
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  let played = game
  for (const step of trace.steps) {
    for (const action of step.actions) {
      if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit))
      else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit))
    }
    played = applyDeduction(played, step.actions, variantHouseMasks(fixture.puzzle, valuesOf(played)))
  }
  assert.equal(isSolved(played), true)
  assert.equal(valuesOf(played), fixture.solution)
  assert.deepEqual(redo(undo(played)).position, played.position)
  assert.equal((await puzzleSolution(game)).board, fixture.solution)
})

test('Anti-King practice, selected proofs, paging and Finder counts explain the actual corner neighbors', async () => {
  const examples = await runEngine({ type: 'practice-examples', technique: 'anti-king', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    const view = lessonExample({ ...example, practice: example })
    assert.ok('variant' in view.deduction.evidence)
    assert.match(view.deduction.evidence.variant.description, /r[1-9]c[1-9] and r[1-9]c[1-9] touch at a corner/i)
    assert.match(view.deduction.evidence.variant.reason, /[1-9] cannot go in r[1-9]c[1-9]/i)
    const evidence = example.deduction.evidence
    assert.equal(evidence.type, 'constraint')
    assert.equal(evidence.cells.length, 2)
    for (const action of example.deduction.actions) {
      assert.ok('eliminate' in action)
      const other = evidence.cells.findIndex(cell => cell !== action.eliminate.cell)
      assert.equal(evidence.domains[other], 1 << (action.eliminate.digit - 1), 'The neighbor is restricted to the removed digit')
    }
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'anti-king', action: example.suggestion }), example.deduction)
  }
  const { game } = await prepareImportedPuzzle(source)
  const selected = await puzzleHints(game, 'all', 'anti-king')
  assert.ok(selected.choices.length)
  const first = await puzzleHints(game, 'all', 'anti-king', 943)
  const all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 943, all.length)).choices)
  assert.deepEqual(all, selected.choices)
  await runEngine({ type: 'release-hints', collection: 943 })
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try { assert.equal(await scan.count('anti-king'), new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close() }
})

test('corner restrictions survive disabled explanations and alternating compiled-rule cache entries', async () => {
  const givens = '008' + '0'.repeat(78)
  for (const rules of [[{ type: 'anti-king' }], [], [{ type: 'anti-king' }]] as VariantRule[][]) {
    const puzzle: VariantPuzzle = { version: 1, givens, rules }
    const position = { puzzle }
    const masks = await runEngine({ type: 'variant', operation: 'candidates', position })
    assert.equal(Boolean(masks[12] & 1 << 7), !rules.length)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
    assert.equal(trace.rating.status, 'stalled')
    assert.equal(trace.steps.length, 0)
    const wrong = Array<string>(81).fill('0'); wrong[12] = '8'
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries: wrong.join('') } }), rules.length ? 'conflict' : 'multiple')
  }
})

test('native Anti-King generation honors clue targets and its required-rule dependency', async () => {
  for (const seed of [1, 7, 19]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 30, maxNodes: 50_000,
      template: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'anti-king' }] }, givens: 30, requiredRule: 'anti-king' })
    assert.equal(generated.givens, 30)
    const independent = countCellRuleSolutions(generated.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, generated.solution)
    assert.equal(countCellRuleSolutions({ ...generated.puzzle, rules: [] }).count, 2)
  }
})

test('Anti-King saves and reloads its rules and player history through the real storage service', async () => {
  const { game } = await prepareImportedPuzzle(source)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const save = '../src/sudoku/storage.ts?king-save'
    const { roomStore } = await import(save) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(fixture.solution[0])))
    const reload = '../src/sudoku/storage.ts?king-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)
    assert.ok(restored)
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], fixture.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
  } finally { keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('every subset of ten rendered families preserves Anti-King and validates the selected fixed clues', async () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/anti-king-combined.json', import.meta.url), 'utf8')) as { cases: {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }[] }
  for (const sample of data.cases) assertVariantCompletion(sample.puzzle, sample.solution)
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight', 'quadruple', 'parity']
  const sourceFamily: Record<string, string> = { antiKing: 'anti-king', cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki',
    region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight', quadruple: 'quadruple', odd: 'parity', even: 'parity' }
  let valid = 0, conflicts = 0
  for (let mask = 0; mask < 1024; mask++) {
    const enabled = new Set(['anti-king', ...families.filter((_, bit) => mask & 1 << bit)])
    const both = enabled.has('diagonal') && enabled.has('anti-knight')
    const sample = data.cases[enabled.has('anti-knight') && !both ? 1 : 0]
    const puzzle: VariantPuzzle = { ...sample.puzzle,
      ...(enabled.has('jigsaw') ? {} : { regions: undefined }),
      rules: [...sample.puzzle.rules!.filter(rule => enabled.has(rule.type)), ...(both ? [{ type: 'anti-knight' as const }] : [])] }
    const input = coachCode({ ...sample.coachData, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
      ...sample.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])),
      ...(both ? [{ type: 'antiKnight', segments: [], settings: {} }] : []),
    ] })
    assert.deepEqual((await detectPuzzle(input)).variant?.puzzle, JSON.parse(JSON.stringify(puzzle)))
    if (both) {
      const values = [...puzzle.givens]
      const offendingPair = values.some((digit, a) => digit !== '0' && values.some((other, b) =>
        a !== b && digit === other && Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) * Math.abs(a % 9 - b % 9) === 2))
      assert.equal(offendingPair, true, 'These fixed clues conflict with the added knight rule')
      await assert.rejects(prepareImportedPuzzle(input), /conflicting givens or rules/)
      conflicts++
      continue
    }
    assertVariantCompletion(puzzle, sample.solution)
    const { game } = await prepareImportedPuzzle(input)
    assert.equal(game.variant?.solution, sample.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    assert.notEqual((await runEngine({ type: 'variant', operation: 'rate', position: variantPosition(game.variant!) })).status, 'stalled')
    valid++
  }
  assert.deepEqual({ valid, conflicts }, { valid: 768, conflicts: 256 })
})
