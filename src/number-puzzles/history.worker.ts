import { addGeneratedNumberResult, type GeneratedNumberResults, type NumberHistoryRequest } from './generated-results.ts'
import { readGeneratedRecords } from './generated-storage.ts'

self.onmessage = async ({ data: request }: MessageEvent<NumberHistoryRequest>) => {
  try {
    const records = await readGeneratedRecords(request.game)
    const result: GeneratedNumberResults = { entries: [], totals: new Map() }
    for (const record of records) addGeneratedNumberResult(result, request, record)
    self.postMessage(result)
  } catch {
    self.postMessage(null)
  }
  self.close()
}
