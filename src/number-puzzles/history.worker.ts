import { addGeneratedHistoryRow, createGeneratedNumberResultCollector, type GeneratedNumberResults, type NumberHistoryRequest } from './generated-results.ts'
import { indexGeneratedPickerHistory, readGeneratedPickerHistory } from './generated-storage.ts'

self.onmessage = async ({ data: request }: MessageEvent<NumberHistoryRequest>) => {
  let needsIndex = false
  try {
    const history = await readGeneratedPickerHistory(request.game)
    const result: GeneratedNumberResults = { entries: [], totals: new Map() }
    if ('rows' in history) {
      for (const row of history.rows) addGeneratedHistoryRow(result, request.status, row)
    } else {
      const collect = createGeneratedNumberResultCollector(result, request)
      for (const record of history.records) collect(record)
      needsIndex = true
    }
    self.postMessage(result)
  } catch {
    self.postMessage(null)
  }
  if (needsIndex) await indexGeneratedPickerHistory(request.game).catch(() => {})
  self.close()
}
