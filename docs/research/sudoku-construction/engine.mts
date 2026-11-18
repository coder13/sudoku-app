import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEngineHandler, type EngineExports } from '../../../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResponse } from '../../../src/sudoku/engine.ts'

export const source = new URL('../../../src/sudoku/', import.meta.url)
const wasm = await readFile(new URL('generated/engine.wasm', source))
export const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
export const wasmSha256 = digest(wasm)
export const seedFor = (key: string) => Number.parseInt(digest(key).slice(0, 8), 16)

// Exercise the normal play functions through their usual worker interface.
class ResearchWorker {
  onmessage?: (event: { data: EngineResponse }) => void
  onerror?: () => void
  private handle = createEngineHandler(async () =>
    (await WebAssembly.instantiate(wasm)).instance.exports as unknown as EngineExports)
  postMessage(message: { id: number; request: EngineRequest }) {
    void this.handle(message).then(data => this.onmessage?.({ data }), () => this.onerror?.())
  }
  terminate() {}
}
Object.defineProperty(globalThis, 'Worker', { value: ResearchWorker })
