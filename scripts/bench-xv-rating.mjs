import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...args] = process.argv.slice(2)
const addedTechniques = args.filter(arg => arg.startsWith('--added-technique=')).map(arg => arg.slice('--added-technique='.length))
const inputPath = args.find(arg => !arg.startsWith('--added-technique='))
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/bench-xv-rating.mjs before.wasm after.wasm [native-inputs.json]')
const load = async name => JSON.parse(await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), 'utf8'))
let cases
if (inputPath) cases = JSON.parse(await readFile(inputPath, 'utf8')).cases
else {
  cases = await Promise.all(['xv-clover', 'xv-quadruple-clover'].map(async name => {
    const { puzzle, solution } = await load(name)
    return { name, position: { puzzle }, solution }
  }))
  for (const source of (await load('xv-coach')).examples.filter(source => !source.deferred.length)) {
    cases.push({ name: source.url.split('/').pop(), position: { puzzle: (await detectPuzzle(source.code)).variant.puzzle }, solution: source.solution })
  }
}
const binaries = await Promise.all([beforePath, afterPath].map(path => readFile(path)))
async function engine(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes)
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  const request = async request => {
    const response = await handle({ id: ++id, request })
    assert.ok('value' in response, JSON.stringify(response))
    return response.value
  }
  const classic = await request({ type: 'techniques' }), variant = await request({ type: 'techniques', variant: true })
  const appOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
    Object.fromEntries([...classic.techniques, ...variant.techniques].map(item => [item.id, item.difficulty])))
  return { request, appOrder, nativeOrder: variant.defaultOrder, memory: () => instance.exports.memory.buffer.byteLength }
}
const summary = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return [0.5, 0.95].map(q => Number(sorted[Math.ceil(q * sorted.length) - 1].toFixed(3)))
}
console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
  artifacts: binaries.map(bytes => ({ raw: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') })),
  addedTechniques,
  method: 'Alternate engines. Fixed candidates/exact/native rating/ordinary hints: 5 warmups/20 samples. App rating and exhaustive pages: 2/5. Include serialization, exclude instantiation, worker startup, transfer and rendering. Complete response checks outside timing. p95 of five is maximum.' }))
for (const fixture of cases) {
  const pair = await Promise.all(binaries.map(engine))
  for (const key of ['appOrder', 'nativeOrder']) {
    assert.deepEqual(pair[1][key].filter(id => !addedTechniques.includes(id)), pair[0][key])
    for (const id of addedTechniques) assert.ok(!pair[0][key].includes(id) && pair[1][key].includes(id))
  }
  for (const operation of ['candidates', 'analyze', 'solve', 'native-rate', 'app-rate', 'ten-hints', 'exhaustive']) {
    const requests = pair.map(engine => ({ type: 'variant', position: fixture.position,
      operation: ['native-rate', 'app-rate'].includes(operation) ? 'rate' : ['ten-hints', 'exhaustive'].includes(operation) ? 'hints' : operation,
      ...(['native-rate', 'app-rate', 'ten-hints', 'exhaustive'].includes(operation) && { techniqueOrder: operation === 'native-rate' ? engine.nativeOrder : engine.appOrder }),
      ...(operation === 'ten-hints' && { limit: 10, preferProgress: true, difficulty: 'medium' }),
      ...(operation === 'exhaustive' && { limit: 0xffff_ffff, collection: 111, preferProgress: true, difficulty: 'medium' }),
    }))
    const expected = await pair[0].request(requests[0])
    const updated = await pair[1].request(requests[1])
    const comparable = operation.endsWith('rate') ? { ...updated, techniqueOrder: updated.techniqueOrder.filter(id => !addedTechniques.includes(id)) } : updated
    assert.deepEqual(comparable, expected, `${fixture.name}: ${operation}`)
    if (operation === 'solve') assert.equal(expected, fixture.solution)
    if (operation === 'analyze') assert.equal(expected, 'unique')
    const times = [[], []], slow = ['app-rate', 'exhaustive'].includes(operation), warmups = slow ? 2 : 5, samples = slow ? 5 : 20
    for (let round = 0; round < warmups + samples; round++) for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now(), result = await pair[index].request(requests[index]), elapsed = performance.now() - start
      assert.deepEqual(result, index === 0 ? expected : updated, `${fixture.name}: ${operation}: engine ${index}`)
      if (round >= warmups) times[index].push(elapsed)
    }
    console.log(JSON.stringify({ name: fixture.name, operation, medianP95: times.map(summary),
      ...(operation.endsWith('rate') && { rating: { points: expected.points, status: expected.status, scoringVersion: expected.scoringVersion } }),
      ...(operation === 'ten-hints' && { choices: expected.length }), ...(operation === 'exhaustive' && { choices: expected.available }) }))
  }
  const traces = await Promise.all(pair.map(engine => engine.request({ type: 'variant', operation: 'trace', position: fixture.position, techniqueOrder: engine.appOrder })))
  assert.deepEqual({ ...traces[1], rating: { ...traces[1].rating, techniqueOrder: traces[1].rating.techniqueOrder.filter(id => !addedTechniques.includes(id)) } }, traces[0], `${fixture.name}: complete ordered trace`)
  console.log(JSON.stringify({ name: fixture.name, traceSteps: traces[0].steps.length, memoryBytes: pair.map(engine => engine.memory()) }))
}
