import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyDeduction, fillEntries, isSolved, makeGame, puzzleIdentity, restartGame, undo } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { runEngine, type SizedConstraintRule } from '../src/sudoku/engine.ts'
import { decodeCoachSix, detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import worker from '../cloudflare/pages/_worker.js'

useWasmWorker(process.env.SIZED_COACH_WASM)

const easyThermoCode = readFileSync(new URL('./fixtures/sudokupad-easy-thermo-1.scl', import.meta.url), 'utf8').trim()
const easyThermoSolution = '1234341223414123'
const coachBetween = JSON.parse(readFileSync(new URL('./fixtures/little-killer-between-GJBz.json', import.meta.url), 'utf8')) as {
  metadata: { sudoku: string; solution: string }
}
const coachInsideDigitGroups = JSON.parse(readFileSync(new URL('./fixtures/little-killer-unsupported-DLeM.json', import.meta.url), 'utf8')) as {
  metadata: { sudoku: string; solution: string }
}

const constraints = [
  { type: 'diagonalPositive', segments: [] },
  { type: 'thermometer', segments: [{ cells: [1, 7, 13, 14] }, { cells: [32, 26, 20] }] },
  { type: 'odd', segments: [{ cells: [24] }, { cells: [17] }] },
]
const code = coachCode({ gridSize: 6, givenDigits: '000000000000000000000000000030000400', givenConstraints: constraints,
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)) })
const expected = '413652625314234561156243542136361425'

test('six-by-six Coach constraints reach Wasm together and change the exact solution count', async () => {
  const decoded = await decodeCoachSix(code)
  const { givens, rules, grid, version } = decoded
  const position = { digits: Array.from(givens, Number), rules, grid, version }
  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
  const solved = await runEngine({ type: 'sized-variant', position, operation: 'solve' })
  assert.equal(solved?.digits.join(''), expected)
  const candidates = await runEngine({ type: 'sized-variant', position, operation: 'candidates' })
  assert.ok(candidates)
  assert.equal(candidates.length, 36)
  assert.equal(candidates[24] & 0b101010, 0)
  for (const ruleType of ['diagonal', 'parity', 'thermometer']) {
    const partial = { ...position, rules: rules.filter(rule => rule.type !== ruleType) }
    assert.equal(await runEngine({ type: 'sized-variant', position: partial, operation: 'analyze' }), 'multiple')
  }
})

test('sized Coach two-cell sums constrain candidates and reject invalid completions in Wasm', async () => {
  const sizedSum = coachCode({ gridSize: 6, regions: Array.from({ length: 36 }, (_, cell) =>
    Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)), givenConstraints: [{
    type: 'twoCellSum', settings: {}, segments: [{ cells: [0, 1], parameters: { sum: 3 } }],
  }] })
  const decoded = await decodeCoachSix(sizedSum)
  assert.deepEqual(decoded.rules, [{ type: 'adjacent-total', cells: [0, 1], sum: 3 }])
  const position = { version: decoded.version, grid: decoded.grid, rules: decoded.rules,
    digits: Array.from(decoded.givens, Number) }
  const candidates = await runEngine({ type: 'sized-variant', position, operation: 'candidates' })
  assert.ok(candidates)
  assert.equal(candidates[0], 0b000011)
  const solution = '123456456123234561561234345612612345'
  const invalid = await runEngine({ type: 'sized-variant', position: {
    ...position, digits: Array.from(solution, Number), rules: [{ type: 'adjacent-total', cells: [0, 1], sum: 4 }],
  }, operation: 'analyze' })
  assert.equal(invalid, 'conflict')
})

