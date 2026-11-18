import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...selected] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm [fixture names]')
const binaries = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes)
  const handler = createEngineHandler(async () => instance.exports)
  let id = 0
  const request = async request => {
    const response = await handler({ id: ++id, request })
    assert.ok('value' in response, JSON.stringify(response))
    return response.value
  }
  const classic = await request({ type: 'techniques' }), variant = await request({ type: 'techniques', variant: true })
  return { request, memory: () => instance.exports.memory.buffer.byteLength, nativeOrder: variant.defaultOrder,
    appOrder: variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
      Object.fromEntries([...classic.techniques, ...variant.techniques].map(item => [item.id, item.difficulty]))) }
}
const load = async path => JSON.parse(await readFile(new URL(`../tests/fixtures/${path}.json`, import.meta.url), 'utf8'))
const fixtures = await Promise.all([
  ['quadruple', 'quadruple-clover'], ['parity', 'parity-big-eight'], ['anti-king', 'anti-king-newman'], ['non-consecutive', 'nonconsecutive-newman'],
].map(async ([name, file]) => ({ name, puzzle: (await load(file)).puzzle })))
fixtures.push({ name: 'nc-white-dots', puzzle: (await detectPuzzle((await load('nonconsecutive-coach')).examples[0].code)).variant.puzzle })
// Opt in so historical runs against older, stalled Whispers profiles retain
// their original workload and sample counts.
if (selected.includes('whispers')) fixtures.push({ name: 'whispers', puzzle: (await load('whispers-brain-zaps')).puzzle })
for (const [name, file] of [['palindrome', 'palindrome-clover'], ['palindrome-knight', 'palindrome-newman']]) {
  if (selected.includes(name)) fixtures.push({ name, puzzle: (await load(file)).puzzle })
}
if (selected.includes('palindrome-whispers')) fixtures.push({ name: 'palindrome-whispers',
  puzzle: (await detectPuzzle((await load('palindrome-coach')).examples[0].code)).variant.puzzle })
for (const name of selected) assert.ok(fixtures.some(fixture => fixture.name === name), `Unknown fixture ${name}`)
const summary = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return [0.5, 0.95].map(q => sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)).join('/')
}
console.log(`Paired Node/Wasm, ${process.platform} ${process.arch}, Node ${process.version}; ms median/p95.`)
console.log(`Before ${binaries[0].length} raw / ${gzipSync(binaries[0]).length} gzip; after ${binaries[1].length} raw / ${gzipSync(binaries[1]).length} gzip.`)
console.log(`SHA-256 before ${createHash('sha256').update(binaries[0]).digest('hex')}; after ${createHash('sha256').update(binaries[1]).digest('hex')}.`)
console.log('Each engine uses its own declared default/app order. Fresh instances per fixture; alternate execution order.')
console.log('Fixed requests: 5 warmups, 20 measured samples. Exhaustive first page: 2 warmups, 10 measured samples.')
for (const { name, puzzle } of fixtures) {
  if (selected.length && !selected.includes(name)) continue
  const pair = await Promise.all(binaries.map(engine))
  let proofPosition = { puzzle }
  if (name === 'palindrome-whispers') {
    const trace = await pair[0].request({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: pair[0].appOrder })
    assert.equal(trace.rating.points, 527)
    assert.equal(trace.steps.length, 18)
    const entries = Array(81).fill('0'), eliminations = Array(81).fill(0)
    for (const proof of trace.steps) for (const action of proof.actions) {
      if ('place' in action) entries[action.place.cell] = String(action.place.digit)
      else eliminations[action.eliminate.cell] |= 1 << (action.eliminate.digit - 1)
    }
    proofPosition = { puzzle, entries: entries.join(''), eliminations }
    console.log('Selected Palindrome/Whispers proofs use the final app trace position; other requests use the opening.')
  }
  const operations = ['candidates', 'analyze', 'solve', 'native-rate', 'app-rate', 'ten-hints', 'exhaustive']
  if (name === 'whispers') operations.push(...[
    'unique-rectangle-1', 'unique-loop', 'bug-plus-one', 'unique-rectangle-aic',
    'unique-rectangle-continuous-nice-loop', 'unique-rectangle-discontinuous-nice-loop',
    'nested-forcing-net',
  ].map(id => `proof:${id}`))
  if (name === 'palindrome-whispers') operations.push(...[
    'tridagon', 'tridagon-forcing-net', 'tridagon-aic',
  ].map(id => `proof:${id}`))
  for (const operation of operations) {
    const technique = operation.startsWith('proof:') ? operation.slice(6) : undefined
    const options = pair.map(engine => ({ type: 'variant', position: technique ? proofPosition : { puzzle }, maxNodes: name === 'whispers' ? 100_000 : name === 'palindrome-whispers' ? 1_000_000 : 20_000,
      operation: technique || operation.endsWith('hints') || operation === 'exhaustive' ? 'hints' : operation.endsWith('rate') ? 'rate' : operation,
      techniqueOrder: technique ? [technique] : operation === 'native-rate' ? engine.nativeOrder : engine.appOrder,
      ...(technique && { limit: 0xffff_ffff }),
      ...(operation === 'ten-hints' && { limit: 10, preferProgress: true, difficulty: 'medium' }),
      ...(operation === 'exhaustive' && { limit: 0xffff_ffff, collection: 111, preferProgress: true, difficulty: 'medium' }),
    }))
    const cold = [], expected = []
    for (const index of [0, 1]) {
      const fresh = await engine(binaries[index])
      const start = performance.now()
      expected[index] = await fresh.request(options[index])
      cold[index] = performance.now() - start
    }
    console.log(`${name} ${operation} fresh-instance first request: ${cold.map(ms => ms.toFixed(3)).join(' -> ')} ms`)
    await Promise.all(pair.map((engine, index) => engine.request(options[index])))
    assert.deepEqual(expected[1], expected[0], `${name}: ${operation}: unchanged behavior`)
    const times = [[], []]
    const warmups = operation === 'exhaustive' ? 2 : 5, samples = operation === 'exhaustive' ? 10 : 20
    for (let round = 0; round < warmups + samples; round++) for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now()
      const result = await pair[index].request(options[index])
      const elapsed = performance.now() - start
      assert.deepEqual(result, expected[index], `${name}: ${operation}: engine ${index}`)
      if (round >= warmups) times[index].push(elapsed)
    }
    console.log(`${name} ${operation}: ${summary(times[0])} -> ${summary(times[1])}`)
    if (operation.endsWith('rate')) console.log(`  ${JSON.stringify(expected.map(rating => ({ status: rating.status, points: rating.points, scoringVersion: rating.scoringVersion })))}`)
    if (technique || operation.endsWith('hints') || operation === 'exhaustive') console.log(`  choices ${expected.map(result => Array.isArray(result) ? result.length : result.available).join(' -> ')}`)
  }
  console.log(`${name} committed Wasm memory after requests: ${pair.map(engine => (engine.memory() / 1024 / 1024).toFixed(2)).join(' -> ')} MiB`)
}
