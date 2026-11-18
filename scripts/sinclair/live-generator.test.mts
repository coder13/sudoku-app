// Run the archived on-device constructor checks explicitly, outside regular CI and deploys.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runEngine, EngineError, type VariantPuzzle } from '../../src/sudoku/engine.ts'
import { generateSinclairClassic, generateSinclairVariant } from '../../src/sudoku/sinclair-generation.ts'
import { generateImpossible } from '../../src/sudoku/sinclair-impossible.ts'
import impossibleBank from '../../src/sudoku/sinclair-impossible-cores.json' with { type: 'json' }
import { givenPairing, jigsawRegions, killerCages, layoutPairing } from '../../src/sudoku/sinclair-layout.ts'
import { sinclairDistance } from '../../src/sudoku/sinclair-score.ts'
import { makeGame } from '../../src/sudoku/game.ts'
import { getVariantPlayOrder } from '../../src/sudoku/variant-play.ts'
import { reflectVariant } from '../../src/sudoku/variant-generation.ts'
import { countMixedSolutions } from '../../tests/helpers/mixed-oracle.ts'
import { useWasmWorker } from '../../tests/helpers/wasm-worker.ts'

useWasmWorker()

test('the browser score reproduces the Python model for the same four reference paths', async () => {
  // Native trace, edition.annotate and edition.priors on the frozen training split.
  for (const [family, expected] of [['classic', .3391518185400044], ['killer', .1266084165727702], ['x', .3552147213602167]] as const) {
    const entries = JSON.parse(await readFile(new URL('../../src/sudoku/collections/sinclair-' + family + '.json', import.meta.url), 'utf8'))
    const entry = entries.find((r: { difficulty: string }) => r.difficulty === 'medium')
    const steps = family === 'classic'
      ? (await runEngine({ type: 'logical-solve', values: entry.givens, techniqueOrder: (await runEngine({ type: 'techniques' })).difficultyOrder })).steps
      : (await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: entry.puzzle }, techniqueOrder: await getVariantPlayOrder() })).steps
    const id = family === 'killer' ? 'killer-cages' : family === 'x' ? 'diagonal' : 'classic'
    assert.ok(Math.abs(sinclairDistance(id, 'medium', steps) - expected) < 1e-9, family)
    if (family === 'x') assert.ok(Math.abs(sinclairDistance('jigsaw', 'medium', steps) - 1.9553865423903891) < 1e-9)
  }
})

test('the half-turn score compares placement and clue roles, and excludes the fixed guides and center cell', () => {
  const empty = '0'.repeat(81)
  assert.equal(givenPairing('1' + '0'.repeat(79) + '9'), 1)
  assert.equal(givenPairing('0'.repeat(40) + '1' + '0'.repeat(40)), null)
  assert.deepEqual(layoutPairing({ version: 1, givens: empty, rules: [{ type: 'diagonal', diagonal: 'main' }] }),
    { given: null, shapes: null, score: 0 })
  const thermo: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'thermometer', cells: [0,1,2] }, { type: 'thermometer', cells: [78,79,80] }] }
  assert.equal(layoutPairing(thermo).shapes, 0)
  const dots: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'kropki', consecutive: { pairs: [[0,1]] }, ratioTwo: { pairs: [[79,80]] } }] }
  assert.equal(layoutPairing(dots).shapes, 0)
})

test('generated cage and jigsaw layouts cover every cell in connected regions', () => {
  for (let seed = 0; seed < 30; seed++) for (const [kind, groups] of [['jigsaw', jigsawRegions(seed)], ['killer', killerCages(seed)]] as const) {
    assert.equal(groups.flat().length, 81)
    assert.equal(new Set(groups.flat()).size, 81)
    for (const group of groups) {
      assert.ok(kind === 'jigsaw' ? group.length === 9 : group.length <= 5)
      const seen = new Set([group[0]])
      for (const a of seen) for (const b of group) {
        if (Math.abs(Math.floor(a/9)-Math.floor(b/9)) + Math.abs(a%9-b%9) === 1) seen.add(b)
      }
      assert.equal(seen.size, group.length)
    }
  }
})

