import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResult } from '../src/sudoku/engine.ts'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run manually. The transport exercises real app callers without browser startup or paint.
useWasmWorker()
test('measure XV engine requests and complete app callers', async () => {
  const load = async (file: string) => JSON.parse(await readFile(new URL(`../tests/fixtures/${file}.json`, import.meta.url), 'utf8'))
  const sources = (await load('xv-coach')).examples.filter((source: { deferred: string[] }) => !source.deferred.length)
  const inputs = []
  for (const file of ['xv-clover', 'xv-quadruple-clover']) {
    const fixture = await load(file)
    inputs.push({ name: file, code: '#variant=' + encodeURIComponent(JSON.stringify({ id: file === 'xv-clover' ? 'xv' : 'mixed', puzzle: fixture.puzzle })), solution: fixture.solution })
  }
  inputs.push(...sources.map((source: { url: string; code: string; solution: string }) => ({ name: source.url.split('/').pop(), ...source })))
  const binary = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version, raw: binary.length, gzip: gzipSync(binary).length,
    engine: createHash('sha256').update(binary).digest('hex'), method: '5 warmups/20 samples for candidates, exact checks, entry and SSR; 2/5 for ratings, hints, exhaustive pages, preview and solution. Timed calls include serialization. Assertions are outside timing. App uses in-process Wasm worker transport; excludes browser worker startup, transfers, layout and paint. Memory is committed raw-engine Wasm memory, not browser heap.' }))
  async function sample<T>(name: string, run: () => Promise<T> | T, check: (value: T) => void, slow = false) {
    const times: number[] = [], warmups = slow ? 2 : 5, samples = slow ? 5 : 20
    for (let round = 0; round < warmups + samples; round++) {
      const start = performance.now(), result = await run(), elapsed = performance.now() - start
      check(result)
      if (round >= warmups) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  }
  const techniqueOrder = await getVariantPlayOrder()
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { Board } = await server.ssrLoadModule('/src/components/Board.tsx')
    for (const source of inputs) {
      const { game } = await prepareImportedPuzzle(source.code)
      const puzzle = game.variant!.puzzle
      const { instance } = await WebAssembly.instantiate(binary)
      const handle = createEngineHandler(async () => instance.exports as unknown as EngineExports)
      let id = 0
      const request = async <T extends EngineRequest>(request: T): Promise<EngineResult<T>> => {
        const response = await handle({ id: ++id, request })
        assert.ok('value' in response, JSON.stringify(response))
        return response.value as EngineResult<T>
      }
      const points = [4538, 1870, 940, 3186, 27358, 160][inputs.indexOf(source)]
      const position = { puzzle }
      await sample(`${source.name}: candidates`, () => request({ type: 'variant', operation: 'candidates', position }), masks => assert.equal(masks.length, 81))
      await sample(`${source.name}: analyze`, () => request({ type: 'variant', operation: 'analyze', position }), result => assert.equal(result, 'unique'))
      await sample(`${source.name}: solve`, () => request({ type: 'variant', operation: 'solve', position }), result => assert.equal(result, source.solution))
      await sample(`${source.name}: rate`, () => request({ type: 'variant', operation: 'rate', position, techniqueOrder }), result => assert.equal(result.points, points), true)
      await sample(`${source.name}: hints`, () => request({ type: 'variant', operation: 'hints', position, techniqueOrder, limit: 10 }), result => assert.ok(result.length > 1), true)
      await sample(`${source.name}: exhaustive`, () => request({ type: 'variant', operation: 'hints', position, techniqueOrder, limit: 0xffff_ffff, collection: 111 }), result => assert.ok(result.available > 1), true)
      await sample(`${source.name}: import preview including rating`, () => prepareImportedPuzzle(source.code), result => assert.equal(result.game.variant?.solution, source.solution), true)
      await sample(`${source.name}: play candidates`, () => playCandidates(game), masks => {
        assert.ok(masks); masks.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)) })
      })
      await sample(`${source.name}: ordinary app hints`, () => puzzleHints(game, 10), result => assert.ok(result.choices.length > 1), true)
      await sample(`${source.name}: solution path`, () => puzzleSolution(game), result => {
        assert.equal(result.board.length, 81); assert.equal(result.rating.score.points, points)
      }, true)
      const cell = game.givens.indexOf('0'), notes = { ...game, position: { ...game.position, center: Array(81).fill(511), corner: Array(81).fill(511) } }
      await sample(`${source.name}: entry with all notes`, () => enter(notes, [cell], 'value', Number(source.solution[cell])), result => assert.equal(result.position.entries[cell], source.solution[cell]))
      const marks = puzzle.rules!.reduce((n, rule) => n + (rule.type === 'xv' ? (rule.five?.pairs?.length ?? 0) + (rule.ten?.pairs?.length ?? 0) : 0), 0)
      await sample(`${source.name}: board SSR`, () => renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: game.givens, values: game.givens })), html => assert.equal([...html.matchAll(/class="variant-xv-mark"/g)].length, marks))
      console.log(JSON.stringify({ name: source.name, memoryBytes: (instance.exports.memory as WebAssembly.Memory).buffer.byteLength }))
    }
  } finally { await server.close() }
})
