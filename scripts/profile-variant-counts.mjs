import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { createCountWorker } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [fixturePath, ...args] = process.argv.slice(2)
assert.ok(fixturePath, 'Usage: node --experimental-strip-types scripts/profile-variant-counts.mjs fixture.json [--source-id=ID] [engine.wasm] [--warmups=N] [--samples=N]')
const option = name => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const wasmPath = args.find(value => !value.startsWith('--'))
const warmups = Number(option('warmups') ?? 2)
const samples = Number(option('samples') ?? 5)
assert.ok(Number.isInteger(warmups) && warmups >= 0 && Number.isInteger(samples) && samples >= 1,
  'Warmups must be nonnegative and samples must be positive integers.')

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const sourceId = option('source-id')
const source = Array.isArray(fixture)
  ? fixture.find(value => value.url?.match(/\/s\/([^/]+)/)?.[1] === sourceId)
  : fixture
assert.ok(source, `No source ${sourceId ?? ''} in ${fixturePath}.`)
const imported = typeof source.coach === 'string' ? await detectPuzzle(source.coach) : undefined
const position = source.position ?? (imported?.variant ? { puzzle: imported.variant.puzzle } : { puzzle: source.puzzle ?? source })
assert.ok(position.puzzle && typeof position.puzzle.givens === 'string', 'Fixture must contain a variant puzzle position.')
const wasm = await readFile(wasmPath ?? new URL('../src/sudoku/generated/engine.wasm', import.meta.url))

async function engineHandler() {
  const { instance } = await WebAssembly.instantiate(wasm)
  return createEngineHandler(async () => instance.exports)
}

const classicHandler = await engineHandler()
const variantHandler = await engineHandler()
let metadataRequest = 0
async function metadata(request) {
  const response = await classicHandler({ id: ++metadataRequest, request })
  assert.ok('value' in response, JSON.stringify(response))
  return response.value
}
const classic = await metadata({ type: 'techniques' })
const variant = await metadata({ type: 'techniques', variant: true })
const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques]
    .map(technique => [technique.id, technique.difficulty])))

let referenceRequest = 0
async function referenceCounts() {
  const counts = {}
  for (let index = 0; index < techniqueOrder.length; index++) {
    const prefix = techniqueOrder.slice(0, index + 1)
    const response = await classicHandler({ id: ++referenceRequest, request: {
      type: 'variant', operation: 'hints', position, techniqueOrder: prefix, limit: 0xffff_ffff,
    } })
    assert.ok('value' in response, JSON.stringify(response))
    const covered = new Set(), targets = new Set()
    for (const id of prefix) {
      for (const hint of response.value) {
        if (hint.technique !== id) continue
        for (const action of hint.actions) {
          const { cell, digit } = 'place' in action ? action.place : action.eliminate
          const target = `${cell}:${digit}`
          if (id === prefix.at(-1) && !covered.has(target)) targets.add(target)
          covered.add(target)
        }
      }
    }
    counts[techniqueOrder[index]] = targets.size
  }
  return counts
}

class ProfileWorker {
  onmessage
  onerror
  constructor() { this.handle = variantHandler }
  postMessage(message) {
    void this.handle(message).then(data => this.onmessage?.({ data }), () => this.onerror?.())
  }
  terminate() {}
}
Object.defineProperty(globalThis, 'Worker', { value: ProfileWorker, configurable: true })

async function sharedCounts() {
  const scan = createCountWorker(position.puzzle.givens, position.eliminations,
    position, position.visibility, techniqueOrder)
  try {
    return Object.fromEntries(await Promise.all(techniqueOrder.map(async technique =>
      [technique, await scan.count(technique)])))
  } finally {
    scan.close()
  }
}

function measure(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b)
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1)),
    samples: sorted.length,
  }
}

for (let index = 0; index < warmups; index++) {
  const expected = await referenceCounts()
  assert.deepEqual(await sharedCounts(), expected)
}

const referenceTimes = [], sharedTimes = []
for (let index = 0; index < samples; index++) {
  let start = performance.now()
  const expected = await referenceCounts()
  referenceTimes.push(performance.now() - start)
  start = performance.now()
  const actual = await sharedCounts()
  sharedTimes.push(performance.now() - start)
  assert.deepEqual(actual, expected)
}

const reference = measure(referenceTimes)
const shared = measure(sharedTimes)
console.log(JSON.stringify({
  fixture: fixturePath,
  techniques: techniqueOrder.length,
  reference,
  shared,
  medianSpeedRatio: Number((reference.medianMs / shared.medianMs).toFixed(2)),
  countMismatches: 0,
}))
