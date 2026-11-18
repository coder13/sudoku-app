import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { gzipSync, gunzipSync } from 'node:zlib'
import { seedFor, wasmSha256 } from '../../docs/research/sudoku-construction/engine.mts'
import { SINGLE_TECHNIQUES } from '../../src/sudoku/difficulty.ts'
import { runEngine } from '../../src/sudoku/engine.ts'
import { generateSinclairClassic } from '../../src/sudoku/sinclair-generation.ts'
import bank from '../../src/sudoku/sinclair-impossible-cores.json' with { type: 'json' }
import { sinclairDistance } from '../../src/sudoku/sinclair-score.ts'
import { countMixedSolutions } from '../../tests/helpers/mixed-oracle.ts'

const [output, draws = '320', checks = '32'] = process.argv.slice(2)
assert.ok(output && +draws >= +checks && +checks > 0)
const machine = { cpu: cpus()[0].model, node: process.version, platform: process.platform, wasmSha256 }
const original = gunzipSync(await readFile(new URL('../../docs/research/sinclair/live/draws.jsonl.gz', import.meta.url)))
  .toString().trim().split('\n').map(line => JSON.parse(line))
  .filter(r => r.id === 'classic' && r.tier === 'impossible' && r.mode === 'sinclair')

function timing(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length, middle = Math.floor(n / 2)
  return { n, p50: n % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p90: sorted[Math.ceil(n * .9) - 1], max: sorted[n - 1] }
}
async function measure(seed: number, previous: string[]) {
  const start = performance.now()
  const { board, rating, style } = await generateSinclairClassic('impossible', seed, undefined, previous)
  const ms = performance.now() - start
  assert.ok(['certified-layout', 'certified-opening'].includes(style.method))
  assert.deepEqual(rating.status, { solved: 'impossible' })
  return { seed, board, ms, score: rating.score, distance: style.distance, pairing: style.pairing.score, method: style.method }
}
const matched = []
for (const row of original) {
  const next = await measure(row.seed, [])
  matched.push({ seed: row.seed, originalMs: row.elapsedMs, newMs: next.ms, pairing: next.pairing,
    originalPairing: row.pairing.score, board: next.board })
}
const history: string[] = [], records = []
for (let i = 0; i < +draws; i++) {
  const row = await measure(seedFor('impossible-history/' + i), history)
  records.push(row)
  history.push(row.board)
}
const keys = await runEngine({ type: 'canonical-puzzles', values: history })
assert.equal(new Set(keys).size, history.length)
const media = { warmHistoryMs: timing(records.map(r => r.ms)), first100Ms: timing(records.slice(0, 100).map(r => r.ms)),
  last100Ms: timing(records.slice(-100).map(r => r.ms)), matchedOldMs: timing(matched.map(r => r.originalMs)),
  matchedNewMs: timing(matched.map(r => r.newMs)), meanPairing: records.reduce((s, r) => s + r.pairing, 0) / records.length }
console.log(JSON.stringify(media))

// Exhaust every supported opening outside the timer. This also detects overlaps
// between different families and between masks related by a Sudoku symmetry.
const masks: string[] = [], coreFor = new Map<string, number>()
const alternate = ['hidden-single-box', 'full-house', 'hidden-single', 'naked-single']
for (const [i, core] of bank.cores.entries()) {
  for (let bits = 0; bits < 2 ** core.optional.length; bits++) {
    const digits = [...core.board]
    core.optional.forEach((cell, j) => { if (bits & (1 << j)) digits[cell] = '0' })
    const board = digits.join('')
    assert.equal(countMixedSolutions({ version: 1, givens: board }).count, 1)
    for (const techniqueOrder of [SINGLE_TECHNIQUES, alternate]) {
      const prefix = await runEngine({ type: 'logical-solve', values: board, techniqueOrder })
      assert.equal(prefix.board, core.board)
      assert.ok(prefix.steps.every(s => s.actions.length === 1 && 'place' in s.actions[0]))
    }
    masks.push(board)
    coreFor.set(board, i)
  }
}
const allKeys = await runEngine({ type: 'canonical-puzzles', values: masks })
const uniqueFamilies = new Set(history.slice(0, bank.cores.length).map(b => coreFor.get(b)))
assert.ok(!uniqueFamilies.has(undefined))
assert.equal(uniqueFamilies.size, Math.min(history.length, bank.cores.length))
const fullChecks = []
for (let i = 0; i < +checks; i++) {
  // Sample throughout the growing history, including after the first pass over families.
  const row = records[Math.floor(i * records.length / +checks)]
  assert.equal(await runEngine({ type: 'accepts-difficulty', values: row.board, difficulty: 'impossible' }), true)
  const path = await runEngine({ type: 'logical-solve', values: row.board, techniqueOrder: bank.difficultyOrder })
  assert.deepEqual(path.rating.status, { solved: 'impossible' })
  assert.deepEqual(path.rating.score, row.score)
  assert.equal(sinclairDistance('classic', 'impossible', path.steps), row.distance)
  assert.equal(countMixedSolutions({ version: 1, givens: row.board }).solution, path.board)
  fullChecks.push({ board: row.board, steps: path.steps.length, points: row.score.points, method: row.method })
}
const verification = { cores: bank.cores.length, editableCores: bank.cores.filter(c => c.optional.length).length,
  masks: masks.length, canonicalMasks: new Set(allKeys).size, independentlyUnique: masks.length,
  freshFamiliesFirstPass: uniqueFamilies.size, distinctDraws: new Set(keys).size, fullChecks }
await writeFile(output, JSON.stringify({ machine, statistics: media, matched, verification,
  methods: Object.fromEntries([...new Set(records.map(r => r.method))].map(m => [m, records.filter(r => r.method === m).length])) }, null, 2) + '\n')
await writeFile(output.replace(/\.json$/, '') + '-draws.jsonl.gz',
  gzipSync(records.map(r => JSON.stringify(r)).join('\n') + '\n'))
console.log('Verified', verification.canonicalMasks, 'distinct structures and', fullChecks.length, 'complete fresh replay ratings.')
