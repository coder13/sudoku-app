import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'
import { assertLineHouseProof } from '../tests/helpers/line-house-truth.ts'
const NEW_TECHNIQUES = ['whispers-house-support']

const [beforePath, afterPath] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-whispers-engines.mjs before.wasm after.wasm')
async function engine(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path))
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return async request => {
    const result = await handle({ id: ++id, request })
    if ('value' in result) return result.value
    assert.equal(result.code, 'search-limit', JSON.stringify(result))
    return { engineError: result.code, message: result.error }
  }
}
const before = await engine(beforePath), after = await engine(afterPath)
const classic = await before({ type: 'techniques' }), old = await before({ type: 'techniques', variant: true })
const current = await after({ type: 'techniques', variant: true })
assert.deepEqual(await after({ type: 'techniques' }), classic)
assert.equal(old.scoringVersion, 7)
assert.equal(current.scoringVersion, 8)
for (const technique of old.techniques) assert.deepEqual(current.techniques.find(item => item.id === technique.id), technique)
assert.equal(current.techniques.length, old.techniques.length + NEW_TECHNIQUES.length)
assert.deepEqual(current.defaultOrder.filter(id => !NEW_TECHNIQUES.includes(id)), old.defaultOrder)
const appOrder = variantTechniqueOrder(old.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...old.techniques].map(item => [item.id, item.difficulty])))
const techniqueOrder = [...new Set([...appOrder, ...old.techniques.map(item => item.id)])]
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const fixtures = (await read('../crates/engine/benches/fixtures/variants.json'))
  .map(({ name, position }) => ({ name, position: { puzzle: position } }))
for (const [name, fixture] of Object.entries(await read('../tests/fixtures/mixed-puzzles.json'))) fixtures.push({ name: `mixed-${name}`, position: { puzzle: fixture.puzzle } })
for (const file of ['combined-families', 'quadruple-clover', 'parity-big-eight', 'anti-king-newman', 'nonconsecutive-newman', 'whispers-brain-zaps']) {
  const fixture = await read(`../tests/fixtures/${file}.json`)
  fixtures.push({ name: file, position: { puzzle: fixture.puzzle } })
}
const coach = (await read('../tests/fixtures/nonconsecutive-coach.json')).examples[0]
fixtures.push({ name: 'nc-white-dots', position: { puzzle: (await detectPuzzle(coach.code)).variant.puzzle } })
fixtures.push({ name: 'archived-nc-stall', position: (await read('../tests/fixtures/nonconsecutive-locked.json')).position })
// Only the declared scoring metadata changes for an explicit retained profile.
const behavior = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'scoringVersion' ? undefined : item))
let comparisons = 0, newProofs = 0
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  assert.deepEqual(behavior(actual), behavior(expected), label)
  comparisons++
  return actual
}
for (const { name, position } of fixtures) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: ${operation}`)
  if (name === 'whispers-brain-zaps') for (const operation of ['analyze', 'solve']) {
    await compare({ type: 'variant', operation, position, maxNodes: 100_000 }, `${name}: completed ${operation}`)
  }
  for (const technique of techniqueOrder) await compare({ type: 'variant', operation: 'hints', position,
    techniqueOrder: [technique], limit: 0xffff_ffff }, `${name}: complete ${technique} proofs`)
  for (const order of [old.defaultOrder, appOrder]) for (const operation of ['trace', 'rate']) {
    await compare({ type: 'variant', operation, position, techniqueOrder: order }, `${name}: retained ${operation}`)
  }
  const request = { type: 'variant', operation: 'hints', position, techniqueOrder: appOrder, preferProgress: true, difficulty: 'medium', limit: 0xffff_ffff }
  const all = await compare(request, `${name}: complete hints`)
  const first = await compare({ ...request, collection: 111 }, `${name}: first page`)
  const collected = [...first.choices]
  while (collected.length < first.available) {
    const page = await compare({ type: 'hint-page', variant: true, collection: 111, index: collected.length }, `${name}: page ${collected.length}`)
    assert.equal(page.offset, collected.length)
    assert.ok(page.choices.length > 0)
    collected.push(...page.choices)
  }
  assert.deepEqual(collected, all)
  await compare({ type: 'release-hints', collection: 111 }, `${name}: release`)
  for (const technique of NEW_TECHNIQUES) {
    const proofs = await after({ type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff })
    for (const proof of proofs) { assertLineHouseProof(position, proof); newProofs++ }
  }
  console.log(`${name}: retained requests, all ${techniqueOrder.length} detector proof lists and every page agree`)
}
for (const technique of NEW_TECHNIQUES) {
  for (const exercise of await after({ type: 'practice-examples', technique, variant: true })) {
    assertLineHouseProof(exercise.position, exercise.deduction); newProofs++
  }
}
console.log(`${comparisons} retained responses match on ${fixtures.length} corpus positions; ${newProofs} new proofs replay independently.`)
