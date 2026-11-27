import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

// Reproduce the full app-order exhaustive scan that was previously observed
// exceeding 103 seconds on the published All Futures opening.
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/x-sum-murphy.json', import.meta.url), 'utf8'))
const wasm = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
const { instance } = await WebAssembly.instantiate(wasm)
const handle = createEngineHandler(async () => instance.exports)
let id = 0

async function request(input) {
  const response = await handle({ id: ++id, request: input })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value
}

const [classic, variant] = await Promise.all([
  request({ type: 'techniques' }),
  request({ type: 'techniques', variant: true }),
])
const difficulty = Object.fromEntries(
  [...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty]),
)
const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder, difficulty)
const query = {
  type: 'variant',
  operation: 'hints',
  position: { puzzle: fixture.puzzle },
  techniqueOrder: order,
  limit: 0xffff_ffff,
  difficulty: 'hard',
}

const measurements = []
let reference
for (let sample = 0; sample < 7; sample++) {
  const start = performance.now()
  const result = await request(query)
  if (sample >= 2) measurements.push(performance.now() - start)
  if (reference === undefined) reference = result
  else assert.deepEqual(result, reference, 'all full-order proofs and actions must be stable across samples')
}
measurements.sort((left, right) => left - right)
const quintuple = reference.filter(hint => hint.technique === 'quintuple-pattern-overlay')
assert.ok(quintuple.length > 0, 'the request must retain its five-digit Pattern Overlay proofs')

console.log(JSON.stringify({
  source: fixture.title,
  host: `${process.platform} ${process.arch}`,
  node: process.version,
  wasmSha256: createHash('sha256').update(wasm).digest('hex'),
  wasmBytes: wasm.byteLength,
  method: 'Two warmups then five measured full app-order requests; excludes Wasm instantiation and worker startup/transfer.',
  techniques: order.length,
  choices: reference.length,
  quintupleProofs: quintuple.length,
  medianP95Ms: [measurements[2], measurements[4]].map(value => Number(value.toFixed(3))),
}))
