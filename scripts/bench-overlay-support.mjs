import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...options] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Provide before.wasm and after.wasm')
assert.ok(options.every(option => /^--(samples|warmups)=\d+$/.test(option) || option.startsWith('--cases=')), 'Unknown option')
const option = (name, fallback) => options.find(option => option.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const samples = Number(option('samples', 3)), warmups = Number(option('warmups', 1))
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 20)
assert.ok(Number.isInteger(warmups) && warmups >= 0 && warmups <= 10)
const selected = option('cases', '').split(',').filter(Boolean)
const load = async name => JSON.parse(await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), 'utf8'))
const binaries = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(binary) {
  const { instance } = await WebAssembly.instantiate(binary)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return { request: async request => {
    const response = await handle({ id: ++id, request })
    if ('value' in response) return response.value
    assert.equal(response.code, 'multiple', JSON.stringify(response))
    return { engineError: response.code, message: response.error }
  }, memory: () => instance.exports.memory.buffer.byteLength }
}
const seed = await engine(binaries[0])
const classic = await seed.request({ type: 'techniques' }), variant = await seed.request({ type: 'techniques', variant: true })
const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
const saved = await load('overlay-dense')
const source = (await load('modular-coach')).examples.find(source => source.url === saved.url)
assert.ok(source?.puzzle)
const cases = []
for (const stepIndex of [22, 23, 24, 25]) {
  const position = stepIndex === 25
    ? (await seed.request({ type: 'variant', operation: 'trace', position: { puzzle: source.puzzle }, techniqueOrder: order })).end
    : (await seed.request({ type: 'variant', operation: 'replay-step', position: { puzzle: source.puzzle }, techniqueOrder: order, stepIndex })).before
  if (stepIndex === 22) {
    assert.equal(position.entries, saved.entries)
    assert.deepEqual(position.eliminations, saved.eliminations)
    assert.deepEqual(await seed.request({ type: 'variant', operation: 'candidates', position }), saved.domains)
  }
  cases.push({ name: `HCHW-${stepIndex}`, request: { type: 'variant', operation: 'hints', position,
    techniqueOrder: ['quintuple-pattern-overlay'], limit: 0xffff_ffff }, expected: 0 })
}
const methods = ['pattern-overlay', 'pairwise-pattern-overlay', 'triple-pattern-overlay', 'quadruple-pattern-overlay', 'quintuple-pattern-overlay']
for (const technique of methods) {
  const [exercise] = await seed.request({ type: 'practice-examples', technique })
  const values = [...exercise.givens].map((digit, cell) => exercise.entries?.[cell] && exercise.entries[cell] !== '0' ? exercise.entries[cell] : digit).join('')
  cases.push({ name: `classic-${technique}`, request: { type: 'deductions', values, eliminations: exercise.eliminations, techniqueOrder: [technique] }, positive: true })
  const [variantExercise] = await seed.request({ type: 'practice-examples', variant: true, technique })
  cases.push({ name: `variant-${technique}`, request: { type: 'variant', operation: 'hints', position: variantExercise.position, techniqueOrder: [technique], limit: 0xffff_ffff }, positive: true })
  cases.push({ name: `empty-${technique}`, request: { type: 'deductions', values: '0'.repeat(81), techniqueOrder: [technique] }, expectedError: 'multiple' })
}
for (const [name, techniqueOrder, expected] of [
  ['Murphy-full', order, 179],
  ['Murphy-quintuple', ['quintuple-pattern-overlay'], 5],
]) {
  if (!selected.includes(name)) continue
  const { puzzle } = await load('x-sum-murphy')
  cases.push({ name, request: { type: 'variant', operation: 'hints', position: { puzzle },
    techniqueOrder, difficulty: 'hard', limit: 0xffff_ffff }, expected, checkpoints: true })
}
for (const name of selected) assert.ok(cases.some(source => source.name === name), `Unknown case ${name}`)
console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
  artifacts: binaries.map(bytes => ({ raw: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') })),
  samples, warmups, method: 'Fresh instances per case, alternate execution order. Include serialization; exclude assertions, instantiation, worker startup/transfer and rendering. Zero warmups retains the first request in the raw samples. Complete replies match outside timing; small-sample p95 is the maximum.' }))
const summary = times => [0.5, 0.95].map(q => Number(times.toSorted((a,b) => a-b)[Math.ceil(q * times.length)-1].toFixed(3)))
for (const source of cases.filter(source => !selected.length || selected.includes(source.name))) {
  const pair = await Promise.all(binaries.map(engine)), times = [[], []]
  let expected
  for (let round = 0; round < warmups + samples; round++) {
    for (const index of round % 2 ? [1, 0] : [0, 1]) {
      if (source.checkpoints) console.error(JSON.stringify({ status: 'started', name: source.name, round, engine: index }))
      const start = performance.now(), actual = await pair[index].request(source.request), elapsed = performance.now() - start
      if (source.checkpoints) console.error(JSON.stringify({ status: 'complete', name: source.name, round,
        engine: index, elapsed, warmup: round < warmups, proofCount: actual.length,
        responseSha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex') }))
      if (expected === undefined) expected = actual
      else assert.deepEqual(actual, expected, `${source.name}: engine ${index}`)
      if (source.positive) assert.ok(actual.length > 0)
      else if (source.expectedError) assert.equal(actual.engineError, source.expectedError)
      else assert.equal(actual.length, source.expected)
      if (round >= warmups) times[index].push(elapsed)
    }
  }
  console.log(JSON.stringify({ name: source.name, proofs: Array.isArray(expected) ? expected.length : undefined, error: expected.engineError, medianP95: times.map(summary), samples: times, memoryBytes: pair.map(engine => engine.memory()) }))
}
