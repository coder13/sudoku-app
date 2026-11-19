import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Cage } from '../src/calcudoku/engine.ts'

// Optional argument points to a worktree with the same engine API.
const source = process.argv[2] || '.'
const { createCalcudoku }: typeof import('../src/calcudoku/engine.ts') =
  await import(pathToFileURL(resolve(source, 'src/calcudoku/engine.ts')).href)
const { solveLatin }: typeof import('../src/latin/engine.ts') =
  await import(pathToFileURL(resolve(source, 'src/latin/engine.ts')).href)

const size = 9
const nodeLimit = 1000
const sampleCount = 100
const solution = Array.from({ length: size * size }, (_, i) => 1 + (i % size + Math.floor(i / size)) % size)
let seed = 0xa016bfa7
function nextLength() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return 2 + Math.floor(seed / 2 ** 32 * 4)
}

const elapsed: number[] = []
const answers: Record<string, number> = {}
const digest = createHash('sha256')
for (let sample = 0; sample < sampleCount; sample++) {
  const cages: Cage[] = []
  for (let row = 0; row < size; row++) {
    let start = 0
    while (start < size) {
      const length = Math.min(nextLength(), size - start)
      const cells = Array.from({ length }, (_, offset) => size * row + start + offset)
      const target = cells.reduce((sum, i) => sum + solution[i], 0)
      cages.push({ cells, operator: length === 1 ? 'equal' : 'add', target })
      start += length
    }
  }

  const puzzle = createCalcudoku(size, cages)
  const start = performance.now()
  const result = solveLatin(puzzle, [], nodeLimit)
  elapsed.push(performance.now() - start)
  answers[result.status] = (answers[result.status] ?? 0) + 1
  digest.update(JSON.stringify(result))
}
elapsed.sort((a, b) => a - b)
console.log(JSON.stringify({
  statusCounts: answers,
  p95Ms: elapsed[Math.ceil(.95 * sampleCount) - 1],
  maxMs: elapsed.at(-1),
  resultDigest: digest.digest('hex'),
}, null, 2))
