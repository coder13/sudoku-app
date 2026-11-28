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
let renderNewPuzzle: (path: string, preference?: { variant: 'inequality'; difficulty: 'hard' }) => Promise<string>
const fixture = JSON.parse(readFileSync(new URL('./fixtures/inequality-generation.json', import.meta.url), 'utf8'))
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })

test('New Puzzle offers Easy and Medium Inequality with directed signs and actual navigation', async () => {
  assert.ok(isVariantId('inequality'))
  assert.deepEqual(variantDifficulties('inequality'), variantDifficulties('classic'))
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'inequality' }))
  assert.equal([...preview.matchAll(/class="variant-inequality"/g)].length, 1)
  assert.match(preview, /data-less="30" data-greater="31"/)
  assert.equal([...preview.matchAll(/viewBox="3 3 2 1"/g)].length, 2)
  assert.match(preview, /<text x="3.5" y="3.5">1<\/text>/)
  assert.match(preview, /<text x="4.5" y="3.5">3<\/text>/)
  const choice = await renderNewPuzzle('/puzzles/new?variant=inequality&ruleset=dutch')
  assert.match(choice, /Choose a variant/)
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=inequality/)
  assert.doesNotMatch(choice, /ruleset=dutch/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=inequality')
  assert.match(difficulty, /Choose difficulty/)
  assert.match(difficulty, /\/puzzles\/new\?variant=inequality/)
  assert.match(difficulty, /value="easy"/); assert.match(difficulty, /value="medium"/)
  assert.match(difficulty, /value="(?:tricky|hard)"/)
  assert.match(await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'inequality', difficulty: 'hard' }), /Start hard puzzle/)
})

test('completed pure Inequality offers another puzzle and the full Palindrome 14 source retains its companions', () => {
  const mixed = JSON.parse(readFileSync(new URL('./fixtures/inequality-palindrome14.json', import.meta.url), 'utf8'))
  for (const source of [fixture.example, mixed]) {
    const id = variantIdForPuzzle(source.puzzle)
    assert.ok(id !== 'classic')
    const game = { ...makeGame('inequality-complete', 'Inequality', source.puzzle.givens, 'imported'),
      variant: { id, puzzle: source.puzzle, solution: source.solution } }
    game.position.entries = [...source.solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const original = structuredClone(game.variant)
    const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium', ratingPending: false,
      shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
    if (source === fixture.example) {
      assert.equal(generationVariant(game.variant), 'inequality')
      assert.match(html, /Next medium puzzle/)
      assert.match(html, /Choose difficulty/); assert.match(html, /Choose variant/)
    } else {
      assert.equal(generationVariant(game.variant), undefined)
      assert.match(html, /Choose another puzzle/); assert.doesNotMatch(html, /Next medium puzzle/)
      assert.equal(source.puzzle.rules.length, 11)
    }
    assert.deepEqual(game.variant, original)
  }
})
