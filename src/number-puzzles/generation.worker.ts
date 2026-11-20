import { generateNumberPuzzle, type GenerationRequest } from './generation.ts'

self.onmessage = (message: MessageEvent<GenerationRequest>) => {
  self.postMessage(generateNumberPuzzle(message.data))
}
