import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'

const binaries = process.argv.slice(2)
assert.ok(binaries.length >= 2,
  'Usage: node --experimental-strip-types scripts/bench-forcing-modes.mjs before.wasm after.wasm')
const log = row => console.log(JSON.stringify(row))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const engines = []
for (const [build, path] of binaries.entries()) {
  const bytes = await readFile(path)
  const { instance } = await WebAssembly.instantiate(bytes)
  log({ build, path, wasmSha256: sha256(bytes) })
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  engines.push({
    async request(request) {
      const reply = await handle({ id: ++id, request })
      assert.ok('value' in reply, JSON.stringify(reply))
      return reply.value
    },
    capacity: () => instance.exports.memory.buffer.byteLength,
  })
}
const source = await readFile(new URL('../tests/fixtures/region-sum-coach.json', import.meta.url))
const { examples } = JSON.parse(source)
const { puzzle } = examples.find(example => example.url.endsWith('/8AGt'))
const modes = ['forcing-chain', 'forcing-net', 'dynamic-forcing-net', 'advanced-forcing-net', 'nested-forcing-net', 'tridagon-forcing-net']
const warmups = 2
const samples = 9
log({ warmups, samples, modes, node: process.version, sourceSha256: sha256(source) })
for (const technique of modes) {
  const [exercise] = await engines[0].request({ type: 'practice-examples', technique, variant: true })
  assert.ok(exercise)
  const controls = [
    ['positive-practice', exercise.position, exercise.suggestion],
    ['8AGt-opening', { puzzle }, null],
  ]
  for (const [fixture, position, suggestion] of controls) {
    const request = { type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff }
    log({ fixture, technique, requestSha256: sha256(JSON.stringify(request)) })
    let expected, responseSha256
    for (let round = -1; round < warmups + samples; round++) {
      for (let offset = 0; offset < engines.length; offset++) {
        const build = (offset + round + 1) % engines.length
        const start = performance.now()
        const proofs = await engines[build].request(request)
        const durationMs = performance.now() - start
        if (expected === undefined) {
          if (suggestion) assert.ok(proofs.some(proof => proof.actions.some(action =>
            JSON.stringify(action) === JSON.stringify(suggestion))))
          expected = proofs
          responseSha256 = sha256(JSON.stringify(proofs))
        }
        assert.deepEqual(proofs, expected)
        log({ build, phase: round < 0 ? 'first' : round < warmups ? 'warmup' : 'sample', round,
          fixture, technique, durationMs, responseSha256, count: proofs.length, capacityBytes: engines[build].capacity() })
      }
    }
  }
}
