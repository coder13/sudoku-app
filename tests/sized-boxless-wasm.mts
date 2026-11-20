import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf, enter, fillEntries, isSolved, makeGame, move, peer, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { SEVEN_BOXLESS_GRID as grid } from '../src/sudoku/grid.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

// Sudoku Coach's published 7 × 7 Killer (no boxes) export.
const link = 'https://sudoku.coach/en/s/FWpZ'
const code = 'SCv7_32_f2e8r4ubdb230325vt2unes84jjrjr97ehcmc4b6hgokpkh1sckr88fvbpjl32h0grm2puv8e6nv0ij1h6rvfu73d5k432ofu5pntknge40obu75surhp9j5hhptkrqnh8rhle02knnkejl1tcc3p0cu7p6fs3tpvbtnqfqlc045kt30iv5jrhj5jhuf4irubfkvj6j8i1jdns4vk0k717e1d8q60f96b46tl0tbceo3c71jb1782df43ic6er1118kmhommu8eq8bkgdj4hskggclup45iqd9f5jck119aa27dkgslp85r7mfp7ler3marnnbf10inb8cjbjjqd1pkcodd43uckcfdc45ccm21rkf38k6rpbrgo5obira6vrdfvcjshaaec6vkvsfmhf1je3030'
const answer = '3542671762314513754265214763415623764375122761354'
const empty = '0'.repeat(49)

test('the published boxless Killer keeps its layout and 18 cages through Play, replay and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/import/sudoku-coach/FWpZ') return Response.json({ code })
      return fetcher(path, init)
    })
    const { game } = await prepareImportedPuzzle(link)
    assert.deepEqual(game.grid, grid)
    assert.ok(game.sized)
    assert.equal(game.sized.solution, answer)
    const cages = game.sized.rules[0]
    assert.ok(cages.type === 'killer-cages')
    assert.equal(cages.cages.length, 18)
    assert.deepEqual(cages.cages[0], { cells: [0, 1, 2, 7, 8, 14], sum: 26 })
    assert.equal(peer(0, 8, undefined, grid), false)
    assert.equal(peer(0, 7, undefined, grid), true)
    assert.equal(isSolved(fillEntries(game, answer)), true)

    const candidates = await playCandidates(game)
    assert.ok(candidates?.every((mask, cell) => mask & (1 << (Number(answer[cell]) - 1))))
    assert.equal(candidates[0] & 0b10, 0)
    const hint = await puzzleHints(game, 'all', 'sized-killer-cages')
    assert.ok(hint.choices.some(choice => choice.technique === 'sized-killer-cages'))
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)
    for (const step of replay.steps) for (const action of step.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(answer[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(answer[action.eliminate.cell]))
    }

    const moved = enter(game, [0], 'value', 2)
    assert.deepEqual(conflictsOf(valuesOf(moved), undefined, grid, game.sized.rules), new Set([0]))
    const saved = readGame(moved.id, JSON.stringify(moved))
    assert.deepEqual(saved?.grid, grid)
    assert.deepEqual(saved?.sized, game.sized)
    assert.equal(valuesOf(saved!)[0], '2')
    const id = await publishSharedPuzzle(moved)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, grid)
    assert.deepEqual(shared.game.sized, game.sized)
    assert.equal(valuesOf(shared.game), empty)

    const definition = puzzleDefinitionForSharing(game)
    for (const bad of [
      { ...definition, grid: { ...grid, regions: [] } },
      { ...definition, sizedRules: [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 15 }] }] },
      { ...definition, sizedRules: [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] },
        { type: 'killer-cages', cages: [{ cells: [1, 8], sum: 5 }] }] },
    ]) {
      const response = await fetcher('/api/v1/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad) })
      assert.equal(response.status, 400)
    }
  } finally {
    sqlite.close()
  }
})

test('authored extra regions coexist with boxless cages and constrain candidates across rows and columns', async () => {
  // These cells contain 1–7 once each in a cyclic Latin square.
  const givens = Array.from({ length: 49 }, (_, cell) => String(1 + (Math.floor(cell / 7) + cell % 7) % 7)).join('')
  const region = [0, 8, 16, 24, 32, 40, 48]
  const { game } = await prepareImportedPuzzle(coachCode({
    gridSize: 7, regions: [],
    givenDigits: '0' + givens.slice(1, 8) + '0' + givens.slice(9),
    givenConstraints: [
      { type: 'cage', segments: [{ cells: [0, 1], parameters: { sum: 3 } }] },
      { type: 'region', segments: [{ cells: region }] },
    ],
  }))
  assert.ok(game.sized)
  const { rules } = game.sized
  assert.deepEqual(rules.map(rule => rule.type), ['killer-cages', 'extra-house'])
  assert.deepEqual(rules[1], { type: 'extra-house', cells: region })
  assert.equal(game.sized.solution, givens)
  assert.equal(peer(0, 8, undefined, grid, rules), true)
  const entered = enter(enter(game, [0], 'value', 1), [8], 'value', 1)
  assert.deepEqual(conflictsOf(valuesOf(entered), undefined, grid, [rules[0]]), new Set([8, 13, 43]))
  assert.deepEqual(conflictsOf(valuesOf(entered), undefined, grid, rules), new Set([0, 8, 13, 43]))
  const candidates = await playCandidates(enter(game, [0], 'value', 1))
  assert.equal(candidates?.[8], 1 << 2)

  const draft = makeGame('boxless-draft', 'Boxless draft', empty, 'draft', 0, grid)
  const edited = move(draft, { ...draft.position, draftSizedRules: rules })
  const restored = readGame(edited.id, JSON.stringify(edited))
  assert.ok(restored)
  assert.deepEqual(restored.grid, grid)
  assert.deepEqual(restored.position.draftSizedRules, rules)
  assert.deepEqual(undo(restored).position.draftSizedRules, [])
  assert.deepEqual(redo(undo(restored)).position.draftSizedRules, rules)
})
