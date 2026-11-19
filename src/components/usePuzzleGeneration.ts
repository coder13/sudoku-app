import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type DifficultyPreference } from '../sudoku/difficulty'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from '../sudoku/algebraic-game'
import { EngineError, runEngine, type SixGrid } from '../sudoku/engine'
import { generateClassic } from '../sudoku/classic-generation'
import { createGameId, makeGame } from '../sudoku/game'
import { ratingAttemptFor } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { generatePlayableVariant } from '../sudoku/variant-play'
import { verifySixPuzzle } from '../sudoku/six-game'
import { MINI_GRID, sixGridForBoxRows } from '../sudoku/grid'
import { ALGEBRAIC_CAGES_NAME, miniDifficulty, MINI_NAME, SIX_NAME, type NewPuzzleId } from '../sudoku/new-puzzle'
import { VARIANTS, variantDifficulty } from '../sudoku/variants'
import { generationRuleset, type VariantGenerationOptions } from '../sudoku/variant-rulesets'

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

  async function generate(preference: DifficultyPreference, onGenerated?: () => void, variant: NewPuzzleId = 'classic', options?: VariantGenerationOptions & { boxRows?: SixGrid['boxRows'] }) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      if (variant === 'algebraic-cages') {
        const difficulty = miniDifficulty(preference)
        const { digits, rules } = await runEngine({ type: 'generate-algebraic', seed, difficulty, exclude: roomStore.playedAlgebraicPuzzles() })
        const givens = digits.join('')
        const algebraic = await verifyAlgebraicPuzzle({ givens, rules })
        const rating = await rateAlgebraicPuzzle(givens, rules)
        if (!mounted.current) return
        if (rating?.difficulty !== difficulty) throw new Error('The walkthrough did not match the selected difficulty.')
        const game = makeGame(createGameId(), nextPuzzleTitle(`${ALGEBRAIC_CAGES_NAME} `), givens, 'generated', undefined, MINI_GRID)
        roomStore.add({ ...game, algebraic, difficulty, score: rating.points })
        onGenerated?.()
        return
      }
      if (variant === 'six') {
        const difficulty = miniDifficulty(preference)
        const grid = sixGridForBoxRows(options?.boxRows)
        const exclude = roomStore.playedSixGivens(grid.boxRows).map(givens => Array.from(givens, Number))
        const givens = (await runEngine({ type: 'generate-six', seed, difficulty, grid, exclude })).join('')
        const six = await verifySixPuzzle({ grid, givens, rules: [] })
        if (!mounted.current) return
        const game = makeGame(createGameId(), nextPuzzleTitle(`${SIX_NAME} `), givens, 'generated', undefined, grid)
        roomStore.add({ ...game, six, difficulty, score: null })
        onGenerated?.()
        return
      }
      if (variant === 'mini') {
        const difficulty = miniDifficulty(preference)
        const exclude = roomStore.playedMiniGivens().map(givens => Array.from(givens, Number))
        const givens = (await runEngine({ type: 'generate-mini', seed, difficulty, exclude })).join('')
        if (!mounted.current) return
        const game = makeGame(createGameId(), nextPuzzleTitle(`${MINI_NAME} `), givens, 'generated', undefined, MINI_GRID)
        roomStore.add({ ...game, difficulty, score: null })
        onGenerated?.()
        return
      }
      const auto = preference === 'auto'
      const difficulty = variantDifficulty(variant, auto ? roomStore.getSnapshot().playerRating.recommended : preference)
      if (variant !== 'classic') {
        const result = await generatePlayableVariant(variant, difficulty, seed, roomStore.getSnapshot().games, options)
        if (!mounted.current) return
        const title = nextPuzzleTitle(`${generationRuleset(variant, options?.ruleset)?.name ?? VARIANTS[variant].name} `)
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
      const previousPuzzles = roomStore.getSnapshot().games.filter(game => !game.variant && !game.grid).map(game => game.givens)
      const { board: givens, rating, canonical } = await generateClassic(difficulty, seed, auto ? await techniqueHistory.readProgress() : undefined, previousPuzzles)
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
