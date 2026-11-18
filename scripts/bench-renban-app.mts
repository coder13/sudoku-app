import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

useWasmWorker()
test('measure real Renban import, help, candidate, input and grid callers', async () => {
  const load = async (name: string) => JSON.parse(await readFile(new URL(`../tests/fixtures/renban-${name}.json`, import.meta.url), 'utf8'))
  const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
  const cases = await Promise.all(['clover','killer-clover'].map(async name => {
    const source = await load(name)
    return { name: 'renban-' + name, code: share(source.puzzle), solution: source.solution as string, complete: true }
  }))
  for (const source of (await load('coach')).examples.filter((source: { deferred?: string }) => !source.deferred)) {
    cases.push({ name: source.url.split('/').at(-1), code: source.code, solution: source.solution, complete: !source.url.endsWith('BSms') })
  }
  const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    artifact: { raw: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') },
    method: 'Preview/hints/path: 2 warmups/5 samples. Candidates/input/Board SSR: 5/20. Include caller serialization and conversions; assertions outside timing. In-process test worker transport excludes browser startup, transfers, layout and paint. p95 of five is the maximum.' }))
  async function sample<T>(name: string, run: () => Promise<T> | T, check: (value: T) => void, slow = true) {
    const warmups = slow ? 2 : 5, samples = slow ? 5 : 20, times: number[] = []
    for (let round = 0; round < warmups + samples; round++) {
      const start = performance.now(), result = await run(), elapsed = performance.now() - start
      check(result); if (round >= warmups) times.push(elapsed)
    }
    times.sort((a,b) => a-b)
    console.log(JSON.stringify({ name, medianP95: [0.5,0.95].map(q => Number(times[Math.ceil(q*samples)-1].toFixed(3))) }))
  }
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { Board } = await server.ssrLoadModule('/src/components/Board.tsx')
    for (const source of cases) {
      const { game } = await prepareImportedPuzzle(source.code), puzzle = game.variant!.puzzle
      await sample(`${source.name}: preview including rating`, () => prepareImportedPuzzle(source.code), result => assert.equal(result.game.variant!.solution, source.solution))
      await sample(`${source.name}: play candidates`, () => playCandidates(game), result => assert.equal(result?.length,81), false)
      await sample(`${source.name}: ordinary app hints`, () => puzzleHints(game,10), result => assert.ok(result.choices.length >= 1))
      console.log(JSON.stringify({ name: source.name, appHintChoices: (await puzzleHints(game,10)).choices.length }))
      await sample(`${source.name}: solution walkthrough`, () => puzzleSolution(game), result => {
        if (source.complete) assert.equal(result.board,source.solution)
        else { assert.equal(result.rating.status,'stalled'); assert.notEqual(result.board,source.solution) }
      })
      const cell = game.givens.indexOf('0'), digit = Number(source.solution[cell])
      const allCandidates = [...game.givens].map(d => d==='0'?511:0)
      const penciled = { ...game, position: { ...game.position, center: allCandidates, corner: [...allCandidates] } }
      await sample(`${source.name}: input with all candidates`, () => enter(penciled,[cell],'value',digit), result => assert.equal(result.position.entries[cell],String(digit)), false)
      await sample(`${source.name}: Board SSR`, () => renderToStaticMarkup(createElement(Board,{ variantPuzzle:puzzle,givens:game.givens,values:game.givens })), result => {
        assert.equal([...result.matchAll(/class="variant-renban"/g)].length,puzzle.rules!.filter(r=>r.type==='renban').length)
        assert.equal([...result.matchAll(/class="variant-cage-total"/g)].length,puzzle.rules!.flatMap(r=>r.type==='killer-cages'?r.cages:[]).length)
      },false)
    }
  } finally { await server.close() }
})
