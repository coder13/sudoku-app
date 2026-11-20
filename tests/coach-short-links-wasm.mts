import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { kropkiDigitExclusions } from '../src/sudoku/grid.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSharedPuzzleId, publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

useWasmWorker()

type Fixture = { url: string; code: string; title: string; puzzle: VariantPuzzle; solution: string }
const between: Fixture = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
const renban: Fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-coach.json', import.meta.url), 'utf8')).examples[0]

const entropySources: (Omit<Fixture, 'puzzle'> & { description: string })[] =
  JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8')).examples
const entropySums = entropySources.find(({ url }) => url.endsWith('HqJ9'))!
const negativeBlackDots = entropySources.find(({ url }) => url.endsWith('K95q'))!

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

test('short links reject unknown and authored rules even when the numeric grid would decode', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const sources = {
    Blank: '<script>const puzzle = "' + between.code + '"</script>',
    Wrong: coachPage('Other', between.code, 'Wrong puzzle'),
    Custom: coachPage('Custom', between.code, 'Custom rule', { custom_constraints: true }),
    Text: coachPage('Text', between.code, 'Author text', { description: 'Reverse the digits on blue cells.' }),
    Markings: coachPage('Markings', coachCode({ givenColours: [{ cells: [0] }] }), 'Colored cells'),
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
    await assert.rejects(detectPuzzle('sudoku.coach/s/Markings'), /unsupported authored markings/)
    await assert.rejects(detectPuzzle('sudoku.coach/s/Unknown'), /not supported yet.*globalModularity/)
  } finally { sqlite.close() }
})
