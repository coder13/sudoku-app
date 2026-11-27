import { performance } from 'node:perf_hooks'
import { createFutoshiki } from '../src/futoshiki/engine.ts'
import { findLatinHints, solveLatin } from '../src/latin/engine.ts'

const warmups = Number(process.argv[2] ?? 5)
const sampleCount = Number(process.argv[3] ?? 30)
if (!Number.isInteger(warmups) || warmups < 0 || !Number.isInteger(sampleCount) || sampleCount < 1) {
  throw new Error('Usage: node --experimental-strip-types scripts/bench-latin-kropki.mjs [warmups] [samples]')
}

const size = 9
const plain = createFutoshiki(size, Array(size ** 2).fill(0), [])
const negativeKropki = createFutoshiki(size, Array(size ** 2).fill(0), [], [], [], [], [], [], {
  consecutive: { pairs: [[0, 1], [20, 21], [40, 41]], negative: true },
  ratioTwo: { pairs: [[1, 10], [30, 31]], negative: true },
})
const splitNegativeKropki = createFutoshiki(size, Array(size ** 2).fill(0), [], [], [], [], [], [], {
  layers: Array.from({ length: 16 }, () => ({ relation: 'consecutive', pairs: [], negative: true })),
})
const negativeEdges = splitNegativeKropki.rules.filter(rule => rule.label.startsWith('The unmarked edge'))
if (negativeEdges.length !== 144) throw new Error(`Expected 144 negative edges, got ${negativeEdges.length}`)
const repeatedLayerBaseline = {
  ...splitNegativeKropki,
  rules: [
    ...splitNegativeKropki.rules.filter(rule => !rule.label.startsWith('The unmarked edge')),
    ...Array.from({ length: 16 }, () => negativeEdges).flat(),
  ],
}
if (repeatedLayerBaseline.rules.length !== 18 + 16 * negativeEdges.length) {
  throw new Error('The repeated-layer benchmark baseline does not match sixteen copies of the negative constraints.')
}

function measure(name, puzzle, operation) {
  const run = () => operation(puzzle)
  for (let index = 0; index < warmups; index++) run()
  const times = []
  let result
  for (let index = 0; index < sampleCount; index++) {
    const start = performance.now()
    result = run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    name,
    constraints: puzzle.rules.length,
    status: Array.isArray(result) ? `${result.length} hints` : result.status,
    medianMs: Number(times[Math.floor(times.length / 2)].toFixed(3)),
    p95Ms: Number(times[Math.ceil(times.length * .95) - 1].toFixed(3)),
  }
}

console.log(JSON.stringify({
  host: `${process.platform} ${process.arch}`,
  node: process.version,
  warmups,
  samples: sampleCount,
  note: 'Synthetic empty 9×9 Latin boards; exact solving uses the default 20,000-node limit. These timings are local observations, not a general performance claim.',
  results: [
    measure('plain Latin hint propagation', plain, puzzle => findLatinHints(puzzle, [])),
    measure('negative Kropki hint propagation', negativeKropki, puzzle => findLatinHints(puzzle, [])),
    measure('16 split negative Kropki layers hint propagation', splitNegativeKropki, puzzle => findLatinHints(puzzle, [])),
    measure('16 split negative Kropki layers before deduplication', repeatedLayerBaseline, puzzle => findLatinHints(puzzle, [])),
    measure('plain Latin exact solve', plain, puzzle => solveLatin(puzzle)),
    measure('negative Kropki exact solve', negativeKropki, puzzle => solveLatin(puzzle)),
    measure('16 split negative Kropki layers exact solve', splitNegativeKropki, puzzle => solveLatin(puzzle)),
    measure('16 split negative Kropki layers before deduplication', repeatedLayerBaseline, puzzle => solveLatin(puzzle)),
  ],
}))
