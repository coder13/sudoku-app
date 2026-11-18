// Run from the repo root after building the app Wasm. Write intermediates outside the repo.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateClassic } from '../../../src/sudoku/classic-generation.ts'
import { SINGLE_TECHNIQUES } from '../../../src/sudoku/difficulty.ts'
import { runEngine, type Difficulty } from '../../../src/sudoku/engine.ts'
import { generatePlayableVariant } from '../../../src/sudoku/variant-play.ts'
import { digest, seedFor, source, wasmSha256 } from './engine.mts'

const [directory, job] = process.argv.slice(2)
const levels: Difficulty[] = ['beginner', 'easy', 'medium', 'tricky']
assert.ok(directory && ['references', 'human', 'variants', ...levels].includes(job),
  'Pass an output directory and references, human, variants, beginner, easy, medium, or tricky.')
await mkdir(directory, { recursive: true })
type SourceRow = { id: string; givens: string; difficulty: Difficulty }
async function catalog(name: string): Promise<SourceRow[]> {
  return JSON.parse(await readFile(new URL('collections/' + name + '.json', source), 'utf8'))
}
const nikoli = await catalog('nikoli-100')
const { difficultyOrder } = await runEngine({ type: 'techniques' })

async function classic(givens: string) {
  assert.equal(await runEngine({ type: 'analyze', values: givens }), 'unique')
  const solution = await runEngine({ type: 'solve', values: givens })
  const rating = await runEngine({ type: 'rate', values: givens, techniqueOrder: difficultyOrder })
  const [key] = await runEngine({ type: 'canonical-puzzles', values: [givens] })
  const values = [...givens]
  const engineWidths = []
  for (let wave = 0; wave < 3; wave++) {
    const deductions = await runEngine({ type: 'deductions', values: values.join(''), techniqueOrder: SINGLE_TECHNIQUES })
    const moves = new Map<number, number>()
    for (const deduction of deductions) for (const action of deduction.actions) {
      assert.ok('place' in action)
      moves.set(action.place.cell, action.place.digit)
    }
    engineWidths.push(moves.size)
    for (const [cell, digit] of moves) values[cell] = String(digit)
  }
  return { givens, solution, fullTier: rating.status, scoring: rating.scoringVersion,
    structure: digest(key), mask: digest(key.replace(/[1-9]/g, '1')), engineWidths }
}
const rows: object[] = []
if (job === 'references') {
  for (const [name, collection] of [['nikoli', nikoli], ['exchange', await catalog('sudoku-exchange')]] as const) {
    for (const row of collection) {
      const info = await classic(row.givens)
      assert.deepEqual(info.fullTier, { solved: row.difficulty })
      rows.push({ source: name, id: row.id, tier: row.difficulty, ...info })
    }
  }
} else if (job === 'human') {
  const data = await readFile(join(directory, '20240415.csv'))
  assert.equal(digest(data), '908bb0d269e93e687e72ab92662a7a3c152fe2aff681f3db46c845227972141c')
  const [header, ...lines] = data.toString('utf8').trim().split(/\r?\n/)
  assert.equal(header, 'Game No.,Sudoku Puzzle,D_TO,D_TR')
  for (const line of lines) {
    const [id, raw, time, combined] = line.split(',')
    assert.match(raw, /^[1-9.]{81}$/)
    const info = await classic(raw.replaceAll('.', '0'))
    rows.push({ id, time: Number(time), combined: Number(combined), ...info })
  }
} else if (job === 'variants') {
  for (const family of ['killer-cages', 'jigsaw'] as const) {
    for (const tier of ['easy', 'medium'] as const) {
      for (let i = 0; i < 12; i++) {
        const seed = seedFor([family, tier, i].join('/'))
        const result = await generatePlayableVariant(family, tier, seed, [])
        const { puzzle, solution, rating } = result
        assert.deepEqual(rating.status, { solved: tier })
        const position = { puzzle }
        assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
        const domains = await runEngine({ type: 'variant', operation: 'candidates', position })
        const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: rating.techniqueOrder })
        assert.deepEqual(trace.rating.status, { solved: tier })
        rows.push({ family, tier, seed, sourceSeed: result.seed, puzzle, solution, domains,
          techniques: trace.steps.map(step => step.technique), scoring: rating.scoringVersion })
      }
    }
  }
} else {
  for (const row of nikoli.filter(row => row.difficulty === job)) {
    for (let slot = 0; slot < 4; slot++) {
      const seed = seedFor(['classic', row.id, slot].join('/'))
      const result = await generateClassic(row.difficulty, seed)
      assert.deepEqual(result.rating.status, { solved: row.difficulty })
      rows.push({ id: row.id, slot, seed, tier: row.difficulty, ...await classic(result.board) })
    }
  }
}
await writeFile(join(directory, job + '.json'), JSON.stringify({ wasm: wasmSha256, rows }))
console.log(job, rows.length)
