import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [fixturePath, recordPath] = process.argv.slice(2)
assert.ok(fixturePath, 'Usage: node --experimental-strip-types scripts/profile-variant-hints.mjs fixture.json [results.json]')
const source = JSON.parse(await readFile(fixturePath, 'utf8'))
const position = { puzzle: source.puzzle ?? source }
const { instance } = await WebAssembly.instantiate(await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url)))
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
    assert.deepEqual(await request(query), proofs[technique])
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  findings.push({ technique, medianMs: Number(times[2].toFixed(3)), choices: proofs[technique].length })
}
console.table(findings.toSorted((a, b) => b.medianMs - a.medianMs).slice(0, 12))
if (recordPath) await writeFile(recordPath, JSON.stringify({ position, order, findings, proofs }) + '\n')
