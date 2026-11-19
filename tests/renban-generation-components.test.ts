import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { makeGame } from '../src/sudoku/game.ts'
import { generationVariant, isVariantId, variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'

type Component = (props: Record<string, unknown>) => ReactNode
let server: ViteDevServer, VariantPreview: Component, CompletedPuzzle: Component
let renderNewPuzzle: (path: string, preference?: { variant: 'renban'; difficulty: 'easy' }) => Promise<string>
const fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-generation.json', import.meta.url), 'utf8'))
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })

test('New Puzzle offers calibrated Medium Renban with complete preview sets and actual navigation', async () => {
  assert.ok(isVariantId('renban'))
  assert.deepEqual(variantDifficulties('renban'), ['medium'])
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'renban' }))
  const paths = [...preview.matchAll(/class="variant-renban"[^>]*><polyline points="([^"]+)"/g)].map(match => match[1])
  const source = fixture.sources.find((item: { id: string }) => item.id === 'clover')
  assert.deepEqual(paths, [source.lines[0], source.lines[3]].map((cells: number[]) =>
    cells.map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ')))
  const choice = await renderNewPuzzle('/puzzles/new?variant=renban&ruleset=dutch')
  assert.match(choice, /Choose a variant/)
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=renban/)
  assert.doesNotMatch(choice, /ruleset=dutch/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=renban')
  assert.match(difficulty, /Choose difficulty/)
  assert.match(difficulty, /\/puzzles\/new\?variant=renban/)
  assert.match(difficulty, /value="medium"/)
  assert.doesNotMatch(difficulty, /value="(?:easy|hard)"/)
  assert.match(await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'renban', difficulty: 'easy' }), /Start medium puzzle/)
})

test('completed pure Renban offers another puzzle while the complete Killer source retains all companions', () => {
  const mixed = JSON.parse(readFileSync(new URL('./fixtures/renban-killer-clover.json', import.meta.url), 'utf8'))
  for (const source of [fixture.example, mixed]) {
    const id = variantIdForPuzzle(source.puzzle)
    assert.ok(id !== 'classic')
    const game = { ...makeGame('renban-complete', 'Renban', source.puzzle.givens, 'imported'), variant: { id, puzzle: source.puzzle, solution: source.solution } }
    game.position.entries = [...source.solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const original = structuredClone(game.variant)
    const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium', ratingPending: false,
      shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
    if (source === fixture.example) {
      assert.equal(generationVariant(game.variant), 'renban')
      assert.match(html, /Next medium puzzle/)
      assert.match(html, /Choose difficulty/)
      assert.match(html, /Choose variant/)
    } else {
      assert.equal(generationVariant(game.variant), undefined)
      assert.match(html, /Choose another puzzle/)
      assert.doesNotMatch(html, /Next medium puzzle/)
    }
    assert.deepEqual(game.variant, original)
  }
})
