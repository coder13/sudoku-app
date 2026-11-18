// Choose and order each group from the completed, graded pool. Build the release offline.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { worker, type Candidate } from './catalog-worker.mts'
import { reflectVariant } from '../../src/sudoku/variant-generation.ts'
import { VARIANTS, variantDifficulties, type VariantId } from '../../src/sudoku/variants.ts'
import { puzzleSimilarity, visibleClues } from '../../src/sudoku/sinclair-variety.ts'
import { SINCLAIR_COUNT, type SinclairPack, type SinclairRow } from '../../src/sudoku/sinclair-format.ts'

const [dir, output = 'data/sinclair', research = 'docs/research/sinclair/catalog'] = process.argv.slice(2)
if (!dir) throw Error('Supply the completed candidate directory.')
const rows = (name: string): Candidate[] => existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8').trim()
  .split('\n').filter(Boolean).map(s => JSON.parse(s)) : []
const candidates = rows('candidates.jsonl')
const improved = new Map(rows('classic-layouts.jsonl').map(c => [c.answerKey, c]))
const trades = rows('cage-trades.jsonl'), converted = rows('cage-conversions.jsonl')
const tradeAnswers = new Set(trades.map(r => r.answerKey))
const pool = [...candidates.map(c => improved.get(c.answerKey) ?? c), ...rows('cages.jsonl'), ...trades, ...converted]
const chosenAnswers = new Set<string>(), classicMasks = new Set<string>()
const records: object[] = []
const files = new Map<string,string>()
const w = worker()
const orders: Record<'classic' | 'variant', string[]> = await w.call({ op: 'catalog-orders' })
function shapeKey(row: Candidate) {
  const forms = Array.from({ length: 8 }, (_, symmetry) => {
    const s = visibleClues(reflectVariant(row.puzzle, symmetry))
    return [...s.givens].join(',') + '/' + [...s.shapes].sort().join(';')
  })
  return forms.sort()[0]
}
try {
  // The first playtest remains playable. Reserve its answer classes as well.
  for (const name of ['classic', 'killer', 'x']) {
    const prior = JSON.parse(readFileSync('src/sudoku/collections/sinclair-' + name + '.json', 'utf8'))
    for (const p of prior) {
      const solved = p.puzzle ? (await w.call({op:'trace', puzzle:p.puzzle, budget:1_000_000})).solution
        : await w.call({op:'solve', givens:p.givens})
      if (!solved) throw Error('Unresolved earlier Sinclair puzzle ' + p.id)
      chosenAnswers.add(await w.call({op:'key', givens:solved}))
      if (!p.puzzle) classicMasks.add(await w.call({op:'key', givens:p.givens.replace(/[1-9]/g,'1')}))
    }
  }
  for (const family of Object.keys(VARIANTS) as VariantId[]) {
    const usedLayouts = new Set<string>()
    for (const tier of variantDifficulties(family)) {
      if (tier === 'auto') continue
      const source = pool.filter(r => r.family === family && r.tier === tier &&
        (family !== 'killer-cages' || /^0{81}$/.test(r.puzzle.givens)))
        .sort((a, b) => a.rank - b.rank || a.seed - b.seed)
      const available = []
      for (const row of source) {
        if (chosenAnswers.has(row.answerKey)) continue
        // Classic masks also exclude rearrangements of bands, stacks, rows and columns.
        const layout: string = family === 'classic' ? await w.call({ op: 'key', givens: row.puzzle.givens.replace(/[1-9]/g, '1') }) : shapeKey(row)
        available.push({ row, layout, style: { ...visibleClues(row.puzzle), hardest: row.hardest, opening: row.opening } })
      }
      const order = orders[family === 'classic' ? 'classic' : 'variant'], openings: string[] = []
      const puzzles: SinclairRow[] = [], counts = new Map<string, number>()
      let previous: typeof available[number] | undefined
      while (puzzles.length < SINCLAIR_COUNT) {
        let best: typeof previous, bestValue = Infinity
        for (const entry of available) {
          const { row, layout, style } = entry
          if (chosenAnswers.has(row.answerKey) || usedLayouts.has(layout) || family === 'classic' && classicMasks.has(layout)) continue
          const value = row.rank + .13 * Math.sqrt(counts.get(row.hardest) ?? 0)
            + .09 * Math.sqrt(counts.get(row.opening) ?? 0) + (previous ? 1.6 * puzzleSimilarity(previous.style, style) : 0)
          if (value < bestValue) { bestValue = value; best = entry }
        }
        if (!best) throw Error(family + '/' + tier + ' has only ' + puzzles.length + ' distinct layouts and answers')
        const { row, layout } = best
        const hardest = order.indexOf(row.hardest), techniques = row.techniques.map(id => order.indexOf(id))
        if (hardest < 0 || techniques.includes(-1)) throw Error('Unknown technique in published path')
        if (!openings.includes(row.opening)) openings.push(row.opening)
        puzzles.push([family === 'classic' ? row.puzzle.givens : row.puzzle, row.solution, row.answerKey, row.points,
          hardest, techniques, openings.indexOf(row.opening)])
        records.push({ family, tier, number: puzzles.length, seed: row.seed, index: row.index, steps: row.steps,
          pairing: row.pairing, distance: row.distance, rank: row.rank, similarity: previous ? puzzleSimilarity(previous.style, best.style) : null,
          layout, construction: tradeAnswers.has(row.answerKey) ? 'cage-trade' : family === 'killer-cages' && row.puzzle.givens === '0'.repeat(81) ? 'empty-cages' : family === 'classic' && improved.has(row.answerKey) ? 'classic-layout-search' : 'graded-pool' })
        chosenAnswers.add(row.answerKey)
        usedLayouts.add(layout)
        if (family === 'classic') classicMasks.add(layout)
        counts.set(row.hardest, (counts.get(row.hardest) ?? 0) + 1)
        counts.set(row.opening, (counts.get(row.opening) ?? 0) + 1)
        previous = best
      }
      const versions = new Set(source.map(r => r.version))
      if (versions.size !== 1) throw Error('Mixed scoring versions')
      const pack: SinclairPack = { edition: 1, variant: family, difficulty: tier, scoringVersion: source[0].version, order, openings, puzzles }
      const { puzzles: entries, ...header } = pack
      const text = JSON.stringify(header).slice(0, -1) + ',"puzzles":[\n' + entries.map(r => JSON.stringify(r)).join(',\n') + '\n]}\n'
      files.set(join(family, tier + '.json'), text)
      console.log(family, tier, source.length, 'candidates')
    }
  }
  // A short pool must not overwrite a working edition with a partial release.
  for (const family of Object.keys(VARIANTS)) mkdirSync(join(output, family), { recursive: true })
  for (const [name,text] of files) writeFileSync(join(output,name),text)
  mkdirSync(research, {recursive:true})
  writeFileSync(join(research, 'selection.jsonl.gz'), gzipSync(records.map(r => JSON.stringify(r)).join('\n') + '\n', { level:9 }))
} finally { w.close() }