test('#7 keeps both Between paths and validates the published 6 × 6 completion in Wasm', async () => {
  const imported = await detectPuzzle(coachBetween.metadata.sudoku)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.ok(imported.grid && imported.sizedRules)
  assert.deepEqual(imported.sizedRules?.filter(rule => rule.type === 'between'), [
    { type: 'between', cells: [20, 15, 16, 10, 4] },
    { type: 'between', cells: [0, 6, 7, 14] },
  ])
  const completion = await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2,
    grid: imported.grid,
    digits: Array.from(coachBetween.metadata.solution, Number),
    rules: imported.sizedRules,
  } })
  assert.equal(completion, 'unique')
  const blank = {
    version: 2 as const,
    grid: imported.grid,
    digits: Array(36).fill(0),
    rules: imported.sizedRules,
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: blank }), 'unique')
  assert.equal(imported.sizedRules.filter(rule => rule.type === 'little-killer').length, 3)

  const preview = await prepareImportedPuzzle(coachBetween.metadata.sudoku)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.deepEqual(preview.game.sized?.rules, imported.sizedRules)
  assert.equal(preview.game.sized?.solution, coachBetween.metadata.solution)
})

test('sized Coach current-state progress reaches Preview, Play and saved reload', async () => {
  const userDigits = Array(36).fill('0')
  userDigits[0] = expected[0]
  const center = Array(36).fill('0')
  center[1] = '8'
  const corner = Array(36).fill('0')
  corner[2] = '16'
  const progressCode = coachCode({
    gridSize: 6,
    givenDigits: '000000000000000000000000000030000400',
    givenConstraints: constraints,
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)),
    userDigits: userDigits.join(''),
    userCellCandidates: center.join('-'),
    userBoxCandidates: corner.join('-'),
  })
  const preview = await prepareImportedPuzzle(progressCode)
  assert.equal(preview.hasProgress, true)
  assert.equal(preview.game.position.entries, expected[0] + '0'.repeat(35))
  assert.equal(preview.game.position.center[1], 4)
  assert.equal(preview.game.position.corner[2], 8)
  assert.equal(preview.game.started, true)
  const restored = readGame(preview.game.id, JSON.stringify(preview.game))
  assert.equal(restored?.position.entries, preview.game.position.entries)
  assert.equal(restored?.position.center[1], 4)
  assert.equal(restored?.position.corner[2], 8)
  assert.deepEqual(restored?.sized, preview.game.sized)
})

test('Cmki Entropic Runaround imports through raw code and short-link Preview and Play with all rules', async ({ mock }) => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples
    .find((example: { url: string }) => example.url.endsWith('/Cmki'))
  const { sqlite, fetcher } = syncDatabase()
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'Cmki', sudoku: fixture.code, name: fixture.title, blocked: false,
    custom_constraints: true, description: fixture.description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string | URL, options?: RequestInit) => path === fixture.url
    ? Promise.resolve(new Response(page())) : fetcher(path, options))

  try {
    const previews = [await prepareImportedPuzzle(fixture.code), await prepareImportedPuzzle(fixture.url)]
    const [raw, linked] = previews
    assert.equal(raw.format, 'Sudoku Coach')
    assert.equal(linked.format, 'Sudoku Coach')
    assert.equal(linked.game.title, fixture.title)
    assert.deepEqual(linked.game.grid, raw.game.grid)
    assert.deepEqual(linked.game.sized?.rules, raw.game.sized?.rules)
    for (const { game } of previews) {
      assert.deepEqual(game.grid, {
        size: 6,
        regions: [[0, 1, 2, 3, 6, 9], [4, 5, 11, 17, 22, 23], [7, 8, 10, 14, 15, 16],
          [12, 13, 18, 24, 30, 31], [19, 20, 21, 25, 27, 28], [26, 29, 32, 33, 34, 35]],
      })
      assert.equal(game.sized?.rules.length, 7)
      assert.equal(game.sized?.solution, fixture.solution)
    }
    const game = linked.game
    const position = { digits: Array.from(game.givens, Number), rules: game.sized!.rules, grid: game.grid!, version: 2 as const }
    assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
    for (const [index, rule] of position.rules.entries()) {
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
        ...position, rules: position.rules.filter((_, ruleIndex) => ruleIndex !== index),
      } }), 'multiple', `removing ${rule.type} rule ${index + 1} leaves more than one completion`)
    }
    const solved = await runEngine({ type: 'sized-variant', position, operation: 'solve' })
    assert.equal(solved?.digits.join(''), fixture.solution)
    const finished = fillEntries(game, fixture.solution)
    assert.equal(isSolved(finished), true)
    const restored = readGame(game.id, JSON.stringify(finished))
    assert.deepEqual(restored?.grid, game.grid)
    assert.deepEqual(restored?.sized?.rules, game.sized?.rules)
    assert.equal(restored?.sized?.solution, fixture.solution)
    assert.equal(restored?.position.entries, fixture.solution)
    const shareId = await publishSharedPuzzle(finished)
    const shared = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, game.grid)
    assert.deepEqual(shared.game.sized?.rules, game.sized?.rules)
    assert.equal(shared.game.sized?.solution, fixture.solution)
    assert.equal(shared.game.position.entries, '0'.repeat(36), 'sharing preserves the puzzle definition, not the played attempt')
  } finally {
    sqlite.close()
  }
})

