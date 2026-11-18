import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../src/sudoku/engine-protocol.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'

const [beforePath, afterPath, ...options] = process.argv.slice(2)
assert.ok(beforePath && afterPath, 'Usage: node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm [--palindrome-trace] [--classic-tridagon] [--exact-houses] [--xv] [--adjacent-total] [--entropic] [--renban]')
assert.ok(options.every(option => ['--palindrome-trace', '--classic-tridagon', '--exact-houses', '--xv', '--adjacent-total', '--entropic', '--renban'].includes(option)), 'Unknown comparison option')
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
const updated = await after({ type: 'techniques', variant: true })
const additionsExpected = [
  ...(options.includes('--adjacent-total') ? [{ id: 'adjacent-total', aliases: [], cost: 20, difficulty: 'easy', requiresUniqueSolution: false }] : []),
  ...(options.includes('--entropic') ? [{ id: 'entropic', aliases: [], cost: 27, difficulty: 'medium', requiresUniqueSolution: false }] : []),
]
if (additionsExpected.length) {
  const additions = updated.techniques.filter(item => !old.techniques.some(before => before.id === item.id))
  assert.deepEqual(additions.toSorted((a,b)=>a.id.localeCompare(b.id)), additionsExpected.toSorted((a,b)=>a.id.localeCompare(b.id)))
  const retained = id => !additionsExpected.some(item => item.id === id)
  assert.deepEqual({ ...updated, defaultOrder: updated.defaultOrder.filter(retained),
    difficultyOrder: updated.difficultyOrder.filter(retained),
    techniques: updated.techniques.filter(item => retained(item.id)) }, old)
  console.log('Catalog adds only the declared techniques. All retained requests below use explicit legacy profiles, without response normalization.')
} else assert.deepEqual(updated, old)
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
if (options.includes('--exact-houses') || options.includes('--xv')) fixtures.push({ name: 'inequality-palindrome14', position: { puzzle: (await read('../tests/fixtures/inequality-palindrome14.json')).puzzle } })
if (options.includes('--xv')) {
  for (const file of ['xv-clover', 'xv-quadruple-clover']) fixtures.push({ name: file,
    position: { puzzle: (await read(`../tests/fixtures/${file}.json`)).puzzle } })
  for (const source of (await read('../tests/fixtures/xv-coach.json')).examples.filter(source => !source.deferred.length)) {
    fixtures.push({ name: `xv-coach-${source.url.split('/').pop()}`,
      position: { puzzle: (await detectPuzzle(source.code)).variant.puzzle } })
  }
}
if (options.includes('--renban')) {
  for (const file of ['renban-clover', 'renban-killer-clover']) fixtures.push({ name: file,
    position: { puzzle: (await read(`../tests/fixtures/${file}.json`)).puzzle } })
  for (const source of (await read('../tests/fixtures/renban-coach.json')).examples.filter(source => !source.deferred)) {
    fixtures.push({ name: `renban-coach-${source.url.split('/').pop()}`, position: { puzzle: source.puzzle } })
  }
  fixtures.push({ name: 'adjacent-sum-99Eu', position: { puzzle: (await detectPuzzle((await read('../tests/fixtures/adjacent-sum-coach.json')).source.code)).variant.puzzle } })
}
let comparisons = 0, positive = 0, improvedBudgets = 0, alternativeCompletions = 0
const exhausted = result => result === 'search-limit' || result?.engineError === 'search-limit'
async function compare(request, label) {
  const expected = await before(request), actual = await after(request)
  if (options.includes('--exact-houses') && request.type === 'variant' && request.seed === undefined && ['analyze', 'solve'].includes(request.operation) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    assert.ok(!exhausted(actual), `${label}: an improved search must not lose a completed result`)
    const reference = await before({ ...request, maxNodes: 10_000_000 })
    if (request.operation === 'analyze') {
      assert.ok(exhausted(expected), `${label}: complete solution counts cannot change`)
      assert.deepEqual(actual, reference, `${label}: larger-budget baseline`)
    } else {
      assert.match(actual, /^[1-9]{81}$/, `${label}: complete grid`)
      const { puzzle, entries, eliminations } = request.position
      for (let cell = 0; cell < 81; cell++) {
        if (entries?.[cell] && entries[cell] !== '0') assert.equal(actual[cell], entries[cell])
        if (puzzle.givens[cell] === '0' && (!entries?.[cell] || entries[cell] === '0')) {
          assert.equal((eliminations?.[cell] ?? 0) & (1 << (Number(actual[cell]) - 1)), 0)
        }
      }
      assert.equal(await before({ type: 'variant', operation: 'analyze', position: { puzzle, entries: actual }, maxNodes: 1 }), 'unique', `${label}: original engine validates every completed rule`)
      if (actual !== reference) {
        assert.equal(await before({ type: 'variant', operation: 'analyze', position: request.position, maxNodes: 10_000_000 }), 'multiple', `${label}: different completions require ambiguity`)
      }
    }
    if (exhausted(expected)) improvedBudgets++
    else alternativeCompletions++
    comparisons++
    console.log(`${label}: verified ${exhausted(expected) ? 'improved budget outcome' : 'alternative valid completion'}`)
    return actual
  }
  assert.deepEqual(actual, expected, label)
  comparisons++
  return actual
}
for (const { name, position } of fixtures) {
  for (const operation of ['candidates', 'analyze', 'solve']) await compare({ type: 'variant', operation, position, maxNodes: 20_000 }, `${name}: ${operation}`)
  if (options.includes('--exact-houses')) {
    for (const seed of [17, 41]) await compare({ type: 'variant', operation: 'solve', position, seed, maxNodes: 20_000 }, `${name}: retained seeded completion ${seed}`)
    if (name === 'inequality-palindrome14') for (const operation of ['analyze', 'solve']) {
      await compare({ type: 'variant', operation, position, maxNodes: 1_000_000 }, `${name}: default-budget ${operation}`)
    }
  }
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
console.log(options.includes('--exact-houses')
  ? `${comparisons} responses checked: ${comparisons - improvedBudgets - alternativeCompletions} match exactly, ${improvedBudgets} verified budget improvements, ${alternativeCompletions} validated alternative completions. ${fixtures.length} corpus positions, ${positive} positive practice positions, ${detectors.length} detector IDs and every hint page.`
  : `${comparisons} complete responses match on ${fixtures.length} corpus positions and ${positive} positive practice positions; ${detectors.length} detector IDs, retained catalogs/scoring and every hint page.`)

if (options.includes('--classic-tridagon')) {
  const start = comparisons
  let positions = 0
  const techniques = ['tridagon', 'tridagon-forcing-net', 'tridagon-aic']
  for (const technique of techniques) {
    const examples = await compare({ type: 'practice-examples', technique }, `${technique}: Classic fixtures`)
    for (const [index, example] of examples.entries()) {
      const { givens, entries, eliminations } = example
      const values = [...givens].map((digit, cell) => entries?.[cell] && entries[cell] !== '0' ? entries[cell] : digit).join('')
      const position = { values, eliminations }
      for (const selected of techniques) {
        const label = `${technique} ${index}: Classic ${selected}`
        await compare({ type: 'deductions', ...position, techniqueOrder: [selected] }, `${label} complete deductions`)
        await compare({ type: 'technique-count', ...position, technique: selected }, `${label} action count`)
        await compare({ type: 'logical-solve', values: givens, entries, eliminations,
          techniqueOrder: [selected], includePositions: true, includeStepDetails: true }, `${label} complete trace`)
      }
      const disabledTechniques = classic.techniques.map(item => item.id).filter(id => !techniques.includes(id))
      const request = { type: 'hints', ...position, disabledTechniques, limit: 'all', includePatterns: true }
      const all = await compare(request, `${technique} ${index}: Classic complete hints`)
      const first = await compare({ ...request, collection: 112 }, `${technique} ${index}: Classic first page`)
      const collected = [...first.choices]
      while (collected.length < first.available) {
        const page = await compare({ type: 'hint-page', collection: 112, index: collected.length }, `${technique} ${index}: Classic page ${collected.length}`)
        assert.ok(page.choices.length)
        collected.push(...page.choices)
      }
      assert.deepEqual(collected, all.choices)
      await compare({ type: 'release-hints', collection: 112 }, `${technique} ${index}: Classic release`)
      positions++
    }
  }
  console.log(`${comparisons - start} additional complete Classic responses match on ${positions} Tridagon practice positions; deductions, counts, traces and all hint pages.`)
}
