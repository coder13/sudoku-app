import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import lzString from 'lz-string'
import { peer, enter, makeGame, move, puzzleIdentity, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { connectedGridCells, fiveJigsawForSeed, isJigsawGrid, jigsawMembership, sevenJigsawForSeed } from '../src/sudoku/grid.ts'
import { puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { parsePuzzleExport, publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const wrappedMiniJigsaw = JSON.parse(readFileSync(new URL('./fixtures/coach-mini-wrapped-jigsaw.json', import.meta.url), 'utf8')) as {
  code: string; title: string; solution: string
}

test('the published Mini Jigsaw wraparound export imports both companion rules into the sized engine', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(wrappedMiniJigsaw.code)
    assert.ok(game.grid?.size === 4 && 'regions' in game.grid && game.sized)
    assert.equal(game.grid.wrapAround, true)
    assert.equal(isJigsawGrid({ size: game.grid.size, regions: game.grid.regions }), false)
    assert.ok(game.grid.regions.every(region => connectedGridCells(region, game.grid!.size, true)))
    assert.equal(game.title, 'Imported 4 × 4 Jigsaw')
    assert.equal([...game.sized.solution].join(''), wrappedMiniJigsaw.solution)
    assert.deepEqual(game.sized.rules.map(rule => rule.type), ['whispers', 'region-sum'])
    const sizedPosition = { version: 2 as const, grid: game.grid, rules: game.sized.rules, digits: [...game.givens].map(Number) }
    const complete = await runEngine({ type: 'sized-variant', operation: 'solve-unique', position: sizedPosition })
    assert.equal(complete.status, 'unique', 'the published wraparound Jigsaw and both line families must compose')
    assert.equal(complete.status === 'unique' ? complete.solution.digits.join('') : '', wrappedMiniJigsaw.solution)
    for (const family of ['whispers', 'region-sum']) {
      const rules = game.sized.rules.filter(rule => rule.type !== family)
      assert.equal((await runEngine({ type: 'sized-variant', operation: 'solve-unique', position: { ...sizedPosition, rules } })).status,
        'multiple', `removing the ${family} family must leave multiple completions`)
    }
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, wrappedMiniJigsaw.solution)
    const definition = puzzleDefinitionForSharing(game)
    assert.doesNotThrow(() => parsePuzzleExport(JSON.stringify({ ...definition, format: 'sudoku-app-puzzle' })))
    const rawShare = await fetcher('/api/v1/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(definition) })
    assert.equal(rawShare.status, 201, `${await rawShare.text()}\n${JSON.stringify(definition)}`)
    const published = await publishSharedPuzzle(game)
    const { game: shared } = await prepareSharedPuzzle(published, [], new AbortController().signal)
    assert.deepEqual(shared.grid, game.grid)
    const draft = makeGame(`wrapped-${Date.now()}`, 'Wrapped Jigsaw draft', game.givens, 'draft', Date.now(), game.grid)
    assert.deepEqual(readGame(draft.id, JSON.stringify(draft))?.grid, game.grid)
  } finally {
    sqlite.close()
  }
})

test('a fixed 4 × 4 Jigsaw import keeps its authored houses in the sized engine', async ({ mock }) => {
  // Janko Chaos Sudoku 001 by Otto Janko.
  const membership = [0, 0, 0, 2, 0, 2, 2, 2, 1, 1, 3, 3, 1, 1, 3, 3]
  const givens = '0043000102000000'
  const answer = '2143342112344312'
  const source = {
    size: 4,
    grid: Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => {
      const cell = row * 4 + column
      return {
        region: membership[cell],
        ...(givens[cell] !== '0' && { given: true, value: Number(givens[cell]) }),
      }
    })),
  }
  const padRegions = Array.from({ length: 4 }, (_, region) => membership.flatMap((label, cell) =>
    label === region ? [[Math.floor(cell / 4), cell % 4]] : []))
  const pad = 'scl' + lzString.compressToBase64(JSON.stringify({
    metadata: { rules: 'Place the digits 1-4 once each into every row, column, and region.' },
    cells: Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => {
      const digit = Number(givens[row * 4 + column])
      return digit ? { value: digit } : {}
    })),
    regions: padRegions,
  }))
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(JSON.stringify(source))
    assert.ok(game.grid?.size === 4 && game.sized)
    assert.equal(game.title, 'Imported 4 × 4 Jigsaw')
    assert.deepEqual(jigsawMembership(game.grid), membership)
    assert.notEqual(puzzleIdentity(game), puzzleIdentity({ givens, grid: { size: 4, boxRows: 2, boxColumns: 2 } }))
    assert.deepEqual(game.sized.solution, answer)
    assert.equal(peer(3, 5, undefined, game.grid), true)
    assert.equal(peer(3, 4, undefined, game.grid), false)
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)

    const moved = enter(game, [0], 'value', Number(answer[0]))
    assert.equal(valuesOf(moved)[0], answer[0])
    assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.grid, game.grid)
    const published = await publishSharedPuzzle(moved)
    const { game: shared } = await prepareSharedPuzzle(published, [], new AbortController().signal)
    assert.deepEqual(shared.grid, game.grid)
    assert.equal(shared.givens, givens)
    assert.equal(shared.sized?.solution, answer)

    const coachGame = await prepareImportedPuzzle(coachCode({ gridSize: 4, givenDigits: givens, regions: membership }))
    assert.ok(coachGame.game.grid?.size === 4 && 'regions' in coachGame.game.grid && coachGame.game.sized)
    const coachMembership = jigsawMembership(coachGame.game.grid)
    const sourceLabelOrder = [...new Set(membership)]
    assert.deepEqual(coachMembership, membership.map(label => sourceLabelOrder.indexOf(label)))
    assert.deepEqual(coachGame.game.sized.solution, answer)

    const padGame = await prepareImportedPuzzle(pad)
    assert.ok(padGame.game.grid?.size === 4 && 'regions' in padGame.game.grid && padGame.game.sized)
    assert.deepEqual(jigsawMembership(padGame.game.grid), membership)
    assert.deepEqual(padGame.game.sized.solution, answer)

  } finally {
    sqlite.close()
  }
})

