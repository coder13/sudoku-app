import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { countMixedSolutions } from '../../tests/helpers/mixed-oracle.ts'

type Trial = {
  family: string
  method: string
  seed: number
  result: null | (({ givens: string } | { puzzle: VariantPuzzle }) & { solution?: string })
}

const files = process.argv.slice(2)
if (!files.length) throw new Error('Supply at least one benchmark JSONL file.')
const solutions = new Map<string, string>()
const methods = new Map<string, number>()
let checked = 0

for (const file of files) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const { family, method, seed, result } = JSON.parse(line) as Trial
    if (result === null) continue
    const puzzle: VariantPuzzle = 'puzzle' in result
      ? result.puzzle
      : { version: 1, givens: result.givens }
    const key = JSON.stringify(puzzle)
    let solution = solutions.get(key)
    if (!solution) {
      const verified = countMixedSolutions(puzzle)
      assert.equal(verified.count, 1, `Expected one solution for ${family} ${method} seed ${seed}.`)
      assert.ok(verified.solution)
      solution = verified.solution
      solutions.set(key, solution)
    }
    if (result.solution) assert.equal(result.solution, solution)
    const group = `${family} ${method}`
    methods.set(group, (methods.get(group) ?? 0) + 1)
    checked++
  }
}

console.log(JSON.stringify({ checked, distinctBoards: solutions.size, methods: Object.fromEntries(methods) }))
