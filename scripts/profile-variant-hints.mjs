import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [fixturePath, ...args] = process.argv.slice(2)
assert.ok(fixturePath, 'Usage: node --experimental-strip-types scripts/profile-variant-hints.mjs fixture.json [results.json] [engine.wasm] [--source-id=ID]')
const option = name => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const [recordPath, wasmPath] = args.filter(value => !value.startsWith('--'))
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const sourceId = option('source-id')
const examples = Array.isArray(fixture) ? fixture : Array.isArray(fixture.examples) ? fixture.examples : undefined
const source = examples
  ? examples.find(value => (value.url?.match(/\/s\/([^/]+)/)?.[1] ?? value.id ?? value.sourceId) === sourceId)
  : fixture
assert.ok(source, `No source ${sourceId ?? ''} in ${fixturePath}.`)
const coachCode = source.coach ?? source.code
const imported = typeof coachCode === 'string' ? await detectPuzzle(coachCode) : undefined
const position = source.position ?? (imported?.variant ? { puzzle: imported.variant.puzzle } : { puzzle: source.puzzle ?? source })
assert.ok(position.puzzle?.givens && position.puzzle?.rules, 'Fixture must contain an imported variant puzzle.')
const { instance } = await WebAssembly.instantiate(await readFile(wasmPath ?? new URL('../src/sudoku/generated/engine.wasm', import.meta.url)))
const handle = createEngineHandler(async () => instance.exports)
let id = 0
async function request(request) {
  const reply = await handle({ id: ++id, request })
  assert.ok('value' in reply, JSON.stringify(reply))
  return reply.value
}
const classic = await request({ type: 'techniques' })
const variant = await request({ type: 'techniques', variant: true })
const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty])))
const findings = [], proofs = {}
for (const technique of order) {
  const query = { type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff }
  proofs[technique] = await request(query)
  const times = []
  for (let sample = 0; sample < 5; sample++) {
    const start = performance.now()
    const result = await request(query)
    times.push(performance.now() - start)
    assert.deepEqual(result, proofs[technique])
  }
  times.sort((a, b) => a - b)
  findings.push({ technique, medianMs: Number(times[2].toFixed(3)), choices: proofs[technique].length })
}
console.table(findings.toSorted((a, b) => b.medianMs - a.medianMs).slice(0, 12))
if (recordPath) await writeFile(recordPath, JSON.stringify({ sourceId, position, order, findings, proofs }) + '\n')
