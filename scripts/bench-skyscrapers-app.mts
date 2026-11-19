import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates } from '../src/sudoku/variant-play.ts'
import type { EngineRequest, VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { assertVariantCompletion } from '../tests/helpers/variant-truth.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run in isolation: node --experimental-strip-types --test scripts/bench-skyscrapers-app.mts.
// Uses real app callers with an in-process test transport. Assertions are outside timing.
useWasmWorker()
test('measure complete Skyscrapers sources, actual app callers and Hard generation', async () => {
  const bytes = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(
    JSON.stringify({
      host: `${process.platform} ${process.arch}`,
      node: process.version,
      engine: createHash('sha256').update(bytes).digest('hex'),
      rawBytes: bytes.byteLength,
      method:
        'Fast operations: 5 warmups/20 samples; app rating, hints, preview and walkthrough: 2/5. In-process worker excludes startup, transfer, browser layout and paint. SSR excludes module loading. Exhaustive requests select Skyscrapers only. Retained Wasm capacity is not peak usage.',
    }),
  )
  async function sample<T>(
    name: string,
    run: () => T | Promise<T>,
    check: (result: T) => void,
    warmups = 5,
    samples = 20,
  ) {
    const times: number[] = []
    for (let i = 0; i < warmups + samples; i++) {
      const start = performance.now(),
        result = await run(),
        elapsed = performance.now() - start
      check(result)
      if (i >= warmups) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(
      JSON.stringify({
        name,
        medianP95: [0.5, 0.95].map((q) => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))),
      }),
    )
  }
  const order = await getVariantPlayOrder()
  const server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { Board } = (await server.ssrLoadModule(
      '/src/components/Board.tsx',
    )) as typeof import('../src/components/Board.tsx')
    for (const name of ['murphy', 'clover', 'bulten', 'mixed', 'jigsaw-mixed']) {
      const source = JSON.parse(
        readFileSync(new URL('../tests/fixtures/skyscrapers-' + name + '.json', import.meta.url), 'utf8'),
      ) as { puzzle: VariantPuzzle; solution: string }
      const position = { puzzle: source.puzzle },
        share =
          '#variant=' +
          encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
      const { instance } = await WebAssembly.instantiate(bytes),
        exports = instance.exports as unknown as EngineExports
      const handle = createEngineHandler(async () => exports)
      let id = 0
      async function raw(request: EngineRequest) {
        const response = await handle({ id: ++id, request })
        if ('error' in response) throw new Error(JSON.stringify(response.error))
        return response.value
      }
      for (const operation of ['candidates', 'analyze', 'solve', 'rate'] as const) {
        await sample(
          name + ': raw ' + operation,
          () => raw({ type: 'variant', operation, position }),
          (value) => {
            if (operation === 'solve') assert.equal(value, source.solution)
            if (operation === 'analyze') assert.equal(value, 'unique')
            if (operation === 'candidates') assert.equal((value as number[]).length, 81)
          },
        )
      }
      await sample(
        name + ': raw app-rate',
        () => raw({ type: 'variant', operation: 'rate', position, techniqueOrder: order }),
        (value) => assert.ok(value),
        2,
        5,
      )
      for (const limit of [10, 0xffff_ffff])
        await sample(
          name + ': raw ' + (limit === 10 ? 'ten hints' : 'selected exhaustive hints'),
          () =>
            raw({
              type: 'variant',
              operation: 'hints',
              position,
              techniqueOrder: limit === 10 ? order : ['skyscrapers'],
              limit,
              difficulty: 'hard',
            }),
          (value) => assert.ok(Array.isArray(value)),
          2,
          5,
        )
      const { game } = await prepareImportedPuzzle(share)
      await sample(
        name + ': preview',
        () => prepareImportedPuzzle(share),
        (result) => assert.equal(result.game.variant?.solution, source.solution),
        2,
        5,
      )
      await sample(
        name + ': play candidates',
        () => playCandidates(game),
        (masks) => assert.equal(masks?.length, 81),
      )
      let choices = 0
      await sample(
        name + ': ordinary hints',
        () => puzzleHints(game),
        (result) => {
          choices = result.choices.length
          assert.ok(choices > 1)
        },
        2,
        5,
      )
      await sample(
        name + ': walkthrough',
        () => puzzleSolution(game),
        (result) => assert.equal(result.board, source.solution),
        2,
        5,
      )
      const notes = {
          ...game,
          position: { ...game.position, center: Array<number>(81).fill(511), corner: Array<number>(81).fill(511) },
        },
        cell = game.givens.indexOf('0')
      await sample(
        name + ': input with all candidates',
        () => enter(notes, [cell], 'value', Number(source.solution[cell])),
        (result) => assert.equal(result.position.entries[cell], source.solution[cell]),
      )
      await sample(
        name + ': Board SSR',
        () =>
          renderToStaticMarkup(
            createElement(Board, {
              variantPuzzle: source.puzzle,
              givens: source.puzzle.givens,
              values: source.puzzle.givens,
              showGuides: true,
            }),
          ),
        (html) => assert.ok(html.includes('data-outside-clue="skyscrapers"')),
      )
      console.log(JSON.stringify({ name, choices, retainedBytes: exports.memory.buffer.byteLength }))
    }
    const source = JSON.parse(
      readFileSync(new URL('../tests/fixtures/skyscrapers-murphy.json', import.meta.url), 'utf8'),
    ) as { puzzle: VariantPuzzle; solution: string }
    const { instance } = await WebAssembly.instantiate(bytes),
      handle = createEngineHandler(async () => instance.exports as unknown as EngineExports)
    let id = 0,
      seed = 0
    const distinct = new Set<string>()
    await sample(
      'fixed-template Hard generation',
      async () => {
        const response = await handle({
          id: ++id,
          request: {
            type: 'generate-variant',
            seed: ++seed,
            maxAttempts: 6,
            maxNodes: 20_000,
            template: { ...source.puzzle, givens: source.solution },
            givens: [0, 30],
            requiredRule: 'skyscrapers',
            difficulty: 'hard',
            techniqueOrder: order,
          },
        })
        if ('error' in response) throw new Error(JSON.stringify(response.error))
        return response.value as { puzzle: VariantPuzzle; solution: string; rating: { status: unknown } }
      },
      (result) => {
        assert.deepEqual(result.rating.status, { solved: 'hard' })
        const counted = countLineSolutions(result.puzzle)
        assert.equal(counted.count, 1)
        assert.equal(counted.solution, result.solution)
        assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
        distinct.add(result.puzzle.givens)
      },
    )
    assert.equal(distinct.size, 25)
    await sample(
      'actual Hard New Puzzle',
      () => generatePlayableVariant('skyscrapers', 'hard', ++seed, []),
      (result) => {
        assert.deepEqual(result.rating.status, { solved: 'hard' })
        assertVariantCompletion(result.puzzle, result.solution)
        assert.equal(countLineSolutions(result.puzzle).count, 1)
        assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
      },
    )
  } finally {
    await server.close()
  }
})
