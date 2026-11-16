/// <reference lib="webworker" />

import type { Analysis, EngineRequest, EngineResponse } from './engine'
import wasmUrl from './generated/engine.wasm?url'

type Exports = {
  memory: WebAssembly.Memory
  board_buffer(): number
  notes_buffer(): number
  analyze_board(): number
  fill_notes(): number
  generate_board(seed: number): void
}

const statuses: Analysis[] = ['conflict', 'unsolvable', 'unique', 'multiple', 'search-limit']
const scope = self as unknown as DedicatedWorkerGlobalScope
let engine: Promise<Exports> | undefined

async function load() {
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error('WebAssembly download failed')
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer())
  return instance.exports as unknown as Exports
}

scope.onmessage = async ({ data }: MessageEvent<{ id: number; request: EngineRequest }>) => {
  const { id, request } = data
  try {
    const wasm = await (engine ??= load())
    const board = () => new Uint8Array(wasm.memory.buffer, wasm.board_buffer(), 81)
    let value: string | number[] | null
    if (request.type === 'generate') {
      wasm.generate_board(request.seed)
      value = board().join('')
    } else {
      board().set(Array.from(request.values, Number))
      if (request.type === 'analyze') value = statuses[wasm.analyze_board()]
      else value = wasm.fill_notes() ? [...new Uint16Array(wasm.memory.buffer, wasm.notes_buffer(), 81)] : null
    }
    scope.postMessage({ id, value } satisfies EngineResponse)
  } catch {
    engine = undefined
    scope.postMessage({ id, error: 'The Sudoku engine is unavailable. Try again in a moment.' } satisfies EngineResponse)
  }
}
