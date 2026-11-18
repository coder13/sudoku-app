import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run manually with node --experimental-strip-types --test scripts/bench-inequality-app.mts.
// This uses the real app callers with the test transport, not browser workers.
useWasmWorker()
test('measure the published inequality import and app callers', async () => {
  const source = JSON.parse(await readFile(new URL('../tests/fixtures/palindrome-coach.json', import.meta.url), 'utf8')).examples[1]
  const binary = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    engine: createHash('sha256').update(binary).digest('hex'),
    method: 'In-process Wasm transport through real app callers. Excludes browser worker startup, transfers, layout and paint. Preview: 2 warmups/5 samples; other callers: 5/20. SSR starts after module loading. Assertions outside timing.' }))
  async function sample<T>(name: string, run: () => Promise<T> | T, check: (value: T) => void, warmups = 5, samples = 20) {
    const times: number[] = []
    for (let round = 0; round < warmups + samples; round++) {
      const start = performance.now(), result = await run(), elapsed = performance.now() - start
      check(result)
      if (round >= warmups) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  }
  const { game } = await prepareImportedPuzzle(source.code)
  await sample('preview', () => prepareImportedPuzzle(source.code), result => {
    assert.equal(result.game.variant?.solution, source.solution)
    assert.equal(result.game.variant?.puzzle.rules?.length, 11)
  }, 2, 5)
  await sample('play candidates', () => playCandidates(game), masks => {
    assert.ok(masks)
    masks.forEach((mask, cell) => assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)))
  })
  await sample('ten hints', () => puzzleHints(game, 10), result => assert.equal(result.choices.length, 7))
  await sample('solution walkthrough', () => puzzleSolution(game), result => {
    assert.equal(result.rating.status, 'stalled'); assert.equal(result.steps.length, 9)
  })
  const notes = { ...game, position: { ...game.position, center: Array(81).fill(511), corner: Array(81).fill(511) } }
  await sample('entry with all notes', () => enter(notes, [0], 'value', Number(source.solution[0])), result => {
    assert.equal(result.position.entries[0], source.solution[0])
  })
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { Board } = await server.ssrLoadModule('/src/components/Board.tsx')
    await sample('board SSR', () => renderToStaticMarkup(createElement(Board, {
      variantPuzzle: game.variant!.puzzle, givens: game.givens, values: game.givens,
    })), html => assert.equal([...html.matchAll(/class="variant-inequality"/g)].length, 7))
  } finally { await server.close() }
})
