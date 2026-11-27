import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { readGame } from '../src/sudoku/storage.ts'
import worker from '../cloudflare/pages/_worker.js'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { needsPuzzleGrade } from '../src/sudoku/puzzle-rating.ts'
import { applyDeduction, conflictsOf, enter, isSolved, peer, undo, redo, valuesOf } from '../src/sudoku/game.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseCells, variantHouseMasks, variantRuleSections, regionMembership } from '../src/sudoku/variants.ts'
import { cellName } from '../src/sudoku/lesson-diagram.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { entropyTrialDomains } from './helpers/global-entropy-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { downloadSharedPuzzle, publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { jigsawRegionColors } from '../src/sudoku/grid.ts'
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

test('paired Quadruples lock two distinct placements into the same two houses', async () => {
  const rules: VariantRule[] = [
    { type: 'quadruple', topLeft: 0, digits: [1] },
    { type: 'quadruple', topLeft: 3, digits: [1] },
  ]
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules }
  const find = async (puzzle: VariantPuzzle) => (await runEngine({ type: 'variant', operation: 'hints',
    position: { puzzle }, techniqueOrder: ['locked-candidates'], limit: 100 }))
    .find(proof => proof.evidence.type === 'quadruple-lock')
  const proof = await find(puzzle)
  assert.ok(proof?.evidence.type === 'quadruple-lock')
  assert.deepEqual(proof.evidence.houses, [{ row: 0 }, { row: 1 }])
  assert.deepEqual(proof.evidence.sites, [[0, 1, 9, 10], [3, 4, 12, 13]])
  assert.deepEqual(proof.actions, [2, 5, 6, 7, 8, 11, 14, 15, 16, 17].map(cell => ({ eliminate: { cell, digit: 1 } })))
  const hint = variantHintChoice(proof, puzzle)
  assert.ok('variant' in hint.evidence)
  assert.match(hint.evidence.variant.description, /row 1 and row 2/)
  assert.equal(hint.pattern?.candidates.length, 8)
  assert.equal(await find({ ...puzzle, rules: [rules[0], { type: 'quadruple', topLeft: 1, digits: [1] }] }), undefined)
  assert.equal(await find({ ...puzzle, rules: [rules[0], { type: 'quadruple', topLeft: 3, digits: [2] }] }), undefined)
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


const mixedFixture = (file: string) => JSON.parse(readFileSync(new URL(`./fixtures/${file}.json`, import.meta.url), 'utf8')) as
  { url: string; coach: string; solution: string }

test('Entropy Quads 18 returns rule-based Forcing Chain hints at the actual stalled position', async () => {
  const { coach, solution } = mixedFixture('quadruple-coach-entropy-lines')
  const { game, grade } = await prepareImportedPuzzle(coach)
  assert.ok(game.variant)
  const { puzzle } = game.variant
  assert.equal(game.variant.solution, solution)
  assertVariantCompletion(puzzle, solution)
  assert.equal(puzzle.rules?.filter(rule => rule.type === 'quadruple').length, 15)
  assert.equal(puzzle.rules?.filter(rule => rule.type === 'entropic').length, 10)
  const position = variantPosition(game.variant)
  const technique = 'forcing-chain'
  const order = await getVariantPlayOrder(puzzle)
  const disabled = await runEngine({
    type: 'variant', operation: 'trace', position, techniqueOrder: order.filter(id => id !== technique),
  })
  assert.equal(disabled.rating.status, 'stalled')
  const path = await puzzleSolution(game)
  assert.equal(path.board, solution)
  assert.deepEqual(path.rating.status, { solved: 'extreme' })
  assert.equal(grade?.points, path.rating.score.points)
  assert.equal(needsPuzzleGrade({ ...game, variantRatingVersion: 12 }), true)
  assert.equal(needsPuzzleGrade(game), false)
  const { entries, eliminations } = disabled.end
  assert.equal(path.positions![disabled.steps.length].entries, entries)
  assert.deepEqual(path.positions![disabled.steps.length].eliminations, eliminations)
  const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
  const first = (await puzzleHints(checkpoint)).choices[0]
  assert.equal(first?.technique, technique)
  assert.ok('variant' in first.evidence)
  const firstProof = first.evidence.variant.source?.deduction.evidence
  assert.ok(firstProof?.type === 'rule-forcing')
  const { assumption, contradiction } = firstProof
  assert.match(first.evidence.variant.description, new RegExp(`^If ${cellName(assumption.cell)} is ${assumption.digit},`, 'i'))
  assert.deepEqual(first.actions, [{ eliminate: assumption }])
  if (contradiction.type === 'empty-cell') {
    assert.match(first.evidence.variant.reason, new RegExp(`leaves ${cellName(contradiction.cell)} without a candidate`, 'i'))
  } else {
    assert.match(first.evidence.variant.reason, new RegExp(`^${contradiction.digit} has no possible cell in`, 'i'))
  }

  const { choices } = await puzzleHints(checkpoint, 'all', technique)
  const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
  const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
  try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
  const collection = 718
  const page = await puzzleHints(checkpoint, 'all', technique, collection)
  try {
    assert.deepEqual(page.choices[0], choices[0])
    assert.deepEqual((await puzzleHintPage(game.variant, collection, 0)).choices[0], choices[0])
  } finally { await runEngine({ type: 'release-hints', collection }) }

  const board = valuesOf(checkpoint)
  let verified = 0
  for (const choice of choices) {
    if (!('variant' in choice.evidence)) continue
    const proof = choice.evidence.variant.source?.deduction.evidence
    if (proof?.type !== 'rule-forcing') continue
    const { assumption, contradiction } = proof
    assert.deepEqual(choice.actions, [{ eliminate: assumption }])
    const masks = entropyTrialDomains(puzzle, board, eliminations, assumption)
    if (contradiction.type === 'empty-cell') assert.equal(masks[contradiction.cell], 0)
    else for (const cell of variantHouseCells(contradiction.house, puzzle)) {
      assert.equal(masks[cell] & (1 << (contradiction.digit - 1)), 0)
    }
    verified++
  }
  assert.ok(verified > 1)
  const viable = { cell: 3, digit: Number(solution[3]) }
  const viableMasks = entropyTrialDomains(puzzle, board, eliminations, viable)
  for (const [cell, mask] of viableMasks.entries()) assert.ok(mask & (1 << (Number(solution[cell]) - 1)))
  for (const { actions } of path.steps) for (const action of actions) {
    if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit))
    else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
  }
})

