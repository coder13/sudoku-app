import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath] = process.argv.slice(2)
assert.ok(beforePath && afterPath,
  'Usage: node --experimental-strip-types scripts/bench-region-sum-rating.mjs before.wasm after.wasm')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const log = row => console.log(JSON.stringify(row))
const builds = []
let id = 0
for (const [build, path] of [beforePath, afterPath].entries()) {
  const bytes = await readFile(path)
  const start = performance.now()
  const { instance } = await WebAssembly.instantiate(bytes)
  log({ build, phase: 'instantiate', durationMs: performance.now() - start, fileSha256: sha256(bytes),
    rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length })
  const handle = createEngineHandler(async () => instance.exports)
  builds.push({
    async request(input) {
      const { id: _, ...response } = await handle({ id: ++id, request: input })
      return response
    },
    memory: instance.exports.memory,
  })
}
const classic = (await builds[0].request({ type: 'techniques' })).value
const variant = (await builds[0].request({ type: 'techniques', variant: true })).value
assert.deepEqual((await builds[1].request({ type: 'techniques' })).value, classic)
assert.deepEqual((await builds[1].request({ type: 'techniques', variant: true })).value, variant)
const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty])))
const source = await readFile(new URL('../tests/fixtures/region-sum-coach.json', import.meta.url))
const { examples } = JSON.parse(source)
const sourceHash = sha256(source)
const samples = 5
const warmups = 1
log({ host: { node: process.version, v8: process.versions.v8 }, samples, warmups, sourceHash, techniqueOrder })
const controls = [
  ['8AGt', 'rate'], ['8AGt', 'trace'], ['91BB', 'rate'], ['8oer', 'rate'], ['FaxQ', 'rate'],
  ['8AGt', 'guardian'], ['FaxQ', 'guardian'],
]
for (const [control, [slug, operation]] of controls.entries()) {
  const { puzzle, solution } = examples.find(example => example.url.endsWith('/' + slug))
  const request = { type: 'variant', operation: operation === 'guardian' ? 'hints' : operation,
    position: { puzzle }, techniqueOrder: operation === 'guardian' ? ['tridagon-forcing-net'] : techniqueOrder,
    ...(operation === 'guardian' ? { limit: 0xffff_ffff } : {}) }
  let reference, responseSha256
  for (let round = -1; round < warmups + samples; round++) {
    for (const build of (round + control) % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now()
      const reply = await builds[build].request(request)
      const durationMs = performance.now() - start
      assert.ok('value' in reply)
      reference ??= reply
      assert.deepEqual(reply, reference)
      responseSha256 ??= sha256(JSON.stringify(reference))
      if (slug === '8AGt' && operation === 'rate') assert.equal(reply.value.points, 4058)
      if (slug === '8AGt' && operation === 'trace') {
        assert.equal(reply.value.steps.length, 185)
        assert.equal(reply.value.rating.points, 4058)
        const { entries } = reply.value.end
        assert.equal(Array.from(puzzle.givens, (given, cell) => given === '0' ? entries[cell] : given).join(''), solution)
      }
      log({ build, slug, operation, phase: round < 0 ? 'first' : round < warmups ? 'warmup' : 'sample', round,
        durationMs, responseSha256, capacityBytes: builds[build].memory.buffer.byteLength,
        ...(operation === 'guardian' ? { proofCount: reply.value.length } : {}) })
    }
  }
}
