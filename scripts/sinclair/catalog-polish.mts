// Regrade promising half-turn layouts of each Classic candidate. Keep at most one per answer.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classicLayouts } from '../../src/sudoku/sinclair-layout.ts'
import { worker, score, type Candidate } from './catalog-worker.mts'
const [dir, jobs = '3'] = process.argv.slice(2)
const out = join(dir, 'classic-layouts.jsonl')
const finished = new Set(existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s).answerKey) : [])
const rows: Candidate[] = readFileSync(join(dir, 'candidates.jsonl'), 'utf8').trim().split('\n')
  .map(s => JSON.parse(s)).filter(r => r.family === 'classic' && !finished.has(r.answerKey))
let cursor = 0
async function lane() {
  const w = worker()
  try {
    while (cursor < rows.length) {
      const r = rows[cursor++]
      let best = r
      for (const grid of classicLayouts(r.puzzle.givens, r.seed, 3)) {
        if (grid === r.puzzle.givens) continue
        const raw = await w.call({ op: 'catalog', family: 'classic', tier: r.tier, seed: r.seed, grid })
        if (!raw) continue
        if (raw.answerKey !== r.answerKey) throw Error('Rearrangement changed the solution class')
        const proposal = score('classic', r.tier, r.seed, r.index, raw)
        if (proposal.rank < best.rank) best = proposal
      }
      appendFileSync(out, JSON.stringify(best) + '\n')
    }
  } finally { w.close() }
}
await Promise.all(Array.from({ length: Number(jobs) }, lane))
