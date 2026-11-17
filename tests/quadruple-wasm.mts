import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { applyDeduction, enter, isSolved, undo, redo, valuesOf } from '../src/sudoku/game.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/quadruple-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string; coach: string }
const real = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach.json', import.meta.url), 'utf8')) as { coach: string }

test('published Quadruple import supports candidates, several hints, complete Play, ratings and replay', async () => {
  const { game } = await prepareImportedPuzzle(fixture.coach)
  assert.equal(game.variant?.solution, fixture.solution)
  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1)) })
  const position = variantPosition(game.variant!)
  const techniqueOrder = await getVariantPlayOrder()
  const hints = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder, limit: 10 })
  assert.ok(hints.length > 1 && hints.length <= 10)
  assert.equal(new Set(hints.map(hint => JSON.stringify(hint.actions))).size, hints.length)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.notEqual(trace.rating.status, 'stalled')
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  assert.equal(variantSolutionPath(trace).board, fixture.solution)
  let played = game
  for (const [index, step] of trace.steps.entries()) {
    assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex: index }))?.deduction, step)
    const view = variantHintChoice(step, fixture.puzzle)
    assert.ok(view.pattern?.cells.length)
    for (const action of step.actions) {
      if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit))
      else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit))
    }
    const next = applyDeduction(played, step.actions, variantHouseMasks(fixture.puzzle, valuesOf(played)))
    assert.notEqual(next, played)
    played = next
  }
  assert.equal(isSolved(played), true)
  assert.equal(valuesOf(played), fixture.solution)
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('repeated printed digits work in practice and locked-digit evidence names its actual house and rule', async () => {
  const examples = await runEngine({ type: 'practice-examples', technique: 'quadruple', variant: true })
  assert.equal(examples.length, 3)
  const repeated = examples[2]
  assert.deepEqual(repeated.position.puzzle.rules, [{ type: 'quadruple', topLeft: 21, digits: [2, 2, 6] }])
  const view = lessonExample({ ...repeated, practice: repeated })
  assert.ok('variant' in view.deduction.evidence)
  assert.match(view.deduction.evidence.variant.description, /2, 2, 6/)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: repeated.position,
    technique: 'quadruple', action: repeated.suggestion }), repeated.deduction)
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'diagonal', diagonal: 'anti' }, { type: 'quadruple', topLeft: 2, digits: [2, 2] },
  ] }
  const proofs = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle }, techniqueOrder: ['locked-candidates'], limit: 100 })
  const lock = proofs.find(proof => proof.evidence.type === 'locked-digit' && 'row' in proof.evidence.target && proof.evidence.target.row === 0)
  assert.ok(lock && lock.evidence.type === 'locked-digit')
  assert.deepEqual(lock.evidence.clue, { rules: [1], cells: [2, 3, 11, 12] })
  assert.deepEqual(lock.actions, [0, 1, 4, 5, 6, 7, 8].map(cell => ({ eliminate: { cell, digit: 2 } })))
  const hint = variantHintChoice(lock, puzzle)
  assert.ok('variant' in hint.evidence)
  assert.match(hint.evidence.variant.description, /2, 2.*row 1/)
  assert.match(hint.evidence.variant.reason, /other cells in row 1 cannot contain 2/)
})

test('real Coach mixed export and actual imported-game save/reload retain the repeated circle', async () => {
  const { game } = await prepareImportedPuzzle(real.coach)
  assert.equal(game.variant?.id, 'mixed')
  assert.deepEqual(game.variant.puzzle.rules?.at(-1), { type: 'quadruple', topLeft: 2, digits: [3, 3] })
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?quadruple-save'
    const { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(game.variant!.solution[0])))
    const reloadModule = '../src/sudoku/storage.ts?quadruple-reload'
    const restored = (await import(reloadModule) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)
    assert.ok(restored)
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], game.variant.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
  } finally {
    keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})

