import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-overlay-engines.mjs before.wasm after.wasm')
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
const overlays = ['pattern-overlay', 'pairwise-pattern-overlay', 'triple-pattern-overlay', 'quadruple-pattern-overlay', 'quintuple-pattern-overlay']
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
let comparisons = 0, positive = 0
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  assert.deepEqual(actual, expected, label)
  comparisons++
  return expected
}
for (const technique of overlays) {
  const exercises = await compare({ type: 'practice-examples', technique }, `${technique}: Classic practice`)
  for (const [index, exercise] of exercises.entries()) {
    const position = { puzzle: { version: 1, givens: exercise.givens }, entries: exercise.entries, eliminations: exercise.eliminations }
    const choices = await compare({ type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff }, `${technique}: positive Classic-as-variant ${index}`)
    assert.ok(choices.some(proof => proof.actions.some(action => JSON.stringify(action) === JSON.stringify(exercise.suggestion))))
    positive++
    const values = [...exercise.givens].map((digit, cell) => digit === '0' ? exercise.entries[cell] : digit).join('')
    await compare({ type: 'deductions', values, eliminations: exercise.eliminations, techniqueOrder: [technique] }, `${technique}: Classic deductions ${index}`)
  }
  const variants = await compare({ type: 'practice-examples', technique, variant: true }, `${technique}: variant practice`)
  for (const [index, exercise] of variants.entries()) {
    const choices = await compare({ type: 'variant', operation: 'hints', position: exercise.position, techniqueOrder: [technique], limit: 0xffff_ffff }, `${technique}: positive variant ${index}`)
    assert.ok(choices.some(proof => proof.actions.some(action => JSON.stringify(action) === JSON.stringify(exercise.suggestion))))
    positive++
  }
}
const fixtures = (await read('../crates/engine/benches/fixtures/variants.json')).map(({ name, position }) => ({ name, position: { puzzle: position } }))
for (const [name, fixture] of Object.entries(await read('../tests/fixtures/mixed-puzzles.json'))) fixtures.push({ name, position: { puzzle: fixture.puzzle } })
for (const [name, path] of [
  ['combined-families', 'combined-families'], ['quadruple', 'quadruple-clover'], ['parity', 'parity-big-eight'],
  ['anti-king', 'anti-king-newman'], ['non-consecutive', 'nonconsecutive-newman'],
]) fixtures.push({ name, position: { puzzle: (await read(`../tests/fixtures/${path}.json`)).puzzle } })
const coach = (await read('../tests/fixtures/nonconsecutive-coach.json')).examples[0]
fixtures.push({ name: 'nc-white-dots', position: { puzzle: (await detectPuzzle(coach.code)).variant.puzzle } })
const classic = await compare({ type: 'techniques' }, 'Classic catalog'), variant = await compare({ type: 'techniques', variant: true }, 'Variant catalog')
const techniqueOrder = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
  Object.fromEntries([...classic.techniques, ...variant.techniques].map(technique => [technique.id, technique.difficulty])))
for (const { name, position } of fixtures) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: retained ${operation}`)
  await compare({ type: 'variant', operation: 'hints', position, techniqueOrder: ['nested-forcing-net'], limit: 0xffff_ffff }, `${name}: complete shared forcing-probe proofs`)
  for (const technique of overlays) await compare({ type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff }, `${name}: complete ${technique}`)
  await compare({ type: 'variant', operation: 'trace', position, techniqueOrder }, `${name}: complete app trace and rating`)
  const request = { type: 'variant', operation: 'hints', position, techniqueOrder, preferProgress: true, difficulty: 'medium', limit: 0xffff_ffff }
  const all = await compare(request, `${name}: complete app hint collection`)
  const first = await compare({ ...request, collection: 113 }, `${name}: first proof page`)
  const collected = [...first.choices]
  while (collected.length < first.available) {
    const page = await compare({ type: 'hint-page', collection: 113, index: collected.length, variant: true }, `${name}: page ${collected.length}`)
    assert.equal(page.offset, collected.length)
    assert.ok(page.choices.length > 0, `${name}: an unfinished collection must return another page`)
    collected.push(...page.choices)
  }
  assert.deepEqual(collected, all, `${name}: paging preserves complete evidence and order`)
  await compare({ type: 'release-hints', collection: 113 }, `${name}: release`)
  console.log(`${name}: all five overlay proofs, complete app trace/rating and all paged hints agree`)
}
console.log(`${comparisons} complete responses match; ${positive} positive practice positions and ${fixtures.length} corpus positions.`)
