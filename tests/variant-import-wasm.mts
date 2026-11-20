import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { applyDeduction, EMPTY, enter, isSolved, needsInitialCandidates, redo, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportAttempt, findImportedPuzzle, prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates, getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { hasMarkedPair, validVariantSave, variantHouseCells, variantHouseMasks } from '../src/sudoku/variants.ts'
import { mixedFixtures } from './helpers/mixed-fixtures.ts'
import { countMixedSolutions } from './helpers/mixed-oracle.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

useWasmWorker()

const link = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: 'mixed', puzzle }))

test('a text grid preview includes its play rating and reuses an existing displayed rating', async () => {
  const rows = ['090040000', '005700100', '603000009', '060901030', '300060400', '007400001', '000009007', '502000040', '000050200']
  const input = rows.join('\n')
  const { game } = await prepareImportedPuzzle(input)
  const { difficultyOrder } = await runEngine({ type: 'techniques' })
  const rating = await runEngine({ type: 'rate', values: rows.join(''), techniqueOrder: difficultyOrder })
  assert.ok(rating.status !== 'stalled')
  assert.equal(game.difficulty, rating.status.solved)
  assert.equal(game.score, rating.score.points)
  assert.equal(game.ratingAttempt?.grade.points, game.score)

  const previous = { ...game, difficulty: 'unfair' as const, score: 1600 }
  const cached = await prepareImportedPuzzle(input, [previous])
  assert.equal(cached.game.difficulty, previous.difficulty)
  assert.equal(cached.game.score, previous.score)
  assert.equal(cached.grade, undefined)
})

test('Coach Current State reopens a mixed-rule attempt independently of puzzle verification and rating', async () => {
  const fixture = mixedFixtures['x-killer']
  const cages = fixture.puzzle.rules?.find(rule => rule.type === 'killer-cages')
  assert.equal(cages?.type, 'killer-cages')
  const entries = '9' + EMPTY.slice(1) // The published solution has 8 here.
  const input = coachCode({
    givenDigits: fixture.puzzle.givens,
    givenConstraints: [
      { type: 'diagonalNegative', segments: [] },
      { type: 'diagonalPositive', segments: [] },
      { type: 'cage', segments: cages.cages.map(({ cells, sum }) => ({ cells, parameters: { sum } })) },
    ],
    userDigits: entries,
    userCellCandidates: ['0', '16', ...Array(79).fill('0')].join('-'),
    userBoxCandidates: ['0', '256', ...Array(79).fill('0')].join('-'),
  })
  const plain = (await prepareImportedPuzzle(fixture.coach)).game
  const preview = await prepareImportedPuzzle(`https://sudoku.coach/en/play/${input}`)
  const { game } = preview
  assert.equal(preview.hasProgress, true)
  assert.equal(game.givens, plain.givens)
  assert.deepEqual(game.variant, plain.variant)
  assert.equal(game.variant?.solution, fixture.solution)
  assert.deepEqual([game.difficulty, game.score], [plain.difficulty, plain.score])
  assert.equal(valuesOf(game)[0], '9')
  assert.equal(game.position.entries, entries)
  assert.equal(game.position.center[1], 8)
  assert.equal(game.position.corner[1], 128)
  assert.equal(game.started, true)
  assert.equal(game.timeUntracked, true)
  assert.equal(needsInitialCandidates(game), false)
  assert.equal(findImportAttempt([plain], preview), undefined)
  const restored = readGame(game.id, JSON.stringify(game))
  assert.ok(restored)
  assert.deepEqual(restored.position, game.position)
  assert.equal(findImportAttempt([plain, restored], preview), restored)
  assert.equal(findImportAttempt([enter(restored, [2], 'value', 3)], preview), undefined)
  const restarted = restartGame(restored)
  assert.equal(restarted.position.entries, EMPTY)
  assert.equal(restarted.givens, fixture.puzzle.givens)
  assert.equal(needsInitialCandidates(restarted), true)
  const cached = await prepareImportedPuzzle(input, [plain])
  assert.deepEqual(cached.game.position, game.position)
  assert.deepEqual(cached.game.variant, game.variant)
  assert.equal(cached.game.score, plain.score)
})