test('Quadruple combines with every subset of the eight existing rendered families through Coach import', async () => {
  const combined = JSON.parse(readFileSync(new URL('./fixtures/combined-families.json', import.meta.url), 'utf8')) as {
    puzzle: VariantPuzzle; solution: string; coachData: { regions: number[]; givenConstraints: { type: string }[] }
  }
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight']
  const sourceFamily: Record<string, string> = { cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki',
    region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight' }
  const quad: VariantRule = { type: 'quadruple', topLeft: 1, digits: [1, 2] }
  const cells = [1, 2, 10, 11].map(cell => Number(combined.solution[cell]))
  assert.ok(cells.includes(1) && cells.includes(2))
  for (let mask = 0; mask < 256; mask++) {
    const enabled = new Set(families.filter((_, bit) => mask & 1 << bit))
    const data = { ...combined.coachData, ...(enabled.has('jigsaw') ? {} : { regions: undefined }), givenConstraints: [
      ...combined.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])),
      { type: 'quadruple', settings: {}, segments: [{ cells: [1], parameters: { digits: '12' } }] },
    ] }
    const { game } = await prepareImportedPuzzle(coachCode(data))
    assert.equal(game.variant?.solution, combined.solution)
    assert.deepEqual(game.variant.puzzle.rules, [...combined.puzzle.rules!.filter(rule => enabled.has(rule.type)), quad])
    const position = variantPosition(game.variant)
    const hints = await runEngine({ type: 'variant', operation: 'hints', position, limit: 10 })
    assert.ok(hints.length >= 2)
    const rated = await runEngine({ type: 'variant', operation: 'rate', position })
    assert.notEqual(rated.status, 'stalled')
    const masks = await playCandidates(game)
    for (let cell = 0; cell < 81; cell++) if (game.givens[cell] === '0') assert.ok(masks![cell] & 1 << (Number(combined.solution[cell]) - 1))
  }
})

test('exact candidate enforcement remains active when Quadruple deductions are disabled', async () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'quadruple', topLeft: 0, digits: [2, 4, 6, 8] },
  ] }
  const position = { puzzle }
  const masks = await runEngine({ type: 'variant', operation: 'candidates', position })
  const expected = [2, 4, 6, 8].reduce((mask, digit) => mask | 1 << (digit - 1), 0)
  for (const cell of [0, 1, 9, 10]) assert.equal(masks[cell], expected)
  const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
  assert.equal(disabled.rating.status, 'stalled')
  assert.equal(disabled.steps.length, 0)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle }, maxNodes: 100_000 }), 'multiple')
  const broken = { puzzle, entries: '1' + '0'.repeat(80) }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: broken }), 'conflict')
})

test('Quadruple uses the actual app hint pages, technique finder and complete solution service', async () => {
  const { game } = await prepareImportedPuzzle(fixture.coach)
  const ranked = await puzzleHints(game)
  assert.ok(ranked.choices.length > 1 && ranked.choices.length <= 10)
  const full = await puzzleHints(game, 'all')
  const first = await puzzleHints(game, 'all', undefined, 900)
  assert.equal(first.available, full.available)
  const choices = [...first.choices]
  while (choices.length < full.available) {
    const page = await puzzleHintPage(game.variant, 900, choices.length)
    assert.equal(page.offset, choices.length)
    choices.push(...page.choices)
  }
  assert.deepEqual(choices, full.choices)
  assert.deepEqual((await puzzleHintPage(game.variant, 900, 0)).choices, first.choices)
  await runEngine({ type: 'release-hints', collection: 900 })
  const selected = await puzzleHints(game, 'all', 'quadruple')
  assert.ok(selected.choices.length)
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try {
    const expected = new Set(selected.choices.flatMap(({ actions }) => actions.map(action => {
      const { cell, digit } = 'place' in action ? action.place : action.eliminate
      return `${'place' in action ? 'p' : 'e'}:${cell}:${digit}`
    }))).size
    assert.equal(await scan.count('quadruple'), expected)
  } finally { scan.close() }
  const path = await puzzleSolution(game)
  assert.notEqual(path.rating.status, 'stalled')
  assert.equal(path.board, fixture.solution)
  assert.equal(path.positions!.length, path.steps.length + 1)
})

test('batched singles and the compiled-rule cache honor each Quadruple definition', async () => {
  const givens = Array<string>(81).fill('0')
  givens[0] = '1'; givens[1] = '2'; givens[9] = '3'
  const board = givens.join('')
  assert.equal(await runEngine({ type: 'solve-singles', values: board }), board)
  for (const digit of [9, 8, 9]) {
    const puzzle: VariantPuzzle = { version: 1, givens: board, rules: [{ type: 'quadruple', topLeft: 0, digits: [digit] }] }
    const answer = [...givens]
    answer[10] = String(digit)
    assert.equal(await runEngine({ type: 'variant', operation: 'solve-singles', position: { puzzle } }), answer.join(''))
  }
})