test('Not Actually Impossible Quads verifies within the default budget and has a full logical path', async () => {
  const { coach, solution } = mixedFixture('quadruple-coach-impossible')
  const { game } = await prepareImportedPuzzle(coach)
  assert.ok(game.variant)
  assert.equal(game.variant.solution, solution)
  const { puzzle } = game.variant
  assertVariantCompletion(puzzle, solution)
  assert.equal(puzzle.givens, '0'.repeat(81))
  assert.equal(puzzle.rules?.filter(rule => rule.type === 'diagonal').length, 2)
  assert.ok(puzzle.rules?.some(rule => rule.type === 'anti-knight'))
  const position = variantPosition(game.variant)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position }), { status: 'unique', solution })
  assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), solution)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position, maxNodes: 0 }), { status: 'search-limit' })
  const candidates = await playCandidates(game)
  for (const [cell, mask] of candidates!.entries()) assert.ok(mask & (1 << (Number(solution[cell]) - 1)))
  const path = await puzzleSolution(game)
  assert.equal(path.board, solution)
  assert.notEqual(path.rating.status, 'stalled')
  for (const { actions } of path.steps) for (const action of actions) {
    if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit))
    else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
  }
})

const mixedPublications = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8')) as {
  title: string; url: string; coach: string; solution: string; hints: [Parameters<typeof puzzleHints>[2], string][]
}[]

for (const source of mixedPublications) {
  test(`published Quadruples with other rules: ${source.title}`, async () => {
    const { game } = await prepareImportedPuzzle(source.coach, [], { deferRating: true })
    assert.ok(game.variant)
    const { puzzle, solution } = game.variant
    assert.equal(solution, source.solution)
    assertVariantCompletion(puzzle, source.solution)
    assert.ok(puzzle.rules?.some(rule => rule.type === 'quadruple'))
    assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant?.puzzle, puzzle)
    assert.ok((await puzzleHints(game)).choices.length)

    const path = await puzzleSolution(game)
    assert.equal(path.board, source.solution)
    assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
    for (const step of path.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
    }
    for (const [technique, text] of source.hints) {
      assert.ok(technique)
      const explains = (hint: typeof path.steps[number]) => hint.technique === technique &&
        'variant' in hint.evidence && [hint.evidence.variant.description, hint.evidence.variant.reason].some(line => line.includes(text))
      const index = path.steps.findIndex(explains)
      assert.ok(index >= 0, `Missing ${technique} proof for ${text}`)
      const { entries, eliminations } = path.positions![index]
      const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
      const { choices } = await puzzleHints(checkpoint, 'all', technique)
      assert.ok(choices.some(explains))
      const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
      try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
    }
  })
}

