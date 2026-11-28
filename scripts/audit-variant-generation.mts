import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { isMainThread, parentPort, Worker } from 'node:worker_threads'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { customRuleIds, hasOverlappingRuleChoices, isCustomDifficulty, markerOptions, type CustomRule, type MarkerRule } from '../src/sudoku/custom-modes.ts'
import { DIFFICULTY_LEVELS, difficultyIndex } from '../src/sudoku/difficulty.ts'
import { miracleSymmetry } from '../src/sudoku/miracle.ts'
import { EngineError, runEngine, type Difficulty, type EngineRequest, type EngineResponse, type VariantDeduction } from '../src/sudoku/engine.ts'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import { assertVariantCompletion } from '../tests/helpers/variant-truth.ts'
import { hasReadableArrowLayout } from '../src/sudoku/arrow-layout.ts'

function verifySolutionPath(givens: string, solution: string, steps: readonly VariantDeduction[]) {
  const board = [...givens]
  for (const { actions } of steps) for (const action of actions) {
    if ('place' in action) {
      const { cell, digit } = action.place
      assert.equal(board[cell], '0')
      assert.equal(solution[cell], String(digit))
      board[cell] = String(digit)
    } else {
      assert.notEqual(solution[action.eliminate.cell], String(action.eliminate.digit))
    }
  }
  assert.equal(board.join(''), solution)
}

function measurePath(steps: readonly VariantDeduction[], tiers: ReadonlyMap<string, Difficulty>) {
  const mediumOrHigher = steps.filter(({ technique }) => {
    const tier = tiers.get(technique)
    assert.ok(tier, technique)
    return difficultyIndex(tier) >= difficultyIndex('medium')
  })
  return {
    steps: steps.length,
    mediumOrHigherSteps: mediumOrHigher.length,
    mediumOrHigherTechniques: [...new Set(mediumOrHigher.map(step => step.technique))],
  }
}

