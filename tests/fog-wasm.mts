import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { runEngine, type VariantRule, type VariantVisibility } from '../src/sudoku/engine.ts'
import { fogView, projectFogPuzzle, revealedFogCells } from '../src/sudoku/fog.ts'
import { EMPTY, completeCandidateMasks, enter, makeGame, puzzleIdentity, redo, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')) as {
  examples: { url: string; code: string; solution: string }[]
}
const source = examples.find(example => example.url.endsWith('/Fnxt'))!

test('the published Fog source verifies exactly and visible markers never expose their hidden layer companions', async () => {
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  const bits = [...source.code.slice('SCv7_32_'.length)].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const json = inflateSync(Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))).toString('utf8')
  const { givenConstraints, ...fields } = JSON.parse(json) as {
    givenConstraints: { type: string; segments: { cells: number[]; parameters: object }[]; settings: object }[]
  }
  const fog = givenConstraints.filter(layer => layer.type === 'fog')
  assert.equal(fog.length, 1)
  assert.deepEqual(fog[0].segments, [{ cells: [63], parameters: {} }])
  assert.deepEqual(fog[0].settings, {})
  const imported = await detectPuzzle(source.code)
  const drawingRemoved = await detectPuzzle(coachCode({ ...fields, givenConstraints: givenConstraints.filter(layer => layer.type !== 'fog') }))
  const { variant } = imported
  assert.deepEqual(imported.variant?.fog, { initialCells: [63] })
  assert.deepEqual(variant?.puzzle, drawingRemoved.variant?.puzzle)
  assert.ok(variant)
  assert.equal(variant.puzzle.rules?.length, 17)
  assertVariantCompletion(variant.puzzle, source.solution)
  const independent = countLineSolutions(variant.puzzle)
  assert.equal(independent.count, 1)
  assert.equal(independent.solution, source.solution)

  // Split marker layers into individually visible facts. The remaining engine rules
  // keep their original definitions and can still participate in the exact solve.
  const rules = variant.puzzle.rules!.flatMap((rule): VariantRule[] => {
    if (rule.type === 'kropki' && rule.ratioTwo?.pairs) {
      return rule.ratioTwo.pairs.map(pair => ({ type: 'kropki', ratioTwo: { pairs: [pair] } }))
    }
    if (rule.type === 'xv') {
      return [
        ...(rule.five?.pairs ?? []).map(pair => ({ type: 'xv' as const, five: { pairs: [pair] } })),
        ...(rule.ten?.pairs ?? []).map(pair => ({ type: 'xv' as const, ten: { pairs: [pair] } })),
      ]
    }
    return [rule]
  })
  const puzzle = { ...variant.puzzle, rules }
  const exact = await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } })
  assert.deepEqual(exact, { status: 'unique', solution: source.solution })

  const initial: VariantVisibility = { cells: [63], rules: [0] }
  const opening = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle }, visibility: initial })
  assert.equal(opening[63], 0x155)
  assert.equal(opening[72], 0x1ff)
  const entries = '0'.repeat(63) + source.solution[63] + '0'.repeat(17)
  const position = { puzzle, entries }
  const black = rules.findIndex(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs?.[0].includes(63))
  const ten = rules.findIndex(rule => rule.type === 'xv' && rule.ten?.pairs?.[0].includes(63))
  assert.ok(black > 0 && ten > 0)
  const revealed: VariantVisibility = { cells: [54, 55, 63, 64, 72, 73], rules: [0, black, ten] }
  const visible = await runEngine({ type: 'variant', operation: 'normalize', position, visibility: revealed })
  assert.deepEqual(visible.puzzle.rules.map(rule => rule.type), ['parity', 'kropki', 'xv'])
  assert.deepEqual(visible.puzzle.rules[1], { type: 'kropki', consecutive: { pairs: [], negative: false },
    ratioTwo: { pairs: [[72, 63]], negative: false } })
  assert.deepEqual(visible.puzzle.rules[2], { type: 'xv', five: { pairs: [], negative: false },
    ten: { pairs: [[63, 64]], negative: false } })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position, visibility: revealed })
  assert.equal(candidates[64], 1 << 8)
  assert.equal(candidates[72], 1 << 1)
  assert.equal(candidates[25], 0x1ff, 'An unrelated black dot is still hidden')
  const singles = await runEngine({ type: 'variant', operation: 'solve-singles', position, visibility: revealed })
  assert.equal(singles[64], source.solution[64])
  assert.equal(singles[72], source.solution[72])
  for (const [cell, digit] of [...singles].entries()) if (digit !== '0') assert.equal(digit, source.solution[cell])

  const beforeScan = watchTechniqueScan(entries, undefined, position, initial)
  const afterScan = watchTechniqueScan(entries, undefined, position, revealed)
  try {
    assert.equal(await beforeScan.count('kropki'), 0)
    const hints = await runEngine({ type: 'variant', operation: 'hints', position, visibility: revealed, techniqueOrder: ['kropki'] })
    const actions = new Set(hints.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 0)
    assert.equal(await afterScan.count('kropki'), actions.size)
    assert.equal(await beforeScan.count('kropki'), 0, 'A reveal must not change counts for the earlier view')
  } finally {
    beforeScan.close()
    afterScan.close()
  }
})

