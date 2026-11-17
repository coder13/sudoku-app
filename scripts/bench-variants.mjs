import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const fixtures = JSON.parse(await readFile(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url), 'utf8'))
const mixed = JSON.parse(await readFile(new URL('../tests/fixtures/mixed-puzzles.json', import.meta.url), 'utf8'))
const combined = JSON.parse(await readFile(new URL('../tests/fixtures/combined-families.json', import.meta.url), 'utf8'))
const quadruple = JSON.parse(await readFile(new URL('../tests/fixtures/quadruple-clover.json', import.meta.url), 'utf8'))
const parity = JSON.parse(await readFile(new URL('../tests/fixtures/parity-big-eight.json', import.meta.url), 'utf8'))
fixtures.push({
  name: 'x-killer', position: mixed['x-killer'].puzzle,
  template: { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' },
  ] },
  derivedClues: [{ type: 'killer-cage-sizes', sizes: Array(27).fill(3), coverGrid: true }], givens: 8,
}, { name: 'all-families', position: combined.puzzle }, {
  name: 'quadruple', position: quadruple.puzzle,
  template: { version: 1, givens: '0'.repeat(81) },
  derivedClues: Array.from({ length: 64 }, (_, i) => ({ type: 'quadruple', topLeft: Math.floor(i / 8) * 9 + i % 8, clueSize: 4 })),
  givens: 0,
}, {
  name: 'parity', position: parity.puzzle,
  template: { version: 1, givens: '0'.repeat(81) },
  derivedClues: [{ type: 'parity', cells: Array.from({ length: 81 }, (_, cell) => cell) }],
  givens: 30,
})
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

async function sample(input, count = samples) {
  for (let index = 0; index < 5; index++) await request(input)
  const measurements = []
  for (let index = 0; index < count; index++) {
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

  if (!template) {
    console.log(`${name.padEnd(16)} candidates ${candidates}  verify ${validation}  solve ${solve}  rate ${rating}  hints ${hints}  generate not configured`)
    continue
  }
  const measurements = []
  let matches = 0
  for (let seed = 1; seed <= seeds; seed++) {
    const start = performance.now()
    const response = await handle({
      id: ++id,
      request: { type: 'generate-variant', seed, maxAttempts, maxNodes, template, derivedClues, givens,
        ...(name === 'quadruple' && { requiredRule: 'quadruple', variantClues: 64 }) },
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

// Repeat the actual app's merged technique order and useful-progress policy.
// The exhaustive request still searches every enabled technique before paging.
const classicCatalog = await request({ type: 'techniques' })
const variantCatalog = await request({ type: 'techniques', variant: true })
const appOrder = variantTechniqueOrder(variantCatalog.defaultOrder, classicCatalog.difficultyOrder,
  Object.fromEntries([...classicCatalog.techniques, ...variantCatalog.techniques].map(technique => [technique.id, technique.difficulty])))
for (const [name, fixture] of [['quadruple', quadruple], ['parity', parity]]) {
  const appHints = { type: 'variant', operation: 'hints', position: { puzzle: fixture.puzzle },
    techniqueOrder: appOrder, preferProgress: true, difficulty: 'medium' }
  const appRate = await sample({ type: 'variant', operation: 'rate', position: appHints.position, techniqueOrder: appOrder })
  const topTen = await sample({ ...appHints, limit: 10 })
  const exhaustive = await sample({ ...appHints, limit: 0xffff_ffff, collection: 100 }, 10)
  const firstPage = await request({ ...appHints, limit: 0xffff_ffff, collection: 100 })
  console.log(`${name} app    rate ${appRate}, ten hints ${topTen} (${samples} samples); exhaustive first page ${exhaustive} (10 samples), ${firstPage.available} choices, ${firstPage.choices.length} transferred`)
}
