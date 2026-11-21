import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, completeCandidateMasks, enter, hintEliminations, redo, replaceCandidates, restartGame, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { kropkiDigitExclusions } from '../src/sudoku/grid.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportAttempt, prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSharedPuzzleId, publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { cachedTechniqueCounts, techniqueScanKey, watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

useWasmWorker()

type Fixture = { url: string; code: string; title: string; puzzle: VariantPuzzle; solution: string }
const between: Fixture = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
const renbanSources: (Fixture & { description?: string })[] =
  JSON.parse(readFileSync(new URL('./fixtures/renban-coach.json', import.meta.url), 'utf8')).examples
const [renban] = renbanSources
const whispersSources = JSON.parse(readFileSync(new URL('./fixtures/whispers-coach.json', import.meta.url), 'utf8')).examples as Omit<Fixture, 'puzzle'>[]
const mixedWhispers = whispersSources.find(source => source.url.endsWith('/Cmdt'))!
const whispersLesson = whispersSources.find(source => source.url.endsWith('/B5mt'))!
const modularSources: (Fixture & { description: string; publishedPuzzle: VariantPuzzle })[] =
  JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples
const published220V = modularSources.find(source => source.url.endsWith('/7rs9'))!

const entropicSources: (Fixture & { description?: string })[] =
  JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples
const mirroredRenban = entropicSources.find(({ url }) => url.endsWith('/Ksy3'))!

const entropySources: (Omit<Fixture, 'puzzle'> & { description: string })[] =
  JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8')).examples
const entropySums = entropySources.find(({ url }) => url.endsWith('HqJ9'))!
const negativeBlackDots = entropySources.find(({ url }) => url.endsWith('K95q'))!
const legacyEntropy = entropySources.find(({ url }) => url.endsWith('2j53'))!

const xSum = JSON.parse(readFileSync(new URL('./fixtures/x-sum-unsupported-AsnF.json', import.meta.url), 'utf8')) as {
  source: string
  metadata: { sudoku_id: string; sudoku: string; name: string; description: string; custom_constraints: boolean }
  decoded: { givenConstraints: { segments: { cells: number[][]; parameters: { text: string } }[] }[] }
}
const xSumTranscription: Pick<Fixture, 'puzzle' | 'solution'> =
  JSON.parse(readFileSync(new URL('./fixtures/x-sum-coach-transcription.json', import.meta.url), 'utf8'))
const terrain = JSON.parse(readFileSync(new URL('./fixtures/sandwich-terrain-unsupported.json', import.meta.url), 'utf8')).source

function coachPage(id: string, code: string, name: string, details: Record<string, unknown> = {}) {
  const specificSudoku = {
    sudoku_id: id, sudoku: code, name, blocked: false, custom_constraints: false, description: '', ...details,
  }
  return '<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'
}

test('a published mixed Coach short link preserves the title, all rules, help, progress and shared starting puzzle', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const browser = { window: {}, localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() }
  const originals = Object.keys(browser).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const [key, value] of Object.entries(browser)) Object.defineProperty(globalThis, key, { value, configurable: true })
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === between.url) return Promise.resolve(new Response(coachPage('9KxH', between.code, between.title)))
    return fetcher(path, init)
  })
  try {
    const { game, format } = await prepareImportedPuzzle(between.url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, between.title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, between.puzzle)
    assert.equal(game.variant.solution, between.solution)

    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1 && ranked.choices.length <= 10)
    const selected = await puzzleHints(game, 'all', 'between')
    assert.ok(selected.choices.length > 0)
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('between'), targets.size) } finally { scan.close() }

    const path = await puzzleSolution(game)
    assert.equal(path.steps.length, 62)
    assert.equal(path.rating.status, 'stalled')
    assert.notEqual(path.board, between.solution)
    const move = ranked.choices[0].actions
    const applied = applyDeduction(game, move, ranked.candidates!)
    assert.notEqual(applied, game)
    assert.deepEqual(undo(applied).position, game.position)
    assert.deepEqual(redo(undo(applied)).position, applied.position)

    const storage = '../src/sudoku/storage.ts?coach-short-links-save'
    const { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(applied)
    const reload = '../src/sudoku/storage.ts?coach-short-links-reload'
    const { games } = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot()
    const restored = games.find(saved => saved.id === applied.id)
    assert.ok(restored)
    assert.equal(restored.title, game.title)
    assert.deepEqual(restored.variant, game.variant)
    assert.deepEqual(restored.position, applied.position)
    const id = await publishSharedPuzzle(restored)
    assert.ok(isSharedPuzzleId(id))
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, game.title)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(valuesOf(shared.game), game.givens)
  } finally {
    sqlite.close()
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('a complete Renban short link and the same pasted code have the same logical solution', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === renban.url) return Promise.resolve(new Response(coachPage('Jh4o', renban.code, renban.title)))
    return fetcher(path, init)
  })
  try {
    const { game } = await prepareImportedPuzzle(renban.url)
    assert.deepEqual(game.variant?.puzzle, renban.puzzle)
    assert.equal(game.variant?.solution, renban.solution)
    const pasted = await prepareImportedPuzzle(renban.code)
    const path = await puzzleSolution(game)
    assert.deepEqual(path, await puzzleSolution(pasted.game))
    assert.equal(path.board, renban.solution)
  } finally { sqlite.close() }
})

