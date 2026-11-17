import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError } from '../sudoku/engine'
import { generateClassic } from '../sudoku/classic-generation'
import { createGameId, makeGame } from '../sudoku/game'
import { ratingAttemptFor } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { generatePlayableVariant } from '../sudoku/variant-play'
import { VARIANTS, variantDifficulty, type VariantId } from '../sudoku/variants'

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
      const auto = preference === 'auto'
      const difficulty = variantDifficulty(variant, auto ? roomStore.getSnapshot().playerRating.recommended : preference)
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      if (variant !== 'classic') {
        const result = await generatePlayableVariant(variant, difficulty, seed, roomStore.getSnapshot().games)
        if (!mounted.current) return
        const title = nextPuzzleTitle(`${VARIANTS[variant].name} `)
        const game = makeGame(createGameId(), title, result.puzzle.givens, 'generated')
        game.variant = { id: variant, puzzle: result.puzzle, solution: result.solution }
        game.difficulty = difficulty
        game.score = result.rating.points
        if (auto) game.generatedWithAuto = true
        game.ratingAttempt = ratingAttemptFor({
          difficulty, points: result.rating.points, scoringVersion: result.rating.scoringVersion,
          techniqueOrder: result.rating.techniqueOrder,
        }, auto ? undefined : 'fixed')
        roomStore.add(game)
        onGenerated?.()
        return
      }
      const { board: givens, rating, canonical } = await generateClassic(difficulty, seed, auto ? await techniqueHistory.readProgress() : undefined)
      if (!mounted.current) return
      const game = makeGame(createGameId(), nextPuzzleTitle(), givens, 'generated')
      if (auto) game.generatedWithAuto = true
      if (rating && rating.status !== 'stalled') {
        game.difficulty = rating.status.solved
        game.score = rating.score.points
      }
      if (canonical && canonical.status !== 'stalled') game.ratingAttempt = ratingAttemptFor({
        difficulty: canonical.status.solved, points: canonical.score.points,
        scoringVersion: canonical.scoringVersion, techniqueOrder: canonical.techniqueOrder,
      }, auto ? undefined : 'fixed')
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
