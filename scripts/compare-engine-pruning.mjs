import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm')
async function engine(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path))
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return async request => {
    const result = await handle({ id: ++id, request })
    assert.ok('value' in result, JSON.stringify(result))
    return result.value
  }
}
const before = await engine(beforePath), after = await engine(afterPath)
const classic = await before({ type: 'techniques' }), old = await before({ type: 'techniques', variant: true })
assert.deepEqual(await after({ type: 'techniques' }), classic)
assert.deepEqual(await after({ type: 'techniques', variant: true }), old)
const techniqueOrder = variantTechniqueOrder(old.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...old.techniques].map(item => [item.id, item.difficulty])))
// Include catalog entries omitted from the app's default search as well.
const detectors = [...new Set([...techniqueOrder, ...old.techniques.map(item => item.id)])]
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const fixtures = (await read('../crates/engine/benches/fixtures/variants.json'))
  .map(({ name, position }) => ({ name, position: { puzzle: position } }))
for (const [name, fixture] of Object.entries(await read('../tests/fixtures/mixed-puzzles.json'))) fixtures.push({ name: `mixed-${name}`, position: { puzzle: fixture.puzzle } })
for (const file of ['combined-families', 'quadruple-clover', 'parity-big-eight', 'anti-king-newman', 'nonconsecutive-newman']) {
  const fixture = await read(`../tests/fixtures/${file}.json`)
  fixtures.push({ name: file, position: { puzzle: fixture.puzzle } })
}
const coach = (await read('../tests/fixtures/nonconsecutive-coach.json')).examples[0]
fixtures.push({ name: 'nc-white-dots', position: { puzzle: (await detectPuzzle(coach.code)).variant.puzzle } })
fixtures.push({ name: 'archived-nc-stall', position: (await read('../tests/fixtures/nonconsecutive-locked.json')).position })
let comparisons = 0, positive = 0
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  assert.deepEqual(actual, expected, label)
  comparisons++
  return actual
}
for (const { name, position } of fixtures) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: ${operation}`)
  for (const technique of detectors) await compare({ type: 'variant', operation: 'hints', position,
    techniqueOrder: [technique], limit: 0xffff_ffff }, `${name}: complete ${technique} proofs`)
  for (const order of [old.defaultOrder, techniqueOrder]) for (const operation of ['trace', 'rate']) {
    await compare({ type: 'variant', operation, position, techniqueOrder: order }, `${name}: retained ${operation}`)
  }
  const request = { type: 'variant', operation: 'hints', position, techniqueOrder, preferProgress: true, difficulty: 'medium', limit: 0xffff_ffff }
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
  // Disabled searches and the reverse custom order retain their exact semantics.
  for (const customOrder of [[], ['non-consecutive'], [...techniqueOrder].reverse()]) {
    await compare({ type: 'variant', operation: 'hints', position, techniqueOrder: customOrder, limit: 10 }, `${name}: custom hints`)
    if (customOrder.length < 2) await compare({ type: 'variant', operation: 'trace', position, techniqueOrder: customOrder }, `${name}: disabled/restricted trace`)
  }
  console.log(`${name}: retained requests, all ${detectors.length} detector proof lists and every page agree`)
}
// Every published exercise is a positive control: preserve complete proofs,
// including detectors absent from the app default and all uniqueness families.
for (const technique of detectors) {
  const exercises = await compare({ type: 'practice-examples', technique, variant: true }, `${technique}: practice fixtures`)
  for (const [index, exercise] of exercises.entries()) {
    const choices = await compare({ type: 'variant', operation: 'hints', position: exercise.position,
      techniqueOrder: [technique], limit: 0xffff_ffff }, `${technique}: complete positive proofs ${index}`)
    assert.ok(choices.some(proof => proof.actions.some(action => JSON.stringify(action) === JSON.stringify(exercise.suggestion))), `${technique}: expected practice action ${index}`)
    positive++
  }
}
console.log(`${comparisons} complete responses match on ${fixtures.length} corpus positions and ${positive} positive practice positions; ${detectors.length} detector IDs, unchanged catalogs/scoring and every hint page.`)
