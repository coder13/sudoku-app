// Run with Node's TypeScript stripping. The research worker loads the app's actual Wasm file.
import assert from 'node:assert/strict'
import { appendFile, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { seedFor, wasmSha256 } from '../../docs/research/sudoku-construction/engine.mts'
import { generateClassic } from '../../src/sudoku/classic-generation.ts'
import { runEngine, EngineError, type Difficulty, type VariantPuzzle } from '../../src/sudoku/engine.ts'
import { generateSinclairClassic, generateSinclairVariant } from '../../src/sudoku/sinclair-generation.ts'
import { layoutPairing } from '../../src/sudoku/sinclair-layout.ts'
import { sinclairDistance } from '../../src/sudoku/sinclair-score.ts'
import { generatePlayableVariant } from '../../src/sudoku/variant-play.ts'
import { VARIANTS, variantDifficulties, type VariantId } from '../../src/sudoku/variants.ts'
import { assertVariantCompletion } from '../../tests/helpers/variant-truth.ts'

const [output, allTiers = '4', mediumTier = '12'] = process.argv.slice(2)
assert.ok(output && Number(allTiers) >= 1 && Number(mediumTier) >= Number(allTiers),
  'Supply an output JSONL path, draws per tier, and total draws per Medium tier.')
const variants = Object.keys(VARIANTS) as VariantId[]
const tiers = variants.flatMap(id => variantDifficulties(id).filter(t => t !== 'auto').map(tier => ({ id, tier })))
const machine = { cpu: cpus()[0].model, node: process.version, platform: process.platform, arch: process.arch, wasmSha256 }
await writeFile(output, JSON.stringify({ machine, allTiers: Number(allTiers), mediumTier: Number(mediumTier) }) + '\n', { flag: 'wx' })

async function measure(id: VariantId, tier: Difficulty, seed: number, mode: 'standard' | 'sinclair') {
  const start = performance.now()
  let elapsedMs: number, puzzle: VariantPuzzle, solution: string, check, style
  try {
    if (id === 'classic') {
      const result = mode === 'sinclair' ? await generateSinclairClassic(tier, seed) : await generateClassic(tier, seed)
      elapsedMs = performance.now() - start
      puzzle = { version: 1, givens: result.board }
      style = 'style' in result ? result.style : undefined
      const position = { values: result.board, techniqueOrder: result.rating.techniqueOrder }
      assert.equal(await runEngine({ type: 'analyze', values: result.board }), 'unique')
      assert.ok(await runEngine({ type: 'accepts-difficulty', values: result.board, difficulty: tier }))
      const trace = await runEngine({ type: 'logical-solve', ...position })
      assert.deepEqual(trace.rating.status, { solved: tier })
      assert.equal(trace.rating.score.points, result.rating.score.points)
      solution = trace.board
      check = { points: trace.rating.score.points, hardest: trace.rating.score.hardest, steps: trace.steps.length,
        distance: sinclairDistance(id, tier, trace.steps) }
    } else {
      const result = mode === 'sinclair' ? await generateSinclairVariant(id, tier, seed, []) : await generatePlayableVariant(id, tier, seed, [])
      elapsedMs = performance.now() - start
      puzzle = result.puzzle
      style = 'style' in result ? result.style : undefined
      const position = { puzzle }
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
      solution = (await runEngine({ type: 'variant', operation: 'solve', position }))!
      assert.equal(solution, result.solution)
      const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: result.rating.techniqueOrder })
      assert.deepEqual(trace.rating.status, { solved: tier })
      assert.equal(trace.rating.points, result.rating.points)
      check = { points: trace.rating.points, hardest: trace.rating.hardest, steps: trace.steps.length,
        distance: sinclairDistance(id, tier, trace.steps) }
    }
  } catch (error) {
    if (error instanceof EngineError && error.code === 'search-limit') return { elapsedMs: performance.now()-start, error: error.code }
    throw error
  }
  assertVariantCompletion(puzzle, solution)
  return { elapsedMs, puzzle, ...check, pairing: layoutPairing(puzzle), style }
}

// Exercise both code paths before recording warm calls. Checks happen outside the timer.
for (const mode of ['standard', 'sinclair'] as const) await measure('classic', 'easy', 32301, mode)
for (let draw = 0; draw < Number(mediumTier); draw++) {
  for (const [index, { id, tier }] of tiers.entries()) {
    if (draw >= Number(allTiers) && tier !== 'medium') continue
    const seed = seedFor(['sinclair-live-v1', id, tier, draw].join('/'))
    const modes = (index + draw) % 2 ? ['standard', 'sinclair'] as const : ['sinclair', 'standard'] as const
    for (const mode of modes) {
      const result = await measure(id, tier, seed, mode)
      await appendFile(output, JSON.stringify({ id, tier, draw, seed, mode, ...result }) + '\n')
      if ('error' in result) console.log(id, tier, mode, result.error)
    }
  }
  console.log('Finished draw', draw + 1)
}