test('Coach 5 × 5 fractional regions and Little Killer clues reach the sized engine together', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/coach-fractional-regions.json', import.meta.url), 'utf8'))
  const decoded = await detectPuzzle(fixture.code)
  assert.ok(decoded.grid && decoded.sizedRules)
  const position = { version: 2 as const, digits: Array.from(decoded.givens, Number), rules: decoded.sizedRules, grid: decoded.grid }
  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
  const solved = await runEngine({ type: 'sized-variant', position, operation: 'solve' })
  assert.equal(solved?.digits.join(''), fixture.solution)
})

test('#453 fractional regions work on a wide 12 × 12 Latin grid', async () => {
  const size = 12
  const width = size * 2
  const pieces = Array.from({ length: 4 }, (_, piece) => ({
    color: ['#aa0000', '#00aa00', '#0000aa', '#aaaa00'][piece],
    quarters: Array.from({ length: width * 6 }, (_, offset) => piece * width * 6 + offset),
  }))
  const solution = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row + column) % size + 1)).flat()
  const position = {
    version: 2 as const,
    grid: { size, noRegions: true as const },
    digits: solution,
    rules: [{ type: 'fractional-regions' as const, pieces }],
  }

  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
})

test('#453 imports the fractional-region puzzle through Preview, Play and saved reload', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/coach-fractional-regions.json', import.meta.url), 'utf8'))
  const preview = await prepareImportedPuzzle(fixture.code)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.deepEqual(preview.game.grid, { size: 5, noRegions: true })
  assert.equal(preview.game.sized?.rules.filter(rule => rule.type === 'little-killer').length, 3)
  assert.equal(preview.game.sized?.rules.filter(rule => rule.type === 'fractional-regions').length, 1)
  assert.equal(preview.game.sized?.solution, fixture.solution)
  const finished = fillEntries(preview.game, fixture.solution)
  assert.equal(isSolved(finished), true)
  const restored = readGame(finished.id, JSON.stringify(finished))
  assert.deepEqual(restored?.sized?.rules, finished.sized?.rules)
  assert.equal(restored?.position.entries, fixture.solution)
})

test('Easy Thermo 1 reaches Preview with both original paths and its unique solution', async () => {
  const { game, format } = await prepareImportedPuzzle(easyThermoCode)
  assert.equal(format, 'SudokuPad')
  assert.equal(game.grid?.size, 4)
  assert.deepEqual(game.sized?.rules, [
    { type: 'thermometer', cells: [8, 4, 5] },
    { type: 'thermometer', cells: [13, 14, 15] },
  ])
  assert.equal(game.sized?.solution, easyThermoSolution)
})

