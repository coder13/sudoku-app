import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...selected] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/bench-overlay-engines.mjs before.wasm after.wasm [fixture names]')
const binaries = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return {
    memory: () => instance.exports.memory.buffer.byteLength,
    async request(request) {
      const result = await handle({ id: ++id, request })
      assert.ok('value' in result, JSON.stringify(result))
      return result.value
    },
  }
}
const load = async path => JSON.parse(await readFile(new URL(`../tests/fixtures/${path}.json`, import.meta.url), 'utf8'))
const fixtures = await Promise.all([
  ['quadruple', 'quadruple-clover'], ['parity', 'parity-big-eight'], ['anti-king', 'anti-king-newman'],
  ['non-consecutive', 'nonconsecutive-newman'],
].map(async ([name, file]) => ({ name, puzzle: (await load(file)).puzzle })))
fixtures.push({ name: 'nc-white-dots', puzzle: (await detectPuzzle((await load('nonconsecutive-coach')).examples[0].code)).variant.puzzle })
for (const name of selected) assert.ok(fixtures.some(fixture => fixture.name === name), `Unknown fixture ${name}`)
const summary = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return [0.5, 0.95].map(q => sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)).join('/')
}
console.log(`Paired app-order Node/Wasm on ${process.platform} ${process.arch}, Node ${process.version}; ms median/p95.`)
console.log(`Before ${binaries[0].length} raw / ${gzipSync(binaries[0]).length} gzip; after ${binaries[1].length} raw / ${gzipSync(binaries[1]).length} gzip.`)
console.log('Each fixture uses fresh instances, two warmups and ten measured samples per engine; alternate execution order.')
for (const { name, puzzle } of fixtures) {
  if (selected.length && !selected.includes(name)) continue
  const pair = await Promise.all(binaries.map(engine))
  const classic = await pair[0].request({ type: 'techniques' }), variant = await pair[0].request({ type: 'techniques', variant: true })
  const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
    Object.fromEntries([...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty])))
  const base = { type: 'variant', position: { puzzle }, techniqueOrder }
  let status
  for (const [operation, options] of [
    ['rate', {}], ['hints', { limit: 10, preferProgress: true, difficulty: 'medium' }],
    ['exhaustive', { limit: 0xffff_ffff, preferProgress: true, difficulty: 'medium', collection: 113 }],
  ]) {
    const request = { ...base, operation: operation === 'exhaustive' ? 'hints' : operation, ...options }
    const expected = await pair[0].request(request)
    const times = [[], []]
    for (let round = 0; round < 12; round++) for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now()
      const result = await pair[index].request(request)
      const elapsed = performance.now() - start
      assert.deepEqual(result, expected, `${name}: ${operation}`)
      if (round >= 2) times[index].push(elapsed)
    }
    if (operation === 'rate') status = expected.status
    const count = operation === 'rate' ? '' : `, ${operation === 'exhaustive' ? expected.available : expected.length} choices`
    console.log(`${name} ${operation}: ${summary(times[0])} -> ${summary(times[1])}${count}`)
  }
  console.log(`${name} status ${JSON.stringify(status)}, committed Wasm memory after requests ${pair.map(item => (item.memory() / 1024 / 1024).toFixed(2)).join(' -> ')} MiB`)
}
