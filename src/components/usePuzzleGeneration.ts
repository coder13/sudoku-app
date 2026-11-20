import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type DifficultyPreference } from '../sudoku/difficulty'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from '../sudoku/algebraic-game'
import { createEngineSession, EngineError, type EngineRunner, type EngineSession, type SixGrid } from '../sudoku/engine'
import { generateClassic } from '../sudoku/classic-generation'
import { createGameId, makeGame } from '../sudoku/game'
import { ratingAttemptFor } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { generatePlayableVariant } from '../sudoku/variant-play'
import { verifySizedRulePuzzle } from '../sudoku/sized-rule-game'
import { fiveJigsawForSeed, MINI_GRID, sevenJigsawForSeed, sixGridForBoxRows } from '../sudoku/grid'
import { ALGEBRAIC_CAGES_NAME, miniDifficulty, MINI_NAME, sizedGridName, type NewPuzzleId } from '../sudoku/new-puzzle'
import { VARIANTS, variantDifficulty } from '../sudoku/variants'
import { generationRuleset, type VariantGenerationOptions } from '../sudoku/variant-rulesets'

export function usePlayerRating() {
  return useSyncExternalStore(roomStore.subscribe,
    () => roomStore.getSnapshot().playerRating, () => roomStore.getServerSnapshot().playerRating)
}

export function usePuzzleGeneration() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<EngineSession | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.close()
      pending.current = null
    }
  }, [])

  async function generate(preference: DifficultyPreference, onGenerated?: () => void, variant: NewPuzzleId = 'classic', options?: VariantGenerationOptions & { boxRows?: SixGrid['boxRows'] }) {
    if (pending.current) return
    const session = createEngineSession()
    pending.current = session
    const active = () => mounted.current && pending.current === session
    const run: EngineRunner = (request, options) => active()
      ? session.run(request, options)
      : Promise.reject(new DOMException('Puzzle generation cancelled.', 'AbortError'))
    setBusy(true)
    setError('')
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      if (variant === 'algebraic-cages') {
        const difficulty = miniDifficulty(preference)
        const { digits, rules } = await run({ type: 'generate-algebraic', seed, difficulty, exclude: roomStore.playedAlgebraicPuzzles() })
        const givens = digits.join('')
        const algebraic = await verifyAlgebraicPuzzle({ givens, rules }, run)
        const rating = await rateAlgebraicPuzzle(givens, rules, run)
        if (!active()) return
        if (rating?.difficulty !== difficulty) throw new Error('The walkthrough did not match the selected difficulty.')
        const game = makeGame(createGameId(), nextPuzzleTitle(`${ALGEBRAIC_CAGES_NAME} `), givens, 'generated', undefined, MINI_GRID)
        roomStore.add({ ...game, pendingSave: true, algebraic, difficulty, score: rating.points })
        onGenerated?.()
        return
      }
      if (variant === 'six' || variant === 'jigsaw-five' || variant === 'jigsaw-seven') {
        const difficulty = miniDifficulty(preference)
        const grid = variant === 'six' ? sixGridForBoxRows(options?.boxRows)
          : variant === 'jigsaw-five' ? fiveJigsawForSeed(seed) : sevenJigsawForSeed(seed)
        const exclude = roomStore.playedSizedGivens(grid).map(givens => Array.from(givens, Number))
        const givens = (await run(grid.size === 6
          ? { type: 'generate-six', seed, difficulty, grid, exclude }
          : { type: 'generate-jigsaw', seed, difficulty, grid, exclude })).join('')
        const sized = await verifySizedRulePuzzle({ grid, givens, rules: [] }, run)
        if (!active()) return
        const game = makeGame(createGameId(), nextPuzzleTitle(`${sizedGridName(grid)} `), givens, 'generated', undefined, grid)
        roomStore.add({ ...game, pendingSave: true, sized, difficulty, score: null })
        onGenerated?.()
        return
      }
      if (variant === 'mini') {
        const difficulty = miniDifficulty(preference)
        const exclude = roomStore.playedMiniGivens().map(givens => Array.from(givens, Number))
        const givens = (await run({ type: 'generate-mini', seed, difficulty, exclude })).join('')
        if (!active()) return
        const game = makeGame(createGameId(), nextPuzzleTitle(`${MINI_NAME} `), givens, 'generated', undefined, MINI_GRID)
        roomStore.add({ ...game, pendingSave: true, difficulty, score: null })
        onGenerated?.()
        return
      }
      const auto = preference === 'auto'
      const difficulty = variantDifficulty(variant, auto ? roomStore.getSnapshot().playerRating.recommended : preference)
      if (variant !== 'classic') {
        const result = await generatePlayableVariant(variant, difficulty, seed, roomStore.getSnapshot().games, options, run)
        if (!active()) return
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
        roomStore.add({ ...game, pendingSave: true })
        onGenerated?.()
        return
      }
      const previousPuzzles = roomStore.getSnapshot().games.filter(game => !game.variant && !game.grid).map(game => game.givens)
      const progress = auto ? await techniqueHistory.readProgress() : undefined
      if (!active()) return
      const { board: givens, rating, canonical } = await generateClassic(difficulty, seed, progress, previousPuzzles, run)
      if (!active()) return
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
      roomStore.add({ ...game, pendingSave: true, difficulty: game.difficulty ?? difficulty })
      onGenerated?.()
    } catch (reason) {
      if (active() && !(reason instanceof Error && reason.name === 'AbortError')) {
        setError(reason instanceof EngineError && reason.code === 'search-limit'
          ? 'The engine couldn’t find a puzzle at this difficulty. Try again or choose an easier difficulty.'
          : (reason as Error).message)
      }
    } finally {
      session.close()
      if (pending.current === session) {
        pending.current = null
        if (mounted.current) setBusy(false)
      }
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
