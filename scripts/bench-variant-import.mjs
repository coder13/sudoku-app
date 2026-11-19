import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'

const [baselineCheckout, baselineWasm, candidateWasm] = process.argv.slice(2)
assert(baselineCheckout && baselineWasm && candidateWasm,
  'Pass the baseline checkout, baseline app Wasm, and candidate app Wasm.')
const baseline = await import(pathToFileURL(resolve(baselineCheckout, 'src/sudoku/puzzle-preview.ts')))
const sha256 = data => createHash('sha256').update(data).digest('hex')
const emit = row => console.log(JSON.stringify(row))
const fixture = async name => JSON.parse(await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url)))
const names = [
  'little-killer-menace', 'little-killer-newman', 'little-killer-murphy', 'little-killer-jigsaw-mixed',
  'renban-killer-clover', 'sandwich-coach-9VLq', 'x-sum-murphy', 'region-sum-newman',
]
const sources = await Promise.all(names.map(async name => ({
  name, ...await fixture(name),
})))
const builds = await Promise.all([
  { name: 'baseline', file: baselineWasm, preview: baseline.prepareImportedPuzzle },
  { name: 'candidate', file: candidateWasm, preview: prepareImportedPuzzle },
].map(async build => ({ ...build, bytes: await readFile(build.file) })))
const samples = 5, warmups = 1
emit({ status: 'manifest', node: process.version, v8: process.versions.v8, kernel: release(), cpu: cpus()[0].model,
  samples, warmups, fixtures: await Promise.all(names.map(async name => ({ name,
    sha256: sha256(await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url))) }))),
  builds: builds.map(({ name, file, bytes }) =>
    ({ name, file, sha256: sha256(bytes), bytes: bytes.length, gzipBytes: gzipSync(bytes).length })) })

let active, calls, id = 0
const unwrap = ({ id: _, ...reply }) => reply
globalThis.Worker = class {
  postMessage(message) {
    const start = performance.now()
    void active.handle(message).then(reply => {
      if (calls) calls.push({ request: message.request, reply: unwrap(reply), elapsedMs: performance.now() - start })
      this.onmessage?.({ data: reply })
    })
  }
}

async function request(build, input) {
  return unwrap(await build.handle({ id: ++id, request: input }))
}

const share = puzzle => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
const previewValue = ({ game: { id: _, created, ...game }, ...rest }) => ({ ...rest, game })
const exactOperations = new Set(['analyze', 'solve', 'solve-unique'])
async function sample(build, source, phase, round, saved) {
  active = build
  calls = []
  const start = performance.now()
  const result = await build.preview(share(source.puzzle), saved ? [saved] : [])
  const elapsedMs = performance.now() - start
  assert.equal(result.game.variant?.solution, source.solution)
  assert.deepEqual(result.game.variant?.puzzle, source.puzzle)
  const exact = calls.filter(call => call.request.type === 'variant' && exactOperations.has(call.request.operation))
  assert.deepEqual(exact.map(call => call.request.operation), saved ? []
    : build.name === 'baseline' ? ['analyze', 'solve'] : ['solve-unique'])
  const preview = previewValue(result)
  emit({ status: phase, build: build.name, fixture: source.name, round, elapsedMs,
    engineCalls: calls.map(({ request, reply, elapsedMs }) => ({
      type: request.type, operation: request.operation, elapsedMs, replySha256: sha256(JSON.stringify(reply)),
    })),
    previewSha256: sha256(JSON.stringify(preview)), wasmCapacityBytes: build.memory.buffer.byteLength,
    processMaxRssKiB: process.resourceUsage().maxRSS })
  calls = undefined
  return result
}

const first = []
for (const build of builds) {
  const start = performance.now()
  const { instance } = await WebAssembly.instantiate(build.bytes)
  emit({ status: 'instantiate', build: build.name, elapsedMs: performance.now() - start,
    wasmCapacityBytes: instance.exports.memory.buffer.byteLength })
  build.handle = createEngineHandler(async () => instance.exports)
  build.memory = instance.exports.memory
  first.push(await sample(build, sources[0], 'cold', 0))
}
assert.deepEqual(previewValue(first[0]), previewValue(first[1]))

for (const [index, source] of sources.entries()) {
  const saved = {}
  for (let round = 0; round < samples + warmups; round++) {
    const outcomes = []
    for (const build of (index + round) % 2 ? builds.toReversed() : builds) {
      const result = await sample(build, source, round < warmups ? 'warmup' : 'sample', round)
      saved[build.name] = result.game
      outcomes.push(previewValue(result))
    }
    assert.deepEqual(outcomes[0], outcomes[1], source.name)
  }
  const cached = []
  for (const build of builds) cached.push(previewValue(await sample(build, source, 'saved', 0, saved[build.name])))
  assert.deepEqual(cached[0], cached[1], source.name)
}

const engineFixtures = JSON.parse(await readFile(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url)))
const controls = [
  ...engineFixtures.map(({ name, position }) => ({ name, position })),
  ...sources.slice(1).map(({ name, puzzle, solution }) => {
    const cell = puzzle.givens.indexOf('0')
    const entries = Array(81).fill('0')
    entries[cell] = solution[cell]
    const eliminations = Array(81).fill(0)
    const empty = puzzle.givens.indexOf('0', cell + 1)
    if (empty !== -1) eliminations[empty] = 511 ^ (1 << (Number(solution[empty]) - 1))
    return { name: `${name}-progressed`, position: { puzzle, entries: entries.join(''), eliminations } }
  }),
  { name: 'Renban ModE with a tight budget', position: { puzzle: sources[0].puzzle }, maxNodes: 20_000 },
]
for (const { name, ...control } of controls) {
  const base = { type: 'variant', ...control }
  const old = await request(builds[0], { ...base, operation: 'analyze' })
  assert.deepEqual(await request(builds[1], { ...base, operation: 'analyze' }), old)
  const result = await request(builds[1], { ...base, operation: 'solve-unique' })
  assert.equal(result.value.status, old.value)
  if (old.value === 'unique') {
    const solution = await request(builds[0], { ...base, operation: 'solve' })
    assert.deepEqual(result, { value: { status: 'unique', solution: solution.value } })
  } else {
    assert.deepEqual(result, { value: { status: old.value } })
  }
  emit({ status: 'exact-control', name, request: base, result })
}
emit({ status: 'complete', pairedPreviews: sources.length * (warmups + samples) + 1,
  savedPreviews: sources.length, exactControls: controls.length })
