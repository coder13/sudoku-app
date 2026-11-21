import { addGeneratedHistoryRow, createGeneratedNumberResultCollector, type GeneratedNumberResults, type NumberHistoryRequest } from './generated-results.ts'
import { generatedNumberHistory, indexGeneratedHistory, prepareGeneratedHistory, readGeneratedPickerHistory } from './generated-storage.ts'

export function requestGeneratedNumberResults(request: NumberHistoryRequest, publish: (result: GeneratedNumberResults) => void) {
  const { game } = request
  let cancelled = false
  let worker: Worker | undefined
  let queue: MessageChannel | undefined

  function fallback() {
    if (cancelled) return
    worker?.terminate()
    worker = undefined
    void prepareGeneratedHistory(game).then(() => readGeneratedPickerHistory(game, request.status, request.page))
      .catch(async () => ({ records: await generatedNumberHistory(game) }))
      .then(history => {
        if (cancelled) return
        const totals = 'totals' in history ? history.totals : undefined
        const result: GeneratedNumberResults = { entries: [], totals: totals ?? new Map() }
        const finish = () => {
          publish(result)
          if ('indexPending' in history && history.indexPending) {
            void indexGeneratedHistory(game, () => cancelled).catch(() => {})
          }
        }
        const length = 'rows' in history ? history.rows.length : history.records.length
        if (!length) {
          finish()
          return
        }

        const fromSave = createGeneratedNumberResultCollector(result, request)
        const collect = 'rows' in history
          ? (index: number) => addGeneratedHistoryRow(result, request, history.rows[index], !totals)
          : (index: number) => fromSave(history.records[index])
        let cursor = 0
        const channel = queue = new MessageChannel()
        channel.port1.onmessage = () => {
          const deadline = performance.now() + 6
          do {
            collect(cursor++)
          } while (cursor < length && performance.now() < deadline)
          if (cursor < length) channel.port2.postMessage(null)
          else {
            channel.port1.close()
            channel.port2.close()
            finish()
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
