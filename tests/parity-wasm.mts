import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { countParitySolutions } from './helpers/parity-oracle.ts'
import { assertParityProof } from './helpers/parity-proof.ts'
useWasmWorker()

const fixture = JSON.parse(readFileSync(new URL('./fixtures/parity-big-eight.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const link = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'parity', puzzle: fixture.puzzle }))

test('native generation derives both marker kinds and honors givens, clue counts and required parity', async () => {
  for (const seed of [1, 7, 19]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000,
      template: { version: 1, givens: '0'.repeat(81) }, givens: 30, variantClues: 81, requiredRule: 'parity',
      derivedClues: [{ type: 'parity', cells: Array.from({ length: 81 }, (_, cell) => cell) }] })
    assert.equal(generated.givens, 30)
    assert.equal(generated.variantClues, 81)
    assert.equal([...generated.puzzle.givens].filter(digit => digit !== '0').length, 30)
    assert.deepEqual(generated.puzzle.rules?.map(rule => rule.type === 'parity' && rule.parity).sort(), ['even', 'odd'])
    const counted = countParitySolutions(generated.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, generated.solution)
    assert.equal(countParitySolutions({ ...generated.puzzle, rules: [] }).count, 2)
  }
})

test('Big Eight supports exact candidates, multiple hints, scoring, complete logical play and undo/redo', async () => {
  const { game } = await prepareImportedPuzzle(link)
  assert.equal(game.variant?.solution, fixture.solution)
  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => {
    if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1))
  })
  for (const rule of fixture.puzzle.rules!) {
    assert.equal(rule.type, 'parity')
    for (const cell of rule.cells) assert.equal(masks[cell] & (rule.parity === 'odd' ? 0b010101010 : 0b101010101), 0)
  }
  const position = variantPosition(game.variant!)
  const techniqueOrder = await getVariantPlayOrder()
  const hints = await puzzleHints(game)
  assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.notEqual(trace.rating.status, 'stalled')
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  assert.equal(variantSolutionPath(trace).board, fixture.solution)
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

test('Odd/Even teaching, technique counts and paged proofs use the actual marker and cell', async () => {
  const examples = await runEngine({ type: 'practice-examples', technique: 'parity', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    assertParityProof(example.position.puzzle, example.deduction)
    const view = lessonExample({ ...example, practice: example })
    assert.ok('variant' in view.deduction.evidence)
    assert.match(view.deduction.evidence.variant.description, /r[1-9]c[1-9] has an (odd circle|even square)/i)
    assert.match(view.deduction.evidence.variant.reason, /Remove [1-9, ]+ from r[1-9]c[1-9]/i)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'parity', action: example.suggestion }), example.deduction)
  }
  const { game } = await prepareImportedPuzzle(link)
  const selected = await puzzleHints(game, 'all', 'parity')
  assert.ok(selected.choices.length > 1)
  const page = await puzzleHints(game, 'all', 'parity', 941)
  const choices = [...page.choices]
  while (choices.length < page.available) choices.push(...(await puzzleHintPage(game.variant, 941, choices.length)).choices)
  assert.deepEqual(choices, selected.choices)
  await runEngine({ type: 'release-hints', collection: 941 })
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try {
    assert.equal(await scan.count('parity'), new Set(selected.choices.flatMap(({ actions }) => actions.map(action =>
      JSON.stringify(action)))).size)
  } finally { scan.close() }
})

test('parity enforcement remains active with its technique disabled and rule caches remain distinct', async () => {
  for (const parity of ['odd', 'even', 'odd'] as const) {
    const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'parity', cells: [0], parity }] }
    const position = { puzzle }
    const masks = await runEngine({ type: 'variant', operation: 'candidates', position })
    assert.equal(masks[0], parity === 'odd' ? 0b101010101 : 0b010101010)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
    assert.equal(trace.rating.status, 'stalled')
    assert.equal(trace.steps.length, 0)
    const wrong = parity === 'odd' ? '2' : '1'
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries: wrong + '0'.repeat(80) } }), 'conflict')
  }
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'parity', cells: [0], parity: 'odd' }, { type: 'parity', cells: [0], parity: 'even' },
  ] }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unsolvable')
})

test('saved Odd/Even games retain markers and player history through the actual storage service', async () => {
  const { game } = await prepareImportedPuzzle(link)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const storage = '../src/sudoku/storage.ts?parity-save'
    const { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(fixture.solution[0])))
    const reload = '../src/sudoku/storage.ts?parity-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)
    assert.ok(restored)
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], fixture.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
  } finally {
    keys.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})

test('Odd/Even combines with every subset of the nine rendered families without changing their meaning', async () => {
  const combined = JSON.parse(readFileSync(new URL('./fixtures/combined-families.json', import.meta.url), 'utf8')) as {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight', 'quadruple']
  const sourceFamily: Record<string, string> = { cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki',
    region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight' }
  const parity = ['odd', 'even'].map(kind => ({ type: kind, settings: {}, segments: [...combined.solution].flatMap((digit, cell) =>
    Number(digit) % 2 === (kind === 'odd' ? 1 : 0) ? [{ cells: [cell], parameters: {} }] : []) }))
  for (let mask = 0; mask < 512; mask++) {
    const enabled = new Set(families.filter((_, bit) => mask & 1 << bit))
    const { game } = await prepareImportedPuzzle(coachCode({ ...combined.coachData,
      ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
        ...combined.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])),
        ...(enabled.has('quadruple') ? [{ type: 'quadruple', settings: {}, segments: [{ cells: [1], parameters: { digits: '12' } }] }] : []),
        ...parity,
      ] }))
    assert.equal(game.variant?.solution, combined.solution)
    const rules = game.variant!.puzzle.rules!
    assert.deepEqual(rules.slice(0, -2), [...combined.puzzle.rules!.filter(rule => enabled.has(rule.type)),
      ...(enabled.has('quadruple') ? [{ type: 'quadruple', topLeft: 1, digits: [1, 2] }] : [])])
    const position = variantPosition(game.variant!)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    assert.notEqual((await runEngine({ type: 'variant', operation: 'rate', position })).status, 'stalled')
    const masks = await playCandidates(game)
    for (let cell = 0; cell < 81; cell++) if (game.givens[cell] === '0') assert.ok(masks![cell] & 1 << (Number(combined.solution[cell]) - 1))
  }
})
