// Cross-check both samples with the independent completion counter and the app's share-link reader.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import '../../../docs/research/sudoku-construction/engine.mts'
import { runEngine, type VariantPuzzle } from '../../../src/sudoku/engine.ts'
import { detectPuzzle } from '../../../src/sudoku/puzzle-import.ts'
import { getVariantPlayOrder } from '../../../src/sudoku/variant-play.ts'
import { countMixedSolutions } from '../../../tests/helpers/mixed-oracle.ts'

const catalog = new URL('../../../src/sudoku/collections/', import.meta.url)
const evidence = new URL('../../../docs/research/sinclair/comparison/', import.meta.url)
type Draw = { id: string; puzzle: VariantPuzzle }
type Measure = { id: string; solution_hash: string; exact: string; family: string; key: string; tier: string; arm: string; points: number }
const jsonGzip = async (name: string) => JSON.parse(gunzipSync(await readFile(new URL(name, evidence))).toString())
const draws: Record<string, { rows: Draw[] }> = await jsonGzip('normal-draws.json.gz')
const measures: Measure[] = await jsonGzip('measurements.json.gz')
const games = new Map<string, VariantPuzzle>(Object.values(draws).flatMap(b => b.rows.map(r => [r.id, r.puzzle] as const)))
for (const family of ['classic', 'killer', 'x']) {
  const rows = JSON.parse(await readFile(new URL('sinclair-' + family + '.json', catalog), 'utf8'))
  for (const row of rows) games.set(row.id.toUpperCase(), row.puzzle ?? { version: 1, givens: row.givens })
}
const answers = new Map<string, string>()
for (const m of measures) {
  const puzzle = games.get(m.id)!
  if (!answers.has(m.exact)) {
    const solved = countMixedSolutions(puzzle, 10_000_000)
    assert.equal(solved.count, 1, m.id)
    answers.set(m.exact, createHash('sha256').update(solved.solution!).digest('hex'))
  }
  assert.equal(answers.get(m.exact), m.solution_hash, m.id)
}
assert.equal(games.size, 1380)
assert.equal(games.size, measures.length)
const byId = new Map(measures.map(m => [m.id, m]))
const sheet = await readFile(new URL('blind-pairs.md', evidence), 'utf8')
const links = [...sheet.matchAll(/\[Play [AB]\]\(([^)]+)\)/g)].map(m => m[1])
const identities = [...sheet.matchAll(/^\| [^|\n]+ · [^|\n]+ \| ([\w-]+) \| ([\w-]+) \|$/gm)].flatMap(m => m.slice(1, 3))
assert.equal(links.length, 46)
assert.equal(identities.length, 46)
const { difficultyOrder } = await runEngine({ type: 'techniques' })
const variantOrder = await getVariantPlayOrder()
for (let i = 0; i < links.length; i++) {
  const imported = await detectPuzzle(links[i])
  const m = byId.get(identities[i])!
  const puzzle = games.get(m.id)!
  assert.equal(imported.givens, puzzle.givens)
  const variant = imported.variant
  assert.equal(variant?.id, m.family === 'classic' ? undefined : m.family === 'x' ? 'diagonal' : 'killer-cages')
  if (variant) {
    const solved = countMixedSolutions(variant.puzzle, 10_000_000)
    assert.equal(solved.count, 1)
    assert.equal(createHash('sha256').update(solved.solution!).digest('hex'), m.solution_hash)
    const grade = await runEngine({ type: 'variant', operation: 'rate', position: { puzzle: variant.puzzle }, techniqueOrder: variantOrder })
    assert.deepEqual(grade.status, { solved: m.tier })
    assert.equal(grade.points, m.points)
  } else {
    const grade = await runEngine({ type: 'rate', values: imported.givens, techniqueOrder: difficultyOrder })
    assert.deepEqual(grade.status, { solved: m.tier })
    assert.equal(grade.score.points, m.points)
  }
  if (i % 2) {
    const other = byId.get(identities[i - 1])!
    assert.equal(other.family, m.family)
    assert.equal(other.tier, m.tier)
    assert.notEqual(other.arm, m.arm)
    assert.notEqual(other.key, m.key)
  }
}
console.log(`Verified ${measures.length} answers across ${answers.size} distinct printed definitions and ${links.length} playable links.`)
