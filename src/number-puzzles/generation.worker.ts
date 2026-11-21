import { generateIndexedCalcudoku } from './calcudoku-layout-index.ts'
import { readGeneratedSessions } from './generated-storage.ts'
import { generateNumberPuzzle, type GenerationRequest } from './generation.ts'

let boardOpened: (() => void) | undefined

async function publish(token: string, indexPending?: boolean) {
  if (!indexPending) {
    self.postMessage(token)
    return
  }
  const ready = new Promise<void>(resolve => { boardOpened = resolve })
  self.postMessage({ board: token, indexPending })
  await ready
}

async function generate(request: GenerationRequest) {
  if (request.previous) {
    self.postMessage(generateNumberPuzzle({ ...request, previous: request.previous }))
  } else if (request.game === 'kakuro') {
    const history = await readGeneratedSessions(request.game).catch(() => undefined)
    if (!history) {
      self.postMessage({ readHistory: true })
      return
    }
    self.postMessage(generateNumberPuzzle({ ...request, previous: history.sessions.map(({ id }) => id) }))
  } else {
    try {
      await generateIndexedCalcudoku(request, publish)
    } catch {
      const history = await readGeneratedSessions('calcudoku').catch(() => undefined)
      if (!history) {
        self.postMessage({ readHistory: true })
        return
      }
      self.postMessage(generateNumberPuzzle({ ...request, previous: history.sessions.map(({ id }) => id) }))
    }
  }
  self.close()
}

self.onmessage = (message: MessageEvent<GenerationRequest | { boardOpened: true }>) => {
  if ('boardOpened' in message.data) {
    boardOpened?.()
    return
  }
  void generate(message.data).catch(() => {
    self.postMessage(null)
    self.close()
  })
}
