import type { Analysis, EnginePayload, EngineRequest, EngineResponse } from './engine.ts'

export type EngineExports = {
  memory: WebAssembly.Memory
  board_buffer(): number
  notes_buffer(): number
  analyze_board(): number
  fill_notes(): number
  solve_board(): number
  generate_board?(seed: number): void
  request_buffer(length: number): number
  run_request(): number
  response_buffer(): number
}

const CELL_COUNT = 81
const statuses: Analysis[] = ['conflict', 'unsolvable', 'unique', 'multiple', 'search-limit']
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function validGrid(value: unknown): value is string {
  return typeof value === 'string' && value.length === CELL_COUNT && !/[^0-9.]/.test(value)
}

function runStructuredRequest(wasm: EngineExports, request: EngineRequest): EnginePayload {
  const bytes = encoder.encode(JSON.stringify(request))
  const address = wasm.request_buffer(bytes.length)
  new Uint8Array(wasm.memory.buffer, address, bytes.length).set(bytes)
  const length = wasm.run_request()
  const response = new Uint8Array(wasm.memory.buffer, wasm.response_buffer(), length)
  return JSON.parse(decoder.decode(response)) as EnginePayload
}

export function createEngineHandler(load: () => Promise<EngineExports>) {
  let engine: Promise<EngineExports> | undefined

  return async ({ id, request }: { id: number; request: EngineRequest }): Promise<EngineResponse> => {
    const validValues = !('values' in request) || (request.type === 'canonical-puzzles'
      ? Array.isArray(request.values) && request.values.every(validGrid)
      : validGrid(request.values))
    if (!validValues) {
      return { id, code: 'invalid-grid', error: 'Enter exactly 81 cells. Use a dot or 0 for each empty cell.' }
    }

    try {
      const wasm = await (engine ??= load())
      const boardView = () => new Uint8Array(wasm.memory.buffer, wasm.board_buffer(), CELL_COUNT)
      if (request.type === 'generate') {
        if (!wasm.generate_board) return { id, code: 'unsupported-capability', error: 'This engine build does not include puzzle generation.' }
        wasm.generate_board(request.seed)
        return { id, value: boardView().join('') }
      }

      if (request.type !== 'analyze' && request.type !== 'notes' && request.type !== 'solve') {
        return { id, ...runStructuredRequest(wasm, request) }
      }

      const board = boardView()
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const digit = request.values.charCodeAt(cell)
        board[cell] = digit === 46 ? 0 : digit - 48
      }
      switch (request.type) {
        case 'analyze': return { id, value: statuses[wasm.analyze_board()] }
        case 'notes': return {
          id,
          value: wasm.fill_notes() ? [...new Uint16Array(wasm.memory.buffer, wasm.notes_buffer(), CELL_COUNT)] : null,
        }
        case 'solve': return { id, value: wasm.solve_board() ? boardView().join('') : null }
      }
    } catch {
      engine = undefined
      return { id, error: 'The Sudoku engine is unavailable. Try again in a moment.' }
    }
  }
}
