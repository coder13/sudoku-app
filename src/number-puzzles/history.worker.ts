import { addGeneratedNumberResult, type GeneratedNumberResults } from './generated-results.ts'
import type { GeneratedNumberGame } from './generated.ts'
import { readGeneratedRecords } from './generated-storage.ts'

self.onmessage = async ({ data: game }: MessageEvent<GeneratedNumberGame>) => {
  try {
    const records = await readGeneratedRecords(game)
    const result: GeneratedNumberResults = { active: [], totals: new Map() }
    for (const record of records) addGeneratedNumberResult(result, game, record)
    self.postMessage(result)
  } catch {
    self.postMessage(null)
  }
  self.close()
}
