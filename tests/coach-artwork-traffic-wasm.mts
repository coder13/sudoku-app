import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { enter, restartGame, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportAttempt, prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

type Source = { sudoku_id: string; sudoku: string; name: string; description: string; solution: string }
const sources = JSON.parse(readFileSync(new URL('./fixtures/coach-artwork-traffic.json', import.meta.url), 'utf8')) as Source[]
const [windoku, khachkar, traffic, spider] = sources
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

test('Sudoku Spider retains the complete Thermometer puzzle and authored fills through every import path', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const { sudoku_id: id, sudoku, solution } = spider
  const shortLink = base + id
  const collectionLink = 'https://sudoku.coach/en/collections/halloween-2024/s/' + id
  const coachApi = 'https://sudoku.coach/beapi'
  const givens = '920080014400000006000060000000000000000000000000000000000000000000000000100000003'
  const thermometerPaths = [
    [57, 56, 55, 64, 73], [66, 75], [68, 77], [59, 60, 61, 70, 79],
    [48, 47, 46, 45, 54], [50, 51, 52, 53, 62], [32, 33, 34], [30, 29, 28],
  ]
  const shades = [
    '...grg...', '..ggmgg..', '..ggrgg..', '..ggggg..', '....g....',
    '...ggg...', '...ggg...', '....g....', '.........',
  ].join('')
  const palettes = { g: ['grey'], r: ['red'], m: ['grey', 'red'] }
  const givenCellColors = Object.fromEntries([...shades].flatMap((color, i) => color === '.' ? [] : [[i, palettes[color]]]))
  const rules = thermometerPaths.map(cells => ({ type: 'thermometer', cells }))
  const expected = { version: 1, givens, rules }
  let description = spider.description
  let sourceCode = sudoku
  const publication = () => ({ ...spider, sudoku: sourceCode, description })
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    if (path === shortLink) return Promise.resolve(new Response('<script>let mainInitData = ' +
      JSON.stringify({ specificSudoku: publication() }) + '</script>'))
    if (path === coachApi + '/get-sudoku/' + id) return Promise.resolve(Response.json(publication()))
    if (path === coachApi + '/get-collection-hierarchy') return Promise.resolve(Response.json({
      hierarchy: { id: 'collections', groups: [{ items: [
        { id: 'halloween-2024', groups: [{ items: [id] }] },
      ] }] },
    }))
    return fetcher(path, init)
  })

  try {
    const direct = await detectPuzzle(sudoku)
    assert.deepEqual(direct.variant?.puzzle, expected)
    assert.deepEqual(direct.givenCellColors, givenCellColors)
    assert.equal(direct.title, spider.name)
    for (const input of [base.replace('/s/', '/solver/') + encodeURIComponent(sudoku), shortLink, collectionLink]) {
      assert.deepEqual(await detectPuzzle(input), direct)
    }
    const preview = await prepareImportedPuzzle(shortLink)
    const { game } = preview
    assert.ok(game.variant)
    assert.equal(game.variant.solution, solution)
    assertVariantCompletion(game.variant.puzzle, solution)
    assert.deepEqual(countLineSolutions(game.variant.puzzle).solutions, [solution])
    assert.deepEqual(game.givenCellColors, givenCellColors)
    assert.equal(preview.hasProgress, undefined)
    assert.equal(game.position.importedCellColors, undefined)
    const { choices } = await puzzleHints(game)
    assert.ok(choices.length > 1)
    const selected = await puzzleHints(game, 'all', 'thermometer')
    assert.ok(selected.choices.length > 1)
    const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant))
    try {
      const actions = new Set(selected.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
      assert.equal(await scan.count('thermometer'), actions.size)
    } finally { scan.close() }
    const walkthrough = await puzzleSolution(game)
    assert.equal(walkthrough.rating.status, 'stalled')
    assert.ok(walkthrough.steps.length > 0)
    for (const [cell, digit] of [...walkthrough.board].entries()) {
      if (digit !== '0') assert.equal(digit, solution[cell])
    }
    for (const step of walkthrough.steps) for (const action of step.actions) {
      const { cell, digit } = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(solution[cell]) === digit, 'place' in action)
    }
    const moved = enter(game, [2], 'value', Number(solution[2]))
    const saved = readGame(game.id, JSON.stringify(moved))
    assert.deepEqual(saved?.givenCellColors, givenCellColors)
    assert.deepEqual(saved?.variant, game.variant)
    assert.deepEqual(saved?.position, moved.position)
    assert.deepEqual(restartGame(moved).givenCellColors, givenCellColors)
    assert.equal(findImportAttempt([{ ...game, givenCellColors: undefined }], preview), undefined)
    assert.equal(findImportAttempt([moved], preview), moved)
    const share = await publishSharedPuzzle(moved)
    const shared = await prepareSharedPuzzle(share, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, game.variant)
    assert.deepEqual(shared.game.givenCellColors, givenCellColors)
    const invalid = await fetcher('/api/v1/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...puzzleDefinitionForSharing(game), givenCellColors: { 0: ['unknown'] } }),
    })
    assert.equal(invalid.status, 400)

    const reorderedPalette = { g: '1', r: '0', m: '10', '.': '' }
    const currentState = {
      givenDigits: givens,
      colours: ['red', 'grey', 'green'],
      givenColours: [...shades].map(shade => reorderedPalette[shade]).join(','),
      givenConstraints: [{
        id: 10, type: 'thermometer', settings: {},
        segments: thermometerPaths.map(cells => ({ cells, parameters: {} })),
      }],
      userDigits: '00' + solution[2] + '0'.repeat(78),
      userCellCandidates: Array.from({ length: 81 }, (_, cell) => cell === 3 ? 1 << Number(solution[cell]) : 0).join('-'),
      userColours: Array.from({ length: 81 }, (_, cell) => cell === 12 ? '2' : '').join(','),
    }
    const progressed = await prepareImportedPuzzle(coachCode(currentState), [moved])
    assert.equal(progressed.hasProgress, true)
    assert.deepEqual(progressed.game.variant, game.variant)
    assert.deepEqual(progressed.game.givenCellColors, givenCellColors)
    assert.equal(progressed.game.position.entries[2], solution[2])
    assert.equal(progressed.game.position.center[3], 1 << (Number(solution[3]) - 1))
    assert.deepEqual(progressed.game.position.importedCellColors, { 12: ['green'] })
    assert.deepEqual(readGame(progressed.game.id, JSON.stringify(progressed.game))?.position, progressed.game.position)
    await assert.rejects(detectPuzzle(coachCode({
      ...currentState, constructorConstructionParameters: { colorRule: 'odd' },
    })), /unsupported authored markings/)

    description = 'Every red cell must be odd.'
    await assert.rejects(detectPuzzle(shortLink), /author instructions/)
    await assert.rejects(detectPuzzle(collectionLink), /author instructions/)
    description = ''
    sourceCode = coachCode({
      givenDigits: givens, colours: ['grey', 'red'], givenColours: ['1', ...Array(80).fill('')].join(','),
      givenConstraints: [{ type: 'thermometer', segments: thermometerPaths.map(cells => ({ cells, parameters: {} })) }],
    })
    await assert.rejects(detectPuzzle(sourceCode), /unsupported authored markings/)
    await assert.rejects(detectPuzzle(shortLink), /unsupported authored markings/)
  } finally {
    sqlite.close()
  }
})
