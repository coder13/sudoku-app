import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const source = JSON.parse(await readFile(new URL('../tests/fixtures/sandwich-terrain-unsupported.json', import.meta.url), 'utf8')).source
const imported = await detectPuzzle(source.sudoku)
assert.ok(imported.variant, 'the published Coach Terrain source should import as a variant')

const wasmBytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
const { instance } = await WebAssembly.instantiate(wasmBytes)
const handle = createEngineHandler(async () => instance.exports)
let requestId = 0

async function request(operation, entries) {
  const response = await handle({
    id: ++requestId,
    request: {
      type: 'variant',
      operation,
      position: { puzzle: imported.variant.puzzle, ...(entries ? { entries } : {}) },
    },
  })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value
}

async function measure(label, operation, entries) {
  for (let index = 0; index < 5; index++) await request(operation, entries)
  const timings = []
  for (let index = 0; index < 40; index++) {
    const start = performance.now()
    await request(operation, entries)
    timings.push(performance.now() - start)
  }
  timings.sort((left, right) => left - right)
  const median = timings[Math.ceil(timings.length * 0.5) - 1]
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]
  console.log(`${label}: ${median.toFixed(3)}/${p95.toFixed(3)} ms median/p95`)
}

console.log(`Coach Terrain Wasm ${process.platform} ${process.arch}, Node ${process.version}; ${wasmBytes.length} raw/${gzipSync(wasmBytes).length} gzip bytes.`)
console.log('Five warmups and 40 measured calls; each request includes protocol encoding/decoding and engine rule compilation.')
const candidates = await request('candidates')
assert.ok(Array.isArray(candidates) && candidates.length === 81)
for (let cell = 0; cell < 81; cell++) {
  assert.ok(candidates[cell] & (1 << (Number(source.solution[cell]) - 1)), `published digit at cell ${cell} remains a candidate`)
}
assert.equal(await request('analyze', source.solution), 'unique')
await measure('Blank-board candidate propagation', 'candidates')
await measure('Published completion verification', 'analyze', source.solution)