test('Quad-Arrows keeps the published sum in hints, Technique Finder and the full walkthrough', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-sum.json', import.meta.url), 'utf8'))
  const publication = { sudoku_id: '7Vva', sudoku: source.coach, name: source.title,
    description: source.description, blocked: false, custom_constraints: true }
  let specificSudoku = publication
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => url === source.url
    ? new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {}))

  const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
  assert.ok(game.variant)
  const { puzzle, solution } = game.variant
  assert.equal(game.title, source.title)
  assert.equal(solution, source.solution)
  assertVariantCompletion(puzzle, source.solution)
  assert.equal(puzzle.rules?.length, 13)
  assert.ok(puzzle.rules?.every(rule => rule.type === 'quadruple-sum'))
  assert.deepEqual((await detectPuzzle(source.coach)).variant?.puzzle, puzzle)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant?.puzzle, puzzle)
  assert.match(variantRuleSections(puzzle).find(section => section.id === 'quadruple-sum')!.descriptions.join(' '),
    /largest digit.*sum of the other three/)

  const ordinary: VariantPuzzle = {
    ...puzzle,
    rules: puzzle.rules?.map(rule => rule.type === 'quadruple-sum' ? { ...rule, type: 'quadruple' } : rule),
  }
  const alternate = '637581924925743618418692537276819453359274861184365279762938145591427386843156792'
  assertVariantCompletion(ordinary, alternate)
  assert.throws(() => assertVariantCompletion(puzzle, alternate))
  const replies = await Promise.all([puzzle, ordinary].map(value => runEngine({
    type: 'variant', operation: 'hints', position: variantPosition({ ...game.variant!, puzzle: value }), technique: 'quadruple', limit: 800,
  })))
  const ordinaryActions = new Set(replies[1].flatMap(step => step.actions.map(action => JSON.stringify(action))))
  const ranked = (await puzzleHints(game)).choices
  assert.ok(ranked.some(choice => choice.technique === 'quadruple' && 'variant' in choice.evidence &&
    /largest digit equals the sum/.test(choice.evidence.variant.description) &&
    choice.actions.some(action => !ordinaryActions.has(JSON.stringify(action)))))

  const { choices } = await puzzleHints(game, 'all', 'quadruple')
  const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant))
  try { assert.equal(await scan.count('quadruple'), actions.size) } finally { scan.close() }
  assert.ok(actions.size > ordinaryActions.size)

  const path = await puzzleSolution(game)
  assert.equal(path.board, source.solution)
  assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
  for (const step of path.steps) for (const action of step.actions) {
    if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
    else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
  }
  specificSudoku = { ...publication, description: publication.description + '\nDigits in purple cells count twice.' }
  await assert.rejects(detectPuzzle(source.url), /author instructions/i)
})

test('Coach Pill Arrows and Lockout Lines work with Quadruple and Fog of War', async ({ mock }) => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/coach-pill-arrow-lockout.json', import.meta.url), 'utf8'))
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (!url.startsWith('https://sudoku.coach/en/s/')) return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {})
    const source = sources.find((source: { url: string }) => source.url === url)
    assert.ok(source)
    const specificSudoku = { sudoku_id: url.split('/').at(-1), sudoku: source.coach, name: source.title,
      description: source.description, blocked: false, custom_constraints: false }
    return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
  })
  for (const source of sources) {
    const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
    assert.ok(game.variant)
    const { puzzle, fog, solution } = game.variant
    assert.equal(solution, source.solution)
    assertVariantCompletion(puzzle, source.solution)
    const raw = (await detectPuzzle(source.coach)).variant
    assert.deepEqual(raw?.puzzle, puzzle)
    assert.deepEqual(raw?.fog, fog)
    assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant?.puzzle, puzzle)
    const path = await puzzleSolution(game)
    assert.equal(path.board, source.solution)
    assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
    for (const step of path.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
    }
    if (source.url.endsWith('/DhdV')) {
      const pill = puzzle.rules!.find(rule => rule.type === 'pill-arrow')
      assert.deepEqual(pill, { type: 'pill-arrow', pill: [77, 78], cells: [68, 59], fromTens: true })
      assert.equal(fog?.initialCells.length, 22)
      assert.ok(path.steps.some(step => step.technique === 'quadruple'))
      continue
    }
    const techniques = source.url.endsWith('/7kvK') ? ['pill-arrow', 'lockout'] as const : ['lockout'] as const
    for (const technique of techniques) {
      const index = path.steps.findIndex(step => step.technique === technique)
      assert.ok(index >= 0, `Missing ${technique} in ${source.title}`)
      const { entries, eliminations } = path.positions![index]
      const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
      const { choices } = await puzzleHints(checkpoint, 'all', technique)
      const witness = technique === 'pill-arrow' ? /tens.*ones/ : /diamonds.*at least 4/
      assert.ok(choices.some(choice => 'variant' in choice.evidence && witness.test(choice.evidence.variant.description)))
      const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      assert.ok(actions.size)
      const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
      try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
    }
  }
})

