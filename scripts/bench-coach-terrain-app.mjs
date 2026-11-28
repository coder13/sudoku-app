import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const source = JSON.parse(await readFile(new URL('../tests/fixtures/coach-terrain.json', import.meta.url), 'utf8')).source
const imported = await detectPuzzle(source.sudoku)
assert.ok(imported.variant, 'the published Coach Terrain source should import as a variant')

const wasmBytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
const { instance } = await WebAssembly.instantiate(wasmBytes)
const memory = instance.exports.memory
assert.ok(memory instanceof WebAssembly.Memory, 'the app Wasm should expose its linear memory')
const initialMemoryBytes = memory.buffer.byteLength
const handle = createEngineHandler(async () => instance.exports)
let requestId = 0

async function request(request) {
  const response = await handle({ id: ++requestId, request })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value
}

const classic = await request({ type: 'techniques' })
const variant = await request({ type: 'techniques', variant: true })
const difficulty = Object.fromEntries([...classic.techniques, ...variant.techniques]
  .map(technique => [technique.id, technique.difficulty]))
const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder, difficulty)
const position = { puzzle: imported.variant.puzzle }
const appRateRequest = { type: 'variant', operation: 'rate', position, techniqueOrder }
const appHintsRequest = { type: 'variant', operation: 'hints', position, techniqueOrder,
  preferProgress: true, difficulty: 'medium', limit: 10 }
const exhaustiveRequest = { ...appHintsRequest, limit: 0xffff_ffff, collection: 100 }

const analyze = await request({ type: 'variant', operation: 'analyze', position, maxNodes: 1_000_000 })
assert.equal(analyze, 'unique')
const solve = await request({ type: 'variant', operation: 'solve', position, maxNodes: 1_000_000 })
assert.equal(solve, source.solution)
const rating = await request(appRateRequest)
const hints = await request(appHintsRequest)
const exhaustive = await request(exhaustiveRequest)
assert.ok(exhaustive.available >= exhaustive.choices.length)

async function measure(label, input, samples) {
  const expected = await request(input)
  for (let index = 0; index < 5; index++) assert.deepEqual(await request(input), expected)
  const timings = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    const result = await request(input)
    timings.push(performance.now() - start)
    assert.deepEqual(result, expected)
  }
  timings.sort((left, right) => left - right)
  const median = timings[Math.ceil(timings.length * 0.5) - 1]
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]
  console.log(`${label}: ${median.toFixed(3)}/${p95.toFixed(3)} ms median/p95 (${samples} samples)`)
}

console.log(`Coach Terrain app Wasm ${process.platform} ${process.arch}, Node ${process.version}; ${wasmBytes.length} raw/${gzipSync(wasmBytes).length} gzip bytes; ${techniqueOrder.length} app-order techniques.`)
console.log(`Published completion: unique; rating ${JSON.stringify(rating.status)}, ${rating.points} points; ${hints.length} top-ten hints; ${exhaustive.available} exhaustive choices (${exhaustive.choices.length} transferred).`)
console.log('Five warmups; 20 samples for rating/hints and 10 for exhaustive collection. Direct Node/Wasm timings exclude worker startup, transfer and rendering.')
await measure('App-order rating', appRateRequest, 20)
await measure('App-order top-ten hints', appHintsRequest, 20)
await measure('App-order exhaustive first collection', exhaustiveRequest, 10)
console.log(`Wasm linear-memory buffer capacity: ${(initialMemoryBytes / 1_048_576).toFixed(3)} MiB initial, ${(memory.buffer.byteLength / 1_048_576).toFixed(3)} MiB after measured calls (buffer capacity, not live allocation or process RSS).`)
