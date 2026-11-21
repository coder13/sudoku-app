import {
  addGeneratedHistoryRow, createGeneratedNumberResultCollector, generatedNumberWindow, orderNumberHistory,
  type GeneratedNumberResults, type GeneratedNumberWindowResult, type NumberHistoryRequest, type NumberHistoryWindow,
} from './generated-results.ts'
import {
  generatedNumberHistory, hasGeneratedNumberHistory, indexGeneratedHistory, indexGeneratedRecentHistory,
  prepareGeneratedHistory, readGeneratedPickerHistory, readGeneratedRecentHistory, readLegacyGeneratedHistory, scanGeneratedRecentHistory,
} from './generated-storage.ts'

export function requestGeneratedNumberResults(request: NumberHistoryRequest, publish: (result: GeneratedNumberResults) => void) {
  return openGeneratedNumberResults(request, publish).close
}

export function openGeneratedNumberResults(
  request: NumberHistoryRequest, publish: (result: GeneratedNumberResults | GeneratedNumberWindowResult) => void,
) {
  const { game } = request
  let windowQuery = request.window
  let cancelled = false
  let worker: Worker | undefined
  let queue: MessageChannel | undefined
  let cached: GeneratedNumberResults | undefined
  let fallbackMode: 'indexed' | 'snapshot' | undefined
  let indexing: Promise<void> | undefined

  function publishWindow(result: GeneratedNumberResults, query = windowQuery) {
    publish(query ? generatedNumberWindow(result.entries, game, query) : result)
  }

  function fallback() {
    if (cancelled || fallbackMode) return
    worker?.terminate()
    worker = undefined
    if (windowQuery) {
      fallbackMode = 'indexed'
      void readFallbackWindow(windowQuery)
    } else {
      fallbackMode = 'snapshot'
      fallbackSnapshot()
    }
  }

  async function readFallbackWindow(query: NumberHistoryWindow) {
    const stale = () => cancelled || query !== windowQuery || fallbackMode !== 'indexed'
    try {
      await prepareGeneratedHistory(game)
      if (stale()) return
      const indexed = await readGeneratedRecentHistory(game, request.status, query).catch(() => undefined)
      if (stale()) return
      const result = indexed?.result ?? await scanGeneratedRecentHistory(game, request.status, query, stale)
      if (stale()) return
      publish(result)
      if (!indexing && (!indexed || indexed.indexPending)) {
        const closed = () => cancelled
        indexing = indexGeneratedHistory(game, closed).then(() => indexGeneratedRecentHistory(game, closed))
          .catch(() => {}).finally(() => { indexing = undefined })
      }
    } catch {
      if (stale()) return
      fallbackMode = 'snapshot'
      fallbackSnapshot()
    }
  }

  function fallbackSnapshot() {
    const history = windowQuery ? readLegacyGeneratedHistory(game).then(records => ({ records }))
      : prepareGeneratedHistory(game).then(() => readGeneratedPickerHistory(game, request.status, request.page))
        .catch(async () => ({ records: await generatedNumberHistory(game) }))
    void history
      .then(history => {
        if (cancelled) return
        const totals = 'totals' in history ? history.totals : undefined
        const result: GeneratedNumberResults = { entries: [], totals: totals ?? new Map() }
        const finish = () => {
          if (windowQuery) {
            orderNumberHistory(result.entries)
            cached = result
          }
          publishWindow(result)
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
          ? (index: number) => addGeneratedHistoryRow(result, request, history.rows[index], !windowQuery && !totals)
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
    void prepareGeneratedHistory(game).then(async () => {
      if (cancelled) return
      // The library only needs rows. An empty store can answer every filter without a worker.
      const empty = request.window && !await hasGeneratedNumberHistory(game)
      if (cancelled) return
      if (empty) {
        cached = { entries: [], totals: new Map() }
        publishWindow(cached)
        return
      }
      try {
        worker = new Worker(new URL('./history.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = ({ data }: MessageEvent<GeneratedNumberResults | GeneratedNumberWindowResult | null>) => {
          if (cancelled) return
          if (data) publish(data)
          else fallback()
        }
        worker.onerror = worker.onmessageerror = fallback
        worker.postMessage({ ...request, window: windowQuery })
      } catch {
        fallback()
      }
    }).catch(fallback)
  })

  return {
    query(query: NumberHistoryWindow) {
      if (query === windowQuery) return
      windowQuery = query
      if (cached) publishWindow(cached, query)
      else if (fallbackMode === 'indexed' && !cancelled) void readFallbackWindow(query)
      else worker?.postMessage({ ...request, window: query })
    },
    close() {
      cancelled = true
      window.cancelAnimationFrame(frame)
      worker?.terminate()
      queue?.port1.close()
      queue?.port2.close()
    },
  }
}
