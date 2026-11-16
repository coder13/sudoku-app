/// <reference lib="webworker" />

import { createEngineHandler, type EngineExports } from './engine-protocol'
import type { EngineRequest } from './engine'
import wasmUrl from './generated/engine.wasm?url'

const scope = self as unknown as DedicatedWorkerGlobalScope
const handle = createEngineHandler(async () => {
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error('WebAssembly download failed')
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer())
  return instance.exports as unknown as EngineExports
})

scope.onmessage = async ({ data }: MessageEvent<{ id: number; request: EngineRequest }>) => {
  scope.postMessage(await handle(data))
}
