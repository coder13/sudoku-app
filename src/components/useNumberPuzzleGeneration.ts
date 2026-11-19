import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog'
import { generatedNumberToken, type GeneratedNumberGame } from '../number-puzzles/generated'
import type { GenerationRequest } from '../number-puzzles/generation.worker'
import { generatedNumberTokens, rememberGeneratedNumberPuzzle, rememberNumberDifficulty } from '../number-puzzles/progress'

export function useNumberPuzzleGeneration(game: GeneratedNumberGame | null, replace = false) {
  const router = useRouter()
  const workerRef = useRef<Worker>(null)
  const [pending, setPending] = useState<NumberPuzzleDifficulty | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => workerRef.current?.terminate(), [])

  function generate(difficulty: NumberPuzzleDifficulty) {
    if (!game || workerRef.current) return
    setPending(difficulty)
    setError('')
    const fail = () => {
      workerRef.current?.terminate()
      workerRef.current = null
      setPending(null)
      setError('A new puzzle is unavailable. Try again.')
    }
    try {
      const worker = new Worker(new URL('../number-puzzles/generation.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onerror = fail
      worker.onmessage = ({ data }) => {
        const board = generatedNumberToken(data)
        if (!board) {
          fail()
          return
        }
        worker.terminate()
        rememberGeneratedNumberPuzzle(game, board)
        void router.navigate({
          to: `/puzzles/${game}/$puzzle`,
          params: { puzzle: 'generated' },
          search: { board },
          state: { fromNumberDifficulty: game },
          replace,
        }).then(() => {
          if (!replace) rememberNumberDifficulty(game, difficulty)
          workerRef.current = null
          setPending(null)
        }, fail)
      }
      const request: GenerationRequest = {
        game, difficulty,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        previous: generatedNumberTokens(game).slice(-150),
      }
      worker.postMessage(request)
    } catch {
      fail()
    }
  }

  return { generate, pending, error }
}
