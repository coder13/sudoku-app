import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, runEngine } from '../sudoku/engine'
import { createGameId, makeGame } from '../sudoku/game'
import { readSolverProfile } from '../sudoku/solver-profile'
import { roomStore } from '../sudoku/storage'
import { generatePlayableVariant } from '../sudoku/variant-play'
import { VARIANTS, type VariantId } from '../sudoku/variants'

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

  async function generate(preference: DifficultyPreference, onGenerated?: () => void, variant: VariantId = 'classic') {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const difficulty = preference === 'auto' ? roomStore.getSnapshot().playerRating.recommended : preference
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      if (variant !== 'classic') {
        const result = await generatePlayableVariant(variant, difficulty, seed, roomStore.getSnapshot().games)
        if (!mounted.current) return
        const title = nextPuzzleTitle(`${VARIANTS[variant].name} `)
        const game = makeGame(createGameId(), title, result.puzzle.givens, 'generated')
        game.variant = { id: variant, puzzle: result.puzzle, solution: result.solution }
        game.difficulty = difficulty
        game.score = result.rating.points
        if (preference === 'auto') game.generatedWithAuto = true
        roomStore.add(game)
        onGenerated?.()
        return
      }
      const maxAttempts = difficulty === 'extreme' ? 2048 : 512
      const { defaultOrder } = await runEngine({ type: 'techniques' })
      const techniqueOrder = (preference === 'auto' ? undefined : readSolverProfile()) ?? defaultOrder
      const givens = await runEngine({
        type: 'generate-targeted', seed, maxAttempts, target: { type: 'difficulty', level: difficulty, techniqueOrder },
      })
      const rating = await runEngine({ type: 'rate', values: givens, techniqueOrder }).catch(() => undefined)
      if (!mounted.current) return
      const game = makeGame(createGameId(), nextPuzzleTitle(), givens, 'generated')
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

function nextPuzzleTitle(prefix = '') {
  const titles = new Set(roomStore.getSnapshot().games.map((game) => game.title))
  const title = (n: number) => `${prefix}Puzzle ${n}`
  let n = 1
  while (titles.has(title(n))) n++
  return title(n)
}