test('a Coach short link preserves 6 × 6 rules through Play, undo, reload and sharing', async ({ mock }) => {
  const shareId = '66666666-6666-4666-8666-666666666666'
  let shared: object | undefined
  mock.method(globalThis, 'fetch', async (path: string, request?: RequestInit) => {
    if (path === '/api/v1/import/sudoku-coach/Test6') return Response.json({ code })
    if (path === '/api/v1/shares' && request?.method === 'POST') {
      shared = JSON.parse(String(request.body))
      return Response.json({ id: shareId })
    }
    assert.equal(path, `/api/v1/shares/${shareId}`)
    return Response.json(shared)
  })
  const { game } = await prepareImportedPuzzle('https://sudoku.coach/en/s/Test6')
  const { sized, grid } = game
  assert.ok(sized && grid?.size === 6)
  assert.equal(sized.solution, expected)
  assert.equal(isSolved(fillEntries(game, expected)), true)
  assert.deepEqual(restartGame(game).sized, sized)
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, grid: { size: 6, boxRows: 3, boxColumns: 2 } }))
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, sized: { ...sized, rules: [] } }))
  const candidates = await playCandidates(game)
  assert.ok(candidates?.every((mask, cell) => game.givens[cell] !== '0' || mask & (1 << (Number(expected[cell]) - 1))))
  const hint = await puzzleHints(game, 'all', 'sized-parity')
  assert.ok(hint.candidates)
  const moved = applyDeduction(game, hint.choices[0].actions, hint.candidates)
  assert.notDeepEqual(moved.position, game.position)
  assert.deepEqual(undo(moved).position, game.position)
  assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.sized, sized)
  assert.deepEqual(readGame(moved.id, JSON.stringify({ ...moved, sized: undefined, six: sized }))?.sized, sized)
  assert.equal(readGame(game.id, JSON.stringify({ ...game, sized: undefined })), undefined)
  assert.equal(await publishSharedPuzzle(moved), shareId)
  assert.deepEqual(shared, { version: 1, title: game.title, givens: game.givens, grid, sixRules: sized.rules })
  const copy = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
  assert.deepEqual(copy.game.sized, sized)
  const replay = await puzzleSolution(game)
  assert.equal(replay.status, 'solved')
  assert.equal(replay.board, expected)
  assert.ok(replay.steps.some(step => step.technique === 'sized-contradiction'))
  assert.ok(replay.steps.some(step => step.technique === 'sized-parity'))
  assert.ok(replay.steps.some(step => step.technique === 'sized-thermometer'))
  for (const step of replay.steps) for (const action of step.actions) {
    if ('place' in action) assert.equal(action.place.digit, Number(expected[action.place.cell]))
    else assert.notEqual(action.eliminate.digit, Number(expected[action.eliminate.cell]))
  }
})

test('older 6 × 6 drafts migrate rule lists in current, undo and redo positions', () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const game = makeGame('legacy-draft', 'Old draft', '0'.repeat(36), 'draft', undefined, grid)
  const rules = [{ type: 'renban', cells: [0, 1, 2] }]
  const restored = readGame(game.id, JSON.stringify({
    ...game, position: { ...game.position, draftSixRules: rules },
    past: [{ ...game.position, draftSixRules: [] }], future: [{ ...game.position, draftSixRules: rules }],
  }))
  assert.deepEqual(restored?.position.draftSizedRules, rules)
  assert.deepEqual(restored?.past[0].draftSizedRules, [])
  assert.deepEqual(restored?.future[0].draftSizedRules, rules)
  assert.ok(!Object.hasOwn(restored!.position, 'draftSixRules'))
})

test('6 × 6 generation meets both difficulty recipes in both box orientations', async () => {
  for (const grid of [{ size: 6, boxRows: 2, boxColumns: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }] as const) {
    for (const difficulty of ['easy', 'medium'] as const) {
      const request = { type: 'generate-six', grid, difficulty, seed: 17 } as const
      const digits = await runEngine(request)
      assert.deepEqual(await runEngine(request), digits)
      assert.notDeepEqual(await runEngine({ ...request, exclude: [digits] }), digits)
      const position = { version: 2, grid, digits } as const
      assert.equal(await runEngine({ type: 'sized-classic', position, operation: 'analyze' }), 'unique')
      const trace = await runEngine({ type: 'sized-classic', position, operation: 'trace' })
      assert.ok(trace?.length)
      assert.ok(trace.at(-1)?.digits.every(Boolean))
      assert.equal(trace.some(step => step.deduction && step.deduction.technique !== 'naked-single'), difficulty === 'medium')
    }
  }
})

