import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createCountWorker } from '../src/sudoku/engine.ts'
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

async function engineHandler() {
  const { instance: workerInstance } = await WebAssembly.instantiate(wasmBytes)
  return createEngineHandler(async () => workerInstance.exports)
}

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
const finderHandler = await engineHandler()

const analyze = await request({ type: 'variant', operation: 'analyze', position, maxNodes: 1_000_000 })
assert.equal(analyze, 'unique')
const solve = await request({ type: 'variant', operation: 'solve', position, maxNodes: 1_000_000 })
assert.equal(solve, source.solution)
const rating = await request(appRateRequest)
const hints = await request(appHintsRequest)
const exhaustive = await request(exhaustiveRequest)
assert.ok(exhaustive.available >= exhaustive.choices.length)

class ProfileWorker {
  onmessage
  onerror
  constructor() { this.handle = finderHandler }
  postMessage(message) {
    void this.handle(message).then(data => this.onmessage?.({ data }), () => this.onerror?.())
  }
  terminate() {}
}
Object.defineProperty(globalThis, 'Worker', { value: ProfileWorker, configurable: true })

async function finderCounts() {
  const scan = createCountWorker(position.puzzle.givens, position.eliminations,
    position, position.visibility, techniqueOrder)
  try {
    return Object.fromEntries(await Promise.all(techniqueOrder.map(async technique =>
      [technique, await scan.count(technique)])))
  } finally {
    scan.close()
  }
}

async function prefixFinderCounts() {
  const counts = {}
  const covered = new Set()
  for (let index = 0; index < techniqueOrder.length; index++) {
    const response = await request({ type: 'variant', operation: 'hints', position,
      techniqueOrder: techniqueOrder.slice(0, index + 1), limit: 0xffff_ffff })
    const targets = new Set()
    for (const hint of response) {
      if (hint.technique !== techniqueOrder[index]) continue
      for (const action of hint.actions) {
        const { cell, digit } = 'place' in action ? action.place : action.eliminate
        const target = `${cell}:${digit}`
        if (!covered.has(target)) targets.add(target)
      }
    }
    counts[techniqueOrder[index]] = targets.size
    for (const target of targets) covered.add(target)
  }
  return counts
}

async function measureFunction(label, run, samples) {
  const expected = await run()
  for (let index = 0; index < 5; index++) assert.deepEqual(await run(), expected)
  const timings = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    const result = await run()
    timings.push(performance.now() - start)
    assert.deepEqual(result, expected)
  }
  timings.sort((left, right) => left - right)
  const median = timings[Math.ceil(timings.length * 0.5) - 1]
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]
  console.log(`${label}: ${median.toFixed(3)}/${p95.toFixed(3)} ms median/p95 (${samples} samples)`)
}

async function measure(label, input, samples) {
  return measureFunction(label, () => request(input), samples)
}

console.log(`Coach Terrain app Wasm ${process.platform} ${process.arch}, Node ${process.version}; ${wasmBytes.length} raw/${gzipSync(wasmBytes).length} gzip bytes; ${techniqueOrder.length} app-order techniques.`)
console.log(`Published completion: unique; rating ${JSON.stringify(rating.status)}, ${rating.points} points; ${hints.length} top-ten hints; ${exhaustive.available} exhaustive choices (${exhaustive.choices.length} transferred).`)
console.log('Five warmups; 20 samples for rating/hints and 10 for exhaustive collection. Direct Node/Wasm timings exclude worker startup, transfer and rendering.')
const expectedFinderCounts = await prefixFinderCounts()
assert.deepEqual(await finderCounts(), expectedFinderCounts)
console.log(`Technique Finder: ${techniqueOrder.length} app-order counts match cumulative-prefix reference.`)
await measureFunction('Technique Finder full app-order counts', finderCounts, 10)
await measure('App-order rating', appRateRequest, 20)
await measure('App-order top-ten hints', appHintsRequest, 20)
await measure('App-order exhaustive first collection', exhaustiveRequest, 10)
console.log(`Wasm linear-memory buffer capacity: ${(initialMemoryBytes / 1_048_576).toFixed(3)} MiB initial, ${(memory.buffer.byteLength / 1_048_576).toFixed(3)} MiB after measured calls (buffer capacity, not live allocation or process RSS).`)