test('published Bento Quadruples solve with only the marked regions and keep matching hint counts', async ({ mock }) => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-bento.json', import.meta.url), 'utf8'))
  let changedDescription = false
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (!url.startsWith('https://sudoku.coach/en/s/')) return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {})
    const source = sources.find((source: { url: string }) => source.url === url)
    assert.ok(source)
    const specificSudoku = { sudoku_id: url.split('/').at(-1), sudoku: source.coach, name: source.title, blocked: false,
      description: changedDescription ? source.description + '\nDigits in blue cells count twice.' : source.description,
      custom_constraints: source.custom }
    return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
  })
  for (const source of sources) {
    const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
    assert.ok(game.variant)
    const { puzzle, solution } = game.variant
    assert.equal(solution, source.solution)
    assert.equal(puzzle.regions?.type, 'partial')
    assert.equal(puzzle.regions.regions.length, source.regionCount)
    assert.equal(game.authoredArtwork?.filter(mark => mark.type === 'divider').length, source.dividers)
    assertVariantCompletion(puzzle, source.solution)
    assert.ok(puzzle.rules?.some(rule => rule.type === 'quadruple'))
    const raw = await detectPuzzle(source.coach)
    assert.deepEqual(raw.variant?.puzzle, puzzle)
    assert.deepEqual(raw.authoredArtwork, game.authoredArtwork)
    assert.deepEqual(readGame(game.id, JSON.stringify(game))?.authoredArtwork, game.authoredArtwork)
    const withBoxes: VariantPuzzle = { ...puzzle, regions: { type: 'boxes' } }
    if (source.alsoFitsStandardBoxes) assertVariantCompletion(withBoxes, source.solution)
    else assert.throws(() => assertVariantCompletion(withBoxes, source.solution), /Every house needs nine distinct digits/)

    const path = await puzzleSolution(game)
    assert.equal(path.board, source.solution)
    assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
    for (const step of path.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
    }
    for (const technique of source.techniques) {
      const index = path.steps.findIndex(step => step.technique === technique)
      assert.ok(index >= 0, `Missing ${technique} in ${source.title}`)
      const { entries, eliminations } = path.positions![index]
      const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
      const { choices } = await puzzleHints(checkpoint, 'all', technique)
      assert.ok(choices.some(choice => 'variant' in choice.evidence && choice.evidence.variant.description.length))
      const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      assert.ok(actions.size)
      const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
      try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
    }
  }
  changedDescription = true
  for (const source of sources) await assert.rejects(detectPuzzle(source.url), /author instructions/i)
})

