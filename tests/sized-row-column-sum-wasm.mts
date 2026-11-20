import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { applyDeduction, conflictsOf, puzzleIdentity } from '../src/sudoku/game.ts'
import { MINI_GRID, rowColumnSumTotal } from '../src/sudoku/grid.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { restoreSizedRuleGame, sizedRuleDescriptions, sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { url } = JSON.parse(readFileSync(new URL('fixtures/sized-sudokupad-row-column-sum.json', import.meta.url), 'utf8'))
const answer = '3521441532243511342552143'
const alternate = '3521441523243511243553142'

test('the original Too Many Sums import needs both rules and an unmarked qualifying edge', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) =>
      fetcher(new URL(path, 'https://sudoku.test').href, options))
    const { game } = await prepareImportedPuzzle(url)
    assert.ok(game.grid?.size === 5 && game.sized)
    const { grid, sized } = game
    assert.deepEqual(sized.rules, [
      { type: 'row-column-sum', pairs: [[23, 22]], requireUnmarked: true },
      { type: 'anti-sum', sum: 9 },
    ])
    assert.equal(sized.solution, answer)
    assert.equal(sized.author, 'GemmaOane')
    assert.ok(sizedRuleDescriptions(grid, sized.rules).some(text => text.startsWith('At least one edge without a diamond')))
    const diamond = sized.rules[0]
    assert.equal(diamond.type, 'row-column-sum')
    const optional = { ...diamond, requireUnmarked: false }
    const position = sizedRulePosition(grid, sized, game.givens)
    const request = { type: 'sized-variant', operation: 'analyze' } as const
    assert.equal(await runEngine({ ...request, position: { ...position, rules: [optional, sized.rules[1]] } }), 'multiple')
    assert.equal(await runEngine({ ...request, position: { ...position, rules: [diamond] } }), 'multiple')
    assert.equal(restoreSizedRuleGame({ ...sized, solution: alternate }, grid, game.givens), undefined)
    assert.ok(restoreSizedRuleGame({ ...sized, solution: alternate, rules: [optional, sized.rules[1]] }, grid, game.givens))
    assert.equal(puzzleIdentity({ ...game, sized: { ...sized, rules: [{ ...diamond, pairs: [[22, 23]] }, sized.rules[1]] } }), puzzleIdentity(game))

    const masks = await playCandidates(game)
    assert.ok(masks?.every((mask, cell) => game.givens[cell] !== '0' || mask & (1 << (Number(answer[cell]) - 1))))
    const hints = await puzzleHints(game, 'all', 'sized-row-column-sum')
    assert.ok(hints.choices[0] && hints.candidates)
    assert.deepEqual(hints.choices[0].pattern?.cells, [22, 23])
    assert.match(hints.choices[0].evidence?.variant?.description ?? '', /row number 5/)
    const moved = applyDeduction(game, hints.choices[0].actions, hints.candidates)
    assert.notDeepEqual(moved.position, game.position)
    assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.sized, sized)

    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)
    const shared = await prepareSharedPuzzle(await publishSharedPuzzle(moved), [], new AbortController().signal)
    assert.deepEqual(shared.game.sized, sized)
    const invalid = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...puzzleDefinitionForSharing(game), sizedRules: [{ ...diamond, pairs: [[22, 23], [23, 22]] }] }),
    })
    assert.equal(invalid.status, 400)
  } finally {
    sqlite.close()
  }
})

test('horizontal and vertical diamonds use their own axis on a boxed grid', async () => {
  const grid = MINI_GRID
  const pairs = [[13, 12], [6, 2]] as const
  assert.deepEqual(pairs.map(pair => rowColumnSumTotal(pair, grid.size)), [4, 3])
  const rules = [{ type: 'row-column-sum', pairs }] as const
  const position = { version: 2, grid, rules, digits: Array(16).fill(0) } as const
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.deepEqual(pairs.flat().map(cell => masks?.[cell]), [5, 5, 3, 3])
  assert.deepEqual(conflictsOf('0010003000000000', undefined, grid, rules), new Set([2, 6]))
})

test('the last possible unmarked edge supports an exact candidate elimination', async () => {
  const rules = [{ type: 'row-column-sum', pairs: [], requireUnmarked: true }] as const
  const position = { version: 2, grid: MINI_GRID, rules, digits: Array.from('0243431200343421', Number) } as const
  const result = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 20 })
  const proof = result?.choices.find(step => step.type === 'row-column-sum')
  assert.deepEqual(proof, {
    type: 'row-column-sum', rule: 0, cells: [8, 9], unmarked: true,
    actions: [{ eliminate: { cell: 8, digit: 1 } }],
  })
  const allPrinted = { ...position, rules: [...rules, { type: 'row-column-sum', pairs: [[8, 9]] }] } as const
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: allPrinted }), 'unsolvable')
  assert.equal(restoreSizedRuleGame({ rules: allPrinted.rules, solution: '1243431221343421' }, MINI_GRID, '0243431200343421'), undefined)
})
