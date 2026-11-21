import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { restartGame } from '../src/sudoku/game.ts'
import { puzzleHints } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportAttempt, prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

type Source = { sudoku_id: string; sudoku: string; name: string; description: string; solution: string }
const sources = JSON.parse(readFileSync(new URL('./fixtures/coach-artwork-traffic.json', import.meta.url), 'utf8')) as Source[]
const [windoku, khachkar, traffic] = sources
const base = 'https://sudoku.coach/en/s/'

test('both reviewed originals preserve all rules and artwork through import, play, storage and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  let extraInstruction = ''
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (!path.startsWith(base)) return fetcher(path, init)
    const source = sources.find(({ sudoku_id }) => path === base + sudoku_id)!
    return Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({
      specificSudoku: { ...source, description: source.description + extraInstruction },
    }) + '</script>'))
  })
  try {
    for (const source of [windoku, khachkar]) {
      const preview = await prepareImportedPuzzle(base + source.sudoku_id)
      const { game, hasProgress } = preview
      assert.equal(game.title, source.name)
      assert.equal(hasProgress, undefined)
      const direct = await detectPuzzle(source.sudoku)
      const { variant, authoredArtwork } = game
      assert.ok(variant && authoredArtwork)
      assert.equal(variant.solution, source.solution)
      assertVariantCompletion(variant.puzzle, source.solution)
      assert.deepEqual(direct.variant?.puzzle, variant.puzzle)
      assert.deepEqual(direct.authoredArtwork, authoredArtwork)
      assert.equal(game.position.importedDrawings, undefined)
      if (source === windoku) {
        const houses = [[1, 2, 3], [5, 6, 7], [0, 4, 8]].flatMap(rows =>
          [[1, 2, 3], [5, 6, 7], [0, 4, 8]].map(columns => rows.flatMap(row => columns.map(col => row * 9 + col)).join(',')))
        const rules = variant.puzzle.rules ?? []
        assert.ok(rules.every(rule => rule.type === 'extra-house'))
        assert.deepEqual(rules.map(rule => [...rule.cells].sort((a, b) => a - b).join(',')).sort(), houses.sort())
        const expectedBoxes = ['1,1–4,4', '1,5–4,8', '5,1–8,4', '5,5–8,8']
        assert.deepEqual(authoredArtwork.map(mark => {
          assert.equal(mark.type, 'outline')
          assert.equal(mark.thickness, .05)
          assert.equal(mark.points.length, 13)
          const xs = mark.points.map(([x]) => x), ys = mark.points.map(([, y]) => y)
          return `${Math.min(...xs)},${Math.min(...ys)}–${Math.max(...xs)},${Math.max(...ys)}`
        }).sort(), expectedBoxes)
      } else {
        assert.equal(variant.puzzle.rules?.[0].type, 'region-sum')
        assert.deepEqual(variant.puzzle.rules?.slice(1), [
          [56,65,73,63,55], [67,76,77], [61,60,51,41], [52,44,34], [7,15,25,17,8],
          [6,5,14], [27,36,37], [79,80],
        ].map(cells => ({ type: 'renban', cells })))
        assert.deepEqual(authoredArtwork, [[7.5,3.5],[7.5,5.5],[5.5,4.5],[6.5,.5],[5.5,1.5]]
          .map(center => ({ type: 'disc', center, radius: .225, color: '#2a2a2a' })))
      }
      assert.ok((await puzzleHints(game)).choices.length > 0)
      assert.deepEqual(restartGame(game).authoredArtwork, authoredArtwork)
      assert.deepEqual(readGame(game.id, JSON.stringify(game))?.authoredArtwork, authoredArtwork)
      assert.equal(findImportAttempt([{ ...game, authoredArtwork: undefined }], preview), undefined)
      const id = await publishSharedPuzzle(game)
      const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
      assert.deepEqual(shared.game.authoredArtwork, authoredArtwork)
      assert.deepEqual(shared.game.variant, variant)
      const malformed = { ...puzzleDefinitionForSharing(game), authoredArtwork: [{ type: 'disc', center: [9.5, 3.5], radius: .225, color: '#2a2a2a' }] }
      const invalidShare = await fetcher('/api/v1/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(malformed),
      })
      assert.equal(invalidShare.status, 400)
    }
    extraInstruction = '\nDigits in dark circles must be even.'
    await assert.rejects(detectPuzzle(base + khachkar.sudoku_id), /author instructions/)
    const changedDrawing = coachCode({ givenConstraints: [{
      type: 'cosmeticShape', settings: { shapeSize: 30, colour: '#2a2a2a' },
      segments: [{ cells: [[7.5,3.5]], parameters: { shape: 'circle' } }],
    }, { type: 'renban', segments: [{ cells: [0,1,2], parameters: {} }] }] })
    await assert.rejects(detectPuzzle(changedDrawing), /unsupported settings for cosmeticShape/)
  } finally {
    sqlite.close()
  }
})

test('the complete published Traffic export verifies within the import budget', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const url = base + traffic.sudoku_id
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku: traffic }) + '</script>'))
    : fetcher(path, init))
  try {
    const { game } = await prepareImportedPuzzle(url)
    assert.equal(game.title, traffic.name)
    assert.equal(game.givens, '0'.repeat(81))
    assert.equal(game.variant?.solution, traffic.solution)
    assert.deepEqual(game.variant.puzzle.rules?.map(({ type }) => type),
      ['anti-king', 'non-consecutive', ...Array(10).fill('inequality')])
    assertVariantCompletion(game.variant.puzzle, traffic.solution)
  } finally {
    sqlite.close()
  }
})
