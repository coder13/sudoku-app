import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import { generateClassic } from '../src/sudoku/classic-generation.ts'
import type { EngineRequest, EngineResponse } from '../src/sudoku/engine.ts'

const handle = createEngineHandler(async () => {
  const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  return (await WebAssembly.instantiate(bytes)).instance.exports as unknown as EngineExports
})
class AuditWorker {
  onmessage?: (event: { data: EngineResponse }) => void
  postMessage(message: { id: number; request: EngineRequest }) {
    void handle(message).then(response => this.onmessage?.({ data: response }))
  }
}
Object.defineProperty(globalThis, 'Worker', { value: AuditWorker, configurable: true })
const tiers = ['beginner','easy','medium','tricky','hard','very-hard','expert','master','extreme','impossible'] as const
let checked = 0
for (const tier of tiers) {
  const records = (await readFile(`${process.argv[2]}/${tier}.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    .filter(record => record.status === 'generated').sort((a,b) => a.index - b.index)
  const selected = new Set([records[0], records.at(-1), records.find(record => record.routes.at(-1).route === 'pool')].filter(Boolean))
  for (const record of selected) {
    const actual = await generateClassic(tier, record.seed)
    assert.equal(actual.board, record.puzzle, `${tier} seed ${record.seed}`)
    assert.deepEqual(actual.rating, record.rating)
    console.log(JSON.stringify({ tier, seed: record.seed, route: record.routes.at(-1).route, parity: 'pass' }))
    checked++
  }
}
console.log(JSON.stringify({ checked }))
