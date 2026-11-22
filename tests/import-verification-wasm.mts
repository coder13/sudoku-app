import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { STARTER } from '../src/sudoku/formats.ts'
import { enter, hasUniquenessProof, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle, PuzzleVerificationError } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { code, solution } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-quadruple-preview.json', import.meta.url), 'utf8'))
const empty = '0'.repeat(81)
const unsolvable = '531070000600195000098000060800060003400803001700020006060000280000419005000080079'

test('the original mixed puzzle is available before the worker returns its uniqueness proof', async ({ mock }) => {
  const post = Worker.prototype.postMessage
  const held = Promise.withResolvers<() => void>()
  let decoded = false
  mock.method(Worker.prototype, 'postMessage', function (request) {
    if (request.request.operation === 'solve-unique') {
      assert.equal(decoded, true)
      held.resolve(() => post.call(this, request))
    } else post.call(this, request)
  })
  const checking = prepareImportedPuzzle(code, [], {
    signal: new AbortController().signal,
    deferRating: true,
    onDecoded: puzzle => {
      assert.equal(puzzle.givens, empty)
      assert.deepEqual(puzzle.variant?.puzzle.rules?.map(rule => rule.type),
        ['global-entropy', ...Array(18).fill('quadruple')])
      decoded = true
    },
  })
  const release = await held.promise
  release()
  const { game, ratingPending } = await checking
  assert.equal(ratingPending, true)
  assert.ok(hasUniquenessProof(game))
  assert.equal(game.variant?.solution, solution)
  assertVariantCompletion(game.variant.puzzle, solution)
})

test('the original zero-given Quadruple puzzle returns hints and replays the verified solution', async () => {
  const { game: imported } = await prepareImportedPuzzle(code)
  const game = { ...imported, candidatesInitialized: true,
    position: { ...imported.position, center: Array<number>(81).fill(0x1ff) } }
  assert.ok(game.variant)
  assert.ok((await puzzleHints(game)).choices.length)
  const path = await puzzleSolution(game)
  assert.equal(path.board, solution)
  assert.notEqual(path.rating.status, 'stalled')
  const technique = 'global-entropy'
  const index = path.steps.findIndex(step => step.technique === technique && 'variant' in step.evidence &&
    step.evidence.variant.source?.deduction.evidence.type === 'entropy-areas')
  assert.ok(index >= 0)
  const { entries, eliminations } = path.positions![index]
  const checkpoint = { ...game, position: { ...game.position, entries, eliminations } }
  const { choices } = await puzzleHints(checkpoint, 'all', technique)
  assert.ok(choices.some(choice => 'variant' in choice.evidence &&
    choice.evidence.variant.source?.deduction.evidence.type === 'entropy-areas'))
  const actions = new Set(choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
  const scan = watchTechniqueScan(valuesOf(checkpoint), eliminations, variantPosition(game.variant, checkpoint.position))
  try { assert.equal(await scan.count(technique), actions.size) } finally { scan.close() }
  for (const { actions } of path.steps) for (const action of actions) {
    if ('place' in action) assert.equal(solution[action.place.cell], String(action.place.digit))
    else assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
  }
})

test('only a matching saved proof can be reused, and Play edits preserve it', async ({ mock }) => {
  const { game } = await prepareImportedPuzzle(STARTER, [], { deferRating: true })
  assert.equal(hasUniquenessProof(game), true)
  const moved = enter(game, [STARTER.indexOf('0')], 'value', 1)
  assert.notEqual(moved.position.entries, game.position.entries)
  for (const attempt of [moved, undo(moved), restartGame(moved)]) {
    const restored = readGame(attempt.id, JSON.stringify(attempt))
    assert.ok(restored)
    assert.equal(hasUniquenessProof(restored), true)
  }

  const post = Worker.prototype.postMessage
  const requests = mock.method(Worker.prototype, 'postMessage', post)
  await prepareImportedPuzzle(STARTER, [game], { deferRating: true })
  assert.equal(requests.mock.callCount(), 0)

  const legacy = { ...game, uniquenessProof: undefined }
  assert.equal(hasUniquenessProof(legacy), false)
  assert.ok(hasUniquenessProof((await prepareImportedPuzzle(STARTER, [legacy], { deferRating: true })).game))
  assert.equal(requests.mock.callCount(), 1)

  const changed = { ...game, givens: empty }
  const changedSave = readGame(changed.id, JSON.stringify(changed))
  assert.ok(changedSave)
  assert.equal(changedSave.uniquenessProof, undefined)
  const mixed = (await prepareImportedPuzzle(code, [], { deferRating: true })).game
  assert.ok(mixed.variant)
  const edited = { ...mixed, variant: { ...mixed.variant, puzzle: {
    ...mixed.variant.puzzle, rules: mixed.variant.puzzle.rules?.slice(1),
  } } }
  assert.equal(hasUniquenessProof(edited), false)
  const editedSave = readGame(edited.id, JSON.stringify(edited))
  assert.ok(editedSave)
  assert.equal(editedSave.uniquenessProof, undefined)
})

test('photo pencil marks survive import as editable progress', async () => {
  const emptyCell = STARTER.indexOf('0')
  const givenCell = [...STARTER].findIndex(digit => digit !== '0')
  const photoCandidates = Array<number>(81).fill(0)
  photoCandidates[emptyCell] = 0b101
  photoCandidates[givenCell] = 0b100
  const { game, hasProgress } = await prepareImportedPuzzle(STARTER, [], { deferRating: true, photoCandidates })
  assert.equal(hasProgress, true)
  assert.equal(game.givens, STARTER)
  assert.equal(game.position.entries, empty)
  assert.equal(game.position.corner[emptyCell], 0b101)
  assert.equal(game.position.corner[givenCell], 0)
  assert.equal(game.candidatesInitialized, true)
  const saved = readGame(game.id, JSON.stringify(game))
  assert.deepEqual(saved?.position.corner, game.position.corner)
  assert.equal(enter(game, [emptyCell], 'corner', 3).position.corner[emptyCell], 1)
})

test('failed uniqueness checks preserve the decoded grid and distinguish why play is unavailable', async ({ mock }) => {
  for (const [input, status] of [[empty, 'multiple'], [unsolvable, 'unsolvable'], ['11' + empty.slice(2), 'conflict']]) {
    let shown: string | undefined
    await assert.rejects(prepareImportedPuzzle(input, [], { onDecoded: puzzle => { shown = puzzle.givens } }),
      (error: unknown) => error instanceof PuzzleVerificationError && error.status === status)
    assert.equal(shown, input)
  }

  mock.method(Worker.prototype, 'postMessage', function (request) {
    queueMicrotask(() => this.onmessage?.({ data: { id: request.id, value: 'search-limit' } }))
  })
  await assert.rejects(prepareImportedPuzzle(STARTER, [], { signal: new AbortController().signal }),
    (error: unknown) => error instanceof PuzzleVerificationError && error.status === 'search-limit')
})

test('editing a decoded preview aborts its verification', async ({ mock }) => {
  const running = Promise.withResolvers<void>()
  mock.method(Worker.prototype, 'postMessage', () => running.resolve())
  const controller = new AbortController()
  const checking = prepareImportedPuzzle(STARTER, [], { signal: controller.signal })
  await running.promise
  controller.abort()
  await assert.rejects(checking, { name: 'AbortError' })
})
