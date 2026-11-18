import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'

const [beforePath, afterPath, mode] = process.argv.slice(2)
assert.ok(beforePath && afterPath && (mode === undefined || mode === '--generation-only'), 'Usage: node --experimental-strip-types scripts/bench-exact-houses.mjs before.wasm after.wasm [--generation-only]')
const bytes = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(binary) {
  const { instance } = await WebAssembly.instantiate(binary)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return {
    request: request => handle({ id: ++id, request }),
    memory: () => instance.exports.memory.buffer.byteLength,
  }
}
function summary(times) {
  const sorted = times.toSorted((a, b) => a - b)
  return [0.5, 0.95].map(q => Number(sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)))
}
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/inequality-palindrome14.json', import.meta.url), 'utf8'))
console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
  artifacts: bytes.map(binary => ({ raw: binary.length, gzip: gzipSync(binary).length, sha256: createHash('sha256').update(binary).digest('hex') })),
  method: 'Alternate engine order; timings include encoding/decoding, exclude assertions, instantiation, workers and rendering. Exact calls: 2 warmups/5 samples at the same 10m budget. Generation: seeds 1..20, six attempts/20k nodes, no warmups; p95 of five is the maximum.' }))
const pair = await Promise.all(bytes.map(engine))
for (const operation of mode === '--generation-only' ? [] : ['analyze', 'solve']) {
  const request = { type: 'variant', operation, position: { puzzle: fixture.puzzle }, maxNodes: 10_000_000 }
  const times = [[], []]
  for (let round = 0; round < 7; round++) for (const index of round % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now()
    const response = await pair[index].request(request)
    const elapsed = performance.now() - start
    assert.equal(response.value, operation === 'analyze' ? 'unique' : fixture.solution, JSON.stringify(response))
    if (round >= 2) times[index].push(elapsed)
  }
  console.log(JSON.stringify({ operation, budget: request.maxNodes, medianP95: times.map(summary), memoryBytes: pair.map(engine => engine.memory()) }))
  const defaults = await Promise.all(pair.map(engine => engine.request({ ...request, maxNodes: 1_000_000 })))
  assert.equal(operation === 'analyze' ? defaults[0].value : defaults[0].code, 'search-limit')
  assert.equal(defaults[1].value, operation === 'analyze' ? 'unique' : fixture.solution)
  console.log(JSON.stringify({ operation, defaultBudget: 1_000_000, before: 'search-limit', after: operation === 'analyze' ? 'unique' : 'published completion' }))
}
const recipes = JSON.parse(await readFile(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url), 'utf8'))
for (const { name, template, derivedClues, givens } of recipes) {
  const pair = await Promise.all(bytes.map(engine))
  const times = [[], []], matches = [0, 0], distinct = [new Set(), new Set()]
  let identical = 0
  for (let seed = 1; seed <= 20; seed++) {
    const responses = []
    for (const index of seed % 2 ? [0, 1] : [1, 0]) {
      const start = performance.now()
      responses[index] = await pair[index].request({ type: 'generate-variant', seed, maxAttempts: 6, maxNodes: 20_000, template, derivedClues, givens })
      times[index].push(performance.now() - start)
      const result = responses[index]
      if (!('value' in result)) {
        assert.equal(result.code, 'search-limit', JSON.stringify(result))
        continue
      }
      assert.equal(result.value.givens, givens)
      assert.equal(result.value.puzzle.givens.replaceAll('0', '').length, givens)
      assert.match(result.value.solution, /^[1-9]{81}$/)
      const position = { puzzle: result.value.puzzle }
      const count = await pair[index].request({ type: 'variant', operation: 'analyze', position, maxNodes: 20_000 })
      assert.equal(count.value, 'unique', JSON.stringify(count))
      // The unchanged engine independently checks every returned completion.
      const filled = await pair[0].request({ type: 'variant', operation: 'analyze', position: { ...position, entries: result.value.solution }, maxNodes: 1 })
      assert.equal(filled.value, 'unique', JSON.stringify(filled))
      matches[index]++
      distinct[index].add(JSON.stringify(result.value.puzzle))
    }
    // IDs differ because the baseline also validates the other build's result.
    const outcome = response => 'value' in response ? response.value : { code: response.code, error: response.error }
    if (JSON.stringify(outcome(responses[0])) === JSON.stringify(outcome(responses[1]))) identical++
  }
  console.log(JSON.stringify({ generation: name, seeds: 20, matches, identicalResponses: identical, distinctPuzzles: distinct.map(set => set.size),
    medianP95: times.map(summary), memoryBytes: pair.map(engine => engine.memory()) }))
}