test('published X-Sums import from the author declaration and preserve typed companion rules', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const metadata = xSum.metadata
  const mix = coachCode({ givenConstraints: [
    ...xSum.decoded.givenConstraints, { type: 'even', segments: [{ cells: [0] }] },
  ] })
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === xSum.source) return Promise.resolve(new Response(coachPage(metadata.sudoku_id, metadata.sudoku, metadata.name, metadata)))
    if (path === 'https://sudoku.coach/en/s/Mix') return Promise.resolve(new Response(coachPage('Mix', mix, 'X-Sums and Even', {
      description: metadata.description, custom_constraints: true,
    })))
    return fetcher(path, init)
  })
  try {
    const { game, format } = await prepareImportedPuzzle(xSum.source)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, metadata.name)
    assert.equal(game.variant?.id, 'x-sum')
    assert.deepEqual(game.variant.puzzle, xSumTranscription.puzzle)
    assert.equal(game.variant.solution, xSumTranscription.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)

    const selected = await puzzleHints(game, 'all', 'x-sum')
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(targets.size > 0)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('x-sum'), targets.size) } finally { scan.close() }

    const walkthrough = await puzzleSolution(game)
    assert.equal(walkthrough.board, xSumTranscription.solution)
    assert.deepEqual(walkthrough.rating.status, { solved: 'hard' })
    const share = await publishSharedPuzzle(game)
    const shared = await prepareSharedPuzzle(share, [], new AbortController().signal)
    assert.equal(shared.game.title, game.title)
    assert.deepEqual(shared.game.variant, game.variant)

    const imported = await detectPuzzle('sudoku.coach/s/Mix')
    assert.equal(imported.variant?.id, 'mixed')
    assert.deepEqual(imported.variant.puzzle.rules, [
      ...xSumTranscription.puzzle.rules!, { type: 'parity', cells: [0], parity: 'even' },
    ])
    await assert.rejects(detectPuzzle(metadata.sudoku), /unsupported settings.*cosmeticText/)
  } finally { sqlite.close() }
})