test('both Coach import paths open the verified Fog puzzle with all companion rules', async ({ mock }) => {
  mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/v1/import/sudoku-coach/Fnxt')
    return Response.json({ code: source.code, coach: { hasAuthorInstructions: false, title: 'Skipping through the fog' } })
  })
  const imported = await detectPuzzle(source.url)
  assert.deepEqual(imported.variant?.fog, { initialCells: [63] })
  assert.equal(imported.title, 'Skipping through the fog')
  assert.equal(imported.variant?.puzzle.rules?.length, 17)
  const linked = await prepareImportedPuzzle(source.url)
  const pasted = await prepareImportedPuzzle(source.code)
  assert.deepEqual(linked.game.variant, pasted.game.variant)
  assert.equal(linked.game.variant?.solution, source.solution)
  assert.equal(linked.game.difficulty, null)
  assert.equal(linked.game.score, null)
  assert.equal(fogView(linked.game.variant)?.cells.size, 1)
})

test('the authored reveal and current entries determine each projection, including after undo and redo', async () => {
  const { variant } = await detectPuzzle(source.code)
  assert.ok(variant?.fog)
  const { puzzle, fog } = variant
  const game = makeGame('fog', 'Published Fog puzzle', EMPTY, 'imported')
  const project = (position: typeof game) => {
    const cells = revealedFogCells(fog, position.position.entries, source.solution)
    const shown = projectFogPuzzle(puzzle, cells)
    assertVariantCompletion(shown, source.solution)
    return { cells: [...cells].sort((a, b) => a - b), puzzle: shown, entries: position.position.entries }
  }
  const opening = project(game)
  assert.deepEqual(opening.cells, [63])
  assert.deepEqual(opening.puzzle.rules, [{ type: 'parity', cells: [63], parity: 'odd' }])
  assert.deepEqual(project(enter(game, [63], 'value', 3)).cells, opening.cells)
  const placed = enter(game, [63], 'value', 1)
  const revealed = project(placed)
  assert.deepEqual(revealed.cells, [54, 55, 63, 64, 72, 73])
  assert.deepEqual(revealed.puzzle.rules, [
    { type: 'parity', cells: [63], parity: 'odd' },
    { type: 'whispers', cells: [63, 64], minDifference: 5 },
    { type: 'kropki', ratioTwo: { pairs: [[72, 63]] } },
    { type: 'xv', ten: { pairs: [[63, 64]] } },
    { type: 'entropic', cells: [54, 55] },
  ])
  assert.deepEqual(project(undo(placed)), opening)
  assert.deepEqual(project(redo(undo(placed))), revealed)

  const candidates = await runEngine({ type: 'variant', operation: 'candidates',
    position: { puzzle: revealed.puzzle, entries: revealed.entries } })
  assert.equal(candidates[64], 1 << 8)
  assert.equal(candidates[72], 1 << 1)
  assert.equal(candidates[25], 0x1ff)

  const opened = enter(enter(placed, [64], 'value', 9), [72], 'value', 2)
  const next = project(opened)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: next.puzzle, entries: next.entries } })
  assert.ok(trace.steps.length > 0)
  assert.ok(trace.steps.every(step => step.actions.every(action => !('place' in action))))
  const complete = revealedFogCells(fog, source.solution, source.solution)
  assert.equal(complete.size, 81)
  assert.equal(projectFogPuzzle(puzzle, complete), puzzle)
})