for (const [name, fixture] of Object.entries(mixedFixtures)) test(`${name} imports, plays, rates, and replays with every rule intact`, async () => {
  const { game } = await prepareImportedPuzzle(fixture.coach)
  assert.equal(game.variant?.id, 'mixed')
  assert.deepEqual(game.variant.puzzle, fixture.puzzle)
  assert.equal(game.variant.solution, fixture.solution)
  assert.ok(validVariantSave(game.variant, game.givens))
  const imported = await detectPuzzle(link(game.variant.puzzle))
  assert.deepEqual(imported.variant?.puzzle, fixture.puzzle)
  assert.equal(findImportedPuzzle([game], imported)?.id, game.id)

  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => {
    if (game.givens[cell] !== '0') assert.equal(mask, 0)
    else assert.ok(mask & 1 << (Number(fixture.solution[cell]) - 1), `solution digit at ${cell}`)
  })
  const techniqueOrder = await getVariantPlayOrder()
  const position = variantPosition(game.variant, game.position)
  const hints = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder, limit: 10 })
  assert.ok(hints.length >= 2 && hints.length <= 10)
  assert.equal(new Set(hints.map(hint => JSON.stringify(hint.actions))).size, hints.length)
  for (const hint of hints) {
    const view = variantHintChoice(hint, game.variant.puzzle)
    assert.deepEqual(view.actions, hint.actions)
    assert.ok(view.pattern?.cells.length)
    for (const action of hint.actions) {
      if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit))
      else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit))
    }
  }
  const changed = applyDeduction(game, hints[0].actions, variantHouseMasks(game.variant.puzzle, valuesOf(game)))
  assert.notEqual(changed, game)
  assert.deepEqual(undo(changed).position, game.position)
  assert.deepEqual(redo(undo(changed)).position, changed.position)
  assert.deepEqual(changed.variant, game.variant)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.ok(trace.rating.status !== 'stalled')
  assert.equal(game.difficulty, trace.rating.status.solved)
  assert.equal(game.score, trace.rating.points)
  const path = variantSolutionPath(trace)
  assert.equal(path.board, fixture.solution)
  assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
  let played = game
  for (const [index, step] of trace.steps.entries()) {
    for (const action of step.actions) {
      if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit))
      else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit))
    }
    const next = applyDeduction(played, step.actions, path.positions![index].candidates!)
    assert.notEqual(next, played, `step ${index} must apply`)
    played = next
  }
  assert.equal(valuesOf(played), fixture.solution)
  assert.equal(isSolved(played), true)
  assert.deepEqual(trace.end.puzzle.rules, trace.start.puzzle.rules)
  for (const stepIndex of [0, trace.steps.findIndex(step => step.evidence.type === 'single'), trace.steps.length - 1]) {
    assert.ok(stepIndex >= 0)
    const replay = await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex })
    assert.ok(replay)
    assert.deepEqual(replay.deduction, trace.steps[stepIndex])
    assert.deepEqual(replay.before.puzzle.rules, trace.start.puzzle.rules)
    assert.equal(replay.before.puzzle.rules?.length, fixture.puzzle.rules?.length)
  }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: {
    ...fixture.puzzle, rules: fixture.puzzle.rules?.filter(rule => rule.type !== 'killer-cages'),
  } } }), 'multiple')
})

test('extra-region proofs and cage proofs retain their indices in an interleaved rule list', async () => {
  const fixture = mixedFixtures['x-killer']
  const cage = fixture.puzzle.rules!.find(rule => rule.type === 'killer-cages')!
  const cells = Array.from({ length: 9 }, (_, row) => row * 8 + 8)
  const puzzle: VariantPuzzle = { ...fixture.puzzle, rules: [
    cage, { type: 'extra-house', cells }, { type: 'diagonal', diagonal: 'main' },
  ] }
  assert.equal(countMixedSolutions(puzzle).solution, fixture.solution)
  const { game } = await prepareImportedPuzzle(link(puzzle))
  assert.equal(game.variant?.solution, fixture.solution)
  assert.deepEqual(variantHouseCells({ extra: 1 }, puzzle), cells)
  assert.deepEqual(variantHouseCells({ extra: 0 }, puzzle), [])
  const position = { puzzle }
  const trace = await runEngine({ type: 'variant', operation: 'trace', position })
  const extraStep = trace.steps.findIndex(step => step.evidence.type === 'single' && step.evidence.house && 'extra' in step.evidence.house)
  assert.ok(extraStep >= 0)
  const step = trace.steps[extraStep]
  assert.ok(step.evidence.type === 'single' && step.evidence.house && 'extra' in step.evidence.house)
  assert.equal(step.evidence.house.extra, 1)
  assert.deepEqual(variantHintChoice(step, puzzle).pattern?.cells, cells)
  for (const deduction of trace.steps) {
    if (deduction.evidence.type === 'cage-sum') assert.ok(deduction.evidence.cages.every(([rule]) => rule === 0))
  }
  assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, stepIndex: extraStep }))?.deduction, step)
})