test('an X-Sums declaration rejects ambiguous totals, markings and unsupported companion rules', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { description } = xSum.metadata
  const text = (label: string, x = -0.5, y = 0.5) => ({ cells: [[x, y]], parameters: { text: label } })
  const layer = (...segments: ReturnType<typeof text>[]) => ({ type: 'cosmeticText', segments })
  const codes = {
    Extra: xSum.metadata.sudoku,
    Empty: coachCode({ givenConstraints: [layer(text(''))] }),
    Corner: coachCode({ givenConstraints: [layer(text('10', -0.5, -0.5))] }),
    Interior: coachCode({ givenConstraints: [layer(text('10', 0.5, 0.5))] }),
    Fraction: coachCode({ givenConstraints: [layer(text('10', 1.25, -0.5))] }),
    BadTotal: coachCode({ givenConstraints: [layer(text('46'))] }),
    Duplicate: coachCode({ givenConstraints: [layer(text('10')), layer(text('12'))] }),
    Graphic: coachCode({ givenConstraints: [{ ...layer(text('10')), settings: { gridSnapToEdges: true } }] }),
    Color: coachCode({ givenColours: [{ cells: [0] }], givenConstraints: [layer(text('10'))] }),
    Unknown: coachCode({ givenConstraints: [layer(text('10')), { type: 'globalModularity', segments: [] }] }),
  }
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const id = path.split('/').at(-1)!
    if (!path.startsWith('https://sudoku.coach/')) return fetcher(path, init)
    if (id === terrain.sudoku_id) return Promise.resolve(new Response(coachPage(id, terrain.sudoku, terrain.name, terrain)))
    assert.ok(Object.hasOwn(codes, id))
    const authorRules = id === 'Extra' ? description + '\nDigits on blue cells count twice.' : description
    return Promise.resolve(new Response(coachPage(id, codes[id as keyof typeof codes], 'X-Sums', {
      description: authorRules, custom_constraints: true,
    })))
  })
  try {
    for (const [id, error] of [
      ['Extra', /has author instructions/], [terrain.sudoku_id, /has author instructions/],
      ['Empty', /has no outside totals/], ['Corner', /beside a row or column/], ['Interior', /beside a row or column/],
      ['Fraction', /beside a row or column/], ['BadTotal', /1 through 45/], ['Duplicate', /multiple X-Sums/],
      ['Graphic', /layer uses unsupported settings/], ['Color', /unsupported authored markings/],
      ['Unknown', /not supported yet.*globalModularity/],
    ] as const) {
      await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), error, id)
    }
  } finally { sqlite.close() }
})

test('a Global Entropy publication whose legend matches its sum clues preserves play, hints and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title, description, solution } = entropySums
  const entropy = { type: 'globalEntropy', segments: [] }
  const sum = (total: number) => ({ type: 'twoCellSum', segments: [{ cells: [0, 1], parameters: { sum: total } }] })
  const codes = {
    HqJ9: code,
    MissingEntropy: coachCode({ givenConstraints: [sum(7), sum(13)] }),
    MissingSeven: coachCode({ givenConstraints: [entropy, sum(13)] }),
    MissingThirteen: coachCode({ givenConstraints: [entropy, sum(7)] }),
  }
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (!path.startsWith('https://sudoku.coach/')) return fetcher(path, init)
    const id = path.split('/').at(-1)!
    assert.ok(Object.hasOwn(codes, id))
    return Promise.resolve(new Response(coachPage(id, codes[id as keyof typeof codes], title, { description })))
  })
  try {
    const { game, format } = await prepareImportedPuzzle(url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, (await detectPuzzle(code)).variant?.puzzle)
    assert.equal(game.variant.solution, solution)
    assert.equal((await puzzleHints(game)).choices.length, 10)

    const selected = await puzzleHints(game, 'all', 'adjacent-total')
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.equal(selected.choices.length, 27)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('adjacent-total'), targets.size) } finally { scan.close() }

    const walkthrough = await puzzleSolution(game)
    assert.equal(walkthrough.board, solution)
    assert.deepEqual(walkthrough.rating.status, { solved: 'medium' })
    assert.ok(walkthrough.rating.score.counts['global-entropy'] > 0)
    let played = game
    for (const [index, step] of walkthrough.steps.entries()) {
      const next = applyDeduction(played, step.actions, walkthrough.positions[index].candidates)
      assert.notEqual(next, played, `step ${index} must apply`)
      played = next
    }
    assert.equal(valuesOf(played), solution)
    const id = await publishSharedPuzzle(played)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, title)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(valuesOf(shared.game), game.givens)

    for (const source of ['MissingEntropy', 'MissingSeven', 'MissingThirteen']) {
      await assert.rejects(detectPuzzle('sudoku.coach/s/' + source), /missing rules from the published description/, source)
    }
  } finally { sqlite.close() }
})

