import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'

const paths = process.argv.slice(2)
assert.equal(paths.length, 2, 'Usage: node --experimental-strip-types scripts/compare-variant-engines.mjs before.wasm after.wasm')
let id = 0
async function engine(path) {
  const bytes = await readFile(path)
  const { instance } = await WebAssembly.instantiate(bytes)
  const handle = createEngineHandler(async () => instance.exports)
  return {
    bytes: bytes.length, gzip: gzipSync(bytes).length,
    async request(request) {
      const response = await handle({ id: ++id, request })
      assert.ok('value' in response, JSON.stringify(response))
      return response.value
    },
  }
}
const before = await engine(paths[0])
const after = await engine(paths[1])
const oldCatalog = await before.request({ type: 'techniques', variant: true })
const newCatalog = await after.request({ type: 'techniques', variant: true })
for (const technique of oldCatalog.techniques) {
  assert.deepEqual(newCatalog.techniques.find(item => item.id === technique.id), technique, `changed retained technique ${technique.id}`)
}
const techniqueOrder = oldCatalog.defaultOrder
const fixtures = JSON.parse(await readFile(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url), 'utf8'))
const mixed = JSON.parse(await readFile(new URL('../tests/fixtures/mixed-puzzles.json', import.meta.url), 'utf8'))
const combined = JSON.parse(await readFile(new URL('../tests/fixtures/combined-families.json', import.meta.url), 'utf8'))
fixtures.push({ name: 'x-killer', position: mixed['x-killer'].puzzle }, { name: 'all-families', position: combined.puzzle })
// A new catalog version is expected. All other retained result fields must agree.
const behavior = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'scoringVersion' ? undefined : item))
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return [0.5, 0.95].map(q => sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)).join('/')
}
console.log(`Paired Wasm requests on ${process.platform} ${process.arch}, Node ${process.version}; milliseconds, median/p95.`)
console.log(`Before ${before.bytes} raw / ${before.gzip} gzip; after ${after.bytes} raw / ${after.gzip} gzip.`)
console.log(`Variant scoring versions ${oldCatalog.scoringVersion} -> ${newCatalog.scoringVersion}; explicit before-catalog order for both engines.`)
for (const fixture of fixtures) {
  const result = {}
  for (const operation of ['candidates', 'analyze', 'solve', 'rate', 'hints', 'trace']) {
    const request = { type: 'variant', operation, position: { puzzle: fixture.position }, maxNodes: 20_000,
      ...(['rate', 'hints', 'trace'].includes(operation) && { techniqueOrder }), ...(operation === 'hints' && { limit: 10 }) }
    assert.deepEqual(behavior(await after.request(request)), behavior(await before.request(request)), `${fixture.name} ${operation}`)
    if (operation === 'trace') continue
    for (let i = 0; i < 10; i++) { await before.request(request); await after.request(request) }
    const times = [[], []]
    for (let i = 0; i < 80; i++) {
      for (const index of i % 2 ? [1, 0] : [0, 1]) {
        const start = performance.now()
        await [before, after][index].request(request)
        times[index].push(performance.now() - start)
      }
    }
    result[operation] = `${summarize(times[0])} -> ${summarize(times[1])}`
  }
  console.log(fixture.name, result)
}
console.log('Retained catalogs, candidates, statuses, completions, ratings, hints, and full traces agree on all seven fixtures.')