test('mixed 6 × 6 Renban and thermometer need both overlapping rules in both box orientations', async () => {
  const givens = '403000000010030000006200000000060005'
  const position = { version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 }, digits: Array.from(givens, Number),
    rules: [{ type: 'renban', cells: [23, 22, 15, 21], segments: [[23, 22, 15], [15, 21]] },
      { type: 'thermometer', cells: [27, 22, 29] }] } as const
  const transpose = (cell: number) => (cell % 6) * 6 + Math.floor(cell / 6)
  const transposed = { ...position, grid: { size: 6, boxRows: 3, boxColumns: 2 },
    digits: position.digits.map((_, index) => position.digits[transpose(index)]),
    rules: [{ type: 'renban', cells: position.rules[0].cells.map(transpose),
      segments: position.rules[0].segments.map(path => path.map(transpose)) },
    { type: 'thermometer', cells: position.rules[1].cells.map(transpose) }] } as const

  for (const [puzzle, solution] of [[position, expected], [transposed, [...expected].map((_, index) => expected[transpose(index)]).join('')]] as const) {
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: puzzle }), 'unique')
    assert.equal((await runEngine({ type: 'sized-variant', operation: 'solve', position: puzzle }))?.digits.join(''), solution)
    for (const rule of puzzle.rules) {
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...puzzle, rules: [rule] } }), 'multiple')
    }
    const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position: puzzle })
    assert.equal(trace?.at(-1)?.digits.join(''), solution)
    assert.ok(trace?.some(step => step.deduction?.type === 'rule' && step.deduction.rule === 0))
  }
})

test('Race track keeps both rule families through exact solving and replay in either 6 × 6 box orientation', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-race-track.json', import.meta.url), 'utf8')) as {
    code: string; solution: string
  }
  const original = await decodeCoachSix(fixture.code)
  assert.deepEqual(original.rules, [
    { type: 'renban', cells: [9, 8, 14, 20, 26, 27] },
    { type: 'renban', cells: [8, 9, 15, 21, 27, 26] },
    { type: 'difference', cells: [26, 20], difference: 1 },
    { type: 'difference', cells: [8, 9], difference: 3 },
    { type: 'difference', cells: [20, 14], difference: 2 },
  ])
  const { game } = await prepareImportedPuzzle(fixture.code)
  assert.deepEqual(game.sized?.rules, original.rules)
  assert.equal(game.sized?.solution, fixture.solution)
  const transpose = (cell: number) => cell % 6 * 6 + Math.floor(cell / 6)
  for (const transposeBoxes of [false, true]) {
    const cellMap = transposeBoxes ? transpose : (cell: number) => cell
    const rules = original.rules.map((rule): SizedConstraintRule => {
      if (rule.type === 'renban') return { ...rule, cells: rule.cells.map(cellMap), segments: rule.segments?.map(path => path.map(cellMap)) }
      assert.equal(rule.type, 'difference')
      return { ...rule, cells: [cellMap(rule.cells[0]), cellMap(rule.cells[1])] }
    })
    const grid = transposeBoxes ? { size: 6, boxRows: 3, boxColumns: 2 } as const : original.grid
    const givens = Array.from(original.givens, (_, cell) => original.givens[cellMap(cell)]).join('')
    const solution = Array.from(fixture.solution, (_, cell) => fixture.solution[cellMap(cell)]).join('')
    const position = { version: 2 as const, grid, digits: Array.from(givens, Number), rules }
    for (const type of ['renban', 'difference']) {
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze',
        position: { ...position, rules: rules.filter(rule => rule.type === type) } }), 'multiple')
    }
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
    const answer = await runEngine({ type: 'sized-variant', operation: 'solve', position })
    assert.equal(answer?.digits.join(''), solution)
    const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
    assert.equal(trace?.at(-1)?.digits.join(''), solution)
    assert.ok(trace?.some(({ deduction }) => deduction?.type === 'rule' && rules[deduction.rule]?.type === 'difference'))
  }
})