test('a written black-dot rule restores the negative constraint and keeps all printed dots and companion rules', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title, description, solution } = negativeBlackDots
  const dot = { type: 'ratio', segments: [{ cells: [0, 1], parameters: { ratio: 2 } }] }
  const white = { type: 'difference', segments: [{ cells: [9, 10], parameters: { difference: 1 } }] }
  const codes = {
    K95q: code,
    MissingLayer: coachCode({ givenConstraints: [{ type: 'globalEntropy', segments: [] }] }),
    WhiteLayer: coachCode({ givenConstraints: [dot, white] }),
    SplitBlack: coachCode({ givenConstraints: [dot, {
      ...dot, segments: [{ cells: [10, 11], parameters: { ratio: 2 } }],
    }] }),
  }
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (!path.startsWith('https://sudoku.coach/')) return fetcher(path, init)
    const id = path.split('/').at(-1)!
    assert.ok(Object.hasOwn(codes, id))
    return Promise.resolve(new Response(coachPage(id, codes[id as keyof typeof codes], title, { description })))
  })
  try {
    const { game, format, grade } = await prepareImportedPuzzle(url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, title)
    assert.equal(game.variant?.id, 'mixed')
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    const raw = (await detectPuzzle(code)).variant!.puzzle.rules!
    const rawDots = raw.find(rule => rule.type === 'kropki')!
    assert.equal(rawDots.ratioTwo?.negative, false)
    const rules = game.variant.puzzle.rules!
    assert.deepEqual(rules, raw.map(rule => rule === rawDots
      ? { ...rawDots, ratioTwo: { ...rawDots.ratioTwo, negative: true } } : rule))

    const expectedDots: string[] = []
    for (let a = 0; a < 81; a++) {
      for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
        if (b === -1) continue
        const first = Number(solution[a]), second = Number(solution[b])
        if (first === 2 * second || second === 2 * first) expectedDots.push(a + ':' + b)
      }
    }
    assert.equal(expectedDots.length, 24)
    assert.deepEqual(rawDots.ratioTwo!.pairs!.map(pair => [...pair].sort((a, b) => a - b).join(':')).sort(), expectedDots.sort())
    const descriptions = variantRuleDescriptions(game.variant.puzzle)
    assert.ok(descriptions.includes('Across a black dot, one digit is double the other.'))
    assert.ok(descriptions.includes('For cells sharing an edge without a Kropki dot, neither digit can be twice the other.'))
    assert.ok(descriptions.every(description => !description.includes('white dot')))

    assert.equal((await puzzleHints(game)).choices.length, 10)
    const selected = await puzzleHints(game, 'all', 'kropki')
    const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 10)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('kropki'), actions.size) } finally { scan.close() }

    const walkthrough = await puzzleSolution(game)
    assert.equal(grade, null)
    assert.equal(walkthrough.rating.status, 'stalled')
    assert.ok(walkthrough.steps.length > 0)
    for (const step of walkthrough.steps) for (const action of step.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
    }

    const id = await publishSharedPuzzle(game)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, title)
    assert.deepEqual(shared.game.variant, game.variant)

    const split = (await detectPuzzle('sudoku.coach/s/SplitBlack')).variant!.puzzle.rules!
    assert.deepEqual(split.filter(rule => rule.type === 'kropki').map(rule => rule.ratioTwo?.pairs), [[[0, 1]], [[10, 11]]])
    assert.equal(kropkiDigitExclusions(split, 10, 11, 2, 9) & (1 << 3), 0)
    assert.equal(kropkiDigitExclusions(split, 11, 12, 2, 9) & (1 << 3), 1 << 3)
    await assert.rejects(detectPuzzle('sudoku.coach/s/MissingLayer'), /missing the black Kropki dot layer/)
    await assert.rejects(detectPuzzle('sudoku.coach/s/WhiteLayer'), /uses white dots/)
  } finally { sqlite.close() }
})

test('a published legacy Coach code retains its Global Entropy rule through help and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, solution } = legacyEntropy
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response(coachPage('2j53', code, '')))
    : fetcher(path, init))
  try {
    const { game, format } = await prepareImportedPuzzle(url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.variant?.id, 'global-entropy')
    assert.deepEqual(game.variant.puzzle, (await detectPuzzle(code)).variant?.puzzle)
    assert.deepEqual(game.variant.puzzle.rules, [{ type: 'global-entropy' }])
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    assert.equal((await puzzleHints(game)).choices.length, 10)

    const selected = await puzzleHints(game, 'all', 'global-entropy')
    const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('global-entropy'), actions.size) } finally { scan.close() }

    const walkthrough = await puzzleSolution(game)
    assert.deepEqual(walkthrough.rating.status, { solved: 'easy' })
    assert.equal(walkthrough.board, solution)
    const id = await publishSharedPuzzle(game)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(shared.game.title, game.title)
  } finally { sqlite.close() }
})

