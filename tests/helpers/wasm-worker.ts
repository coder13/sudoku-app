import { after, before } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createEngineHandler, type EngineExports } from '../../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResponse } from '../../src/sudoku/engine.ts'

export function useWasmWorker(
  wasmPath: string | URL = new URL('../../src/sudoku/generated/engine.wasm', import.meta.url)
) {
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  before(() => {
    class TestWorker {
      onmessage?: (message: { data: EngineResponse }) => void
      onerror?: () => void
      handle = createEngineHandler(async () => {
        const bytes = await readFile(wasmPath)
        return (await WebAssembly.instantiate(bytes)).instance.exports as unknown as EngineExports
      })
      postMessage(message: { id: number; request: EngineRequest }) {
        void this.handle(message).then(data => this.onmessage?.({ data }))
      }
      terminate() {}
    }
    Object.defineProperty(globalThis, 'Worker', { value: TestWorker, configurable: true })
  })
  after(() => {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker)
    else delete (globalThis as { Worker?: unknown }).Worker
  })
}