test('the published 5 × 5 Jigsaw retains its authored regions through import, replay and sharing', async ({ mock }) => {
  // First puzzle and answer from https://sudoku.cool/pdf/en-easy-j-5-5.pdf.
  const membership = Array.from('0003401134012341123422234', Number)
  const givens = '0000203500003000040000000'
  const answer = '3514243521243151245351234'
  const source = {
    size: 5,
    ruleset: 'Normal irregular 5x5 Sudoku rules apply.',
    grid: Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
      const cell = 5 * row + column
      return {
        ...(membership[cell] === row ? {} : { region: membership[cell] }),
        ...(givens[cell] === '0' ? {} : { given: true, value: Number(givens[cell]) }),
      }
    })),
  }
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(JSON.stringify(source))
    assert.ok(game.grid?.size === 5 && game.sized)
    assert.deepEqual(jigsawMembership(game.grid), membership)
    assert.equal(game.sized.solution, answer)
    assert.deepEqual(game.sized.rules, [])
    assert.equal(peer(0, 10, undefined, game.grid), true)
    assert.equal(peer(1, 6, undefined, game.grid), true)
    assert.equal(peer(1, 7, undefined, game.grid), false)
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)

    const firstMove = enter(game, [0], 'value', Number(answer[0]))
    assert.deepEqual(readGame(firstMove.id, JSON.stringify(firstMove))?.grid, game.grid)
    const published = await publishSharedPuzzle(firstMove)
    const { game: shared } = await prepareSharedPuzzle(published, [], new AbortController().signal)
    assert.deepEqual(shared.grid, game.grid)
    assert.equal(shared.givens, givens)
    assert.equal(valuesOf(shared), givens)

    const coach = await prepareImportedPuzzle(coachCode({ gridSize: 5, givenDigits: givens, regions: membership.map(label => label + 1) }))
    assert.ok(coach.game.grid?.size === 5)
    assert.equal(puzzleIdentity(coach.game), puzzleIdentity(game))
    assert.equal(coach.game.sized?.solution, answer)
  } finally {
    sqlite.close()
  }
})

// The published Thermometer export omits any region equal to the cell's row.
const labels = ['0000111', '0200111', '2223331', '2223434', '5553434', '5666444', '5556666']
const paths = [
  ['R2C2', 'R3C3', 'R4C4'], ['R3C1', 'R4C2', 'R5C3'], ['R3C7', 'R4C6', 'R5C6'],
  ['R6C7', 'R7C7', 'R7C6'], ['R1C7', 'R2C6'], ['R7C1', 'R7C2'],
]
const exportData = {
  size: 7, title: '7 × 7 Jigsaw Thermometer', author: 'Playmaker6174',
  ruleset: 'Normal irregular 7x7 Sudoku rules apply.\n\nDigits along a thermometer must strictly increase from the bulb to the end.',
  grid: labels.map((row, index) => Array.from(row, label => Number(label) === index ? {} : { region: Number(label) })),
  thermometer: paths.map(path => ({ lines: [path] })),
}
const answer = '7135624632415747625132517346127346534562715641732'

test('a 7 × 7 Jigsaw Thermometer keeps its authored houses through import, play, replay and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(JSON.stringify(exportData))
    assert.ok(game.grid?.size === 7 && game.sized)
    const { grid, sized } = game
    assert.deepEqual(grid.regions.map(cells => cells.length), Array(7).fill(7))
    assert.equal(sized.solution, answer)
    assert.equal(sized.rules.length, 6)
    assert.ok(peer(8, 16, undefined, grid))
    assert.equal(peer(1, 8, undefined, grid), true)
    assert.equal(peer(0, 8, undefined, grid), false)
    const moved = enter(game, [0], 'value', 7)
    assert.equal(valuesOf(moved)[0], '7')
    assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.grid, grid)
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)

    const share = await publishSharedPuzzle(moved)
    const shared = await prepareSharedPuzzle(share, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, grid)
    assert.deepEqual(shared.game.sized, sized)
    assert.equal(valuesOf(shared.game), '0'.repeat(49))
    const disconnected = grid.regions.map(cells => [...cells])
    const last = disconnected[6].length - 1
    ;[disconnected[0][0], disconnected[6][last]] = [disconnected[6][last], disconnected[0][0]]
    const request = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...puzzleDefinitionForSharing(game), grid: { size: 7, regions: disconnected } }),
    })
    assert.equal(request.status, 201, 'authored region membership may include disconnected pieces')
  } finally {
    sqlite.close()
  }
})

