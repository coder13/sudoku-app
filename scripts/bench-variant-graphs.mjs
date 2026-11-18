import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...options] = process.argv.slice(2)
const classicOnly = options.includes('--classic-only')
assert.ok(options.every(option => option === '--classic-only'), 'Unknown benchmark option')
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm after.wasm [--classic-only]')
const bytes = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(binary) {
  const { instance } = await WebAssembly.instantiate(binary)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return {
    request: async request => {
      const reply = await handle({ id: ++id, request })
      assert.ok('value' in reply, JSON.stringify(reply))
      return reply.value
    },
    memory: () => instance.exports.memory.buffer.byteLength,
  }
}
const seed = await engine(bytes[0])
const classic = await seed.request({ type: 'techniques' })
const variant = await seed.request({ type: 'techniques', variant: true })
const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
const source = JSON.parse(await readFile(new URL('../tests/fixtures/modular-coach.json', import.meta.url), 'utf8')).examples.find(s => s.url.endsWith('/HCHW'))
const traces = []
for (const order of [variant.defaultOrder, techniqueOrder]) {
  traces.push(await seed.request({ type: 'variant', operation: 'trace', position: { puzzle: source.puzzle }, techniqueOrder: order }))
}
assert.deepEqual(traces.map(trace => [trace.rating.points, trace.steps.length, trace.rating.status]), [[420, 21, 'stalled'], [2000, 25, 'stalled']])
const methods = ['unique-rectangle-aic', 'unique-rectangle-continuous-nice-loop', 'unique-rectangle-discontinuous-nice-loop']
const cases = [
  { name: 'HCHW-opening', position: { puzzle: source.puzzle }, solution: source.solution, positive: false },
  { name: 'HCHW-native-stall', position: traces[0].end, solution: source.solution, positive: false },
  { name: 'HCHW-app-stall', position: traces[1].end, solution: source.solution, positive: false },
]
for (const technique of methods) {
  const [exercise] = await seed.request({ type: 'practice-examples', variant: true, technique })
  const solution = await seed.request({ type: 'variant', operation: 'solve', position: exercise.position })
  cases.push({ name: `${technique}-published`, position: exercise.position, solution, positive: true })
}
console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
  artifacts: bytes.map(binary => ({ raw: binary.length, gzip: gzipSync(binary).length, sha256: createHash('sha256').update(binary).digest('hex') })),
  method: 'Alternate engines, two warmups/seven samples. Include serialization; exclude assertions, instantiation, worker startup, transfer and rendering. p95 of seven is maximum. Fresh instances per position. Separate requests retain separate position caches.' }))
const summary = times => [0.5, 0.95].map(q => Number(times.toSorted((a,b) => a-b)[Math.ceil(q * times.length)-1].toFixed(3)))
for (const fixture of cases.filter(fixture => !classicOnly || fixture.positive)) {
  const pair = await Promise.all(bytes.map(engine))
  assert.deepEqual(await pair[1].request({ type: 'techniques', variant: true }), variant)
  assert.equal(await pair[0].request({ type: 'variant', operation: 'analyze', position: fixture.position }), 'unique')
  const classicPosition = {
    values: [...fixture.position.puzzle.givens].map((digit, cell) => fixture.position.entries?.[cell] && fixture.position.entries[cell] !== '0' ? fixture.position.entries[cell] : digit).join(''),
    eliminations: fixture.position.eliminations,
  }
  const operations = classicOnly ? [
    ['classic-rectangle-inferences', { type: 'deductions', ...classicPosition, techniqueOrder: methods }],
    ['classic-reversed-rectangle-inferences', { type: 'deductions', ...classicPosition, techniqueOrder: [...methods].reverse() }],
  ] : [
    ['rectangle-inferences', { type: 'variant', operation: 'hints', position: fixture.position, techniqueOrder: methods, limit: 0xffff_ffff }],
    ['reversed-rectangle-inferences', { type: 'variant', operation: 'hints', position: fixture.position, techniqueOrder: [...methods].reverse(), limit: 0xffff_ffff }],
    ...(!fixture.positive ? [
      ['app-rate', { type: 'variant', operation: 'rate', position: fixture.position, techniqueOrder }],
      ['exhaustive', { type: 'variant', operation: 'hints', position: fixture.position, techniqueOrder, limit: 0xffff_ffff, collection: 179 }],
    ] : []),
  ]
  for (const [operation, query] of operations) {
    const expected = await pair[0].request(query)
    assert.deepEqual(await pair[1].request(query), expected, `${fixture.name}: ${operation}`)
    if (operation.includes('rectangle-inferences')) assert.equal(expected.length > 0, fixture.positive)
    if (Array.isArray(expected)) for (const proof of expected) for (const action of proof.actions) {
      const candidate = action.place ?? action.eliminate
      assert.equal(Number(fixture.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }
    const times = [[], []]
    for (let round = 0; round < 9; round++) for (const index of round % 2 ? [1,0] : [0,1]) {
      const start = performance.now(), actual = await pair[index].request(query), elapsed = performance.now() - start
      assert.deepEqual(actual, expected, `${fixture.name}: ${operation}: engine ${index}`)
      if (round >= 2) times[index].push(elapsed)
    }
    console.log(JSON.stringify({ name: fixture.name, operation, medianP95: times.map(summary),
      ...(Array.isArray(expected) ? { proofs: expected.length } : operation === 'exhaustive' ? { choices: expected.available } : { rating: { points: expected.points, status: expected.status, scoringVersion: expected.scoringVersion } }),
      memoryBytes: pair.map(engine => engine.memory()) }))
  }
}
