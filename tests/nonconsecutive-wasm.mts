import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, undo, valuesOf } from '../src/sudoku/game.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { saveDisabledHintTechniques } from '../src/sudoku/hint-preferences.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-newman.json', import.meta.url), 'utf8')) as {
  puzzle: VariantPuzzle; solution: string; coachConstraint: Record<string, unknown>
}
const coach = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-coach.json', import.meta.url), 'utf8')).examples[0] as {
  code: string; solution: string
}
const source = coachCode({ givenDigits: fixture.puzzle.givens, givenConstraints: [fixture.coachConstraint] })

test('Literally No One imports with sound candidates, multiple hints, matching rating and complete logical Play', async () => {
  const { game } = await prepareImportedPuzzle(source)
  assert.equal(game.variant?.solution, fixture.solution)
  assertVariantCompletion(fixture.puzzle, fixture.solution)
  const candidates = await playCandidates(game)
  assert.ok(candidates)
  candidates.forEach((mask, cell) => {
    if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1))
  })
  assert.ok((await puzzleHints(game)).choices.length > 1)
  const position = variantPosition(game.variant!), techniqueOrder = await getVariantPlayOrder()
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.notEqual(trace.rating.status, 'stalled')
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  let played = game
  for (const step of trace.steps) {
    for (const action of step.actions) {
      if ('place' in action) assert.equal(String(action.place.digit), fixture.solution[action.place.cell])
      else assert.notEqual(String(action.eliminate.digit), fixture.solution[action.eliminate.cell])
    }
    played = applyDeduction(played, step.actions, variantHouseMasks(fixture.puzzle, valuesOf(played)))
  }
  assert.equal(isSolved(played), true)
  assert.equal((await puzzleSolution(game)).board, fixture.solution)
})

test('the real two-given Coach export preserves 38 exceptions and separates exact completion from logical progress', async () => {
  const { game } = await prepareImportedPuzzle(coach.code)
  assert.equal(game.variant?.solution, coach.solution)
  const puzzle = game.variant!.puzzle
  assertVariantCompletion(puzzle, coach.solution)
  const rule = puzzle.rules!.find(rule => rule.type === 'non-consecutive')!
  assert.equal(rule.type, 'non-consecutive')
  assert.equal(rule.except?.length, 38)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: {
    ...puzzle, rules: puzzle.rules!.filter(rule => rule.type !== 'non-consecutive'),
  } } }), 'multiple')
  const noExceptions = { ...puzzle, rules: puzzle.rules!.map(rule => rule.type === 'non-consecutive' ? { type: 'non-consecutive' as const } : rule) }
  assert.ok(['conflict', 'unsolvable'].includes(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: noExceptions } })))
  assert.ok((await puzzleHints(game)).choices.length > 1)
  const logical = await puzzleSolution(game)
  for (const step of logical.steps) for (const action of step.actions) {
    if ('place' in action) assert.equal(String(action.place.digit), coach.solution[action.place.cell])
    else assert.notEqual(String(action.eliminate.digit), coach.solution[action.eliminate.cell])
  }
  if (logical.rating.status === 'stalled') assert.ok(logical.board.includes('0'))
  else assert.equal(logical.board, coach.solution)
})

test('Non-Consecutive practice, paging and Finder expose genuine edge restrictions with their proof domains', async () => {
  for (const example of await runEngine({ type: 'practice-examples', technique: 'non-consecutive', variant: true })) {
    const view = lessonExample({ ...example, practice: example })
    assert.ok('variant' in view.deduction.evidence)
    assert.match(view.deduction.evidence.variant.description, /r[1-9]c[1-9] and r[1-9]c[1-9] share an edge/)
    assert.match(view.deduction.evidence.variant.reason, /Every choice would differ/)
    const proof = example.deduction.evidence
    assert.equal(proof.type, 'constraint')
    for (const action of example.deduction.actions) {
      assert.ok('eliminate' in action)
      const other = proof.cells.findIndex(cell => cell !== action.eliminate.cell)
      for (let digit = 1; digit <= 9; digit++) if (proof.domains[other] & 1 << (digit - 1)) {
        assert.equal(Math.abs(digit - action.eliminate.digit), 1)
      }
    }
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move',
      position: example.position, technique: 'non-consecutive', action: example.suggestion }), example.deduction)
  }
  const { game } = await prepareImportedPuzzle(source)
  const expected = await puzzleHints(game, 'all', 'non-consecutive')
  const first = await puzzleHints(game, 'all', 'non-consecutive', 1044)
  const choices = [...first.choices]
  while (choices.length < first.available) choices.push(...(await puzzleHintPage(game.variant, 1044, choices.length)).choices)
  assert.deepEqual(choices, expected.choices)
  const finder = watchTechniqueScan(game.givens, undefined, variantPosition(game.variant!))
  try { assert.equal(await finder.count('non-consecutive'), first.available) }
  finally { finder.close(); await runEngine({ type: 'release-hints', collection: 1044 }) }
})