// Use real workers so the generation deadline can interrupt synchronous Wasm.
if (!isMainThread) {
  const handle = createEngineHandler(async () => {
    const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
    return (await WebAssembly.instantiate(bytes)).instance.exports as unknown as EngineExports
  })
  parentPort!.on('message', async request => parentPort!.postMessage(await handle(request)))
} else if (process.argv[2] === '--symmetry') {
  const requested = process.argv.slice(3)
  const choices = requested.length ? requested.map(value => value.split(',') as CustomRule[])
    : customRuleIds.flatMap((first, index) => [[first], ...customRuleIds.slice(index + 1).map(second => [first, second])])
  for (const rules of choices) {
    assert.ok(rules.every(rule => customRuleIds.includes(rule)))
    if (hasOverlappingRuleChoices(new Set(rules))) continue
    const proof = miracleSymmetry(rules)
    console.log(JSON.stringify({ rules, status: proof ? 'proved-impossible' : 'undetermined', proof }))
  }
} else {
  const workers = new Set<Worker>()
  class AuditWorker {
    worker = new Worker(new URL(import.meta.url))
    onmessage?: (message: { data: EngineResponse }) => void
    onerror?: (error: Error) => void
    constructor() {
      workers.add(this.worker)
      this.worker.on('message', data => this.onmessage?.({ data }))
      this.worker.on('error', error => this.onerror?.(error))
    }
    postMessage(message: { id: number; request: EngineRequest }) { this.worker.postMessage(message) }
    terminate() { void this.worker.terminate() }
  }
  Object.defineProperty(globalThis, 'Worker', { value: AuditWorker })
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      matrix: { type: 'boolean' }, pairs: { type: 'string' }, miracle: { type: 'boolean' }, repeat: { type: 'string', default: '1' },
      strict: { type: 'boolean' }, 'seed-step': { type: 'string', default: '0' },
      'lower-positions': { type: 'string' },
      'verify-trace': { type: 'boolean' }, 'include-puzzle': { type: 'boolean' },
    } })
    const repeats = Number(values.repeat)
    assert.ok(Number.isSafeInteger(repeats) && repeats > 0, 'Supply a positive integer after --repeat.')
    const seedStep = Number(values['seed-step'])
    assert.ok(Number.isInteger(seedStep) && seedStep >= 0 && seedStep <= 0xffff_ffff,
      'Supply a non-negative 32-bit integer after --seed-step.')
    const lowerPositions = values['lower-positions'] === undefined ? undefined : Number(values['lower-positions'])
    assert.ok(lowerPositions === undefined || Number.isInteger(lowerPositions) && lowerPositions >= 0 && lowerPositions <= 256,
      'Supply a position budget from 0 through 256 after --lower-positions.')
    let specs = positionals
    if (values.pairs !== undefined) {
      const [seed] = specs
      const grade = values.pairs
      assert.ok(isCustomDifficulty(grade) && !values.matrix && specs.length === 1 && /^\d+$/.test(seed),
        'Supply a difficulty and seed after --pairs.')
      specs = customRuleIds.flatMap((first, i) => customRuleIds.slice(i + 1).flatMap(second =>
        hasOverlappingRuleChoices(new Set([first, second])) ? [] : [`${first},${second}/${grade}/${seed}`]))
    } else if (values.matrix) {
      const [seed, ...selected] = specs
      assert.ok(seed && /^\d+$/.test(seed), 'Supply a numeric seed after --matrix.')
      const choices = selected.length ? selected : customRuleIds
      const levels = values.miracle ? DIFFICULTY_LEVELS.slice(DIFFICULTY_LEVELS.indexOf('hard')) : DIFFICULTY_LEVELS
      specs = choices.flatMap(rules => levels.map(grade => `${rules}/${grade}/${seed}`))
    }
    const tiers = values['verify-trace'] && new Map((await runEngine({ type: 'techniques', variant: true })).techniques
      .map(technique => [technique.id, technique.difficulty]))
    for (const spec of specs) {
      const [choices, grade, seedText, ...options] = spec.split('/')
      assert.ok(isCustomDifficulty(grade))
      const rules = choices.split(',') as CustomRule[]
      assert.ok(rules.every(rule => customRuleIds.includes(rule)))
      const initialSeed = Number(seedText)
      assert.ok(Number.isInteger(initialSeed))
      assert.ok(options.every(option => option === 'miracle' || option.startsWith('negative=')))
      const miracle = values.miracle || options.includes('miracle')
      const negativeMarkers = options.flatMap(option => option.startsWith('negative=') ? option.slice(9).split(',') : []) as MarkerRule[]
      assert.ok(negativeMarkers.every(marker => Object.hasOwn(markerOptions, marker)))
      const history: Game[] = []
      for (let draw = 1; draw <= repeats; draw++) {
        const seed = (initialSeed + Math.imul(draw - 1, seedStep)) >>> 0
        const start = performance.now()
        try {
          const { puzzle, solution, rating, givens, ruleDependencies } = await generateCustomSudoku(rules, grade, seed, history, { miracle, negativeMarkers })
          assert.deepEqual(rating.status, { solved: grade })
          assert.equal(givens, puzzle.givens.replaceAll('0', '').length)
          if (miracle) assert.equal(givens, 0)
          assert.ok(hasReadableArrowLayout(puzzle.rules), 'Generated arrows should have clear separate paths.')
          const complete = new Set<MarkerRule>()
          for (const rule of puzzle.rules ?? []) {
            if (rule.type === 'kropki') {
              if (rule.consecutive?.negative) complete.add('kropki-white')
              if (rule.ratioTwo?.negative) complete.add('kropki-black')
            } else if (rule.type === 'xv') {
              if (rule.five?.negative) complete.add('xv-five')
              if (rule.ten?.negative) complete.add('xv-ten')
            }
          }
          assert.deepEqual(complete, new Set(negativeMarkers))
          assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }), { status: 'unique', solution })
          assertVariantCompletion(puzzle, solution)
          const classic = await runEngine({ type: 'analyze', values: puzzle.givens })
          assert.ok(['multiple', 'unsolvable', 'conflict'].includes(classic))
          const expected = rules.map(rule => rule === 'windoku' ? 'extra-house' : rule === 'whispers' ? 'german-whispers' : rule)
          assert.deepEqual(new Set(ruleDependencies?.map(dep => dep.rule)), new Set(expected))
          const trace = values['verify-trace'] && await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
          if (trace) {
            assert.deepEqual(trace.rating.status, rating.status)
            verifySolutionPath(puzzle.givens, solution, trace.steps)
          }
          const required = ruleDependencies!.map(({ rule, step, technique, action, alternative }) => {
            assertVariantCompletion(puzzle, alternative, rule)
            assert.throws(() => assertVariantCompletion(puzzle, alternative), { name: 'AssertionError' })
            const candidate = 'place' in action ? action.place : action.eliminate
            assert.equal(alternative[candidate.cell] === String(candidate.digit), 'eliminate' in action)
            assert.equal(solution[candidate.cell] === String(candidate.digit), 'place' in action)
            if (trace) {
              assert.equal(trace.steps[step - 1]?.technique, technique)
              assert.ok(trace.steps[step - 1].actions.some(a => isDeepStrictEqual(a, action)))
              assert.ok(trace.steps.slice(0, step - 1).every(move => move.actions.every(a =>
                'place' in a ? Number(alternative[a.place.cell]) === a.place.digit : Number(alternative[a.eliminate.cell]) !== a.eliminate.digit)))
            }
            return { rule, step, technique }
          })
          assert.ok(history.every(game => !isDeepStrictEqual(game.variant?.puzzle, puzzle)))
          history.push({ ...makeGame(String(draw), spec, puzzle.givens, 'generated'), variant: { id: 'mixed', puzzle, solution } })
          const lower = lowerPositions === undefined ? undefined : await runEngine({ type: 'variant', operation: 'search-lower-grade',
            position: { puzzle }, difficulty: grade, maxPositions: lowerPositions, techniqueOrder: rating.techniqueOrder })
          if (lower?.status === 'found') {
            verifySolutionPath(puzzle.givens, solution, lower.steps)
            if (values.strict) process.exitCode = 1
          }
          console.log(JSON.stringify({ spec, draw, seed, ...(values['include-puzzle'] && { puzzle }), status: 'verified', givens, classic,
            hardest: rating.hardest, required, ...(trace && tiers && { path: measurePath(trace.steps, tiers) }),
            ...(lower && { lower }), ms: Math.round(performance.now() - start) }))
        } catch (error) {
          if (!(error instanceof EngineError)) throw error
          if (values.strict) process.exitCode = 1
          console.log(JSON.stringify({ spec, draw, seed, status: error.code, reason: error.message, ms: Math.round(performance.now() - start) }))
          if (!seedStep || error.code !== 'search-limit') break
        }
      }
    }
  } finally {
    await Promise.all([...workers].map(worker => worker.terminate()))
  }
}