test('imported Mini Region Sum and Renban lines jointly determine the same grid for play and replay', async () => {
  const payload = coachCode({ gridSize: 4, givenDigits: '1000000000000000', givenConstraints: [
    { type: 'regionSumLine', segments: [{ cells: [0, 4, 9, 13, 10, 5] }] },
    { type: 'renban', segments: [{ cells: [4, 9, 14] }] },
  ] })
  const { game } = await prepareImportedPuzzle(payload)
  assert.ok(game.sized && game.grid)
  assert.deepEqual(game.sized.rules.map(rule => rule.type), ['region-sum', 'renban'])
  const answer = '1234341221434321'
  assert.equal(game.sized.solution, answer)
  for (const rule of game.sized.rules) {
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
      version: 2, grid: game.grid, digits: Array.from(game.givens, Number), rules: [rule],
    } }), 'multiple')
  }
  const replay = await puzzleSolution(game)
  assert.equal(replay.status, 'solved')
  assert.equal(replay.board, answer)
  assert.ok(replay.steps.some(step => step.technique === 'sized-region-sum'))
  assert.ok(replay.steps.some(step => step.technique === 'sized-renban'))
})

test('#457 verifies a 4 × 4 Jigsaw and companion Renban through Import Preview', async () => {
  const givens = '1234234134124123'
  const regions = [1, 1, 2, 2, 3, 1, 4, 2, 3, 1, 4, 2, 3, 3, 4, 4]
  const payload = coachCode({ gridSize: 4, regions, givenDigits: givens, givenConstraints: [
    { type: 'renban', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
  ] })
  const { game } = await prepareImportedPuzzle(payload)
  assert.deepEqual(game.grid, {
    size: 4, regions: [[0, 1, 5, 9], [2, 3, 7, 11], [4, 8, 12, 13], [6, 10, 14, 15]],
  })
  assert.deepEqual(game.sized?.rules, [{ type: 'renban', cells: [0, 1, 2] }])
  assert.equal(game.sized?.solution, givens)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: game.grid!, digits: Array.from(givens, Number), rules: game.sized!.rules,
  } }), 'unique')
})

test('#457 solves the published Janko Chaos 001 control through Import Preview', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/janko-chaos-sudoku-001.json', import.meta.url), 'utf8')) as {
    size: 4; givens: string; regionLabels: number[]; solution: string
  }
  const payload = coachCode({ gridSize: source.size, regions: source.regionLabels, givenDigits: source.givens })
  const { game } = await prepareImportedPuzzle(payload)
  assert.ok(game.grid && game.sized)
  assert.deepEqual(game.grid, {
    size: 4, regions: [[0, 1, 2, 4], [3, 5, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]],
  })
  assert.equal(game.givens, source.givens)
  assert.equal(game.sized.solution, source.solution)
  const result = await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: game.grid, digits: Array.from(source.givens, Number), rules: game.sized.rules,
  } })
  assert.equal(result, 'unique')
})

test('DLeM outside digit groups survive Cloudflare sharing and reopen', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string | URL, options?: RequestInit) => fetcher(path, options))
    const { game } = await prepareImportedPuzzle(coachInsideDigitGroups.metadata.sudoku)
    const malformed = JSON.parse(JSON.stringify(puzzleDefinitionForSharing(game))) as {
      sizedRules: Array<{ type: string; firstThreeDigits?: number[] }>
    }
    const malformedClue = malformed.sizedRules.find(rule => rule.type === 'outside-text')
    assert.ok(malformedClue)
    assert.ok(malformedClue.firstThreeDigits?.length)
    malformedClue.firstThreeDigits = [malformedClue.firstThreeDigits[0] % 9 + 1]
    const rejected = await fetcher('/api/v1/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(malformed),
    })
    assert.equal(rejected.status, 400)

    const shareId = await publishSharedPuzzle(game)
    const reopened = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
    assert.deepEqual(reopened.game.sized?.rules, game.sized?.rules)
    assert.equal(reopened.game.sized?.solution, coachInsideDigitGroups.metadata.solution)
  } finally {
    sqlite.close()
  }
})
