import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { buildBrowserEngine } from './build-wasm.mjs'
import { engineBuildProfiles } from './engine-build-profiles.mjs'

const root = mkdtempSync(join(tmpdir(), 'sudoku-wasm-profiles-'))
const givens = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const solved = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const results = []
let reference
try {
  for (const profile of ['unknown', 'toString', '__proto__']) {
    await assert.rejects(buildBrowserEngine(profile), /Choose an engine build profile/)
  }
  for (const [profile, features] of Object.entries(engineBuildProfiles)) {
    const output = join(root, profile)
    await buildBrowserEngine(profile, output)
    const bytes = readFileSync(join(output, 'engine.wasm'))
    const { instance: { exports: engine }, module } = await WebAssembly.instantiate(bytes)
    assert.equal(WebAssembly.Module.customSections(module, 'name').length, 0)
    const request = message => {
      const input = Buffer.from(JSON.stringify(message))
      const offset = engine.request_buffer(input.length)
      new Uint8Array(engine.memory.buffer, offset, input.length).set(input)
      const length = engine.run_request()
      return JSON.parse(Buffer.from(new Uint8Array(engine.memory.buffer, engine.response_buffer(), length)))
    }
    const expected = { classic: true, ...Object.fromEntries(['variants', 'generation', 'teaching'].map(feature => [feature, features.includes(feature)])) }
    assert.deepEqual(request({ type: 'capabilities' }).value, expected)
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'engine-profile.json'))), { profile, features, capabilities: expected })
    assert.equal(typeof engine.generate_board === 'function', expected.generation)
    assert.equal(existsSync(join(output, 'lesson-examples.json')), expected.teaching)
    const rate = request({ type: 'rate', values: givens })
    assert.equal(rate.value?.status.solved, 'beginner')
    const hints = request({ type: 'hints', values: givens, limit: 10 })
    assert.ok(hints.value?.choices.length > 1)
    const catalog = request({ type: 'techniques' })
    const behavior = { rate, hints, catalog }
    if (reference) assert.deepEqual(behavior, reference, `${profile} changes Classic behavior`)
    else reference = behavior
    for (const [enabled, message] of [
      [expected.variants, { type: 'variant', operation: 'solve', position: { puzzle: { version: 1, givens: solved } } }],
      [expected.variants, { type: 'techniques', variant: true }],
      [expected.generation, { type: 'generate-constrained', seed: 17, maxAttempts: 1, clues: 81, score: [0, 0], templates: [solved] }],
      [expected.teaching, { type: 'practice-examples', technique: 'naked-single' }],
    ]) {
      const reply = request(message)
      if (enabled) assert.ok('value' in reply, JSON.stringify(reply))
      else assert.equal(reply.code, 'unsupported-capability', JSON.stringify(reply))
      assert.equal(request({ type: 'rate', values: solved }).value?.status.solved, 'beginner')
    }
    results.push({ profile, bytes: bytes.length, gzip: gzipSync(bytes).length })
  }
  const size = name => results.find(result => result.profile === name).bytes
  assert.ok(size('solver') < size('classic'))
  assert.ok(size('solver') < size('variant-solver'))
  assert.ok(size('classic') < size('app'))
  assert.ok(size('variant-solver') < size('app'))
  console.table(results)
} finally {
  rmSync(root, { recursive: true, force: true })
}
