import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { runEngine } from '../src/sudoku/engine.ts'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { sizedRulePosition, verifySizedRulePuzzle } from '../src/sudoku/sized-rule-game.ts'
import { sizedRuleHintChoices, sizedRuleSolutionTrace } from '../src/sudoku/sized-rule-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

const { puzzles } = JSON.parse(readFileSync(new URL('./fixtures/aspartagcus-irregular-fortress.json', import.meta.url), 'utf8'))
useWasmWorker()

for (const { url, size, regions, marked, solution } of puzzles) {
  test(`the published ${size} × ${size} Fortress import keeps its regions and Maximum rule`, async () => {
    const code = decodeURIComponent(new URL(url).pathname.slice(1))
    const imported = await detectPuzzle(code)
    assert.ok(imported.grid && 'regions' in imported.grid && imported.sizedRules)
    assert.equal(imported.grid.size, size)
    assert.deepEqual(imported.grid.regions.toSorted((a, b) => a[0] - b[0]), regions)
    assert.deepEqual(imported.sizedRules, [{
      type: 'maximum', cells: marked, ignoreMarkedNeighbors: true, shaded: true,
    }])
    assert.equal(imported.givens, '0'.repeat(size ** 2))

    const sized = await verifySizedRulePuzzle({
      grid: imported.grid, givens: imported.givens, rules: imported.sizedRules,
      author: imported.sizedAuthor, authoredSolution: imported.authoredSolution,
    })
    assert.equal(sized.solution, solution)
    assert.equal(conflictsOf(solution, undefined, imported.grid, imported.sizedRules).size, 0)
    const trace = await sizedRuleSolutionTrace(sized, imported.grid, imported.givens)
    assert.equal(trace.status, 'solved')
    assert.equal(trace.board, solution)

    const choices = await sizedRuleHintChoices(sized, imported.grid, imported.givens)
    const maximumHint = choices?.choices.find(choice => choice.technique === 'sized-maximum')
    assert.match(maximumHint?.evidence?.variant?.description ?? '', /shaded cell/)
  })
}

test('Fortress imports reject rule text and Maximum data that do not agree', async () => {
  const source = decodeURIComponent(new URL(puzzles[0].url).pathname.slice(1))
  const data = JSON.parse(lzString.decompressFromBase64(source.slice(4))!)
  const encode = (value: object) => 'fpuz' + lzString.compressToBase64(JSON.stringify(value))
  await assert.rejects(detectPuzzle(encode({ ...data, ruleset: data.ruleset + '\n- Diagonals must be odd.' })), /custom rules text/)
  await assert.rejects(detectPuzzle(encode({ ...data, maximum: [] })), /needs Maximum cells/)
  await assert.rejects(detectPuzzle(encode({ ...data, maximum: [data.maximum[0], data.maximum[0]] })), /repeats a Maximum clue/)
  data.grid[2][2].c = '#ffffff'
  await assert.rejects(detectPuzzle(encode(data)), /gray cells that do not match its Maximum clues/)
  data.grid[2][2].c = '#A8A8A8'
  data.grid[0][0].region = 2
  await assert.rejects(detectPuzzle(encode(data)), /needs three connected regions/)
})

test('the sized engine validates shaded Maximum rule data and skips marked neighbors', async () => {
  const grid = { size: 3, regions: [[0, 1, 2], [3, 6, 7], [4, 5, 8]] } as const
  const base = { version: 2 as const, grid, digits: Array(9).fill(0), rules: [] }
  const position = { ...base, rules: [{ type: 'maximum' as const, cells: [0, 1], ignoreMarkedNeighbors: true, shaded: true }] }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.ok(Array.isArray(candidates))
  assert.equal(candidates[0] & 0b001, 0)
  assert.equal(candidates[1] & 0b001, 0)
  const partial = { ...position, digits: [3, 2, 1, 1, 0, 0, 0, 0, 0] }
  assert.notEqual(await runEngine({ type: 'sized-variant', operation: 'analyze', position: partial }), 'conflict')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...partial, rules: [{ type: 'maximum', cells: [0, 1], shaded: true }],
  } }), 'conflict')
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    ...base, rules: [{ type: 'maximum', cells: [0, 0], ignoreMarkedNeighbors: true, shaded: true }],
  } }))
})

test('the sized engine verifies Anti-Knight together with authored Jigsaw regions', async () => {
  const code = readFileSync(new URL('./fixtures/sudokupad-3-pointing-knights.fpuz', import.meta.url), 'utf8').trim()
  const source = JSON.parse(lzString.decompressFromBase64(code.slice(4))!)
  delete source.arrow
  source.ruleset = 'Normal irregular 6x6 Antiknight Sudoku rules apply.'
  source.solution = Array.from('456321321654612543543216234165165432', Number)
  for (const row of source.grid) for (const [column, cell] of row.entries()) cell.region = column

  const imported = await detectPuzzle('fpuz' + lzString.compressToBase64(JSON.stringify(source)))
  assert.ok(imported.grid && 'regions' in imported.grid && imported.sizedRules)
  assert.deepEqual(imported.sizedRules, [{ type: 'anti-knight' }])
  const verified = await verifySizedRulePuzzle({
    grid: imported.grid, givens: imported.givens, rules: imported.sizedRules,
    authoredSolution: imported.authoredSolution, authoredSolutionOnly: true,
  })
  assert.equal(verified.solution, '456321321654612543543216234165165432')
})
