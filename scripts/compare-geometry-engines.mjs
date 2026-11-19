import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { VARIANTS } from '../src/sudoku/variants.ts'
import { variantGenerationRequest, variantSeeds, variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-geometry-engines.mjs before.wasm after.wasm')
async function engine(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path))
  const handle = createEngineHandler(async () => instance.exports)
  let id = 0
  return async request => {
    const response = await handle({ id: ++id, request })
    // Compare failures as well as successes; request ids are transport metadata.
    return { ...response, id: 0 }
  }
}
const before = await engine(beforePath), after = await engine(afterPath)
let comparisons = 0, positive = 0
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  assert.deepEqual(actual, expected, label)
  comparisons++
  return expected.value
}
const classic = await compare({ type: 'techniques' }, 'Classic catalog')
const variant = await compare({ type: 'techniques', variant: true }, 'Variant catalog')
const appOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(item => [item.id, item.difficulty])))
const corpus = new Map()
function add(name, position) {
  if (position?.puzzle && /^[0-9]{81}$/.test(position.puzzle.givens)) corpus.set(JSON.stringify(position), { name, position })
}
const read = async url => JSON.parse(await readFile(url, 'utf8'))
for (const fixture of await read(new URL('../crates/engine/benches/fixtures/variants.json', import.meta.url))) add(fixture.name, { puzzle: fixture.position })
const directory = new URL('../tests/fixtures/', import.meta.url)
for (const name of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
  const fixture = await read(new URL(name, directory))
  add(name, fixture.position ?? { puzzle: fixture.puzzle })
  for (const [index, example] of (fixture.examples ?? []).entries()) add(`${name}:${index}`, example.position ?? { puzzle: example.puzzle })
  if (name === 'mixed-puzzles.json') for (const [key, example] of Object.entries(fixture)) add(key, { puzzle: example.puzzle })
}
for (const technique of variant.techniques) {
  const exercises = await compare({ type: 'practice-examples', variant: true, technique: technique.id }, `${technique.id}: complete practice list`)
  for (const [index, exercise] of (exercises ?? []).entries()) {
    const choices = await compare({ type: 'variant', operation: 'hints', position: exercise.position,
      techniqueOrder: [technique.id], limit: 0xffff_ffff }, `${technique.id}: positive proof ${index}`)
    assert.ok(choices?.length, `${technique.id} practice needs a real proof`)
    positive++
  }
}
for (const { name, position } of corpus.values()) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: ${operation}`)
  for (const technique of variant.techniques) await compare({ type: 'variant', operation: 'hints', position,
    techniqueOrder: [technique.id], limit: 0xffff_ffff }, `${name}: complete ${technique.id} proofs`)
  for (const order of [variant.defaultOrder, appOrder]) for (const operation of ['trace', 'rate']) {
    await compare({ type: 'variant', operation, position, techniqueOrder: order }, `${name}: ${operation}`)
  }
  const request = { type: 'variant', operation: 'hints', position, techniqueOrder: appOrder,
    preferProgress: true, difficulty: 'medium', limit: 0xffff_ffff }
  const all = await compare(request, `${name}: complete hint list`)
  const first = await compare({ ...request, collection: 811 }, `${name}: first page`)
  if (first) {
    const collected = [...first.choices]
    while (collected.length < first.available) {
      const page = await compare({ type: 'hint-page', variant: true, collection: 811, index: collected.length }, `${name}: page ${collected.length}`)
      assert.equal(page.offset, collected.length)
      assert.ok(page.choices.length)
      collected.push(...page.choices)
    }
    assert.deepEqual(collected, all)
    await compare({ type: 'release-hints', collection: 811 }, `${name}: release`)
  }
  console.log(`${name}: all detector proofs, complete traces/ratings and every page match`)
}
const generation = {}
for (const id of Object.keys(VARIANTS).filter(id => id !== 'classic')) {
  const difficulty = variantSeeds[id].easy ? 'easy' : 'medium'
  const recipe = variantSeeds[id][difficulty][0]
  let accepted = 0
  for (let seed = 1; seed <= 20; seed++) {
    const request = { ...variantGenerationRequest(id, difficulty, recipe, appOrder, seed), maxNodes: 20_000 }
    const result = await compare(request, `${id}: generation ${seed}`)
    if (result) accepted++
  }
  generation[id] = { requests: 20, accepted, exhausted: 20 - accepted }
}
console.log(JSON.stringify({ generation }))
console.log(JSON.stringify({ comparisons, positivePracticePositions: positive, corpusPositions: corpus.size,
  detectorCount: variant.techniques.length, scoringVersion: variant.scoringVersion }))
