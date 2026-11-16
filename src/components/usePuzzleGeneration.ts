import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, runEngine } from '../sudoku/engine'
import { createGameId, makeGame } from '../sudoku/game'
import { readSolverProfile } from '../sudoku/solver-profile'
import { roomStore } from '../sudoku/storage'

export function usePlayerRating() {
  return useSyncExternalStore(roomStore.subscribe,
    () => roomStore.getSnapshot().playerRating, () => roomStore.getServerSnapshot().playerRating)
}

export function usePuzzleGeneration() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function generate(preference: DifficultyPreference, onGenerated?: () => void) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const difficulty = preference === 'auto' ? roomStore.getSnapshot().playerRating.recommended : preference
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const maxAttempts = difficulty === 'extreme' ? 2048 : 512
      const { defaultOrder } = await runEngine({ type: 'techniques' })
      const techniqueOrder = (preference === 'auto' ? undefined : readSolverProfile()) ?? defaultOrder
      const givens = await runEngine({
        type: 'generate-targeted', seed, maxAttempts, target: { type: 'difficulty', level: difficulty, techniqueOrder },
      })
      const rating = await runEngine({ type: 'rate', values: givens, techniqueOrder }).catch(() => undefined)
      if (!mounted.current) return
      const titles = new Set(roomStore.getSnapshot().games.map((game) => game.title))
      let n = 1
      while (titles.has(`Puzzle ${n}`)) n++
      const game = makeGame(createGameId(), `Puzzle ${n}`, givens, 'generated')
      if (preference === 'auto') game.generatedWithAuto = true
      if (rating && rating.status !== 'stalled') {
        game.difficulty = rating.status.solved
        game.score = rating.score.points
        if (rating.techniqueOrder.length === defaultOrder.length && rating.techniqueOrder.every((id, index) => id === defaultOrder[index])) {
          game.ratingAttempt = {
            grade: { difficulty: rating.status.solved, points: rating.score.points,
              scoringVersion: rating.scoringVersion, techniqueOrder: rating.techniqueOrder },
            viewed: [], applied: [], priorElapsed: 0,
          }
        }
      } else if (preference === 'auto') {
        throw new Error('The generated puzzle couldn’t be rated. Try again or choose a difficulty.')
      }
      roomStore.add({ ...game, difficulty: game.difficulty ?? difficulty })
      onGenerated?.()
    } catch (reason) {
      if (mounted.current) {
        setError(reason instanceof EngineError && reason.code === 'search-limit'
          ? 'The engine couldn’t find a puzzle at this difficulty. Try again or choose an easier difficulty.'
          : (reason as Error).message)
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { busy, error, generate }
}