test('a conflicting added rule rejects the full import and leaves subsequent requests usable', async () => {
  const fixture = mixedFixtures['jigsaw-killer']
  const puzzle: VariantPuzzle = { ...fixture.puzzle, givens: fixture.solution, rules: [
    ...fixture.puzzle.rules!, { type: 'extra-house', cells: [0, 1, 2, 3, 4, 5, 6, 7, 9] },
  ] }
  await assert.rejects(prepareImportedPuzzle(link(puzzle)), /conflicting givens or rules/)
  const { game } = await prepareImportedPuzzle(fixture.coach)
  assert.equal(game.variant?.solution, fixture.solution)
  assert.deepEqual(game.variant?.puzzle.regions, fixture.puzzle.regions)
})

function markedPairs(solution: string, relation: (a: number, b: number) => boolean): [number, number][] {
  return Array.from({ length: 81 }, (_, a) => [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]
    .filter(b => b !== -1 && relation(Number(solution[a]), Number(solution[b]))).map(b => [a, b] as [number, number])).flat()
}

test('mixed Kropki layers enforce each negative family and explain missing dots honestly', async () => {
  const fixture = mixedFixtures['x-killer']
  const white = markedPairs(fixture.solution, (a, b) => Math.abs(a - b) === 1)
  const black = markedPairs(fixture.solution, (a, b) => a === b * 2 || b === a * 2)
  const puzzle: VariantPuzzle = { ...fixture.puzzle, rules: [...fixture.puzzle.rules!,
    { type: 'kropki', consecutive: { pairs: white, negative: true } },
    { type: 'kropki', ratioTwo: { pairs: black, negative: true } },
  ] }
  const { game } = await prepareImportedPuzzle(link(puzzle))
  assert.equal(game.variant?.solution, fixture.solution)
  const hints = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle }, techniqueOrder: ['kropki'], limit: 200 })
  for (const [pairs, phrase] of [[white, 'There is no white dot'], [black, 'There is no black dot']] as const) {
    const hint = hints.find(hint => hint.evidence.type === 'constraint' &&
      !hasMarkedPair(pairs, hint.evidence.cells[0], hint.evidence.cells[1]) &&
      JSON.stringify(variantHintChoice(hint, puzzle).evidence).includes(phrase))
    assert.ok(hint, phrase)
  }
  const filled = { ...puzzle, givens: fixture.solution }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: filled } }), 'unique')
  for (const family of ['consecutive', 'ratioTwo'] as const) {
    const broken = structuredClone(filled)
    const rule = broken.rules!.find(rule => rule.type === 'kropki' && rule[family])!
    assert.ok(rule.type === 'kropki' && rule[family])
    rule[family].pairs = rule[family].pairs!.slice(1)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: broken } }), 'conflict')
    rule[family].negative = false
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: broken } }), 'unique')
  }
})

