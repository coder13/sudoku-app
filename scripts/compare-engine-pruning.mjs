import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...options] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm [--palindrome-trace]')
assert.ok(options.every(option => option === '--palindrome-trace'), 'Unknown comparison option')
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
const ai = { puzzle: { version: 1,
  givens: '100007090030020008009600500005300900010080002600004000300000010041000007007000300' } }
fixtures.push({ name: 'ai-escargot', position: ai })
const aiSolution = await before({ type: 'variant', operation: 'solve', position: ai, maxNodes: 20_000 })
assert.equal(typeof aiSolution, 'string')
const aiProofs = await before({ type: 'variant', operation: 'hints', position: ai, techniqueOrder: ['nested-forcing-net'], limit: 0xffff_ffff })
assert.equal(aiProofs.length, 12)
const removal = aiProofs.flatMap(proof => proof.actions).find(action => 'eliminate' in action)?.eliminate
assert.ok(removal)
assert.notEqual(Number(aiSolution[removal.cell]), removal.digit)
const eliminations = Array(81).fill(0)
eliminations[removal.cell] = 1 << (removal.digit - 1)
fixtures.push({ name: 'ai-escargot-removal', position: { ...ai, eliminations } })
const entries = Array(81).fill('0'), firstEmpty = ai.puzzle.givens.indexOf('0')
entries[firstEmpty] = aiSolution[firstEmpty]
fixtures.push({ name: 'ai-escargot-placement', position: { ...ai, entries: entries.join('') } })
// Keep earlier scoring-version comparisons reproducible while including the
// complete Whispers family whenever the compared catalog supports it.
if (detectors.includes('whispers-house-support')) {
  fixtures.push({ name: 'whispers-brain-zaps', position: { puzzle: (await read('../tests/fixtures/whispers-brain-zaps.json')).puzzle } })
  fixtures.push({ name: 'closed-whispers-walk', position: { puzzle: { version: 1, givens: '0'.repeat(81),
    rules: [{ type: 'whispers', cells: [0, 10, 20, 0], minDifference: 4 }] } } })
}
// Opt in to preserve the historical corpus and its response counts. Replay
// every established removal instead of treating each grid as fresh givens.
if (options.includes('--palindrome-trace')) {
  for (const file of ['palindrome-clover', 'palindrome-newman']) {
    fixtures.push({ name: file, position: { puzzle: (await read(`../tests/fixtures/${file}.json`)).puzzle } })
  }
  const coach = (await read('../tests/fixtures/palindrome-coach.json')).examples[0]
  const puzzle = (await detectPuzzle(coach.code)).variant.puzzle
  const trace = await before({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder })
  assert.equal(trace.rating.status, 'stalled')
  assert.equal(trace.rating.points, 527)
  assert.equal(trace.steps.length, 18)
  const entries = Array(81).fill('0'), eliminations = Array(81).fill(0)
  for (let step = 0; step <= trace.steps.length; step++) {
    fixtures.push({ name: `palindrome-coach-step-${step}`, position: { puzzle,
      entries: entries.join(''), eliminations: [...eliminations] } })
    if (step < trace.steps.length) for (const action of trace.steps[step].actions) {
      if ('place' in action) entries[action.place.cell] = String(action.place.digit)
      else eliminations[action.eliminate.cell] |= 1 << (action.eliminate.digit - 1)
    }
  }
}
let comparisons = 0, positive = 0
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  assert.deepEqual(actual, expected, label)
  comparisons++
  return actual
}
for (const { name, position } of fixtures) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: ${operation}`)
  if (name === 'whispers-brain-zaps') for (const operation of ['analyze', 'solve']) {
    await compare({ type: 'variant', operation, position, maxNodes: 100_000 }, `${name}: completed ${operation}`)
  }
  for (const technique of detectors) {
    const proofs = await compare({ type: 'variant', operation: 'hints', position,
      techniqueOrder: [technique], limit: 0xffff_ffff }, `${name}: complete ${technique} proofs`)
    if (name === 'ai-escargot' && technique === 'nested-forcing-net') assert.equal(proofs.length, 12)
  }
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