test('reviewed Quadruple publications preserve colors, author-defined regions and working hints through sharing', async ({ mock }) => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-colors.json', import.meta.url), 'utf8')) as {
    url: string; title: string; coach: string; solution: string; regionLabels: string | null
    colorCodes: string; palette: string[]; quadruples: number
  }[]
  const { sqlite, fetcher } = syncDatabase()
  let extraAuthorRule = false
  let differentCode: string | undefined
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/v1/shares')) return fetcher(url, init)
    if (!url.startsWith('https://sudoku.coach/en/s/')) return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {})
    const source = sources.find(source => source.url === url)
    assert.ok(source)
    const specificSudoku = { sudoku_id: url.split('/').at(-1), sudoku: differentCode ?? source.coach, name: source.title, blocked: false,
      description: extraAuthorRule ? 'The yellow cells must contain odd digits.' : '', custom_constraints: false }
    return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
  })
  try {
    for (const source of sources) {
      const expectedColors = Object.fromEntries(source.colorCodes.split('.').flatMap((color, cell) =>
        color ? [[cell, [source.palette[Number(color)]]]] : []))
      const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
      assert.ok(game.variant)
      const { puzzle, solution } = game.variant
      assert.equal(game.title, source.title)
      assert.equal(solution, source.solution)
      assert.equal(puzzle.rules?.filter(rule => rule.type === 'quadruple').length, source.quadruples)
      assert.deepEqual(game.givenCellColors, expectedColors)
      assertVariantCompletion(puzzle, source.solution)
      if (source.regionLabels) {
        assert.equal(puzzle.regions?.type, 'jigsaw')
        const labels = source.regionLabels
        assert.deepEqual(puzzle.regions.regions, [...new Set(labels)].map(label =>
          Array.from(labels).flatMap((marked, cell) => marked === label ? [cell] : [])))
        const membership = regionMembership(puzzle.regions.regions)
        const colors = jigsawRegionColors(membership, 9)
        assert.equal(new Set(colors).size, 9)
        assert.equal(membership[20], membership[27])
        assert.equal(colors[membership[20]], colors[membership[27]])
        assert.ok(peer(20, 27, puzzle))
        const repeated = Array.from({ length: 81 }, (_, cell) => cell === 20 || cell === 27 ? '1' : '0').join('')
        const conflicts = conflictsOf(repeated, puzzle)
        assert.ok(conflicts.has(20) && conflicts.has(27))
        assert.match(variantRuleSections(puzzle)[0].descriptions.join(' '), /same region color/)
        assert.equal(conflictsOf(repeated, { ...puzzle, regions: { type: 'boxes' } }).size, 0)
        const invalidRegions = puzzle.regions.regions.map(region => [...region])
        invalidRegions[1][0] = invalidRegions[0][0]
        const payload = puzzleDefinitionForSharing(game)
        const invalid = { ...payload, variant: { ...payload.variant, puzzle: { ...puzzle, regions: { type: 'jigsaw', regions: invalidRegions } } } }
        const rejected = await fetcher('/api/v1/shares', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalid),
        })
        assert.equal(rejected.status, 400)
      } else assert.equal(puzzle.regions, undefined)

      const pasted = await detectPuzzle(source.coach)
      assert.equal(pasted.title, source.title)
      assert.deepEqual(pasted.variant?.puzzle, puzzle)
      assert.deepEqual(pasted.givenCellColors, expectedColors)
      const firstOpen = [...game.givens].indexOf('0')
      const progressed = enter(game, [firstOpen], 'value', Number(solution[firstOpen]))
      const restored = readGame(game.id, JSON.stringify(progressed))
      assert.deepEqual(restored?.givenCellColors, expectedColors)
      assert.deepEqual(restored?.variant, game.variant)
      assert.equal(restored?.position.entries[firstOpen], solution[firstOpen])
      const shared = await downloadSharedPuzzle(await publishSharedPuzzle(progressed))
      assert.equal(shared.givens, game.givens)
      assert.deepEqual(shared.variant?.puzzle, puzzle)
      assert.deepEqual(shared.givenCellColors, expectedColors)

      const path = await puzzleSolution(game)
      assert.equal(path.board, source.solution)
      assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
      for (const step of path.steps) for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(solution[action.eliminate.cell]))
      }
      const opening = await puzzleHints(game, 'all', 'quadruple')
      assert.ok(opening.choices.length > 1)
      assert.ok(opening.choices.every(choice => 'variant' in choice.evidence && !!choice.evidence.variant.description))
      const actions = new Set(opening.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
      try { assert.equal(await scan.count('quadruple'), actions.size) } finally { scan.close() }
    }
    extraAuthorRule = true
    for (const source of sources) await assert.rejects(detectPuzzle(source.url), /author instructions/)
    extraAuthorRule = false
    differentCode = coachCode({ gridSize: 9, givenDigits: '0'.repeat(81),
      colours: ['yellow'], givenColours: ['0', ...Array(80).fill('')].join(','),
      givenConstraints: [{ type: 'quadruple', segments: [{ cells: [0], parameters: { digits: '2' } }] }] })
    await assert.rejects(detectPuzzle(sources[1].url), /unsupported authored markings/)
  } finally { sqlite.close() }
})

