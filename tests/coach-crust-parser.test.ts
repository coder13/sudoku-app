import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { readReviewedCoachCrust } from '../src/sudoku/puzzle-import/coach-crust.ts'
import { isSizedGrid } from '../src/sudoku/grid.ts'
import { isSizedRuleList } from '../src/sudoku/sized-rule-game.ts'
import worker from '../cloudflare/pages/_worker.js'

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-crust.json', import.meta.url), 'utf8')) as {
  id: 'BKR7' | 'ABjn' | 'DZEy' | '9Z8C'; title: string; code: string; description: string; solution?: string
}[]
const expectedClues = {
  BKR7: ['b2:16', 'b4:13', 'b5:26', 'l0:25', 'l3:17', 'l4:16', 'l5:18', 'l7:19', 'r2:11', 'r3:15', 'r4:25', 'r5:23', 'r7:22', 't1:21', 't4:23', 't5:13', 't7:23'],
  ABjn: ['b0:5/0', 'b1:23/3', 'l0:18/1', 'l1:10/0', 'l2:10/1', 'l3:15/2', 'l4:22/3', 'r0:20/1', 'r1:18/3', 'r2:23/3', 'r3:13/1', 'r4:19/4', 't1:10/2', 't2:22/0', 't3:18/1'],
  DZEy: ['b0:16', 'b1:6', 'b2:14', 'b3:5', 'b4:9', 'b5:9', 'b6:16', 'l0:11', 'l1:6', 'l2:22', 'l3:11', 'l4:6', 'l5:4', 'l6:7', 'r0:17', 'r1:5', 'r2:5', 'r3:1', 'r4:12', 'r5:6', 'r6:3', 't0:3', 't1:2', 't2:11', 't3:8', 't4:7', 't5:9', 't6:12'],
  '9Z8C': ['b0:10/1', 'b5:16/2', 'b6:39/4', 'b7:23/1', 'b8:21/1', 'l0:29/0', 'l1:19/0', 'l2:39/4', 'l3:10/0', 'l4:42/4', 'l5:38/3', 'r0:16/0', 'r1:24/1', 'r2:20/2', 'r3:29/1', 'r4:6/1', 'r5:20/1', 'r6:40/2', 't0:35/1', 't1:2/0', 't2:9/1', 't3:3/0', 't4:10/0', 't5:15/0', 't6:18/1', 't7:30/2', 't8:23/0'],
} satisfies Record<'BKR7' | 'ABjn' | 'DZEy' | '9Z8C', string[]>

test('reviewed Crust exports parse outside totals and the Edge-Count companion layer', async () => {
  for (const fixture of fixtures) {
    const data = await decodeSudokuCoachPayload(fixture.code)
    const crust = await readReviewedCoachCrust(fixture.code, data)
    assert.ok(crust, fixture.id)
    assert.equal(crust.source, fixture.id)
    assert.equal(crust.size, fixture.id === 'BKR7' || fixture.id === '9Z8C' ? 9 : 7)
    assert.equal(crust.clues.length, fixture.id === 'BKR7' ? 17 : fixture.id === 'ABjn' ? 15 : fixture.id === '9Z8C' ? 27 : 28)
    if (fixture.id === 'BKR7') assert.equal(crust.authoredSolution, fixture.solution)
    assert.equal(new Set(crust.clues.map(clue => `${clue.side}:${clue.index}`)).size, crust.clues.length)
    assert.ok(crust.clues.every(clue => Number.isInteger(clue.total) && clue.total > 0))
    assert.deepEqual(crust.clues.map(clue => `${clue.side[0]}${clue.index}:${clue.total}${clue.crossedEdges === undefined ? '' : `/${clue.crossedEdges}`}`).sort(),
      expectedClues[fixture.id])
    if (fixture.id === 'ABjn' || fixture.id === '9Z8C') {
      assert.ok(crust.clues.every(clue => Number.isInteger(clue.crossedEdges)))
      if (fixture.id === 'ABjn') {
        assert.deepEqual(crust.clues.find(clue => clue.side === 'left' && clue.index === 0), {
          side: 'left', index: 0, total: 18, crossedEdges: 1,
        })
        assert.deepEqual(crust.clues.find(clue => clue.side === 'right' && clue.index === 0), {
          side: 'right', index: 0, total: 20, crossedEdges: 1,
        })
      } else {
        assert.deepEqual(crust.sharedRegion, [42, 72])
        assert.deepEqual(crust.fixedEdges, [[72, 73]])
        assert.equal(fixture.solution?.length, 81)
      }
    } else {
      assert.ok(crust.clues.every(clue => clue.crossedEdges === undefined))
    }
  }
})

test('Crust parsing rejects changed exports, altered source geometry, and incomplete edge counts', async () => {
  const fixture = fixtures.find(({ id }) => id === 'ABjn')!
  const data = await decodeSudokuCoachPayload(fixture.code)
  assert.equal(await readReviewedCoachCrust(`${fixture.code}0`, data), undefined)
  const changedGeometry = structuredClone(data)
  const layer = changedGeometry.givenConstraints[0] as { segments: { cells: number[][] }[] }
  layer.segments[0].cells[0][0] += 1
  assert.equal(await readReviewedCoachCrust(fixture.code, changedGeometry), undefined)
  const missingCount = structuredClone(data)
  const countLayer = missingCount.givenConstraints[1] as { segments: unknown[] }
  countLayer.segments.pop()
  assert.equal(await readReviewedCoachCrust(fixture.code, missingCount), undefined)
})

test('reviewed Crust exports become no-region sized engine imports', async () => {
  for (const fixture of fixtures) {
    const imported = await detectPuzzle(fixture.code)
    assert.equal(imported.givens.length, (fixture.id === 'BKR7' || fixture.id === '9Z8C' ? 9 : 7) ** 2)
    assert.deepEqual(imported.grid, { size: fixture.id === 'BKR7' || fixture.id === '9Z8C' ? 9 : 7, noRegions: true })
    assert.equal(imported.sizedRules?.length, 1)
    assert.equal(imported.sizedRules?.[0].type, 'crust')
    assert.ok(imported.grid && isSizedGrid(imported.grid))
    assert.ok(imported.grid && isSizedRuleList(imported.sizedRules, imported.grid))
    const rule = imported.sizedRules?.[0]
    assert.equal(rule?.type === 'crust' ? rule.clues.length : 0,
      fixture.id === 'BKR7' ? 17 : fixture.id === 'ABjn' ? 15 : fixture.id === '9Z8C' ? 27 : 28)
  }
})

test('published Crust short links import the same complete rules as their copied codes', async ({ mock }) => {
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    const fixture = fixtures.find(item => path === item.url)
    if (fixture) {
      const page = '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
        sudoku_id: fixture.id, sudoku: fixture.code, name: fixture.title, blocked: false,
        custom_constraints: true, description: fixture.description,
      } }) + '</script>'
      return Promise.resolve(new Response(page))
    }
    return typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 }))
  })

  for (const fixture of fixtures) {
    const linked = await detectPuzzle(fixture.url)
    const pasted = await detectPuzzle(fixture.code)
    assert.equal(linked.title, fixture.title)
    assert.deepEqual(linked.grid, pasted.grid, fixture.id)
    assert.deepEqual(linked.sizedRules, pasted.sizedRules, fixture.id)
  }
})
