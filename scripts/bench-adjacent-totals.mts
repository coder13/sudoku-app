import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResult, VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates } from '../src/sudoku/variant-play.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

useWasmWorker()
test('measure general totals through raw requests and real app callers', async () => {
  const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/adjacent-sum-coach.json', import.meta.url), 'utf8'))
  const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: 'adjacent-total', puzzle }))
  const essential: VariantPuzzle = { ...fixture.authoredControl.basePuzzle, rules: fixture.authoredControl.additionalSums.map((s: { cells: [number, number]; total: number }) => ({ type: 'adjacent-total', cells: s.cells, sum: s.total })) }
  const solution: string = fixture.authoredControl.solution
  const rules: NonNullable<VariantPuzzle['rules']>[number][] = []
  for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) if (b >= 0) rules.push({ type: 'adjacent-total', cells: [a, b], sum: Number(solution[a]) + Number(solution[b]) })
  const dense: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules }
  const cases = [{ name: 'Coach 99Eu', code: fixture.source.code, solution: fixture.solution as string },
    { name: 'Essential total', code: share(essential), solution }, { name: 'All 144 edges', code: share(dense), solution }]
  const binary = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version, raw: binary.length, gzip: gzipSync(binary).length,
    sha256: createHash('sha256').update(binary).digest('hex'), method: '5 warmups/20 samples for candidates, input and SSR; 2/5 for normalization, exact checks, ratings, hints, preview and path. Include serialization; assertions outside timing. In-process app worker transport excludes browser worker startup, transfers, layout and paint. Generation: seeds 1..20, six attempts/20k exact nodes, no warmups. Memory is committed raw-instance Wasm capacity, not RSS.' }))
  async function sample<T>(name: string, run: () => Promise<T> | T, check: (value: T) => void, slow = true) {
    const times: number[] = [], warmups = slow ? 2 : 5, samples = slow ? 5 : 20
    for (let i = 0; i < warmups + samples; i++) { const start = performance.now(), result = await run(), elapsed = performance.now() - start; check(result); if (i >= warmups) times.push(elapsed) }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * samples) - 1].toFixed(3))) }))
  }
  const appOrder = await getVariantPlayOrder()
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { Board } = await server.ssrLoadModule('/src/components/Board.tsx')
    for (const source of cases) {
      const { game } = await prepareImportedPuzzle(source.code), puzzle = game.variant!.puzzle, position = { puzzle }
      const { instance } = await WebAssembly.instantiate(binary), handle = createEngineHandler(async () => instance.exports as unknown as EngineExports)
      let id = 0
      const request = async <T extends EngineRequest>(request: T): Promise<EngineResult<T>> => { const response = await handle({ id: ++id, request }); assert.ok('value' in response, JSON.stringify(response)); return response.value as EngineResult<T> }
      const native = (await request({ type: 'techniques', variant: true })).defaultOrder
      await sample(`${source.name}: normalize`, () => request({ type: 'variant', position, operation: 'normalize' }), value => { assert.equal(value.puzzle.givens, puzzle.givens); assert.deepEqual(value.puzzle.rules, puzzle.rules) })
      await sample(`${source.name}: candidates`, () => request({ type: 'variant', position, operation: 'candidates' }), value => assert.equal(value.length, 81), false)
      await sample(`${source.name}: analyze`, () => request({ type: 'variant', position, operation: 'analyze' }), value => assert.equal(value, 'unique'))
      await sample(`${source.name}: solve`, () => request({ type: 'variant', position, operation: 'solve' }), value => assert.equal(value, source.solution))
      for (const [name, techniqueOrder] of [['native', native], ['app', appOrder]] as const) {
        const trace = await request({ type: 'variant', position, operation: 'trace', techniqueOrder })
        console.log(JSON.stringify({ name: source.name, profile: name, points: trace.rating.points, steps: trace.steps.length, status: trace.rating.status }))
        await sample(`${source.name}: ${name} rate`, () => request({ type: 'variant', position, operation: 'rate', techniqueOrder }), value => assert.deepEqual(value, trace.rating))
      }
      await sample(`${source.name}: ten raw hints`, () => request({ type: 'variant', position, operation: 'hints', techniqueOrder: appOrder, limit: 10, preferProgress: true, difficulty: 'medium' }), value => assert.ok(value.length >= 1))
      await sample(`${source.name}: exhaustive page`, () => request({ type: 'variant', position, operation: 'hints', techniqueOrder: appOrder, limit: 0xffff_ffff, collection: 111, preferProgress: true, difficulty: 'medium' }), value => assert.ok(value.available >= 1))
      await sample(`${source.name}: preview including rating`, () => prepareImportedPuzzle(source.code), value => assert.equal(value.game.variant?.solution, source.solution))
      await sample(`${source.name}: play candidates`, () => playCandidates(game), value => assert.equal(value?.length, 81), false)
      await sample(`${source.name}: ordinary app hints`, () => puzzleHints(game, 10), value => assert.ok(value.choices.length >= 1))
      console.log(JSON.stringify({ name: source.name, hintCounts: { raw: (await request({ type: 'variant', position, operation: 'hints', techniqueOrder: appOrder, limit: 10, preferProgress: true, difficulty: 'medium' })).length,
        exhaustive: (await request({ type: 'variant', position, operation: 'hints', techniqueOrder: appOrder, limit: 0xffff_ffff, collection: 111, preferProgress: true, difficulty: 'medium' })).available,
        app: (await puzzleHints(game, 10)).choices.length } }))
      await sample(`${source.name}: solution path`, () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
      const clue = puzzle.rules!.find(rule => rule.type === 'adjacent-total')!; assert.equal(clue.type, 'adjacent-total')
      const cell = clue.cells.find(cell => game.givens[cell] === '0')!, digit = Number(source.solution[cell])
      const allNotes = { ...game, position: { ...game.position, center: Array(81).fill(511), corner: Array(81).fill(511) } }
      await sample(`${source.name}: input with all candidates`, () => enter(allNotes, [cell], 'value', digit), value => assert.equal(value.position.entries[cell], String(digit)), false)
      await sample(`${source.name}: grid SSR`, () => renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: game.givens, values: game.givens })), value => assert.equal([...value.matchAll(/class="variant-total-mark"/g)].length, puzzle.rules!.filter(rule => rule.type === 'adjacent-total').length), false)
      console.log(JSON.stringify({ name: source.name, memoryBytes: (instance.exports.memory as WebAssembly.Memory).buffer.byteLength }))
    }
    const { instance } = await WebAssembly.instantiate(binary), handle = createEngineHandler(async () => instance.exports as unknown as EngineExports)
    let id = 0, matches = 0
    const times: number[] = []
    for (let seed = 1; seed <= 20; seed++) {
      const start = performance.now(), response = await handle({ id: ++id, request: { type: 'generate-variant', seed, maxAttempts: 6, maxNodes: 20_000,
        template: { version: 1, givens: '0'.repeat(81) }, givens: 30, variantClues: 20, requiredRule: 'adjacent-total',
        derivedClues: Array.from({ length: 81 }, (_, a) => a).filter(a => a % 9 < 8).slice(0, 20).map(a => ({ type: 'adjacent-total', cells: [a, a + 1] })) } })
      times.push(performance.now() - start)
      if (!('value' in response)) { assert.equal(response.code, 'search-limit'); continue }
      const output = response.value as { puzzle: VariantPuzzle; solution: string; givens: number; variantClues: number }
      assert.equal(output.givens, 30); assert.equal(output.variantClues, 20)
      const counted = countLineSolutions(output.puzzle)
      assert.equal(counted.count, 1); assert.equal(counted.solution, output.solution)
      assert.equal(countLineSolutions({ ...output.puzzle, rules: [] }).count, 2)
      matches++
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ generation: 'Twenty derived sums, thirty givens', seeds: 20, matches, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  } finally { await server.close() }
})
