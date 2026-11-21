import {
  addGeneratedHistoryRow, createGeneratedNumberResultCollector, generatedNumberWindow, orderNumberHistory,
  type GeneratedNumberResults, type NumberHistoryRequest,
} from './generated-results.ts'
import { indexGeneratedHistory, indexGeneratedRecentHistory, readGeneratedPickerHistory, readGeneratedRecentHistory } from './generated-storage.ts'

async function readHistory(request: NumberHistoryRequest) {
  const history = await readGeneratedPickerHistory(request.game, request.status, request.page)
  const totals = 'totals' in history ? history.totals : undefined
  const result: GeneratedNumberResults = { entries: [], totals: totals ?? new Map() }
  if ('rows' in history) {
    for (const row of history.rows) addGeneratedHistoryRow(result, request, row, !request.window && !totals)
  } else {
    const collect = createGeneratedNumberResultCollector(result, request)
    for (const record of history.records) collect(record)
  }
  if (request.window) orderNumberHistory(result.entries)
  return { result, indexPending: history.indexPending }
}

let history: ReturnType<typeof readHistory> | undefined
let latest: NumberHistoryRequest
let indexing = false
let buildingRecentIndex = false

self.onmessage = async ({ data: request }: MessageEvent<NumberHistoryRequest>) => {
  latest = request
  try {
    // Keep paging the existing snapshot while this worker writes the new index.
    const indexed = request.window && !buildingRecentIndex
      ? await readGeneratedRecentHistory(request.game, request.status, request.window) : undefined
    if (request !== latest) return
    if (indexed) history = undefined
    const { result, indexPending } = indexed ?? await (history ??= readHistory(request))
    if (request !== latest) return
    self.postMessage(request.window && !indexed ? generatedNumberWindow(result.entries, request.game, request.window) : result)
    if (!indexing && (indexPending || request.window && !indexed)) {
      indexing = true
      buildingRecentIndex = Boolean(request.window && !indexed)
      if (indexPending) await indexGeneratedHistory(request.game).catch(() => {})
      if (buildingRecentIndex) await indexGeneratedRecentHistory(request.game).catch(() => {})
      buildingRecentIndex = false
    }
  } catch {
    if (request === latest) self.postMessage(null)
  }
  if (!request.window) self.close()
}
