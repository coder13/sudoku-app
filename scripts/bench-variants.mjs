import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'

const fixtures = JSON.parse(await readFile(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url), 'utf8'))
const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
const { instance } = await WebAssembly.instantiate(bytes)
const handle = createEngineHandler(async () => instance.exports)
const samples = 40
const seeds = 20
const maxAttempts = 6
const maxNodes = 20_000
let id = 0

function summary(measurements) {
  measurements.sort((a, b) => a - b)
  return [0.5, 0.95].map(fraction => measurements[Math.ceil(fraction * measurements.length) - 1].toFixed(3)).join('/')
}

async function request(input) {
  const response = await handle({ id: ++id, request: input })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value
}

async function sample(input) {
  for (let index = 0; index < 5; index++) await request(input)
  const measurements = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    await request(input)
    measurements.push(performance.now() - start)
  }
  return summary(measurements)
}

console.log(`Wasm on ${process.platform} ${process.arch}, Node ${process.version}. Latency in ms, median/p95.`)
console.log(`${bytes.length} raw bytes, ${gzipSync(bytes).length} gzip bytes.`)
for (const { name, position: puzzle, template, derivedClues, givens } of fixtures) {
  const position = { puzzle }
  assert.equal(await request({ type: 'variant', position, operation: 'analyze', maxNodes }), 'unique')
  const rating = name === 'classic'
    ? await sample({ type: 'rate', values: puzzle.givens })
    : await sample({ type: 'variant', position, operation: 'rate' })
  const hints = name === 'classic'
    ? await sample({ type: 'hints', values: puzzle.givens, limit: 10 })
    : await sample({ type: 'variant', position, operation: 'hints', limit: 10 })

  const candidates = await sample({ type: 'variant', position, operation: 'candidates' })
  const validation = await sample({ type: 'variant', position, operation: 'analyze', maxNodes })
  const solve = await sample({ type: 'variant', position, operation: 'solve', maxNodes })

  const measurements = []
  let matches = 0
  for (let seed = 1; seed <= seeds; seed++) {
    const start = performance.now()
    const response = await handle({
      id: ++id,
      request: { type: 'generate-variant', seed, maxAttempts, maxNodes, template, derivedClues, givens },
    })
    measurements.push(performance.now() - start)
    if ('value' in response) {
      assert.equal(response.value.givens, givens)
      matches++
    } else {
      assert.equal(response.code, 'search-limit', JSON.stringify(response))
    }
  }
  console.log(`${name.padEnd(16)} candidates ${candidates}  verify ${validation}  solve ${solve}  rate ${rating}  hints ${hints}  generate ${summary(measurements)}  matches ${matches}/${seeds}`)
}