test('every subset of the eight rendered rule families survives import, exact validation, candidates, hints, and rating', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/combined-families.json', import.meta.url), 'utf8')) as {
    puzzle: VariantPuzzle; solution: string;
    coachData: { gridSize: number; givenDigits: string; regions: number[]; givenConstraints: { type: string }[] }
  }
  const families = ['jigsaw', 'killer-cages', 'thermometer', 'kropki', 'extra-house', 'diagonal', 'arrow', 'anti-knight']
  const sourceFamily: Record<string, string> = {
    cage: 'killer-cages', thermometer: 'thermometer', difference: 'kropki', ratio: 'kropki',
    region: 'extra-house', diagonalNegative: 'diagonal', arrow: 'arrow', antiKnight: 'anti-knight',
  }
  // Both region layouts contain 1–9 in this completion. Each row has at most one
  // blank, so the row rules alone prove uniqueness for every subset.
  const unique = (cells: readonly number[]) => assert.equal(new Set(cells.map(cell => fixture.solution[cell])).size, 9)
  for (let row = 0; row < 9; row++) {
    const cells = Array.from({ length: 9 }, (_, col) => row * 9 + col)
    unique(cells)
    assert.ok(cells.filter(cell => fixture.puzzle.givens[cell] === '0').length <= 1)
    unique(Array.from({ length: 9 }, (_, col) => col * 9 + row))
    unique(Array.from({ length: 9 }, (_, i) => Math.floor(row / 3) * 27 + row % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
  }
  assert.equal(fixture.puzzle.regions?.type, 'jigsaw')
  fixture.puzzle.regions.regions.forEach(unique)
  for (const rule of fixture.puzzle.rules!) {
    const value = (cell: number) => Number(fixture.solution[cell])
    if (rule.type === 'killer-cages') for (const cage of rule.cages) {
      assert.equal(cage.cells.reduce((sum, cell) => sum + value(cell), 0), cage.sum)
      assert.equal(new Set(cage.cells.map(value)).size, cage.cells.length)
    } else if (rule.type === 'extra-house') unique(rule.cells)
    else if (rule.type === 'diagonal') unique(Array.from({ length: 9 }, (_, row) => row * 10))
    else if (rule.type === 'thermometer') assert.ok(rule.cells.every((cell, i) => !i || value(cell) > value(rule.cells[i - 1])))
    else if (rule.type === 'arrow') assert.equal(rule.cells.reduce((sum, cell) => sum + value(cell), 0), value(rule.circle))
    else if (rule.type === 'kropki') {
      rule.consecutive?.pairs?.forEach(([a, b]) => assert.equal(Math.abs(value(a) - value(b)), 1))
      rule.ratioTwo?.pairs?.forEach(([a, b]) => assert.ok(value(a) === value(b) * 2 || value(b) === value(a) * 2))
    } else if (rule.type === 'anti-knight') {
      for (let a = 0; a < 81; a++) for (let b = a + 1; b < 81; b++) {
        if (Math.abs(a % 9 - b % 9) * Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) === 2) assert.notEqual(value(a), value(b))
      }
    } else assert.fail(`Missing independent fixture check for ${rule.type}`)
  }
  for (let mask = 0; mask < 1 << families.length; mask++) {
    const enabled = new Set(families.filter((_, bit) => mask & 1 << bit))
    const data = {
      ...fixture.coachData,
      ...(enabled.has('jigsaw') ? {} : { regions: undefined }),
      givenConstraints: fixture.coachData.givenConstraints.filter(rule => enabled.has(sourceFamily[rule.type])),
    }
    const rules = fixture.puzzle.rules!.filter(rule => enabled.has(rule.type))
    const expected: VariantPuzzle = { version: 1, givens: fixture.puzzle.givens,
      ...(enabled.has('jigsaw') && { regions: fixture.puzzle.regions }), ...(rules.length && { rules }) }
    const { game } = await prepareImportedPuzzle(coachCode(data))
    const context = `families: ${[...enabled].join(', ') || 'Classic'}`
    if (enabled.size) {
      assert.deepEqual(game.variant?.puzzle, expected, context)
      assert.equal(game.variant.solution, fixture.solution, context)
      const position = variantPosition(game.variant)
      const rating = await runEngine({ type: 'variant', operation: 'rate', position })
      assert.notEqual(rating.status, 'stalled', context)
      assert.equal(rating.counts['full-house'], 5, context)
      const hints = await runEngine({ type: 'variant', operation: 'hints', position, limit: 10 })
      assert.ok(hints.length >= 2, context)
      for (const hint of hints) for (const action of hint.actions) {
        if ('place' in action) assert.equal(fixture.solution[action.place.cell], String(action.place.digit), context)
        else assert.notEqual(fixture.solution[action.eliminate.cell], String(action.eliminate.digit), context)
      }
    } else {
      assert.equal(game.variant, undefined)
      assert.equal(await runEngine({ type: 'solve', values: game.givens }), fixture.solution)
    }
    const candidates = await playCandidates(game)
    assert.ok(candidates, context)
    for (let cell = 0; cell < 81; cell++) if (game.givens[cell] === '0') {
      assert.ok(candidates[cell] & 1 << (Number(fixture.solution[cell]) - 1), `${context}; cell ${cell}`)
    }
  }
})

test('an actual all-family import survives library reload with its moves and rules', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/combined-families.json', import.meta.url), 'utf8')) as {
    puzzle: VariantPuzzle; solution: string; coachData: Record<string, unknown>
  }
  const { game } = await prepareImportedPuzzle(coachCode(fixture.coachData))
  assert.equal(game.variant?.id, 'mixed')
  assert.ok(game.title.length <= 72, 'the imported title must fit the saved-game contract')
  const local = new MemoryStorage()
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const saveModule = '../src/sudoku/storage.ts?all-family-save'
    const { roomStore } = await import(saveModule) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(fixture.solution[0])))
    const before = roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    const reloadModule = '../src/sudoku/storage.ts?all-family-reload'
    const reloaded = (await import(reloadModule) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot()
    assert.equal(reloaded.active, game.id)
    const restored = reloaded.games.find(saved => saved.id === game.id)!
    assert.ok(restored, 'an imported puzzle must remain available after reload')
    assert.deepEqual(restored, JSON.parse(JSON.stringify(before)))
    assert.deepEqual(restored.variant?.puzzle, fixture.puzzle)
    assert.equal(restored.position.entries[0], fixture.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
  } finally {
    keys.forEach((key, index) => {
      const descriptor = originals[index]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})