test('candidate caches distinguish exceptions and rule enforcement survives disabling its deduction', async () => {
  const entries = '4' + '0'.repeat(80)
  const plain: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive' }] }
  const exempt: VariantPuzzle = { ...plain, rules: [{ type: 'non-consecutive', except: [[1, 0]] }] }
  for (const puzzle of [plain, exempt, plain, exempt]) {
    const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle, entries } })
    assert.equal(Boolean(candidates[1] & 1 << 2), puzzle === exempt)
    assert.equal(Boolean(candidates[9] & 1 << 2), false)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: fixture.puzzle }, techniqueOrder: [] })
    assert.equal(trace.steps.length, 0)
    assert.equal(trace.rating.status, 'stalled')
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
  try {
    assert.equal(saveDisabledHintTechniques(['non-consecutive']), true)
    const { game } = await prepareImportedPuzzle(source)
    assert.ok((await puzzleHints(game)).choices.every(hint => hint.technique !== 'non-consecutive'))
    assert.ok((await puzzleHints(game, 'all', 'non-consecutive')).choices.length, 'An explicitly selected proof remains available')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('native generation honors givens and required-rule dependency, and retains a mixed exception template', async () => {
  for (const seed of [1, 7, 19]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 30, maxNodes: 50_000,
      template: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive' }] },
      givens: 30, requiredRule: 'non-consecutive' })
    assert.equal(generated.givens, 30)
    assert.equal(generated.puzzle.givens.replaceAll('0', '').length, 30)
    const counted = countCellRuleSolutions(generated.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, generated.solution)
    assert.equal(countCellRuleSolutions({ ...generated.puzzle, rules: [] }).count, 2)
  }
  const template = (await detectPuzzle(coach.code)).variant!.puzzle
  const generated = await runEngine({ type: 'generate-variant', seed: 1, maxAttempts: 10, maxNodes: 50_000, template, givens: 30 })
  assert.equal(generated.givens, 30)
  assert.equal(generated.puzzle.givens.replaceAll('0', '').length, 30)
  assert.deepEqual(generated.puzzle.rules, template.rules!.map(rule => rule.type === 'kropki'
    ? { ...rule, ratioTwo: { pairs: [], negative: false } } : rule))
  assertVariantCompletion(generated.puzzle, generated.solution)
})

test('actual storage retains mixed Non-Consecutive exceptions and move history', async () => {
  const { game } = await prepareImportedPuzzle(coach.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const storePath = '../src/sudoku/storage.ts?nc-save'
    const { roomStore } = await import(storePath) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [1], 'value', Number(coach.solution[1])))
    const reloadPath = '../src/sudoku/storage.ts?nc-reload'
    const restored = (await import(reloadPath) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)
    assert.ok(restored)
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[1], coach.solution[1])
    assert.equal(undo(restored).position.entries[1], '0')
  } finally { keys.forEach((key, index) => {
    if (previous[index]) Object.defineProperty(globalThis, key, previous[index]!)
    else Reflect.deleteProperty(globalThis, key)
  }) }
})

test('all 2048 selections of eleven rendered families retain Non-Consecutive and validate their fixed clues', async () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-combined.json', import.meta.url), 'utf8')) as { cases: {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }[] }
  for (const sample of data.cases) assertVariantCompletion(sample.puzzle, sample.solution)
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight', 'quadruple', 'parity', 'anti-king']
  const sourceFamily: Record<string, string> = { nonconsecutive: 'non-consecutive', antiKing: 'anti-king', cage: 'killer-cages',
    thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki', region: 'extra-house', diagonalNegative: 'diagonal',
    arrow: 'arrow', antiKnight: 'anti-knight', quadruple: 'quadruple', odd: 'parity', even: 'parity' }
  let valid = 0, conflicting = 0
  for (let mask = 0; mask < 2048; mask++) {
    const enabled = new Set(['non-consecutive', ...families.filter((_, bit) => mask & 1 << bit)])
    const both = enabled.has('diagonal') && enabled.has('anti-knight')
    const sample = data.cases[enabled.has('anti-knight') && !both ? 1 : 0]
    const puzzle: VariantPuzzle = { ...sample.puzzle, ...(enabled.has('jigsaw') ? {} : { regions: undefined }),
      rules: [...sample.puzzle.rules!.filter(rule => enabled.has(rule.type)), ...(both ? [{ type: 'anti-knight' as const }] : [])] }
    const input = coachCode({ ...sample.coachData, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
      ...sample.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])),
      ...(both ? [{ type: 'antiKnight', segments: [], settings: {} }] : []),
    ] })
    assert.deepEqual((await detectPuzzle(input)).variant?.puzzle, JSON.parse(JSON.stringify(puzzle)))
    if (both) {
      assert.ok([...puzzle.givens].some((digit, a) => digit !== '0' && [...puzzle.givens].some((other, b) =>
        a !== b && digit === other && Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) * Math.abs(a % 9 - b % 9) === 2)),
      'These fixed clues contain a knight conflict; this makes no claim about other givens')
      await assert.rejects(prepareImportedPuzzle(input), /conflicting givens or rules/)
      conflicting++
      continue
    }
    assertVariantCompletion(puzzle, sample.solution)
    const { game } = await prepareImportedPuzzle(input)
    assert.equal(game.variant?.solution, sample.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    assert.notEqual((await runEngine({ type: 'variant', operation: 'rate', position: variantPosition(game.variant!) })).status, 'stalled')
    valid++
  }
  assert.deepEqual({ valid, conflicting }, { valid: 1536, conflicting: 512 })
})