test('reviewed Quadruple region legends retain their title and colors with appended rules', async () => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-colors.json', import.meta.url), 'utf8')) as {
    title: string; coach: string; solution: string; regionLabels: string | null; colorCodes: string; palette: string[]
  }[]
  for (const source of sources) {
    const data = await decodeSudokuCoachPayload(source.coach)
    const digits = [...source.solution].map(Number)
    const pair = Array.from({ length: 81 }, (_, cell) => {
      const right = cell % 9 < 8 ? cell + 1 : -1
      const down = cell < 72 ? cell + 9 : -1
      return [right, down].filter(next => Math.max(digits[cell], digits[next]) === 2 * Math.min(digits[cell], digits[next]))
        .map(next => [cell, next] as [number, number])
    }).flat()[0]
    assert.ok(pair, source.title)
    const code = coachCode({ ...data, givenConstraints: [
      ...(data.givenConstraints as unknown[]),
      { type: 'ratio', segments: [{ cells: pair, parameters: {} }], settings: {} },
    ] })
    const { game } = await prepareImportedPuzzle(code, [], { deferRating: true })
    assert.ok(game.variant, source.title)
    assert.equal(game.title, source.title)
    assert.equal(game.variant.solution, source.solution)
    assert.deepEqual(game.givenCellColors, Object.fromEntries(source.colorCodes.split('.').flatMap((color, cell) =>
      color ? [[cell, [source.palette[Number(color)]]]] : [])))
    assert.equal(game.variant.puzzle.rules?.filter(rule => rule.type === 'quadruple').length,
      source.title === 'Revival' ? 16 : 20)
    assert.ok(game.variant.puzzle.rules?.some(rule => rule.type === 'kropki'))
    assertVariantCompletion(game.variant.puzzle, source.solution)
  }
})

test('Code Cracker keeps its Inside Grid, Consecutive Thermometers and Quadruple proofs', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-inside-grid.json', import.meta.url), 'utf8')) as {
    url: string; title: string; coach: string; description: string; solution: string; rows: number[][]
    thermometers: number[][]; clues: { topLeft: number; digits: number[] }[]
  }
  const { sqlite, fetcher } = syncDatabase()
  const specificSudoku = { sudoku_id: '7FCB', sudoku: source.coach, name: source.title, blocked: false,
    description: source.description, custom_constraints: true }
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === source.url) return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
    if (url.startsWith('/api/v1/shares')) return fetcher(url, init)
    return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {})
  })
  try {
    const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
    assert.ok(game.variant)
    const { puzzle, solution } = game.variant
    assert.equal(game.title, source.title)
    assert.equal(solution, source.solution)
    assertVariantCompletion(puzzle, source.solution)
    assert.deepEqual(puzzle.rules, [
      { type: 'inside-grid', rows: source.rows },
      ...source.thermometers.map(cells => ({ type: 'consecutive-run', cells, fromBulb: true, color: '#ff00ff' })),
      ...source.clues.map(clue => ({ type: 'quadruple', ...clue })),
    ])
    const pasted = await detectPuzzle(source.coach)
    assert.deepEqual(pasted.variant?.puzzle, puzzle)
    const progressed = enter(game, [4], 'value', Number(solution[4]))
    assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.variant, game.variant)
    assert.deepEqual((await downloadSharedPuzzle(await publishSharedPuzzle(progressed))).variant?.puzzle, puzzle)

    const path = await puzzleSolution(game)
    assert.equal(path.board, source.solution)
    assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
    for (const step of path.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(solution[action.eliminate.cell]))
    }

    for (const [technique, proofText] of [
      ['consecutive-run', /one at each step from the bulb/],
      ['quadruple', /circle requires/],
      ['inside-grid', /uses the same set/],
    ] as const) {
      const index = path.steps.findIndex(step => step.technique === technique)
      assert.ok(index >= 0, `Missing ${technique}`)
      const { entries, eliminations } = path.positions![index]
      const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
      const hints = await puzzleHints(checkpoint, 'all', technique)
      assert.ok(hints.choices.some(choice => 'variant' in choice.evidence && proofText.test(choice.evidence.variant.description)))
      const moves = new Set(hints.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
      try { assert.equal(await scan.count(technique), moves.size) } finally { scan.close() }
    }

    for (const step of path.steps.filter(step => step.technique === 'inside-grid')) {
      assert.ok('variant' in step.evidence)
      const proof = step.evidence.variant.source?.deduction.evidence
      assert.ok(proof?.type === 'constraint')
      const support = insideGridTruth(source.rows, proof.cells, proof.domains)
      for (const action of step.actions) {
        assert.ok('eliminate' in action)
        const { cell, digit } = action.eliminate
        assert.equal(support[cell] & 1 << (digit - 1), 0)
      }
    }
    const drills = await runEngine({ type: 'practice-examples', technique: 'inside-grid', variant: true })
    assert.equal(drills.length, 3)
    assert.ok(drills.every(drill => drill.deduction.technique === 'inside-grid'))

    specificSudoku.description += '\nAll diamond digits are odd.'
    await assert.rejects(detectPuzzle(source.url), /author instructions/)
  } finally { sqlite.close() }
})

