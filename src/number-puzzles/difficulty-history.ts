import { createGeneratedNumberResultCollector, type GeneratedNumberResults, type NumberHistoryRequest } from './generated-results.ts'
import { generatedNumberHistory, prepareGeneratedHistory } from './generated-storage.ts'

export function requestGeneratedNumberResults(request: NumberHistoryRequest, publish: (result: GeneratedNumberResults) => void) {
  const { game } = request
  let cancelled = false
  let worker: Worker | undefined
  let queue: MessageChannel | undefined

  function fallback() {
    if (cancelled) return
    worker?.terminate()
    worker = undefined
    void generatedNumberHistory(game).then(records => {
      if (cancelled) return
      const result: GeneratedNumberResults = { entries: [], totals: new Map() }
      if (!records.length) {
        publish(result)
        return
      }

      const collect = createGeneratedNumberResultCollector(result, request)
      let cursor = 0
      const channel = queue = new MessageChannel()
      channel.port1.onmessage = () => {
        const deadline = performance.now() + 6
        do {
          collect(records[cursor++])
        } while (cursor < records.length && performance.now() < deadline)
        if (cursor < records.length) channel.port2.postMessage(null)
        else {
          channel.port1.close()
          channel.port2.close()
          publish(result)
        }
      }
      channel.port2.postMessage(null)
    })
  }

  const frame = window.requestAnimationFrame(() => {
    void prepareGeneratedHistory(game).then(() => {
      if (cancelled) return
      try {
        worker = new Worker(new URL('./history.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = ({ data }: MessageEvent<GeneratedNumberResults | null>) => {
          if (cancelled) return
          if (data) publish(data)
          else fallback()
        }
        worker.onerror = worker.onmessageerror = fallback
        worker.postMessage(request)
      } catch {
        fallback()
      }
    }, fallback)
  })

  return () => {
    cancelled = true
    window.cancelAnimationFrame(frame)
    worker?.terminate()
    queue?.port1.close()
    queue?.port2.close()
  }
}