test('220V imports its complete published rules and centered paths through the short-link resolver', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title, description, solution, publishedPuzzle } = published220V
  let sourceCode = code
  let sourceDescription = description
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response(coachPage('7rs9', sourceCode, title, { description: sourceDescription })))
    : fetcher(path, init))
  try {
    const { game, grade } = await prepareImportedPuzzle(url)
    assert.equal(game.title, title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, publishedPuzzle)
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    const counted = countLineSolutions(game.variant.puzzle)
    assert.deepEqual(counted.solutions, [solution])
    assert.equal(grade, null)

    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1)
    async function regionSumChoices(current: Game) {
      const values = valuesOf(current)
      const masks = hintEliminations(values, completeCandidateMasks(current), current.position.eliminations)
      assert.ok(current.variant)
      const position = variantPosition(current.variant, current.position)
      const key = techniqueScanKey(values, masks, position.puzzle)
      const scan = watchTechniqueScan(values, masks, position)
      try {
        const [count, selected] = await Promise.all([scan.count('region-sum'), puzzleHints(current, 'all', 'region-sum')])
        const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
        assert.equal(count, actions.size)
        assert.deepEqual(cachedTechniqueCounts(key)['region-sum'], { count })
        return { selected, actions }
      } finally { scan.close() }
    }

    const initial = await regionSumChoices(game)
    assert.equal(initial.actions.size, 30)
    const applied = initial.selected.choices[0]
    assert.ok(applied.actions.every(action => 'eliminate' in action &&
      Number(solution[action.eliminate.cell]) !== action.eliminate.digit))
    assert.ok(initial.selected.candidates)
    const progressed = applyDeduction(game, applied.actions, initial.selected.candidates)
    assert.notEqual(progressed, game)
    assert.equal(valuesOf(progressed), valuesOf(game), 'Only candidate removals should affect the next scan')
    const next = await regionSumChoices(progressed)
    assert.ok(next.actions.size > 0)
    const removed = new Set(applied.actions.map(action => JSON.stringify(action)))
    const rankedAfter = await puzzleHints(progressed)
    assert.ok(rankedAfter.choices.length > 0)
    for (const hint of rankedAfter.choices) {
      assert.ok(hint.actions.every(action => !removed.has(JSON.stringify(action))))
    }
    for (const action of removed) assert.ok(!next.actions.has(action))
    assert.deepEqual((await regionSumChoices(undo(progressed))).actions, initial.actions)
    assert.deepEqual((await regionSumChoices(redo(undo(progressed)))).actions, next.actions)

    // A complete set of candidates can change the scan even when saved hint removals and placed digits stay the same.
    const removal = next.selected.choices.flatMap(hint => hint.actions).find(action => 'eliminate' in action)
    assert.ok(removal && 'eliminate' in removal)
    assert.ok(next.selected.candidates)
    const marked = replaceCandidates(progressed, next.selected.candidates)
    const { cell, digit } = removal.eliminate
    const pencilled = enter(marked, [cell], 'corner', digit, { candidateAction: 'remove' })
    assert.ok(completeCandidateMasks(pencilled))
    assert.equal(pencilled.position.eliminations, marked.position.eliminations)
    assert.equal(valuesOf(pencilled), valuesOf(marked))
    assert.ok(!(await regionSumChoices(pencilled)).actions.has(JSON.stringify(removal)))
    assert.ok((await regionSumChoices(undo(pencilled))).actions.has(JSON.stringify(removal)))

    const path = await puzzleSolution(game)
    assert.ok('rating' in path)
    assert.equal(path.rating.status, 'stalled')
    assert.equal(path.steps.length, 32)
    assert.equal(path.rating.score.points, 1045)
    let played = game
    for (const step of path.steps) {
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(game.variant.puzzle, valuesOf(played)))
    }
    assert.equal(valuesOf(played), path.board)
    assert.notEqual(path.board, solution)
    const restored = readGame(played.id, JSON.stringify(played))
    assert.deepEqual(restored?.variant, game.variant)
    assert.deepEqual(restored?.position, played.position)
    const share = await publishSharedPuzzle(played)
    const shared = await prepareSharedPuzzle(share, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(shared.game.title, title)

    await assert.rejects(detectPuzzle(code), /unsupported settings for cosmeticLine/)
    sourceDescription += '\nOther blue cells may repeat digits.'
    await assert.rejects(detectPuzzle(url), /has author instructions/)
    sourceDescription = description
    sourceCode = coachCode({ givenConstraints: [{ type: 'nonconsecutive', segments: [] }] })
    await assert.rejects(detectPuzzle(url), /has author instructions/)
  } finally { sqlite.close() }
})