// Enumerate complete placements by choosing the five digits and a disjoint
// layout for each. A layout visits every inside row and column and respects
// the outer Sudoku houses. This does not use the engine's matching routine.
function insideGridTruth(rows: number[][], proofCells: readonly number[], domains: readonly number[]) {
  const side = rows.length
  const cells = rows.flat()
  const domainAt = new Map(proofCells.map((cell, i) => [cell, domains[i]]))
  const support = Array<number>(81).fill(0)
  const full = (1 << cells.length) - 1
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const layouts = digits.map(digit => {
    const result: number[] = []
    function place(row: number, used: number, cols: number, outerRows: number, outerCols: number, boxes: number) {
      if (row === side) {
        result.push(used)
        return
      }
      for (const [column, cell] of rows[row].entries()) {
        const cb = 1 << column, rb = 1 << Math.floor(cell / 9), ob = 1 << (cell % 9)
        const bb = 1 << (Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3))
        if (!(cols & cb || outerRows & rb || outerCols & ob || boxes & bb) &&
          ((domainAt.get(cell) ?? 0) & (1 << (digit - 1)))) {
          place(row + 1, used | (1 << (row * side + column)), cols | cb, outerRows | rb, outerCols | ob, boxes | bb)
        }
      }
    }
    place(0, 0, 0, 0, 0, 0)
    return result
  })
  const chosen: [number, number][] = []
  function combine(first: number, used: number) {
    if (used === full) {
      for (const [digit, layout] of chosen) {
        cells.forEach((cell, i) => { if (layout & 1 << i) support[cell] |= 1 << (digit - 1) })
      }
      return
    }
    for (let i = first; i <= digits.length - (side - chosen.length); i++) {
      for (const layout of layouts[i]) if (!(used & layout)) {
        chosen.push([digits[i], layout])
        combine(i + 1, used | layout)
        chosen.pop()
      }
    }
  }
  combine(0, 0)
  assert.ok(cells.every(cell => support[cell] !== 0))
  return support
}

