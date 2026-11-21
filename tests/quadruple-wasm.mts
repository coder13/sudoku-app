import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runEngine, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { readGame } from '../src/sudoku/storage.ts'
import worker from '../cloudflare/pages/_worker.js'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { needsPuzzleGrade } from '../src/sudoku/puzzle-rating.ts'
import { applyDeduction, enter, isSolved, undo, redo, valuesOf } from '../src/sudoku/game.ts'
import { variantHintChoice, variantSolutionPath } from '../src/sudoku/variant-hints.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseCells, variantHouseMasks, variantRuleSections } from '../src/sudoku/variants.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { entropyTrialDomains } from './helpers/global-entropy-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
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
  assert.match(first.evidence.variant.description, /If R1C4 is 1/i)
  assert.match(first.evidence.variant.reason, /leaves R1C1 without a candidate/i)

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
