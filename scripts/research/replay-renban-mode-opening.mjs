import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createEngineHandler } from '../../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../../src/sudoku/variant-generation.ts'

const [wasmPath, fixturePath] = process.argv.slice(2)
const wasm = readFileSync(wasmPath)
const fixture = readFileSync(fixturePath)
const { instance } = await WebAssembly.instantiate(wasm)
const handle = createEngineHandler(async () => instance.exports)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
let id = 0
async function request(request) {
  const { id: _, ...reply } = await handle({ id: ++id, request })
  return reply
}
const { value: classic } = await request({ type: 'techniques' })
const { value: variant } = await request({ type: 'techniques', variant: true })
const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
const source = JSON.parse(fixture)
const opening = { puzzle: source.puzzle }
const pinned = { ...opening, entries: '0'.repeat(76) + '8' + '0'.repeat(4) }
const removed = { ...opening, eliminations: Array(81).fill(0) }
removed.eliminations[76] = 1 << 7
console.log(JSON.stringify({ status: 'manifest', wasmPath, wasmSha256: sha(wasm), fixturePath,
  fixtureSha256: sha(fixture), order, node: process.version }))
async function check(name, operation, position, options) {
  const query = { type: 'variant', operation, position, techniqueOrder: order, ...options }
  console.log(JSON.stringify({ status: 'started', name, query }))
  const start = performance.now()
  const reply = await request(query)
  console.log(JSON.stringify({ status: 'done', name, elapsedMs: performance.now() - start, reply }))
  return reply
}
await check('opening-candidates', 'candidates', opening)
const { value: trace } = await check('opening-trace', 'trace', opening)
assert.equal(trace.rating.status, 'stalled')
assert.equal(trace.rating.points, 0)
assert.equal(trace.steps.length, 0)
const { value: hints } = await check('opening-hints', 'hints', opening, { limit: 10, difficulty: 'medium', preferProgress: true })
assert.deepEqual(hints, [])
assert.equal((await check('original-tight', 'analyze', opening, { maxNodes: 20_000 })).value, 'search-limit')
assert.equal((await check('original-exact', 'analyze', opening, { maxNodes: 1_000_000 })).value, 'unique')
assert.equal((await check('pinned-8-exact', 'analyze', pinned, { maxNodes: 1_000_000 })).value, 'unsolvable')
assert.equal((await check('removed-8-solve', 'solve', removed, { maxNodes: 1_000_000 })).value, source.solution)
