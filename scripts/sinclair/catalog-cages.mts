// Sample fresh completions inside connected, often paired cage outlines. Keep the grid empty.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { killerCages, randomIndex } from '../../src/sudoku/sinclair-layout.ts'
import { catalogSeed, worker, score, type Candidate } from './catalog-worker.mts'
import { variantDifficulties } from '../../src/sudoku/variants.ts'
import type { Difficulty } from '../../src/sudoku/engine.ts'

const [dir, jobs = '3', quota = '135', requested] = process.argv.slice(2)
const ledger = join(dir, 'cages.jsonl'), checkpoint = join(dir, 'cage-cursor.txt')
const tiers = variantDifficulties('killer-cages').filter((t): t is Difficulty => t !== 'auto' && (!requested || requested.split(',').includes(t)))
if (!tiers.length) throw Error('Choose at least one Killer difficulty.')
const counts = new Map(tiers.map(t => [t, 0])), seen = new Set<string>()
function count(row: Candidate) {
  if (counts.has(row.tier)) counts.set(row.tier, counts.get(row.tier)! + 1)
  seen.add(row.answerKey)
}
if (existsSync(ledger)) for (const line of readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)) count(JSON.parse(line))
let cursor = existsSync(checkpoint) ? Number(readFileSync(checkpoint, 'utf8')) : 0
async function lane() {
  const w = worker()
  try {
    for (;;) {
      const wanted = tiers.filter(t => counts.get(t)! < Number(quota))
      if (!wanted.length) return
      const index = cursor++, seed = catalogSeed('sinclair-cages/1/' + index)
      const pick = randomIndex(seed)
      const sizes = Array.from({ length: 34 }, () => 2 + pick(4))
      const layout = pick(3) ? { type: 'killer-cages', cages: killerCages(seed), coverGrid: true }
        : { type: 'killer-cage-sizes', sizes, coverGrid: true }
      const raw = await w.call({ op: 'catalog', family: 'killer-cages', tier: 'any', wanted, seed,
        template: { version: 1, givens: '0'.repeat(81) }, derived: [layout], mask: '0'.repeat(81), max: 0 })
      if (index % 500 === 0) writeFileSync(checkpoint, String(cursor))
      if (!raw || seen.has(raw.answerKey) || counts.get(raw.tier)! >= Number(quota)) continue
      const row = score('killer-cages', raw.tier, seed, index, raw)
      count(row)
      appendFileSync(ledger, JSON.stringify(row) + '\n')
    }
  } finally { w.close() }
}
const timer = setInterval(() => console.log(cursor, Object.fromEntries(counts)), 30000)
try { await Promise.all(Array.from({ length: Number(jobs) }, lane)) }
finally { clearInterval(timer); writeFileSync(checkpoint, String(cursor)) }
