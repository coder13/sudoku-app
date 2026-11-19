import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'

const [beforePath, afterPath, ...extra] = process.argv.slice(2)
assert.ok(beforePath && !extra.length,
  'Usage: node --experimental-strip-types scripts/bench-renban-exact.mjs before.wasm [after.wasm]')
const paths = [beforePath, afterPath].filter(Boolean)
const bytes = await Promise.all(paths.map(path => readFile(path)))
const fixtureFile = new URL('../tests/fixtures/little-killer-menace.json', import.meta.url)
const fixture = await readFile(fixtureFile)
const { puzzle, solution } = JSON.parse(fixture)
const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
const sha256 = data => createHash('sha256').update(data).digest('hex')
const log = record => console.log(JSON.stringify(record))
const warmups = 1
const samples = 5
const defaultNodes = 1_000_000
const cases = [
  { operation: 'analyze', maxNodes: defaultNodes, expected: { value: 'unique' } },
  { operation: 'solve', maxNodes: defaultNodes, expected: { value: solution } },
  { operation: 'preview' },
  { operation: 'analyze', maxNodes: 20_000, expected: { value: 'search-limit' } },
  { operation: 'solve', maxNodes: 20_000, expected: { code: 'search-limit' } },
]
log({
  host: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8 },
  fixture: { file: 'tests/fixtures/little-killer-menace.json', sha256: sha256(fixture) },
  artifacts: bytes.map((binary, index) => ({ path: paths[index], sha256: sha256(binary),
    rawBytes: binary.length, gzipBytes: gzipSync(binary).length })),
  warmups, samples, cases, defaultNodes, workerCount: 1, seeds: [],
})

let activeEngine
let calls
let id = 0
globalThis.Worker = class {
  postMessage(message) {
    const start = performance.now()
    void activeEngine.handle(message).then(response => {
      if (calls) calls.push({ request: message.request, response: payload(response), elapsedMs: performance.now() - start })
      this.onmessage?.({ data: response })
    })
  }
  terminate() {}
}

function payload({ id: _, ...response }) {
  return response
}

const engines = []
for (const [build, binary] of bytes.entries()) {
  const start = performance.now()
  const { instance } = await WebAssembly.instantiate(binary)
  const loadMs = performance.now() - start
  const handle = createEngineHandler(async () => instance.exports)
  const memory = () => ({ wasmCapacityBytes: instance.exports.memory.buffer.byteLength,
    processMaxRssKiB: process.resourceUsage().maxRSS })
  const engine = { build, handle, memory }
  engines.push(engine)
  log({ build, phase: 'instantiate', elapsedMs: loadMs, ...memory() })

  const request = { type: 'variant', operation: 'analyze', position: { puzzle }, maxNodes: defaultNodes }
  const first = performance.now()
  const response = payload(await handle({ id: ++id, request }))
  const elapsedMs = performance.now() - first
  assert.deepEqual(response, { value: 'unique' })
  log({ build, phase: 'first', operation: 'analyze', elapsedMs, response, ...memory() })
}

for (const variant of [false, true]) {
  const request = { type: 'techniques', variant }
  const catalogs = await Promise.all(engines.map(engine => engine.handle({ id: ++id, request }).then(payload)))
  for (const catalog of catalogs) assert.deepEqual(catalog, catalogs[0])
}
activeEngine = engines[0]
log({ appTechniqueOrder: await getVariantPlayOrder() })

for (const [caseIndex, { operation, maxNodes, expected }] of cases.entries()) {
  const request = expected ? { type: 'variant', operation, position: { puzzle }, maxNodes } : undefined
  let reference
  for (let round = 0; round < warmups + samples; round++) {
    for (const engine of (round + caseIndex) % 2 ? engines.toReversed() : engines) {
      activeEngine = engine
      calls = request ? undefined : []
      const start = performance.now()
      const result = request
        ? await engine.handle({ id: ++id, request })
        : await prepareImportedPuzzle(share)
      const elapsedMs = performance.now() - start
      let response
      if (request) {
        response = payload(result)
        for (const [key, value] of Object.entries(expected)) assert.equal(response[key], value)
      } else {
        assert.deepEqual(result.game.variant.puzzle, puzzle)
        assert.equal(result.game.variant.solution, solution)
        assert.deepEqual(calls.map(call => call.request.operation), ['solve-unique', 'rate'])
        assert.equal(calls[1].response.value.status, 'stalled')
        assert.equal(calls[1].response.value.points, 0)
        assert.equal(calls[1].response.value.scoringVersion, 8)
        // ID and creation time come from the app, independently of the engine.
        const { id: _, created, ...game } = result.game
        response = { ...result, game, calls: calls.map(({ request, response }) => ({ request, response })) }
      }
      reference ??= response
      assert.deepEqual(response, reference)
      log({ build: engine.build, phase: round < warmups ? 'warmup' : 'sample', operation, maxNodes, round,
        elapsedMs, ...engine.memory(), ...(calls ? { calls } : { response }) })
      calls = undefined
    }
  }
}
