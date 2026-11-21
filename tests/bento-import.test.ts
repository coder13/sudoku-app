import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { candidateId, makeChainGraph } from '../src/sudoku/chains.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, createGameId, makeGame, peer } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { selectedNakedSubset } from '../src/sudoku/subsets.ts'
import { syncRequest } from '../src/sudoku/sync-engine.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { syncDatabase } from './helpers/sync-database.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-bento.json', import.meta.url), 'utf8'))
const empty = '0'.repeat(81)

test('unmarked Bento cells have row and column peers while marked regions also support chains', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty,
    regions: { type: 'partial', regions: [[0, 1, 2, 9, 10, 11, 18, 19, 20]] },
    rules: [{ type: 'quadruple', topLeft: 30, digits: [2, 2] }],
  }
  assert.equal(peer(30, 40, puzzle), false)
  assert.equal(peer(0, 10, puzzle), true)

  const values = [...empty]
  values[30] = values[40] = '2'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
  values[0] = values[10] = '3'
  assert.deepEqual(conflictsOf(values.join(''), puzzle), new Set([0, 10]))

  const masks = Array(81).fill(0)
  for (const cell of [0, 10, 30, 40]) masks[cell] = 3
  const node = (cell: number) => candidateId({ cell, digit: 2 })
  const graph = makeChainGraph(masks, puzzle)
  assert.equal(graph.strength(node(0), node(10)), 'strong')
  assert.equal(graph.strength(node(30), node(40)), undefined)
  assert.equal(selectedNakedSubset([30, 40], masks, undefined, puzzle), null)
})

test('Bento shared links retain the authored dividers and partial regions', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    for (const source of sources) {
      const { givens, variant, authoredArtwork } = await detectPuzzle(source.coach)
      assert.ok(variant && authoredArtwork)
      const puzzle = variant.puzzle
      assert.equal(puzzle.regions?.type, 'partial')
      assert.equal(puzzle.regions.regions.length, source.regionCount)
      assert.match(variantRuleDescriptions(puzzle).join(' '), /Each marked region also contains/)
      const game = { ...makeGame(createGameId(), source.title, givens, 'imported'),
        variant: { ...variant, solution: source.solution }, authoredArtwork }
      const definition = puzzleDefinitionForSharing(game)
      const { id } = await api<{ id: string }>('shares', 'POST', definition)
      assert.deepEqual(await api(`shares/${id}`), JSON.parse(JSON.stringify(definition)))
      const invalid = [{ ...definition, variant: { ...definition.variant, puzzle: { ...puzzle,
        regions: { type: 'partial', regions: [puzzle.regions.regions[0], puzzle.regions.regions[0]] },
      } } }, { ...definition, authoredArtwork: [{ type: 'divider', thickness: .05, points: [[0, 0], [1, 1]] }] }]
      for (const value of invalid) await assert.rejects(api('shares', 'POST', value), { status: 400 })
    }
  } finally { sqlite.close() }
})
