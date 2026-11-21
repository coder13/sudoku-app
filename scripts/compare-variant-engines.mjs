import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const paths = process.argv.slice(2)
const ruleScaling = paths[0] === '--rule-scaling'
if (ruleScaling) paths.shift()
assert.ok(paths.length >= 2, 'Usage: node --experimental-strip-types scripts/compare-variant-engines.mjs [--rule-scaling] before.wasm after.wasm [fixture.json ...]')
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
const quad = oldCatalog.techniques.some(technique => technique.id === 'quadruple')
  ? JSON.parse(await readFile(new URL('../tests/fixtures/quadruple-clover.json', import.meta.url), 'utf8')) : undefined
if (quad) fixtures.push({ name: 'quadruple', position: quad.puzzle })
if (ruleScaling) {
  const publications = JSON.parse(await readFile(new URL('../tests/fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8'))
  const fixturesBySize = [...publications].filter(example =>
    ['Buffet of Variants', 'Anti-Ratio constraint boxes'].includes(example.title))
  const puzzles = await Promise.all(fixturesBySize.map(async example => ({
    name: example.title,
    position: (await detectPuzzle(example.coach)).variant.puzzle,
  })))
  fixtures.splice(0, fixtures.length, { name: 'all-families', position: combined.puzzle }, ...puzzles.sort((a, b) => a.position.rules.length - b.position.rules.length))
}
const added = []
for (const path of paths.slice(2)) {
  const source = JSON.parse(await readFile(path, 'utf8'))
  const fixture = { name: source.title ?? path, position: source.puzzle ?? source }
  fixtures.push(fixture)
  added.push(fixture)
}
// A new catalog version is expected. All other retained result fields must agree.
const behavior = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'scoringVersion' ? undefined : item))
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return [0.5, 0.95].map(q => sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)).join('/')
}
console.log(`Paired Wasm requests on ${process.platform} ${process.arch}, Node ${process.version}; milliseconds, median/p95.`)
console.log(`Before ${before.bytes} raw / ${before.gzip} gzip; after ${after.bytes} raw / ${after.gzip} gzip.`)
console.log(`Variant scoring versions ${oldCatalog.scoringVersion} -> ${newCatalog.scoringVersion}; explicit before-catalog order for both engines.`)
const operations = ['candidates', 'analyze', 'solve', 'rate', 'hints', 'trace']
const directRules = new Set([
  'anti-king', 'anti-knight', 'clone', 'inequality', 'kropki', 'non-consecutive', 'palindrome',
  'thermometer', 'whispers', 'xv', 'adjacent-total', 'arrow', 'pill-arrow', 'between', 'lockout',
  'consecutive-run', 'inside-grid', 'distinct-cells', 'entropic', 'modular', 'little-killer', 'region-sum', 'renban',
  'sandwich', 'skyscrapers', 'x-sum',
])
for (const fixture of fixtures) {
  const result = {}
  if (!ruleScaling && oldCatalog.techniques.some(technique => technique.id === 'nested-forcing-net')) {
    const query = { type: 'variant', operation: 'hints', position: { puzzle: fixture.position },
      techniqueOrder: ['nested-forcing-net'], limit: 0xffff_ffff }
    assert.deepEqual(await after.request(query), await before.request(query), `${fixture.name} complete nested proofs`)
  }
  const requests = operations.map(operation => [
    operation,
    { type: 'variant', operation, position: { puzzle: fixture.position }, maxNodes: ruleScaling ? 500_000 : 20_000,
      ...(['rate', 'hints', 'trace'].includes(operation) && { techniqueOrder }), ...(operation === 'hints' && { limit: 10 }) },
  ])
  if (ruleScaling) {
    for (const [label, order] of [
      ['direct-rule-hints', techniqueOrder.filter(id => directRules.has(id))],
      ['cage-house-hints', techniqueOrder.filter(id => id === 'cage-house-sum')],
    ]) {
      assert.ok(order.length, `No techniques for ${label}`)
      requests.push([label, { type: 'variant', operation: 'hints', position: { puzzle: fixture.position },
        techniqueOrder: order, limit: 0xffff_ffff }])
    }
  }
  for (const [label, request] of requests) {
    assert.deepEqual(behavior(await after.request(request)), behavior(await before.request(request)), `${fixture.name} ${label}`)
    if (label === 'trace') continue
    for (let i = 0; i < 10; i++) { await before.request(request); await after.request(request) }
    const times = [[], []]
    for (let i = 0; i < (ruleScaling ? 25 : 80); i++) {
      for (const index of i % 2 ? [1, 0] : [0, 1]) {
        const start = performance.now()
        await [before, after][index].request(request)
        times[index].push(performance.now() - start)
      }
    }
    result[label] = `${summarize(times[0])} -> ${summarize(times[1])}`
  }
  console.log(ruleScaling ? `${fixture.name} (${fixture.position.rules?.length ?? 0} rules)` : fixture.name, result)
}
console.log(`Retained catalogs, candidates, statuses, completions, ratings, hints, and full traces agree on all ${fixtures.length} fixtures.`)
if (!ruleScaling && (quad || added.length)) {
  const classic = await before.request({ type: 'techniques' })
  const appOrder = variantTechniqueOrder(oldCatalog.defaultOrder, classic.difficultyOrder,
    Object.fromEntries([...classic.techniques, ...oldCatalog.techniques].map(technique => [technique.id, technique.difficulty])))
  for (const fixture of [...(quad ? [{ name: 'Quadruple', position: quad.puzzle }] : []), ...added]) {
    const request = { type: 'variant', operation: 'hints', position: { puzzle: fixture.position },
      techniqueOrder: appOrder, preferProgress: true, difficulty: 'medium', limit: 0xffff_ffff, collection: 100 }
    assert.deepEqual(await after.request(request), await before.request(request), `${fixture.name} exhaustive first page changed`)
    const times = [[], []]
    for (let i = 0; i < 12; i++) for (const index of i % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now()
      await [before, after][index].request(request)
      if (i >= 2) times[index].push(performance.now() - start)
    }
    console.log(`${fixture.name} exhaustive app hints, 2 warmups and 10 alternating samples: ${summarize(times[0])} -> ${summarize(times[1])} ms`)
  }
}
