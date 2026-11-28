import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readCoachSolutionSources } from '../tests/helpers/coach-fixture-sources.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

useWasmWorker()

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

test('benchmark full preview verification for the published zero-given Entropic combination', async () => {
  const source = [...readCoachSolutionSources().values()]
    .find(({ references }) => references.includes('entropic-coach.json:$.examples[6]'))
  assert.ok(source, 'the published Coach fixture must be available')

  const timings = []
  for (let sample = 0; sample < 5; sample++) {
    const start = performance.now()
    const preview = await prepareImportedPuzzle(source.code, [], { deferRating: true })
    timings.push(performance.now() - start)
    assert.equal(preview.game.variant?.solution, source.solution,
      'every timed preview verifies the published completion')
  }

  const format = value => value.toFixed(1)
  console.log(`Sudoku Coach app preview ${process.platform} ${process.arch}, Node ${process.version}.`)
  console.log('One 9×9 zero-given source, 15 imported rules, 5 sequential samples, no warmups; includes source parsing and full preview verification.')
  console.log(`Preview: ${format(percentile(timings, 0.5))}/${format(percentile(timings, 0.95))} ms median/p95.`)
  console.log(`Samples: ${timings.map(format).join(', ')} ms.`)
})
