import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, hostname, release } from 'node:os'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const quintuple = 'quintuple-pattern-overlay'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function engine(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return {
    async request(request) {
      const { id: _, ...response } = await handle({ id: ++id, request })
      return response
    },
    capacity: () => instance.exports.memory.buffer.byteLength,
  }
}

if (process.argv[2] === '--probe') {
  process.once('message', async ({ wasm, wasmSha256, request }) => {
    const bytes = readFileSync(wasm)
    assert.equal(sha256(bytes), wasmSha256)
    const api = await engine(bytes)
    const start = performance.now()
    const response = await api.request(request)
    process.send({
      elapsedMs: performance.now() - start,
      linearCapacityBytes: api.capacity(),
      peakRssKiB: process.resourceUsage().maxRSS,
      response,
    }, error => {
      if (error) throw error
      process.disconnect()
    })
  })
} else {
  const [fixture, wasm, log, mode, timeoutArg, workersArg = '1'] = process.argv.slice(2)
  const timeoutMs = Number(timeoutArg), workerCount = Number(workersArg)
  assert.ok(fixture && wasm && log && mode && Number.isSafeInteger(timeoutMs) && timeoutMs > 0
    && timeoutMs <= 2_147_483_647 && Number.isSafeInteger(workerCount) && workerCount > 0,
  'Usage: node --experimental-strip-types scripts/profile-exhaustive-hints.mjs fixture.json engine.wasm results.jsonl full|each|without-quintuple|trace|technique-id timeout-ms [workers]')
  const bytes = readFileSync(wasm)
  const fixtureBytes = readFileSync(fixture)
  const source = JSON.parse(fixtureBytes)
  const position = source.position ?? { puzzle: source.puzzle ?? source }
  const api = await engine(bytes)
  const { value: classic } = await api.request({ type: 'techniques' })
  const { value: variant } = await api.request({ type: 'techniques', variant: true })
  const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
    Object.fromEntries([...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty])))
  const selections = new Map([
    ['full', order],
    ['without-quintuple', order.filter(id => id !== quintuple)],
    ['trace', order],
    ...order.map(id => [id, [id]]),
  ])
  assert.ok(mode === 'each' || selections.has(mode), 'Unknown scan or technique ID')
  const jobs = (mode === 'each' ? order : [mode]).map(name => ({
    name,
    request: {
      type: 'variant', operation: name === 'trace' ? 'trace' : 'hints', position,
      techniqueOrder: selections.get(name),
      ...(name === 'trace' ? {} : { limit: 0xffff_ffff, difficulty: 'hard' }),
    },
  }))
  const wasmSha256 = sha256(bytes)
  writeFileSync(log, JSON.stringify({
    status: 'manifest', mode, suiteOrder: order, jobs, timeoutMs, workerCount,
    fixture, fixtureSha256: sha256(fixtureBytes), wasm, wasmSha256,
    wasmBytes: bytes.length, wasmGzipBytes: gzipSync(bytes).length,
    host: hostname(), kernel: release(), cpu: cpus()[0]?.model,
    node: process.version, v8: process.versions.v8,
  }) + '\n', { flag: 'wx' })

  function probe({ name, request }) {
    appendFileSync(log, JSON.stringify({ status: 'started', name }) + '\n')
    return new Promise(resolve => {
      const start = performance.now()
      const child = fork(fileURLToPath(import.meta.url), ['--probe'])
      let result, expired = false
      const timer = setTimeout(() => {
        expired = true
        child.kill('SIGKILL')
      }, timeoutMs)
      child.on('message', message => { result = message })
      child.on('error', error => { result = { error: error.message } })
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer)
        const status = expired ? 'timeout' : exitCode === 0 && result?.response ? 'complete' : 'error'
        appendFileSync(log, JSON.stringify({
          status, name, wallMs: performance.now() - start, exitCode, signal, ...result,
        }) + '\n')
        if (status === 'error' || (status === 'complete' && !('value' in result.response))) process.exitCode = 1
        resolve()
      })
      child.send({ wasm, wasmSha256, request }, error => {
        if (error && !expired) result = { error: error.message }
      })
    })
  }

  let next = 0
  await Promise.all(Array.from({ length: Math.min(workerCount, jobs.length) }, async () => {
    while (next < jobs.length) await probe(jobs[next++])
  }))
}
