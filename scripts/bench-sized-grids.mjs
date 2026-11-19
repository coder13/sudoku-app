import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'

const warmup = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
async function engine(path) {
  const binary = readFileSync(path)
  const { instance: { exports: e } } = await WebAssembly.instantiate(binary)
  const prepare = message => encoder.encode(JSON.stringify(message))
  const run = input => {
    const offset = e.request_buffer(input.length)
    new Uint8Array(e.memory.buffer, offset, input.length).set(input)
    const length = e.run_request()
    const result = JSON.parse(decoder.decode(new Uint8Array(e.memory.buffer, e.response_buffer(), length)))
    assert.ok('value' in result, JSON.stringify(result))
    return result.value
  }
  const board = [...warmup].map(Number)
  const classicAbi = operation => {
    new Uint8Array(e.memory.buffer, e.board_buffer(), 81).set(board)
    return e[operation]()
  }
  return { e, prepare, run, classicAbi, bytes: binary.length, gzip: gzipSync(binary).length }
}
function measure(call, batch = 100) {
  for (let i = 0; i < batch; i++) call(i)
  const timings = []
  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    for (let j = 0; j < batch; j++) call(i * batch + j)
    timings.push((performance.now() - start) * 1000 / batch)
  }
  timings.sort((l, r) => l - r)
  return [timings[15], timings[28]].map(x => Math.round(x * 100) / 100)
}
const [baselinePath, sizedPath = 'src/sudoku/generated/engine.wasm'] = process.argv.slice(2)
if (!baselinePath) throw new Error('Usage: node scripts/bench-sized-grids.mjs BASELINE_WASM [SIZED_WASM]')
const [baseline, sized] = await Promise.all([baselinePath, sizedPath].map(engine))
for (const [label, build] of [['baseline',baseline],['sized',sized]]) {
  const { e, classicAbi, prepare, run, bytes, gzip } = build
  const hints = prepare({ type:'hints', values:warmup, limit:10 })
  const memoryBefore = e.memory.buffer.byteLength
  const checks = Object.fromEntries(['analyze_board','fill_notes','solve_board'].map(name => [name, measure(() => classicAbi(name), 1000)]))
  console.log(label, { bytes, gzip, memoryBefore, ...checks, hints: measure(() => run(hints), 10), memoryAfter: e.memory.buffer.byteLength })
}
const gridRuns = []
for (const [size, boxRows, boxColumns] of [[4,2,2],[6,2,3],[8,2,4],[12,3,4],[16,4,4]]) {
  const position = {
    version:2, grid:{ size, boxRows, boxColumns },
    digits: Array.from({length:size*size}, (_,i) => {
      const row = Math.floor(i / size), column = i % size
      return (2 * row + column) % 5 < 2 ? 0 : (boxColumns * (row % boxRows) + Math.floor(row / boxRows) + column) % size + 1
    }),
  }
  const tests = ['analyze','candidates','next-deduction','solve','trace']
  const row = [size]
  for (const operation of tests) {
    const message = sized.prepare({ type:'sized-classic', position, operation })
    const result = sized.run(message)
    assert.ok(result != null, JSON.stringify({ size, operation, result }))
    if (operation === 'analyze') assert.equal(result, 'unique')
    if (operation === 'trace') assert.ok(result.at(-1).digits.every(Boolean))
    row.push(measure(() => sized.run(message), operation === 'trace' ? 10 : 100))
  }
  gridRuns.push(row)
}
console.log('Sized grids: [size, analyze, candidates, next deduction, solve, trace], all in microseconds [p50,p95]', gridRuns)
for (const difficulty of ['easy','medium']) {
  const requests = Array.from({length:1000}, (_, seed) => sized.prepare({ type:'generate-mini', seed, difficulty }))
  const pass = requests.map(sized.run)
  assert.ok(pass.every(digits => digits.length === 16))
  console.log(difficulty, { observedYield: pass.length, generation:measure(i => sized.run(requests[i % requests.length]), 50) })
}
console.log({ sizedMemoryAfterAllOperations: sized.e.memory.buffer.byteLength })