test('greetings and reviewed author notes keep all encoded rules available through the short link', async (t) => {
  const sources = [
    { source: renbanSources.find(({ url }) => url.endsWith('/KUUo'))!, complete: true },
    { source: entropicSources.find(({ url }) => url.endsWith('/EoGB'))!, complete: true },
    { source: modularSources.find(({ url }) => url.endsWith('/HCHW'))!, complete: true },
  ]
  const { sqlite, fetcher } = syncDatabase()
  t.after(() => sqlite.close())
  t.mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const source = sources.find(({ source }) => source.url === path)?.source
    if (!source) return fetcher(path, init)
    return Promise.resolve(new Response(coachPage(
      source.url.split('/').at(-1)!, source.code, source.title, { description: source.description },
    )))
  })
  for (const { source, complete } of sources) await t.test(source.title, async () => {
    assert.ok(source.description)
    const { game, format } = await prepareImportedPuzzle(source.url)
    assert.equal(format, 'Sudoku Coach')
    assert.equal(game.title, source.title)
    assert.ok(game.variant)
    assert.deepEqual(game.variant.puzzle, source.puzzle)
    assert.equal(game.variant.solution, source.solution)
    assertVariantCompletion(source.puzzle, source.solution)

    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1)
    const { technique } = ranked.choices[0]
    const selected = await puzzleHints(game, 'all', technique)
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(targets.size > 0)
    const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count(technique), targets.size) } finally { scan.close() }

    const path = await puzzleSolution(game)
    assert.ok(path.steps.length > 0)
    if (complete) assert.equal(path.board, source.solution)
    else assert.equal(path.rating.status, 'stalled')
    for (const step of path.steps) for (const action of step.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }

    assert.ok(ranked.candidates)
    const played = applyDeduction(game, ranked.choices[0].actions, ranked.candidates)
    assert.notEqual(played, game)
    const restored = readGame(played.id, JSON.stringify(played))
    assert.deepEqual(restored?.position, played.position)
    assert.deepEqual(restored?.variant, game.variant)
    const id = await publishSharedPuzzle(played)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, game.title)
    assert.deepEqual(shared.game.variant, game.variant)
  })
})

test('the published Ksy3 link imports Mirrored Renbans and every encoded companion rule', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title, description, puzzle, solution } = mirroredRenban
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response(coachPage('Ksy3', code, title, { description })))
    : fetcher(path, init))
  try {
    const { game, grade } = await prepareImportedPuzzle(url)
    assert.equal(game.title, title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, puzzle)
    assert.deepEqual(game.variant, (await prepareImportedPuzzle(code)).game.variant)
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(puzzle, solution)
    assert.deepEqual([grade?.difficulty, grade?.points], ['medium', 2730])
    assert.ok((await puzzleHints(game)).choices.length > 1)
    const selected = await puzzleHints(game, 'all', 'adjacent-total')
    const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(targets.size > 0)
    const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('adjacent-total'), targets.size) } finally { scan.close() }

    const path = await puzzleSolution(game)
    assert.equal(path.board, solution)
    let played = game
    for (const step of path.steps) {
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
    }
    assert.equal(valuesOf(played), solution)
    assert.deepEqual(readGame(played.id, JSON.stringify(played))?.variant, game.variant)
    const id = await publishSharedPuzzle(played)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, title)
    assert.deepEqual(shared.game.variant, game.variant)
  } finally { sqlite.close() }
})

