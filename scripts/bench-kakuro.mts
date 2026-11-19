import { performance } from 'node:perf_hooks'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { checkKakuro, createKakuro, findKakuroHint, solveKakuro } from '../src/kakuro/engine.ts'

const board = kakuroCatalog.find(entry => entry.id === 'hard-1')!.puzzle
const solution = solveKakuro(board).solution!
const partial = solution.map((value, index) => index % 3 === 0 ? value : 0)
const largest = kakuroCatalog.reduce((best, entry) =>
  entry.puzzle.cells.filter(cell => cell === null).length > best.puzzle.cells.filter(cell => cell === null).length
    ? entry : best)
const largestSolution = solveKakuro(largest.puzzle).solution!
const largestPartial = largestSolution.map((value, index) => index % 3 === 0 ? value : 0)
const columns = [3, 5, 7, 9, 11, 13, 15, 17, 10]
const row = [{ across: 45 }, ...columns.map(() => null)]
const long = createKakuro(10, [{}, ...columns.map(down => ({ down })), ...row, ...row])
const longPartial = solveKakuro(long).solution!.map((value, index) => index % 3 === 0 ? value : 0)
const profiles = [
  ['check rules, empty Hard', () => checkKakuro(board, [])],
  ['check rules, partial Hard', () => checkKakuro(board, partial)],
  ['find a hint, empty Hard', () => findKakuroHint(board, [])],
  ['exact solve, empty Hard', () => solveKakuro(board)],
  [`check rules, partial ${largest.id}`, () => checkKakuro(largest.puzzle, largestPartial)],
  [`find a hint, empty ${largest.id}`, () => findKakuroHint(largest.puzzle, [])],
  [`exact solve, empty ${largest.id}`, () => solveKakuro(largest.puzzle)],
  ['check rules, partial nine-cell runs', () => checkKakuro(long, longPartial)],
  ['exact solve, nine-cell runs', () => solveKakuro(long)],
] as const

const callsPerSample = 100
for (const [name, run] of profiles) {
  for (let i = 0; i < 1000; i++) run()
  const samples = Array.from({ length: 40 }, () => {
    const start = performance.now()
    for (let i = 0; i < callsPerSample; i++) run()
    return (performance.now() - start) / callsPerSample
  }).sort((a, b) => a - b)
  console.log(`${name}: median ${samples[20].toFixed(4)} ms, p95 ${samples[37].toFixed(4)} ms`)
}