test('projected layers hide givens, cut paths at hidden cells, and delay negative marks', async () => {
  const importFog = (...layers: unknown[]) => detectPuzzle(coachCode({ givenConstraints: layers }))
  const mask = (cells: number[]) => ({ type: 'fog', segments: [{ cells, parameters: {} }] })
  for (const layer of [
    mask([]), mask([0, 0]), mask([81]), mask([-1]), mask([2.5]),
    { ...mask([0]), settings: { radius: 2 } },
    { ...mask([0]), segments: [{ cells: [0] }, { cells: [1] }] },
    { ...mask([0]), segments: [{ cells: [0], parameters: { custom: true } }] },
  ]) {
    await assert.rejects(importFog(layer), /invalid or unsupported reveal settings/)
  }
  assert.deepEqual((await importFog(mask([80, 0]), mask([10, 80]))).variant?.fog, { initialCells: [0, 10, 80] })
  await assert.rejects(importFog(mask([0]), { type: 'terrain', segments: [{ cells: [0] }] }), /not supported yet \(terrain\)/)

  const puzzle = { version: 1, givens: '1' + '0'.repeat(79) + '2', rules: [
    { type: 'parity', cells: [0, 80], parity: 'odd' },
    { type: 'whispers', cells: [0, 1, 2, 3, 4], minDifference: 5 },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 6 }, { cells: [79, 80], sum: 5 }] },
    { type: 'kropki', ratioTwo: { pairs: [[0, 1], [79, 80]], negative: true } },
    { type: 'xv', ten: { pairs: [[0, 1]], negative: true } },
    { type: 'adjacent-total', cells: [78, 79], sum: 5 },
  ] } as const
  const early = projectFogPuzzle(puzzle, new Set([0, 1, 3, 4]))
  assert.equal(early.givens, '1' + '0'.repeat(80))
  assert.deepEqual(early.rules, [
    { type: 'parity', cells: [0], parity: 'odd' },
    { type: 'whispers', cells: [0, 1], minDifference: 5 },
    { type: 'whispers', cells: [3, 4], minDifference: 5 },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 6 }] },
    { type: 'kropki', ratioTwo: { pairs: [[0, 1]] } },
    { type: 'xv', ten: { pairs: [[0, 1]] } },
  ])
  const later = projectFogPuzzle(puzzle, new Set([0, 1, 2, 3, 4, 78, 79, 80]))
  assert.equal(later.givens, puzzle.givens)
  assert.deepEqual(later.rules, puzzle.rules)
})

test('normal Fog play, paged hints, Technique Finder, reload, sharing, and exact solution agree on the published grid', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  mock.method(globalThis, 'fetch', fetcher)
  try {
    const { game } = await prepareImportedPuzzle(source.code)
    assert.ok(game.variant?.fog)
    const before = await puzzleHints(game, 'all', 'kropki')
    assert.equal(before.choices.length, 0)
    const opening = await playCandidates(game)
    assert.ok(opening)
    assert.equal(opening[63], 0x155)
    assert.equal(opening[72], 0x1ff)
    const coveredCandidates = { ...game, position: { ...game.position, center: Array(81).fill(1) } }
    const shownCandidates = completeCandidateMasks(coveredCandidates)
    assert.equal(shownCandidates?.[63], 1)
    assert.equal(shownCandidates?.[72], 0x1ff)

    const wrong = enter(game, [63], 'value', 3)
    assert.equal(fogView(wrong.variant, wrong.position.entries)?.cells.size, 1)
    const placed = enter(wrong, [63], 'value', 1)
    const scoped = variantPosition(game.variant, placed.position)
    const candidates = await playCandidates(placed)
    assert.ok(candidates)
    assert.equal(candidates[64], 1 << 8)
    assert.equal(candidates[72], 1 << 1)

    const collection = 321
    const first = await puzzleHints(placed, 'all', 'kropki', collection)
    assert.ok(first.choices.length > 0)
    const page = await puzzleHintPage(game.variant, collection, 0, runEngine, placed.position.entries)
    assert.deepEqual(page.choices[0], first.choices[0])
    assert.equal(page.choices[0].evidence.variant.source.puzzle.rules.length, 5)
    const actions = new Set(first.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    const finder = watchTechniqueScan(valuesOf(placed), undefined, scoped)
    try { assert.equal(await finder.count('kropki'), actions.size) } finally { finder.close() }

    const restored = readGame(placed.id, JSON.stringify(placed))
    assert.ok(restored)
    assert.deepEqual(variantPosition(game.variant, restored.position), scoped)
    assert.equal(fogView(restored.variant, undo(restored).position.entries)?.cells.size, 1)
    assert.equal(fogView(restored.variant, redo(undo(restored)).position.entries)?.cells.size, 6)
    assert.equal(fogView(restored.variant, restartGame(restored).position.entries)?.cells.size, 1)
    assert.equal(puzzleIdentity(restored), puzzleIdentity(game))
    assert.notEqual(puzzleIdentity(restored), puzzleIdentity({ ...game, variant: { ...game.variant, fog: { initialCells: [64] } } }))

    const id = await publishSharedPuzzle(restored)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.equal(valuesOf(shared.game), EMPTY)
    assert.equal(fogView(shared.game.variant)?.cells.size, 1)

    const solution = await puzzleSolution(restored)
    assert.equal(solution.board, source.solution)
    assert.equal(solution.exact, true)
    assert.equal(solution.rating.status, 'stalled')
    assert.equal(solution.positions.length, solution.steps.length + 1)
    assert.equal(solution.positions.at(-1).entries, source.solution)
    assert.equal(valuesOf(restored)[63], '1')
  } finally { sqlite.close() }
})