test('the published Cmdt short link preserves its full mixed puzzle, hints, Finder and walkthrough', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title, solution } = mixedWhispers
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response(coachPage('Cmdt', code, title)))
    : fetcher(path, init))
  try {
    const { game, grade } = await prepareImportedPuzzle(url)
    assert.equal(game.title, title)
    assert.equal(game.variant?.id, 'mixed')
    assert.deepEqual(game.variant.puzzle, (await detectPuzzle(code)).variant?.puzzle)
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    assert.deepEqual([grade?.difficulty, grade?.points], ['medium', 3910])
    const ranked = await puzzleHints(game)
    assert.equal(ranked.choices.length, 10)
    const selected = await puzzleHints(game, 'all', 'thermometer')
    const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 10)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('thermometer'), actions.size) } finally { scan.close() }

    const path = await puzzleSolution(game)
    assert.equal(path.board, solution)
    let played = game
    for (const step of path.steps) {
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(game.variant.puzzle, valuesOf(played)))
    }
    assert.equal(valuesOf(played), solution)
    const id = await publishSharedPuzzle(played)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.title, game.title)
    assert.deepEqual(shared.game.variant, game.variant)
  } finally { sqlite.close() }
})

test('pasted and published markings require encoded regions or mirrored Renban pairs', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const house = [0, 1, 2, 9, 10, 11, 18, 19, 27]
  const marks = (cells: number[]) => Array.from({ length: 81 }, (_, cell) => cells.includes(cell) ? '0' : '').join(',')
  const region = { type: 'region', segments: [{ cells: house }] }
  const palindrome = { type: 'palindromeLine', segments: [{ cells: [0, 10, 20, 30, 40] }, { cells: [15, 25, 35] }] }
  const renban = { type: 'renban', segments: [{ cells: [40, 30, 20] }] }
  const marksWithPair = (otherCell: number) => marks(house).split(',')
    .map((shades, cell) => cell === 0 || cell === otherCell ? shades + '1' : shades).join(',')
  const solution = '534876912872195346196342587659781423428653791713924658981537264267419835345268179'
  const givenDigits = [...solution].map((digit, cell) => cell % 10 === 0 ? '0' : digit).join('')
  const mixed = { givenDigits, colours: ['blue', 'orange'], givenColours: marksWithPair(40), givenConstraints: [region, palindrome, renban] }
  const cases = {
    Mixed: mixed,
    WrongPair: { ...mixed, givenColours: marksWithPair(20) },
    Exact: { givenColours: marks(house) },
    UnusedPalette: { colours: ['blue', 'red'], givenColours: marks(house) },
    PaletteOnly: { colours: ['blue'], givenColours: marks([]) },
    Partial: { givenColours: marks(house.slice(1)) },
    Other: { givenColours: marks([...house.slice(1), 80]) },
    Unknown: { givenColours: marks(house).replace('0', '1') },
    Truncated: { givenColours: '0,0' },
    Missing: { givenColours: marks(house), givenConstraints: [] },
  } as const
  const codeFor = (id: keyof typeof cases) => coachCode({ colours: ['blue'], givenConstraints: [region], ...cases[id] })
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (!path.startsWith('https://sudoku.coach/')) return fetcher(path, init)
    const id = path.split('/').at(-1)! as keyof typeof cases
    return Promise.resolve(new Response(coachPage(id, codeFor(id), 'Colored region')))
  })
  try {
    for (const id of ['Exact', 'UnusedPalette', 'PaletteOnly', 'Mixed'] as const) {
      const code = codeFor(id)
      for (const input of [code, `https://sudoku.coach/en/play/${code}`, `https://sudoku.coach/en/s/${id}`]) {
        const imported = await detectPuzzle(input)
        assert.deepEqual(imported.variant?.puzzle.rules, id === 'Mixed' ? [
          { type: 'extra-house', cells: house },
          { type: 'palindrome', cells: [0, 10, 20, 30, 40] },
          { type: 'palindrome', cells: [15, 25, 35] },
          { type: 'renban', cells: [40, 30, 20] },
        ] : [{ type: 'extra-house', cells: house }], id)
      }
    }
    const { game } = await prepareImportedPuzzle('https://sudoku.coach/en/s/Mixed')
    const { variant } = game
    assert.equal(variant?.solution, solution)
    assertVariantCompletion(variant.puzzle, solution)
    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1)
    const technique = ranked.choices[0].technique
    const selected = await puzzleHints(game, 'all', technique)
    const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 0)
    const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(variant, game.position))
    try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
    assert.equal((await puzzleSolution(game)).board, solution)
    const played = applyDeduction(game, ranked.choices[0].actions, ranked.candidates!)
    assert.notEqual(played, game)
    assert.deepEqual(readGame(played.id, JSON.stringify(played))?.variant, variant)
    const shared = await prepareSharedPuzzle(await publishSharedPuzzle(played), [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, variant)
    assert.equal(valuesOf(shared.game), givenDigits)
    for (const id of ['Partial', 'Other', 'Unknown', 'Truncated', 'Missing', 'WrongPair'] as const) {
      const code = codeFor(id)
      for (const input of [code, `https://sudoku.coach/en/play/${code}`, `https://sudoku.coach/en/s/${id}`]) {
        await assert.rejects(detectPuzzle(input), /unsupported authored markings/, id)
      }
    }
  } finally { sqlite.close() }
})