test('a fixed mask needs a unique answer, the requested tier, an essential rule and an unseen layout', async () => {
  const result = await generateSinclairVariant('diagonal', 'medium', 361, [])
  assert.equal(countMixedSolutions(result.puzzle).count, 1)
  assert.equal(countMixedSolutions({ ...result.puzzle, rules: [] }).count, 2)
  const request = { type: 'generate-variant' as const, seed: 1, maxAttempts: 1, givens: [0,81] as const,
    template: { ...result.puzzle, givens: result.solution }, requiredRule: 'diagonal', difficulty: 'medium' as const,
    givenMask: result.puzzle.givens.replace(/[1-9]/g, '1'), techniqueOrder: result.rating.techniqueOrder }
  assert.deepEqual((await runEngine(request)).puzzle, result.puzzle)
  for (const change of [{ givenMask: '0'.repeat(81) }, { givenMask: '1'.repeat(81) },
    { difficulty: 'master' as const }, { exclude: [reflectVariant(result.puzzle, 6)] }]) {
    await assert.rejects(runEngine({ ...request, ...change }), e => e instanceof EngineError && e.code === 'search-limit')
  }
  await assert.rejects(runEngine({ ...request, givenMask: '10x' }), e => e instanceof EngineError && e.code === 'invalid-clue-mask')
  const game = makeGame('x', 'X', result.puzzle.givens, 'generated')
  game.variant = { id: 'diagonal', puzzle: result.puzzle, solution: result.solution }
  const next = await generateSinclairVariant('diagonal', 'medium', 361, [game])
  assert.notDeepEqual(next.puzzle, result.puzzle)
})

test('classic selection is repeatable, keeps its grade and respects saved puzzle structures', async () => {
  const first = await generateSinclairClassic('easy', 1847)
  assert.deepEqual(await generateSinclairClassic('easy', 1847), first)
  assert.deepEqual(first.rating.status, { solved: 'easy' })
  assert.equal(countMixedSolutions({ version: 1, givens: first.board }).count, 1)
  const next = await generateSinclairClassic('easy', 1847, undefined, [first.board])
  const keys = await runEngine({ type: 'canonical-puzzles', values: [first.board, next.board] })
  assert.notEqual(keys[0], keys[1])
})

test('a generated Impossible opening reproduces the whole solve, quality floor and learned score', async () => {
  const history: string[] = []
  let edited
  for (let seed = 1; seed <= 32 && !edited; seed++) {
    const result = await generateSinclairClassic('impossible', seed, undefined, history)
    assert.ok(result.style.method.startsWith('certified-'))
    history.push(result.board)
    if (result.style.method === 'certified-opening') edited = result
  }
  assert.ok(edited)
  assert.ok(!impossibleBank.cores.some(core => core.board === edited.board))
  const path = await runEngine({ type: 'logical-solve', values: edited.board, techniqueOrder: edited.rating.techniqueOrder })
  assert.deepEqual(path.rating, edited.rating)
  assert.deepEqual(edited.canonical, path.rating)
  assert.equal(edited.style.distance, sinclairDistance('classic', 'impossible', path.steps))
  assert.ok(await runEngine({ type: 'accepts-difficulty', values: edited.board, difficulty: 'impossible' }))
  const oracle = countMixedSolutions({ version: 1, givens: edited.board })
  assert.equal(oracle.count, 1)
  assert.equal(oracle.solution, path.board)
})

test('Impossible keeps technique focus, excludes equivalent imports, and observes cancellation', async () => {
  const focus = 'quadruple-pattern-overlay'
  const progress = [{ technique: focus, puzzles: 3, withHints: 5, withoutHints: 0, independence: 0 }]
  const first = await generateImpossible(12, progress, [])
  assert.ok(first && first.rating.score.counts[focus])
  assert.deepEqual(await generateImpossible(12, progress, []), first)
  const transposed = Array.from({ length: 81 }, (_, i) => first.board[i % 9 * 9 + Math.floor(i / 9)]).join('')
    .replace(/[12]/g, d => d === '1' ? '2' : '1')
  const next = await generateImpossible(12, progress, [transposed.replaceAll('0', '.')])
  assert.ok(next && next.rating.score.counts[focus])
  const keys = await runEngine({ type: 'canonical-puzzles', values: [first.board, transposed, next.board] })
  assert.equal(keys[0], keys[1])
  assert.notEqual(keys[0], keys[2])
  const controller = new AbortController()
  const pending = generateImpossible(2, undefined, [], controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('the fast Impossible search visits its last unseen opening and yields to live search on exhaustion', async () => {
  const masks = impossibleBank.cores.flatMap(core => Array.from({ length: 2 ** core.optional.length }, (_, mask) => {
    const board = [...core.board]
    core.optional.forEach((cell, j) => { if (mask & (1 << j)) board[cell] = '0' })
    return board.join('')
  }))
  const remaining = masks.pop()!
  const last = await generateImpossible(7, undefined, masks)
  assert.equal(last?.board, remaining)
  assert.equal(await generateImpossible(7, undefined, [...masks, remaining]), undefined)
})