test('Sandwich Roll solves with an unknown key and offers focused hints for its lettered circles', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-lettered.json', import.meta.url), 'utf8')) as {
    url: string; title: string; coach: string; description: string; solution: string; keyDigits: string
    clues: { topLeft: number; letters: string }[]; symbolLayouts: string[]
  }
  const { sqlite, fetcher } = syncDatabase()
  const specificSudoku = { sudoku_id: 'ALYC', sudoku: source.coach, name: source.title, blocked: false,
    description: source.description, custom_constraints: true }
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === source.url) return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
    if (url.startsWith('/api/v1/shares')) return fetcher(url, init)
    return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), init), {}, {})
  })
  try {
    const { game } = await prepareImportedPuzzle(source.url, [], { deferRating: true })
    assert.ok(game.variant)
    const { puzzle, solution } = game.variant
    assert.equal(game.title, source.title)
    assert.equal(solution, source.solution)
    assert.equal(puzzle.givens, '0'.repeat(81))
    assert.deepEqual(puzzle.rules?.at(-1), { type: 'lettered-quadruples', clues: source.clues })
    const alphabet = [...new Set(source.clues.flatMap(clue => [...clue.letters]))].sort()
    assert.equal(source.keyDigits.length, alphabet.length)
    const covers = (values: string, at: number, expected: string) => {
      const actual = [at, at + 1, at + 9, at + 10].map(cell => values[cell])
      for (const digit of expected) {
        const index = actual.indexOf(digit)
        if (index < 0) return false
        actual.splice(index, 1)
      }
      return true
    }
    for (const { topLeft, letters } of source.clues) {
      assert.ok(covers(source.solution, topLeft, [...letters].map(letter => source.keyDigits[alphabet.indexOf(letter)]).join('')))
    }
    const symbolsOnly = { ...puzzle, rules: puzzle.rules?.flatMap((rule): VariantRule[] =>
      rule.type === 'palindrome' || rule.type === 'extra-house' ? [rule] : rule.type === 'whispers'
        ? [{ ...rule, minDifference: 1 }] : []) }
    assert.equal(new Set(source.symbolLayouts).size, 4)
    for (const layout of source.symbolLayouts) {
      assertVariantCompletion(symbolsOnly, layout)
      for (const { topLeft, letters } of source.clues) {
        assert.ok(covers(layout, topLeft, [...letters].map(letter => String(alphabet.indexOf(letter) + 1)).join('')))
      }
    }

    const pasted = await detectPuzzle(source.coach)
    assert.deepEqual(pasted.variant?.puzzle, puzzle)
    const progressed = enter(game, [72], 'value', Number(solution[72]))
    assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.variant, game.variant)
    assert.deepEqual((await downloadSharedPuzzle(await publishSharedPuzzle(progressed))).variant?.puzzle, puzzle)
    const withoutLettered = { ...puzzle, rules: puzzle.rules?.filter(rule => rule.type !== 'lettered-quadruples') }
    assertVariantCompletion(withoutLettered, source.solution)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: withoutLettered } }), 'multiple')

    const path = await puzzleSolution(game)
    assert.equal(path.board, source.solution)
    assert.ok(typeof path.rating.status === 'object' && 'solved' in path.rating.status)
    for (const step of path.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(solution[action.eliminate.cell]))
    }
    const index = path.steps.findIndex(step => step.technique === 'lettered-quadruples')
    assert.ok(index >= 0)
    const { entries, eliminations } = path.positions![index]
    const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
    const hints = await puzzleHints(checkpoint, 'all', 'lettered-quadruples')
    assert.ok(hints.choices.length > 1)
    const moves = new Set(hints.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
    const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
    try { assert.equal(await scan.count('lettered-quadruples'), moves.size) } finally { scan.close() }
    for (const choice of [...hints.choices, ...path.steps.filter(step => step.technique === 'lettered-quadruples')]) {
      assert.ok('variant' in choice.evidence)
      assert.match(choice.evidence.variant.reason, /possible keys leave/)
      const evidence = choice.evidence.variant.source?.deduction.evidence
      assert.ok(evidence?.type === 'constraint')
      const support = letterKeyTruth(source.symbolLayouts, evidence.cells, evidence.domains)
      const [target] = choice.pattern.cells
      assert.deepEqual(choice.pattern.cells, [target])
      const unsupported = evidence.domains[evidence.cells.indexOf(target)] & ~support[target]
      const expected = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => unsupported & (1 << (digit - 1)))
      assert.deepEqual(choice.actions, expected.map(digit => ({ eliminate: { cell: target, digit } })))
      assert.ok(support[target] & (1 << (Number(solution[target]) - 1)))
    }
    const drills = await runEngine({ type: 'practice-examples', technique: 'lettered-quadruples', variant: true })
    assert.equal(drills.length, 3)
    assert.ok(drills.every(drill => drill.deduction.technique === 'lettered-quadruples'))

    specificSudoku.description += '\nEach letter in a blue cell is odd.'
    await assert.rejects(detectPuzzle(source.url), /author instructions/)
  } finally { sqlite.close() }
})

// The four symbol layouts were enumerated externally from the printed circles,
// ordinary houses, marked region, Palindromes and difference-only Whispers.
// Enumerate the keys directly for each layout rather than calling the matching solver.
function letterKeyTruth(layouts: readonly string[], cells: readonly number[], domains: readonly number[]) {
  const support = Array<number>(81).fill(0)
  for (const layout of layouts) {
    const possible = Array<number>(9).fill(511)
    cells.forEach((cell, index) => { possible[Number(layout[cell]) - 1] &= domains[index] })
    const key: number[] = []
    function visit(symbol: number, used: number) {
      if (symbol === 9) {
        for (let cell = 0; cell < 81; cell++) support[cell] |= key[Number(layout[cell]) - 1]
        return
      }
      for (let bit = 1; bit <= 256; bit <<= 1) {
        if (possible[symbol] & bit && !(used & bit)) {
          key[symbol] = bit
          visit(symbol + 1, used | bit)
        }
      }
    }
    visit(0, 0)
  }
  assert.ok(support.every(Boolean))
  return support
}
