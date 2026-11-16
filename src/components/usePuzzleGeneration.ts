import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SINGLE_TECHNIQUES, type DifficultyPreference } from '../sudoku/difficulty'
import { EngineError, runEngine, type Difficulty } from '../sudoku/engine'
import { createGameId, makeGame } from '../sudoku/game'
import { ratingAttemptFor } from '../sudoku/player-rating'
import { readSolverProfile } from '../sudoku/solver-profile'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { autoTechniqueFocus } from '../sudoku/technique-progress'
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
      const { board: givens, rating, canonical } = await generateClassic(difficulty, seed, auto)
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

async function generateClassic(difficulty: Difficulty, seed: number, auto: boolean) {
  const { defaultOrder, techniques } = await runEngine({ type: 'techniques' })
  const techniqueOrder = (auto ? undefined : readSolverProfile()) ?? defaultOrder
  const maxAttempts = difficulty === 'extreme' ? 2048 : 512
  const needsMoreThanSingles = auto && difficulty !== 'easy'
  const available = techniques.filter(({ id, difficulty: tier }) =>
    tier === difficulty && defaultOrder.includes(id) && !SINGLE_TECHNIQUES.includes(id)).map(({ id }) => id)
  const focus = needsMoreThanSingles ? autoTechniqueFocus(await techniqueHistory.readProgress(), available) : undefined
  if (focus) {
    try {
      const board = await runEngine({
        type: 'generate-constrained', seed, maxAttempts: 64, clues: [24, 36], difficulty, technique: focus, techniqueOrder,
      })
      const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
      if (rating.status !== 'stalled' && rating.status.solved === difficulty && rating.score.counts[focus]) {
        return { board, rating, canonical: rating }
      }
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }

  for (let attempt = 0; attempt < (needsMoreThanSingles ? 6 : 1); attempt++) {
    const board = await runEngine({
      type: 'generate-targeted', seed: (seed + attempt) >>> 0, maxAttempts,
      target: { type: 'difficulty', level: difficulty, techniqueOrder },
    })
    const rating = await runEngine({ type: 'rate', values: board, techniqueOrder }).catch(() => undefined)
    if (auto && (!rating || rating.status === 'stalled' || rating.status.solved !== difficulty)) continue
    if (needsMoreThanSingles && !Object.keys(rating?.score.counts ?? {}).some((id) => !SINGLE_TECHNIQUES.includes(id))) continue
    const canonical = techniqueOrder === defaultOrder ? rating
      : await runEngine({ type: 'rate', values: board, techniqueOrder: defaultOrder }).catch(() => undefined)
    return { board, rating, canonical }
  }
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}

function nextPuzzleTitle(prefix = '') {
  const titles = new Set(roomStore.getSnapshot().games.map((game) => game.title))
  const title = (n: number) => `${prefix}Puzzle ${n}`
  let n = 1
  while (titles.has(title(n))) n++
  return title(n)
}
