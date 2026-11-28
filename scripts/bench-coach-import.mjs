import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { readCoachSolutionSources } from '../tests/helpers/coach-fixture-sources.ts'

const sources = [...readCoachSolutionSources().values()]
const samplesPerSource = 10
const warmupRounds = 3
const timings = sources.map(() => [])

async function importSource(source) {
  const puzzle = await detectPuzzle(source.code)
  assert.equal(puzzle.format, 'Sudoku Coach')
  assert.equal(puzzle.givens.length, source.solution.length)
}

for (let round = 0; round < warmupRounds; round++) {
  for (const source of sources) await importSource(source)
}

for (let round = 0; round < samplesPerSource; round++) {
  for (const [index, source] of sources.entries()) {
    const start = performance.now()
    await importSource(source)
    timings[index].push(performance.now() - start)
  }
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

const allTimings = timings.flat()
const slowest = sources.map((source, index) => ({ reference: source.references[0], timings: timings[index] }))
  .sort((left, right) => percentile(right.timings, 0.5) - percentile(left.timings, 0.5))
  .slice(0, 5)

console.log(`Sudoku Coach import ${process.platform} ${process.arch}, Node ${process.version}; ${sources.length} solution sources.`)
console.log(`${warmupRounds} warmup rounds, ${samplesPerSource} measured imports per source; parser only, no UI or worker startup.`)
console.log(`Import: ${percentile(allTimings, 0.5).toFixed(3)}/${percentile(allTimings, 0.95).toFixed(3)} ms median/p95.`)
for (const source of slowest) {
  console.log(`${source.reference}: ${percentile(source.timings, 0.5).toFixed(3)}/${percentile(source.timings, 0.95).toFixed(3)} ms median/p95.`)
}
