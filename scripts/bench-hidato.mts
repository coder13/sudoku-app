import { performance } from 'node:perf_hooks'
import { hidatoCatalog } from '../src/hidato/catalog.ts'
import { checkHidato, findHidatoHint, solveHidato } from '../src/hidato/engine.ts'

const board = hidatoCatalog.find(entry => entry.id === 'hard-2')!.puzzle
const partial = solveHidato(board).solution!.map((digit, cell) => cell % 4 === 0 ? Math.max(digit, 0) : 0)
const measures = [
  ['partial rule check', () => checkHidato(board, partial)],
  ['first hint', () => findHidatoHint(board, [])],
  ['exact solve', () => solveHidato(board)],
] as const

for (const [label, run] of measures) {
  for (let i = 0; i < 1000; i++) run()
  const samples = Array.from({ length: 40 }, () => {
    const start = performance.now()
    for (let i = 0; i < 100; i++) run()
    return (performance.now() - start) / 100
  }).sort((a, b) => a - b)
  console.log(`${label}: median ${samples[20].toFixed(4)} ms, p95 ${samples[37].toFixed(4)} ms`)
}
