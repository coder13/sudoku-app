import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog'
import { generatedNumberToken, type GeneratedNumberGame } from '../number-puzzles/generated'
import type { GenerationRequest } from '../number-puzzles/generation'
import { generatedNumberHistory, openGeneratedNumberPuzzle } from '../number-puzzles/generated-storage'
import { rememberNumberDifficulty } from '../number-puzzles/progress'

export function useNumberPuzzleGeneration(game: GeneratedNumberGame | null, replace = false) {
  const router = useRouter()
  const workerRef = useRef<Worker>(null)
  const [pending, setPending] = useState<NumberPuzzleDifficulty | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

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
      worker.onmessage = async ({ data }) => {
        if (workerRef.current !== worker) return
        const board = generatedNumberToken(data)
        if (!board) {
          fail()
          return
        }
        worker.terminate()
        await openGeneratedNumberPuzzle(game, board)
        if (workerRef.current !== worker) return
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
      void generatedNumberHistory(game).then(history => {
        if (workerRef.current !== worker) return
        const request: GenerationRequest = {
          game, difficulty,
          seed: crypto.getRandomValues(new Uint32Array(1))[0],
          previous: history.map(({ id }) => id),
        }
        worker.postMessage(request)
      }).catch(() => { if (workerRef.current === worker) fail() })
    } catch {
      fail()
    }
  }

  return { generate, pending, error }
}
