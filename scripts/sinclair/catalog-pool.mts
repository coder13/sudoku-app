// Stream native, fully graded proposals to a resumable research directory.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIFFICULTY_LEVELS } from '../../src/sudoku/difficulty.ts'
import type { Difficulty } from '../../src/sudoku/engine.ts'
import { classicLayouts, jigsawRegions, killerCages, pairedLines, randomIndex } from '../../src/sudoku/sinclair-layout.ts'
import { catalogSeed, worker, score } from './catalog-worker.mts'
import { variantGenerationRequest, variantSeeds } from '../../src/sudoku/variant-generation.ts'
import { VARIANTS, variantDifficulties, type VariantId } from '../../src/sudoku/variants.ts'

const [directory, jobsText = '5', quotaText = '135', filter = ''] = process.argv.slice(2)
if (!directory) throw Error('Supply a scratch directory, worker count, target candidates per level and optional family/level filter.')
const quota = Number(quotaText)
mkdirSync(directory, { recursive: true })
const source = readFileSync('crates/engine/data/impossible.txt', 'utf8').trim().split('\n')
const ledger = join(directory, 'candidates.jsonl'), checkpoint = join(directory, 'progress.json')
const cursors: Record<string, number> = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : {}
type Entry = { family: VariantId; tier: Difficulty; index: number; answerKey: string }
type Group = { family: VariantId; tier: Difficulty; key: string; accepted: number }
const groups: Group[] = Object.keys(VARIANTS).flatMap(v => variantDifficulties(v as VariantId).filter(t => t !== 'auto').map(tier =>
  ({ family: v as VariantId, tier, key: v + '/' + tier, accepted: 0 })))
const byGroup = new Map(groups.map(g => [g.key, g]))
const answers = new Set<string>()
function count(r: Entry) {
  const g = byGroup.get(r.family + '/' + r.tier)!
  g.accepted++
  answers.add(r.answerKey)
  cursors[g.key] = Math.max(cursors[g.key] ?? 0, r.index + 1)
}
if (existsSync(ledger)) for (const line of readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)) count(JSON.parse(line))
const requested = groups.filter(g => !filter || g.key.includes(filter))
if (!requested.length) throw Error('No matching levels.')
let cursor = 0
function next() {
  for (let i = 0; i < requested.length; i++) {
    const group = requested[cursor++ % requested.length]
    if (group.accepted < quota) return group
  }
}

type Worker = ReturnType<typeof worker>
async function request(w: Worker, g: Group, seed: number) {
  const { family, tier } = g, pick = randomIndex(seed)
  const base: Record<string, unknown> = { op: 'catalog', family, tier, seed }
  if (family === 'classic') {
    const level = DIFFICULTY_LEVELS.indexOf(tier as typeof DIFFICULTY_LEVELS[number])
    if (level < 6 || level < 9 && pick(5) === 0) return base
    const src = source[pick(source.length)]
    const board = pick(7) === 0 ? src : classicLayouts(src, seed, 1)[0]
    if (level === 9) return { ...base, grid: board }
    const solution = await w.call({ op: 'solve', givens: board })
    const digits = [...board], blanks = digits.flatMap((d, i) => d === '0' ? [i] : [])
    for (let i = 0, n = 1 + pick(3); i < n; i++) {
      const cell = blanks.splice(pick(blanks.length), 1)[0]
      digits[cell] = solution[cell]
    }
    return { ...base, grid: digits.join('') }
  }
  const recipes = variantSeeds[family][tier]!, recipe = recipes[pick(recipes.length)]
  const request = variantGenerationRequest(family, tier, recipe, [], seed)
  let template = request.template, derived = request.derivedClues
  if (family === 'arrow' || family === 'thermometer') {
    const solution = await w.call({ op: 'solution', family: 'classic', seed })
    template = { version: 1, givens: solution, rules: pairedLines(family, seed, solution, 4 + pick(7)) }
  }
  if (family === 'jigsaw' && pick(5) !== 0) {
    template = { version: 1, givens: '0'.repeat(81), regions: { type: 'jigsaw', regions: jigsawRegions(seed) } }
  }
  if (family === 'killer-cages' && pick(4) === 0) derived = [{ type: 'killer-cages', cages: killerCages(seed), coverGrid: true }]
  return { ...base, template, derived, max: recipe.maxGivens, paired: pick(4) !== 0 }
}
let attempts = 0
const save = () => {
  writeFileSync(checkpoint + '.tmp', JSON.stringify(cursors))
  renameSync(checkpoint + '.tmp', checkpoint)
}
async function lane() {
  const w = worker()
  try {
    for (let g; (g = next());) {
      const index = cursors[g.key] ?? 0
      cursors[g.key] = index + 1
      const seed = catalogSeed('sinclair-catalog-1/' + g.key + '/' + index)
      const raw = await w.call(await request(w, g, seed))
      if (++attempts % 250 === 0) save()
      if (!raw || answers.has(raw.answerKey) || g.accepted >= quota) continue
      const record = score(g.family, g.tier, seed, index, raw)
      appendFileSync(ledger, JSON.stringify(record) + '\n')
      count(record)
    }
  } finally { w.close() }
}
const report = setInterval(() => {
  save()
  console.log(new Date().toISOString(), answers.size, 'accepted;', attempts, 'attempts this run;',
    requested.filter(g => g.accepted < quota).map(g => g.key + '=' + g.accepted).join(' '))
}, 30000)
try { await Promise.all(Array.from({ length: Number(jobsText) }, lane)) }
finally { clearInterval(report); save() }