test('classic Fog hides authored givens until a logical placement starts the reveal', async () => {
  const code = coachCode({
    givenDigits: Array.from(source.solution, (digit, cell) => cell === 63 || cell === 72 ? '0' : digit).join(''),
    givenConstraints: [{ type: 'fog', segments: [{ cells: Array.from({ length: 81 }, (_, cell) => cell)
      .filter(cell => ![54, 55, 63, 64, 72, 73].includes(cell)) }] }],
  })
  const { game } = await prepareImportedPuzzle(code)
  assert.ok(game.variant?.fog)
  assert.equal(game.givens[54], '8')
  assert.equal(valuesOf(game)[54], '0')
  const placed = enter(game, [63], 'value', 1)
  assert.equal(valuesOf(placed)[54], '8')
  const logical = await puzzleSolution(game)
  assert.equal(logical.board, source.solution)
  assert.equal(logical.exact, undefined)
  assert.ok(logical.steps.length > 1)
  assert.equal(logical.positions[0].givens[54], '0')
  assert.equal(logical.positions.at(-1).givens[54], '8')
})

test('published mixed Fog imports keep outside totals public and exclude clipped Quadruples from opening proofs', async ({ mock }) => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/fog-coach.json', import.meta.url), 'utf8')) as
    { id: string; url: string; title: string; description: string; code: string; solution: string }[]
  const { sqlite, fetcher } = syncDatabase()
  let changedNote = false
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const source = sources.find(item => item.url === path)
    if (!source) return fetcher(path, init)
    const specificSudoku = { sudoku_id: source.id, name: source.title, sudoku: source.code,
      description: changedNote ? source.description + '\nDigits in shaded cells count twice.' : source.description,
      custom_constraints: false, blocked: false }
    return Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
  })
  try {
    for (const source of sources) {
      const preview = await prepareImportedPuzzle(source.url)
      const { game } = preview
      assert.ok(game.variant?.fog)
      assert.equal(game.title, source.title)
      assert.equal(game.variant.solution, source.solution)
      assertVariantCompletion(game.variant.puzzle, source.solution)
      const position = variantPosition(game.variant, game.position)
      const view = fogView(game.variant)!
      if (source.id === 'E3xE') {
        assert.equal(view.cells.size, 45)
        assert.equal(game.variant.puzzle.rules?.filter(rule => rule.type === 'quadruple').length, 15)
        assert.equal(position.puzzle.rules?.filter(rule => rule.type === 'quadruple').length, 6)
        assert.equal(position.puzzle.rules?.some(rule => rule.type === 'quadruple' && rule.topLeft === 32), false)
      } else {
        assert.equal(view.cells.size, 8)
        const totals = position.puzzle.rules?.filter(rule => rule.type === 'sandwich')
        assert.deepEqual(totals?.map(rule => [rule.direction, rule.sum]), [['north', 17], ['west', 12]])
        assert.ok(totals?.[1].cells.every(cell => !view.cells.has(cell)))
        const candidates = await playCandidates(game)
        assert.equal(candidates?.[34], 0xff)
        const withoutOutside = await runEngine({ type: 'variant', operation: 'candidates', position: {
          ...position, puzzle: { ...position.puzzle, rules: position.puzzle.rules?.filter(rule => rule.type !== 'sandwich') },
        } })
        assert.equal(withoutOutside[34], 0x1ff)
      }
      const hints = await puzzleHints(game)
      assert.ok(hints.choices.length >= 2)
      for (const hint of hints.choices) {
        if ('variant' in hint.evidence) assert.deepEqual(hint.evidence.variant.source?.puzzle, position.puzzle)
      }
    }
    changedNote = true
    await assert.rejects(prepareImportedPuzzle(sources[1].url), /has author instructions/)
  } finally { sqlite.close() }
})
