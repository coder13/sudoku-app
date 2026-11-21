import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { NumberPuzzleDifficulty } from '../number-puzzles/catalog'
import { generatedNumberToken, type GeneratedNumberGame } from '../number-puzzles/generated'
import type { GenerationRequest } from '../number-puzzles/generation'
import { generatedNumberHistory, openGeneratedNumberPuzzle, prepareGeneratedHistory } from '../number-puzzles/generated-storage'
import { rememberNumberDifficulty } from '../number-puzzles/progress'

export function useNumberPuzzleGeneration(game: GeneratedNumberGame | null, replace = false) {
  const router = useRouter()
  const workerRef = useRef<Worker>(null)
  const [pending, setPending] = useState<NumberPuzzleDifficulty | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (workerRef.current?.onmessage) workerRef.current.terminate()
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
      const request: GenerationRequest = { game, difficulty, seed: crypto.getRandomValues(new Uint32Array(1))[0] }
      let requestedFullHistory = false
      function sendFullHistory() {
        requestedFullHistory = true
        void generatedNumberHistory(request.game).then(history => {
          if (workerRef.current === worker) worker.postMessage({ ...request, previous: history.map(({ id }) => id) })
        }).catch(() => { if (workerRef.current === worker) fail() })
      }
      worker.onmessage = async ({ data }) => {
        if (workerRef.current !== worker) return
        if (data?.readHistory && !requestedFullHistory) {
          sendFullHistory()
          return
        }
        const board = generatedNumberToken(data?.board ?? data)
        if (!board) {
          fail()
          return
        }
        // The worker closes itself after any background index write.
        worker.onmessage = null
        worker.onerror = null
        try {
          await openGeneratedNumberPuzzle(game, board)
        } catch {
          if (workerRef.current === worker) fail()
          else worker.terminate()
          return
        }
        if (workerRef.current !== worker) {
          worker.terminate()
          return
        }
        void router.navigate({
          to: `/puzzles/${game}/$puzzle`,
          params: { puzzle: 'generated' },
          search: { board },
          state: previous => replace && previous.fromNumberPuzzleLibrary
            ? { fromNumberPuzzleLibrary: previous.fromNumberPuzzleLibrary } : { fromNumberDifficulty: game },
          replace,
        }).then(() => {
          if (data?.indexPending) {
            window.requestAnimationFrame(() => window.setTimeout(() => worker.postMessage({ boardOpened: true }), 0))
          }
          if (!replace) rememberNumberDifficulty(game, difficulty)
          workerRef.current = null
          setPending(null)
        }, fail)
      }
      void prepareGeneratedHistory(game).then(() => {
        if (workerRef.current === worker) worker.postMessage(request)
      }).catch(() => { if (workerRef.current === worker) sendFullHistory() })
    } catch {
      fail()
    }
  }

  return { generate, pending, error }
}
