import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isMainThread, parentPort, Worker } from 'node:worker_threads'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { customRuleIds, hasOverlappingRuleChoices, isCustomDifficulty, markerOptions, type CustomRule, type MarkerRule } from '../src/sudoku/custom-modes.ts'
import { DIFFICULTY_LEVELS } from '../src/sudoku/difficulty.ts'
import { miracleSymmetry } from '../src/sudoku/miracle.ts'
import { EngineError, runEngine, type EngineRequest, type EngineResponse } from '../src/sudoku/engine.ts'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'

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
    let specs = process.argv.slice(2)
    if (specs[0] === '--matrix') {
      const [, seed, ...selected] = specs
      assert.ok(seed && /^\d+$/.test(seed), 'Supply a numeric seed after --matrix.')
      const choices = selected.length ? selected : customRuleIds
      specs = choices.flatMap(rules => DIFFICULTY_LEVELS.map(grade => `${rules}/${grade}/${seed}`))
    }
    for (const spec of specs) {
      const [choices, grade, seedText, ...options] = spec.split('/')
      assert.ok(isCustomDifficulty(grade))
      const rules = choices.split(',') as CustomRule[]
      assert.ok(rules.every(rule => customRuleIds.includes(rule)))
      const seed = Number(seedText)
      assert.ok(Number.isInteger(seed))
      const start = performance.now()
      assert.ok(options.every(option => option === 'miracle' || option.startsWith('negative=')))
      const miracle = options.includes('miracle')
      const negativeMarkers = options.flatMap(option => option.startsWith('negative=') ? option.slice(9).split(',') : []) as MarkerRule[]
      assert.ok(negativeMarkers.every(marker => Object.hasOwn(markerOptions, marker)))
      try {
        const { puzzle, solution, rating, givens, ruleDependencies } = await generateCustomSudoku(rules, grade, seed, [], { miracle, negativeMarkers })
        assert.deepEqual(rating.status, { solved: grade })
        assert.equal(givens, puzzle.givens.replaceAll('0', '').length)
        if (miracle) assert.equal(givens, 0)
        assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }), { status: 'unique', solution })
        const classic = await runEngine({ type: 'analyze', values: puzzle.givens })
        assert.ok(['multiple', 'unsolvable', 'conflict'].includes(classic))
        const expected = rules.map(rule => rule === 'windoku' ? 'extra-house' : rule === 'whispers' ? 'german-whispers' : rule)
        assert.deepEqual(new Set(ruleDependencies?.map(dep => dep.rule)), new Set(expected))
        const required = ruleDependencies!.map(({ rule, step, technique, action, alternative }) => {
          const candidate = 'place' in action ? action.place : action.eliminate
          assert.equal(alternative[candidate.cell] === String(candidate.digit), 'eliminate' in action)
          assert.equal(solution[candidate.cell] === String(candidate.digit), 'place' in action)
          return { rule, step, technique }
        })
        console.log(JSON.stringify({ spec, status: 'verified', givens, classic, hardest: rating.hardest, required, ms: Math.round(performance.now() - start) }))
      } catch (error) {
        if (!(error instanceof EngineError)) throw error
        console.log(JSON.stringify({ spec, status: error.code, reason: error.message, ms: Math.round(performance.now() - start) }))
      }
    }
  } finally {
    await Promise.all([...workers].map(worker => worker.terminate()))
  }
}