test('the Whispers lesson verifies, rates, and keeps its guide through attempts and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { code, solution } = whispersLesson
  const title = 'Variant Lesson: German Whisper Line Basics'
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === '/api/v1/import/sudoku-coach/B5mt'
    ? Promise.resolve(Response.json({ code, coach: { title, hasAuthorInstructions: true, whispersGuide: true } }))
    : fetcher(path, init))
  try {
    const preview = await prepareImportedPuzzle(whispersLesson.url)
    const { game, grade } = preview
    assert.equal(game.title, title)
    assert.equal(game.whispersGuide, true)
    assert.equal(game.variant?.id, 'whispers')
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    assert.deepEqual([grade?.difficulty, grade?.points], ['medium', 2534])
    assert.equal(findImportAttempt([{ ...game, whispersGuide: undefined }], preview), undefined)
    const restored = readGame(game.id, JSON.stringify(game))!
    assert.equal(findImportAttempt([restored], preview), restored)
    assert.equal(restartGame(restored).whispersGuide, true)

    const hints = await puzzleHints(game)
    assert.equal(hints.choices.length, 10)
    const chosen = await puzzleHints(game, 'all', 'whispers')
    const actions = new Set(chosen.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 10)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant, game.position))
    try { assert.equal(await scan.count('whispers'), actions.size) } finally { scan.close() }
    const walkthrough = await puzzleSolution(game)
    assert.equal(walkthrough.board, solution)

    const id = await publishSharedPuzzle(restored)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.equal(shared.game.whispersGuide, true)
    assert.deepEqual(shared.game.variant, game.variant)
  } finally { sqlite.close() }
})

test('a changed author declaration blocks the matching Whispers lesson short link', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { url, code, title } = whispersLesson
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response(coachPage('B5mt', code, title, { description: 'All unmarked edges also obey Whispers.' })))
    : fetcher(path, init))
  try {
    await assert.rejects(detectPuzzle(url), /has author instructions/)
  } finally { sqlite.close() }
})

test('short links reject unknown and authored rules even when the numeric grid would decode', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const sources = {
    Blank: '<script>const puzzle = "' + between.code + '"</script>',
    Wrong: coachPage('Other', between.code, 'Wrong puzzle'),
    Custom: coachPage('Custom', between.code, 'Custom rule', { custom_constraints: true }),
    Text: coachPage('Text', between.code, 'Author text', { description: 'Reverse the digits on blue cells.' }),
    Markings: coachPage('Markings', coachCode({ givenColours: [{ cells: [0] }] }), 'Colored cells'),
    Drawing: coachPage('Drawing', coachCode({ quickDrawLineSegments: { '0/1=>1/1': { colour: 'red' } } }), 'Drawn clue'),
    Unknown: coachPage('Unknown', coachCode({ givenConstraints: [{ type: 'globalModularity', segments: [] }] }), 'Unknown rule'),
  }
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const id = path.split('/').at(-1)!
    if (path.startsWith('https://sudoku.coach/') && Object.hasOwn(sources, id)) {
      return Promise.resolve(new Response(sources[id as keyof typeof sources]))
    }
    return fetcher(path, init)
  })
  try {
    for (const id of ['Blank', 'Wrong']) await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), /use Copy → Puzzle/)
    for (const id of ['Custom', 'Text']) await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), /has author instructions/)
    for (const id of ['Markings', 'Drawing']) await assert.rejects(detectPuzzle('sudoku.coach/s/' + id), /unsupported authored markings/)
    await assert.rejects(detectPuzzle('sudoku.coach/s/Unknown'), /not supported yet.*globalModularity/)
  } finally { sqlite.close() }
})
