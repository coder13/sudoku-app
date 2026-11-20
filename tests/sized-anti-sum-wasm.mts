import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { runEngine } from '../src/sudoku/engine.ts'
import { applyDeduction, conflictsOf, enter, undo } from '../src/sudoku/game.ts'
import { gridCellsShareEdge, MINI_GRID, sixGridForBoxRows } from '../src/sudoku/grid.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { restoreSizedRuleGame, sizedRuleDescriptions, sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { url } = JSON.parse(readFileSync(new URL('fixtures/sized-sudokupad-anti-sum.json', import.meta.url), 'utf8'))
const answer = '4213535241514231435223514'
const alternate = '4213535241513241345224513'
const digits = '0'.repeat(25)

test('the published Anti-Sum puzzle preserves its Thermometers, exact solution, edge proofs, and share', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) =>
      fetcher(new URL(path, 'https://sudoku.test').href, options))
    const { game } = await prepareImportedPuzzle(url)
    assert.ok(game.grid?.size === 5 && game.sized)
    const { grid, sized } = game
    const rules = sized.rules
    assert.deepEqual(rules, [
      { type: 'thermometer', cells: [16, 22] }, { type: 'thermometer', cells: [11, 7, 3] },
      { type: 'anti-sum', sum: 9 },
    ])
    assert.equal(sized.solution, answer)
    assert.equal(sized.author, 'GemmaOane')
    assert.ok(sizedRuleDescriptions(grid, rules).includes('Digits in cells that share an edge cannot add to 9.'))

    const request = { type: 'sized-variant', position: sizedRulePosition(grid, sized, digits) } as const
    const withoutAntiSum = { ...request, position: { ...request.position, rules: rules.slice(0, 2) } }
    assert.equal(await runEngine({ ...withoutAntiSum, operation: 'analyze' }), 'multiple')
    assert.deepEqual(restoreSizedRuleGame({ ...sized, solution: alternate, rules: rules.slice(0, 2) }, grid, digits)?.solution, alternate)
    assert.equal(restoreSizedRuleGame({ ...sized, solution: alternate }, grid, digits), undefined)

    const candidateMasks = await playCandidates(game)
    assert.ok(candidateMasks?.every((mask, cell) => mask & (1 << (Number(answer[cell]) - 1))))
    let moved = game
    let antiSumHints = await puzzleHints(moved, 'all', 'sized-anti-sum')
    for (let step = 0; step < 10 && !antiSumHints.choices.length; step++) {
      const hints = await puzzleHints(moved)
      assert.ok(hints.candidates && hints.choices[0])
      const next = applyDeduction(moved, hints.choices[0].actions, hints.candidates)
      assert.notEqual(next, moved)
      moved = next
      antiSumHints = await puzzleHints(moved, 'all', 'sized-anti-sum')
    }
    const antiSum = antiSumHints.choices[0]
    assert.ok(antiSumHints.candidates && antiSum)
    const [first, second] = antiSum.pattern!.cells
    assert.ok(gridCellsShareEdge(first, second, 5))
    assert.match(antiSum.evidence!.variant!.description, /9/)
    const applied = applyDeduction(moved, antiSum.actions, antiSumHints.candidates)
    assert.notDeepEqual(applied.position, moved.position)
    assert.deepEqual(undo(applied).position, moved.position)
    assert.deepEqual(readGame(applied.id, JSON.stringify(applied))?.sized, sized)

    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)
    const shared = await prepareSharedPuzzle(await publishSharedPuzzle(applied), [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, grid)
    assert.deepEqual(shared.game.sized, sized)
    const invalid = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...puzzleDefinitionForSharing(game), sizedRules: [{ type: 'anti-sum', sum: 11 }] }),
    })
    assert.equal(invalid.status, 400)
  } finally {
    sqlite.close()
  }
})

test('Anti-Sum clears manual pencil marks and marks only conflicting pairs that share an edge', async () => {
  const { game } = await prepareImportedPuzzle(url)
  const { grid, sized } = game
  assert.ok(grid && sized)
  const onlyAntiSum = [sized.rules[2]]
  const marked = enter(game, [1, 5, 6], 'center', 5)
  const placed = enter(marked, [0], 'value', 4)
  assert.equal(placed.position.center[1], 0)
  assert.equal(placed.position.center[5], 0)
  assert.equal(placed.position.center[6], 1 << 4)
  assert.deepEqual(conflictsOf('45000' + '0'.repeat(20), undefined, grid, onlyAntiSum), new Set([0, 1]))
  assert.deepEqual(conflictsOf('4000005000' + '0'.repeat(15), undefined, grid, onlyAntiSum), new Set())
  assert.deepEqual(conflictsOf('0000450000' + '0'.repeat(15), undefined, grid, onlyAntiSum), new Set())
})

test('Anti-Sum uses the configured sum and grid size across boxed layouts', async () => {
  for (const grid of [MINI_GRID, sixGridForBoxRows(3)]) {
    const { size } = grid
    const digits = Array<number>(size ** 2).fill(0)
    digits[0] = size
    const rules = [{ type: 'anti-sum', sum: 2 * size - 1 }] as const
    const position = { version: 2, grid, digits, rules } as const
    const request = { type: 'sized-variant', position } as const
    const masks = await runEngine({ ...request, operation: 'candidates' })
    const bit = 1 << (size - 2)
    assert.equal(masks?.[1] & bit, 0)
    assert.equal(masks?.[size] & bit, 0)
    assert.equal(masks?.[size + 1] & bit, bit)
    digits[size] = size - 1
    assert.equal(await runEngine({ ...request, operation: 'analyze' }), 'conflict')
  }
})

test('the Anti-Sum adapter rejects active XV marks and unrecognized cages', async () => {
  const puzzleId = new URL(url).searchParams.get('puzzleid')!
  const source = JSON.parse(lzString.decompressFromBase64(puzzleId.slice('fpuzzles'.length))!)
  await assert.rejects(detectPuzzle(JSON.stringify({ ...source, xv: [{ cells: ['R1C1', 'R1C2'], value: 'V' }] })), /unsupported XV rules or cages/)
  await assert.rejects(detectPuzzle(JSON.stringify({ ...source, ruleset: source.ruleset.split('\n\n').slice(0, 2).join('\n\n') })), /unsupported XV rules or cages/)
  await assert.rejects(detectPuzzle(JSON.stringify({ ...source, cage: [{ ...source.cage[0], outlineC: '#000000' }] })), /unsupported XV rules or cages/)
})
