import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'
const [mainPath, currentPath, technique = 'region-sum-distinct'] = process.argv.slice(2)
assert.ok(mainPath && currentPath, 'Pass the paths to the released and current app Wasm files.')
assert.ok(['region-sum-distinct', 'region-sum-house'].includes(technique), 'Choose a Region Sum technique to compare.')
useWasmWorker(currentPath)

async function engine(path) {
  const bytes = readFileSync(path)
  const { instance } = await WebAssembly.instantiate(bytes)
  console.log(JSON.stringify({ path, bytes: bytes.length, gzip: gzipSync(bytes).length }))
  const handler = createEngineHandler(async () => instance.exports)
  return async request => {
    const { value, error } = await handler({ id: 1, request })
    assert.notEqual(value, undefined, error)
    return value
  }
}
const main = await engine(mainPath)
const after = await engine(currentPath)
const read = n => JSON.parse(readFileSync('tests/fixtures/' + n + '.json', 'utf8'))
const cases = [
  { ...read('region-sum-newman'), url: 'https://fixture/Symmetease' },
  ...read('region-sum-coach').examples,
  ...read('modular-coach').examples.filter(x => x.url.endsWith('/7rs9') || x.url.endsWith('/HCHW'))
    .map(x => ({ ...x, puzzle: x.publishedPuzzle ?? x.puzzle })),
]
const summary = samples => {
  const sorted = [...samples].sort((a, b) => a - b)
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] }
}
const clock = process.threadCpuUsage
  ? () => { const { user, system } = process.threadCpuUsage(); return (user + system) / 1000 }
  : () => performance.now()
console.log(JSON.stringify({ timing: process.threadCpuUsage ? 'thread-cpu-ms' : 'wall-ms', samples: 7 }))
const expectedChange = new Set(technique === 'region-sum-house'
  ? ['Symmetease', 'FaxQ'] : ['91BB', '8AGt', '8oer', 'FaxQ', '7rs9'])
for (const { puzzle, solution, url } of cases) {
  const id = url.split('/').at(-1)
  const techniqueOrder = (await getVariantPlayOrder(puzzle))
    .filter(id => technique === 'region-sum-house' || id !== 'region-sum-house')
  const original = techniqueOrder.filter(id => id !== technique)
  const gradeFor = async (engine, techniqueOrder) => {
    const rating = await engine({ type: 'variant', operation: 'rate', position: { puzzle }, techniqueOrder })
    return rating.status.solved ?? 'medium'
  }
  const previousDifficulty = await gradeFor(main, original)
  const currentDifficulty = await gradeFor(after, techniqueOrder)
  const table = {}
  for (const operation of ['candidates', 'solve-unique', 'rate', 'hints']) {
    const makeRequest = (order, difficulty) => ({
      type: 'variant', operation, position: { puzzle },
      ...(['rate', 'hints'].includes(operation) && { techniqueOrder: order }),
      ...(operation === 'hints' && { limit: 10, preferProgress: true, difficulty }),
    })
    const previousRequest = makeRequest(original, previousDifficulty)
    const currentRequest = makeRequest(techniqueOrder, currentDifficulty)
    const run = [() => main(previousRequest), () => after(currentRequest)]
    const baseline = await run[0]()
    const control = await after(previousRequest)
    const target = await run[1]()
    const normalized = result => operation === 'rate' ? { ...result, scoringVersion: baseline.scoringVersion } : result
    assert.deepEqual(normalized(control), baseline, id + ' ' + operation + ' disabled')
    if (!['rate', 'hints'].includes(operation)) assert.deepEqual(target, baseline, id + ' ' + operation)
    if (!expectedChange.has(id) && operation === 'hints') assert.deepEqual(target, baseline, id + ' ' + operation)
    if (!expectedChange.has(id) && operation === 'rate') assert.deepEqual({ ...normalized(target), techniqueOrder: original }, baseline, id)
    if (operation === 'solve-unique') assert.deepEqual(target, { status: 'unique', solution }, id)
    const timings = [[], []]
    for (let attempt = 0; attempt < 7; attempt++) {
      for (const index of attempt % 2 ? [1, 0] : [0, 1]) {
        const start = clock()
        await run[index]()
        timings[index].push(clock() - start)
      }
    }
    table[operation] = timings.map(summary)
  }
  console.log(JSON.stringify({ id, table }))
}
