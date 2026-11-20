import { generateIndexedCalcudoku } from './calcudoku-layout-index.ts'
import { readCalcudokuSessions } from './generated-storage.ts'
import { generateNumberPuzzle, type GenerationRequest } from './generation.ts'

async function generate(request: GenerationRequest) {
  if (request.previous) {
    self.postMessage(generateNumberPuzzle({ ...request, previous: request.previous }))
  } else {
    try {
      await generateIndexedCalcudoku(request, token => self.postMessage(token))
    } catch {
      const history = await readCalcudokuSessions().catch(() => undefined)
      if (!history) {
        self.postMessage({ readHistory: true })
        return
      }
      self.postMessage(generateNumberPuzzle({ ...request, previous: history.sessions.map(({ id }) => id) }))
    }
  }
  self.close()
}

self.onmessage = (message: MessageEvent<GenerationRequest>) => {
  void generate(message.data).catch(() => {
    self.postMessage(null)
    self.close()
  })
}
