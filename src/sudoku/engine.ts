export type Analysis = 'conflict' | 'unsolvable' | 'unique' | 'multiple' | 'search-limit'
export type EngineRequest =
  | { type: 'analyze'; values: string }
  | { type: 'notes'; values: string }
  | { type: 'solve'; values: string }
  | { type: 'generate'; seed: number }

export type EngineResult<T extends EngineRequest> =
  T['type'] extends 'analyze' ? Analysis :
  T['type'] extends 'notes' ? number[] | null :
  T['type'] extends 'solve' ? string | null : string

export type EngineResponse =
  | { id: number; value: Analysis | number[] | null | string }
  | { id: number; error: string }

let worker: Worker | undefined
let requestId = 0
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

function connect() {
  const instance = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  instance.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if ('error' in data) request.reject(new Error(data.error))
    else request.resolve(data.value)
  }
  instance.onerror = () => {
    instance.terminate()
    worker = undefined
    for (const request of pending.values()) request.reject(new Error('The Sudoku engine could not start. Try again.'))
    pending.clear()
  }
  return instance
}

export function runEngine<T extends EngineRequest>(request: T): Promise<EngineResult<T>> {
  return new Promise((resolve, reject) => {
    worker ??= connect()
    const id = ++requestId
    pending.set(id, { resolve: (value) => resolve(value as EngineResult<T>), reject })
    worker.postMessage({ id, request })
  })
}
