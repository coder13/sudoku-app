import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { type VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates } from '../src/sudoku/variant-play.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'
const wasmPath = process.env.SUDOKU_BENCH_WASM
useWasmWorker(wasmPath)
const family = process.env.SUDOKU_BENCH_FAMILY ?? 'entropic'
assert.ok(['entropic', 'global-entropy', 'modular', 'between'].includes(family), 'Choose entropic, global-entropy, modular or between')
const variantClues = family === 'entropic' ? 8 : family === 'modular' ? 12 : family === 'between' ? 8 : 0

test(`measure ${family} engine requests, actual app callers and fixed-template generation`, async () => {
  const load = async (name: string) =>
    JSON.parse(
      await readFile(new URL(`../tests/fixtures/${family}-${name}.json`, import.meta.url), 'utf8')
    )
  const base = await load(family === 'entropic' ? 'clover' : 'newman'),
    share = (puzzle: VariantPuzzle) =>
      '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
  const cases = [
    { name: family === 'entropic' ? 'clover' : 'newman', code: share(base.puzzle), solution: base.solution, complete: true },
    ...(await load('coach')).examples
      .filter((s: { puzzle?: VariantPuzzle }) => s.puzzle)
      .map((s: { url: string; code: string; solution: string }) => ({
        name: s.url.split('/').at(-1),
        code: s.code,
        solution: s.solution,
        complete: !(family === 'entropic' ? ['Hyk5', 'Hafj'] : family === 'modular' ? ['HCHW'] : ['A2s7', 'CJhv', '9KxH']).some((id) => s.url.endsWith(id)),
      })),
  ]
  const bytes = await readFile(wasmPath ?? new URL('../src/sudoku/generated/engine.wasm', import.meta.url)),
    { instance } = await WebAssembly.instantiate(bytes)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  const request = async (request: unknown) => {
    const result = await handle({ id: ++id, request })
    assert.ok('value' in result, JSON.stringify(result))
    return result.value
  }
  console.log(
    JSON.stringify({
      host: `${process.platform} ${process.arch}`,
      node: process.version,
      artifact: {
        raw: bytes.length,
        gzip: gzipSync(bytes).length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      method:
        'Candidates/input/SSR/native/exact: 5 warmups/20 samples. App rate/preview/hints/walkthrough: 2/5. Include request serialization and caller conversions. Assertions outside timing. In-process worker excludes startup, transfer, layout and paint. p95 of five is the maximum.',
    })
  )
  const summary = (times: number[]) =>
    [0.5, 0.95].map((q) =>
      Number(times.toSorted((a, b) => a - b)[Math.ceil(q * times.length) - 1].toFixed(3))
    )
  async function sample<T>(
    name: string,
    run: () => Promise<T> | T,
    check: (value: T) => void,
    slow = false
  ) {
    const warmups = slow ? 2 : 5,
      samples = slow ? 5 : 20,
      times: number[] = []
    for (let round = 0; round < warmups + samples; round++) {
      const start = performance.now(),
        result = await run(),
        elapsed = performance.now() - start
      check(result)
      if (round >= warmups) times.push(elapsed)
    }
    console.log(JSON.stringify({ name, medianP95: summary(times) }))
  }
  const server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { Board } = await server.ssrLoadModule('/src/components/Board.tsx'),
      nativeOrder = (await request({ type: 'techniques', variant: true })).defaultOrder,
      appOrder = await getVariantPlayOrder()
    for (const source of cases) {
      const { game } = await prepareImportedPuzzle(source.code),
        puzzle = game.variant!.puzzle,
        position = { puzzle }
      const gold = await request({
        type: 'variant',
        operation: 'rate',
        position,
        techniqueOrder: appOrder,
      })
      for (const operation of [
        'candidates',
        'analyze',
        'solve',
        'native-rate',
        'app-rate',
        'ten-hints',
        'exhaustive',
      ]) {
        const message = {
          type: 'variant',
          position,
          operation: operation.endsWith('rate')
            ? 'rate'
            : ['ten-hints', 'exhaustive'].includes(operation)
              ? 'hints'
              : operation,
          ...(operation.endsWith('rate') ||
          operation.includes('hints') ||
          operation === 'exhaustive'
            ? { techniqueOrder: operation === 'native-rate' ? nativeOrder : appOrder }
            : {}),
          ...(operation === 'ten-hints'
            ? { limit: 10, preferProgress: true, difficulty: 'medium' }
            : {}),
          ...(operation === 'exhaustive'
            ? { limit: 0xffff_ffff, collection: 158, preferProgress: true, difficulty: 'medium' }
            : {}),
        }
        const expected = await request(message)
        if (operation === 'analyze') assert.equal(expected, 'unique')
        if (operation === 'solve') assert.equal(expected, source.solution)
        await sample(
          `${source.name}: raw ${operation}`,
          () => request(message),
          (value) => assert.deepEqual(value, expected),
          ['app-rate', 'exhaustive'].includes(operation)
        )
        if (operation === 'ten-hints' || operation === 'exhaustive')
          console.log(
            JSON.stringify({
              name: source.name,
              operation,
              choices: operation === 'exhaustive' ? expected.available : expected.length,
            })
          )
      }
      await sample(
        `${source.name}: preview including rating`,
        () => prepareImportedPuzzle(source.code),
        (result) => assert.equal(result.game.variant!.solution, source.solution),
        true
      )
      await sample(
        `${source.name}: play candidates`,
        () => playCandidates(game),
        (result) => assert.equal(result?.length, 81)
      )
      await sample(
        `${source.name}: ordinary app hints`,
        () => puzzleHints(game, 10),
        (result) => assert.ok(result.choices.length > 1),
        true
      )
      await sample(
        `${source.name}: solution walkthrough`,
        () => puzzleSolution(game),
        (result) => {
          assert.equal(result.rating.score.points, gold.points)
          assert.deepEqual(result.rating.score.counts, gold.counts)
          assert.equal(result.rating.score.hardest, gold.hardest)
          assert.deepEqual(result.rating.status, gold.status)
          assert.equal(result.rating.scoringVersion, gold.scoringVersion)
          assert.deepEqual(result.rating.techniqueOrder, gold.techniqueOrder)
          if (source.complete) assert.equal(result.board, source.solution)
          else {
            assert.equal(result.rating.status, 'stalled')
            assert.notEqual(result.board, source.solution)
          }
        },
        true
      )
      const cell = game.givens.indexOf('0'),
        candidates = [...game.givens].map((d) => (d === '0' ? 511 : 0)),
        penciled = {
          ...game,
          position: { ...game.position, center: candidates, corner: [...candidates] },
        }
      await sample(
        `${source.name}: input with all candidates`,
        () => enter(penciled, [cell], 'value', Number(source.solution[cell])),
        (result) => assert.equal(result.position.entries[cell], source.solution[cell])
      )
      await sample(
        `${source.name}: Board SSR`,
        () =>
          renderToStaticMarkup(
            createElement(Board, {
              variantPuzzle: puzzle,
              givens: game.givens,
              values: game.givens,
            })
          ),
        (result) => {
          assert.equal(
            [...result.matchAll(/class="variant-entropic"/g)].length,
            puzzle.rules!.filter((r) => r.type === 'entropic').length
          )
          if (family === 'between') assert.equal([...result.matchAll(/class="variant-between-endpoints"/g)].length, puzzle.rules!.filter(rule => rule.type === 'between').length)
          if (family === 'modular') assert.equal([...result.matchAll(/class="variant-modular"/g)].length, puzzle.rules!.filter(rule => rule.type === 'modular').length)
          if (family === 'global-entropy') assert.match(result, /Global Entropy: every 2 × 2 area/)
        }
      )
      console.log(
        JSON.stringify({
          name: source.name,
          rating: { points: gold.points, status: gold.status, scoringVersion: gold.scoringVersion },
          memoryBytes: instance.exports.memory.buffer.byteLength,
          appHintChoices: (await puzzleHints(game, 10)).choices.length,
        })
      )
    }
    const template = { ...base.puzzle, givens: '0'.repeat(81) },
      times: number[] = [],
      failedSeeds: number[] = [],
      distinct = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) {
      const message = {
          type: 'generate-variant',
          seed,
          maxAttempts: 6,
          maxNodes: 20_000,
          template,
          givens: 30,
          variantClues,
          requiredRule: family,
        },
        start = performance.now(),
        result = await handle({ id: ++id, request: message })
      times.push(performance.now() - start)
      const repeat = await handle({ id: ++id, request: message })
      assert.deepEqual({ ...repeat, id: 0 }, { ...result, id: 0 })
      if (!('value' in result)) {
        assert.equal(result.code, 'search-limit')
        failedSeeds.push(seed)
        continue
      }
      const generated = result.value
      assert.equal(generated.givens, 30)
      assert.equal(generated.variantClues, variantClues)
      assert.deepEqual(generated.puzzle.rules, template.rules)
      const counted = countLineSolutions(generated.puzzle)
      assert.equal(counted.count, 1)
      assert.equal(counted.solution, generated.solution)
      assert.equal(countLineSolutions({ ...generated.puzzle, rules: generated.puzzle.rules!.filter(rule => rule.type !== family) }).count, 2)
      distinct.add(JSON.stringify(generated.puzzle))
    }
    console.log(
      JSON.stringify({
        generation: family,
        seeds: 20,
        successes: 20 - failedSeeds.length,
        failedSeeds,
        distinctPuzzles: distinct.size,
        medianP95: summary(times),
        method:
          'No warmups. Six attempts and 20,000 nodes per exact check. Deterministic repeat, independent uniqueness/dependence and assertions outside timing.',
      })
    )
    if (family === 'between') for (const difficulty of ['easy', 'medium'] as const) {
      await sample(`New Puzzle ${difficulty}: fresh seed and bounded fallback`,
        () => generatePlayableVariant('between', difficulty, 2, []),
        (generated) => {
          assert.deepEqual(generated.rating.status, { solved: difficulty })
          const counted = countLineSolutions(generated.puzzle)
          assert.equal(counted.count, 1)
          assert.equal(counted.solution, generated.solution)
          assert.equal(countLineSolutions({ ...generated.puzzle, rules: generated.puzzle.rules!.filter(rule => rule.type !== 'between') }).count, 2)
        }, true)
    }
  } finally {
    await server.close()
  }
})