test('Jigsaw generation verifies both recipes on every layout and excludes earlier givens', async () => {
  for (const difficulty of ['easy', 'medium'] as const) {
    const layouts = [
      ...Array.from({ length: 6 }, (_, seed) => ({ seed, grid: fiveJigsawForSeed(seed) })),
      ...Array.from({ length: 8 }, (_, seed) => ({ seed, grid: sevenJigsawForSeed(seed) })),
    ]
    for (const { seed, grid } of layouts) {
      const request = { type: 'generate-jigsaw', seed, grid, difficulty } as const
      const digits = await runEngine(request)
      assert.equal(digits.length, grid.size ** 2)
      const position = { version: 2 as const, grid, digits }
      assert.equal(await runEngine({ type: 'sized-classic', operation: 'analyze', position }), 'unique')
      const trace = await runEngine({ type: 'sized-classic', operation: 'trace', position })
      assert.ok(trace?.at(-1)?.digits.every(Boolean))
      assert.equal(trace.some(step => step.deduction && step.deduction.technique !== 'naked-single'), difficulty === 'medium')
      assert.notDeepEqual(await runEngine({ ...request, exclude: [digits] }), digits)
    }
  }
})

test('a drafted irregular layout survives reload and both history directions with its clues', () => {
  const first = sevenJigsawForSeed()
  const second = sevenJigsawForSeed(1)
  const original = makeGame('jigsaw-draft', 'Jigsaw draft', '0'.repeat(49), 'draft', 0, first)
  const changed = move(original, { ...original.position, draftRegions: second.regions,
    draftSizedRules: [{ type: 'thermometer', cells: [0, 1, 2] }] })
  assert.deepEqual(changed.grid, second)
  const loaded = readGame(changed.id, JSON.stringify(changed))
  assert.ok(loaded)
  const previous = undo(loaded)
  assert.deepEqual(previous.grid, first)
  assert.deepEqual(previous.position.draftSizedRules, [])
  assert.deepEqual(redo(previous).grid, second)
  assert.deepEqual(redo(previous).position.draftSizedRules, changed.position.draftSizedRules)
  assert.equal(readGame(changed.id, JSON.stringify({ ...changed, grid: first })), undefined)
})

test('the published Jigsaw labeled dots preserve all nine clues and a complete logical replay', async () => {
  const labels = ['0000111', '0222221', '0322331', '0333341', '5444441', '5546666', '5555666']
  const dots = {
    difference: [['R4C7', 'R4C6', 2], ['R2C2', 'R3C2', 3], ['R1C5', 'R1C4', 4],
      ['R1C6', 'R1C5', 1], ['R6C4', 'R6C5', 2], ['R4C4', 'R4C5', 1]],
    ratio: [['R1C2', 'R1C3', 3], ['R3C2', 'R4C2', 2], ['R4C5', 'R4C6', 2]],
  }
  const content = JSON.stringify({
    size: 7, title: '7 × 7 Jigsaw with labeled dots', author: 'Playmaker6174',
    ruleset: 'Normal irregular 7x7 Sudoku rules apply.\n\nA white dot with a number in it implies the difference between two cells. A black dot with a number in it implies the ratio relationship between two cells.',
    grid: labels.map((row, index) => Array.from(row, label => Number(label) === index ? {} : { region: Number(label) })),
    ...Object.fromEntries(Object.entries(dots).map(([relation, entries]) =>
      [relation, entries.map(([a, b, value]) => ({ cells: [a, b], value: String(value) }))])),
  })
  const { game } = await prepareImportedPuzzle(content)
  assert.ok(game.grid?.size === 7 && game.sized)
  const rules = game.sized.rules
  assert.deepEqual(rules.map(rule => rule.type === 'labeled-dots' && rule.marks.map(mark => mark.value)), [[2, 3, 4, 1, 2, 1], [3, 2, 2]])
  const exact = '3621547513472674563124275631671245325631741347265'
  assert.equal(game.sized.solution, exact)
  const replay = await puzzleSolution(game)
  assert.equal(replay.status, 'solved')
  assert.equal(replay.board, exact)
  assert.ok(replay.steps.some(step => step.technique === 'sized-labeled-dots'))
  const invalid = enter(enter(game, [1], 'value', 6), [2], 'value', 3)
  assert.equal(readGame(game.id, JSON.stringify(invalid))?.sized?.solution, exact)
  const { sqlite, fetcher } = syncDatabase()
  try {
    const response = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(puzzleDefinitionForSharing(game)),
    })
    assert.equal(response.status, 201)
  } finally { sqlite.close() }
})
