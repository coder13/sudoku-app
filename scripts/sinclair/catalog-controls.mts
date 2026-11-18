// Draw a matched, unfiltered sample through Standard's production play functions.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { digest, seedFor } from '../../docs/research/sudoku-construction/engine.mts'
import { generateClassic } from '../../src/sudoku/classic-generation.ts'
import { generatePlayableVariant } from '../../src/sudoku/variant-play.ts'
import { EngineError, runEngine, type Difficulty } from '../../src/sudoku/engine.ts'
import { VARIANTS, variantDifficulties, type VariantId } from '../../src/sudoku/variants.ts'
import { sinclairDistance } from '../../src/sudoku/sinclair-score.ts'
import { layoutPairing } from '../../src/sudoku/sinclair-layout.ts'
import { worker } from './catalog-worker.mts'

const [file, shard = '0', shards = '1', draws = '100'] = process.argv.slice(2)
const done = new Set(existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s).seed) : [])
const groups = Object.keys(VARIANTS).flatMap(v => variantDifficulties(v as VariantId).filter(t => t !== 'auto')
  .map(tier => ({ family: v as VariantId, tier }))).filter((_,i) => i % Number(shards) === Number(shard))
const w = worker()
type Measures = { hardest: string | null; points: number; steps: number; pairing: number; distance: number; answer: string }
const measured = new Map<string, Measures>()
async function standard(family: VariantId, tier: Difficulty, seed: number) {
  const classic = family === 'classic' ? await generateClassic(tier, seed) : undefined
  const variant = family !== 'classic' ? await generatePlayableVariant(family, tier, seed, []) : undefined
  const puzzle = variant?.puzzle ?? { version: 1 as const, givens: classic!.board }
  const id = digest(JSON.stringify(puzzle))
  let metrics = measured.get(id)
  if (!metrics) {
    const trace = variant ? await runEngine({ type:'variant', operation:'trace', position:{puzzle}, techniqueOrder:variant.rating.techniqueOrder })
      : await runEngine({ type:'logical-solve', values:puzzle.givens, techniqueOrder:classic!.rating.techniqueOrder })
    if (trace.rating.status === 'stalled' || trace.rating.status.solved !== tier) throw Error('Standard control grade differs')
    const solution = variant?.solution ?? ('board' in trace ? trace.board : undefined)
    if (!solution) throw Error('Missing Standard solution')
    const rating = 'score' in trace.rating ? trace.rating.score : trace.rating
    metrics = { hardest:rating.hardest, points:rating.points, steps:trace.steps.length, pairing:layoutPairing(puzzle).score,
      distance:sinclairDistance(family, tier, trace.steps), answer:digest(await w.call({op:'key',givens:solution})) }
    measured.set(id, metrics)
  }
  return { id, ...metrics }
}
try {
  for (let draw = 0; draw < Number(draws); draw++) {
    for (const {family, tier} of groups) {
      const seed = seedFor('sinclair-catalog-controls/1/' + family + '/' + tier + '/' + draw)
      if (done.has(seed)) continue
      let record
      try { record = await standard(family, tier, seed) }
      catch (error) {
        if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
        record = { error:error.code }
      }
      appendFileSync(file,JSON.stringify({family,tier,draw,seed,...record}) + '\n')
    }
  }
} finally { w.close() }
