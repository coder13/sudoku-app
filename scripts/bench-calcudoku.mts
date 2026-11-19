import { performance } from 'node:perf_hooks'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { checkLatin, findLatinHint, solveLatin } from '../src/latin/engine.ts'

const board = calcudokuCatalog.find(entry => entry.id === 'hard-2')!.puzzle
const partial = solveLatin(board).solution!.map((digit, cell) => cell % 4 === 0 ? digit : 0)
const measures = [
  ['partial rule check', () => checkLatin(board, partial)],
  ['first hint', () => findLatinHint(board, [])],
  ['exact solve', () => solveLatin(board)],
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
