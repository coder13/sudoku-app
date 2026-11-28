import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { currentDifficulty, type DifficultyPreference } from '../sudoku/difficulty'
import { rateAlgebraicPuzzle, verifyAlgebraicPuzzle } from '../sudoku/algebraic-game'
import { createEngineSession, EngineError, type EngineRunner, type EngineSession } from '../sudoku/engine'
import { generateClassic } from '../sudoku/classic-generation'
import type { CustomModeDefinition } from '../sudoku/custom-modes'
import { createGameId, makeGame, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { generatePracticePuzzle, generateVariantPracticePuzzle, hasVariantPracticePuzzles } from '../sudoku/practice-play'
import { ratingAttemptFor } from '../sudoku/player-rating'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { generatePlayableVariant } from '../sudoku/variant-play'
import { verifySizedRulePuzzle } from '../sudoku/sized-rule-game'
import { fiveJigsawForSeed, MINI_GRID, rectangularGridForBoxRows, sevenJigsawForSeed, type RectangularBoxRows } from '../sudoku/grid'
import { ALGEBRAIC_CAGES_NAME, miniDifficulty, MINI_NAME, rectangularPuzzleSize, sizedGridName, type NewPuzzleId } from '../sudoku/new-puzzle'
import { VARIANTS, variantDifficulty, variantIdForPuzzle } from '../sudoku/variants'
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
  const customSearch = useRef<AbortController | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      customSearch.current?.abort()
      customSearch.current = null
      pending.current?.close()
      pending.current = null
    }
  }, [])

  async function withGeneration(work: (seed: number, run: EngineRunner, active: () => boolean) => Promise<void>, searchError?: string) {
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
      await work(seed, run, active)
    } catch (reason) {
      if (active() && !(reason instanceof Error && reason.name === 'AbortError')) {
        setError(reason instanceof EngineError && reason.code === 'search-limit' && searchError
          ? searchError : (reason as Error).message)
      }
    } finally {
      session.close()
      if (pending.current === session) {
        customSearch.current = null
        pending.current = null
        if (mounted.current) setBusy(false)
      }
    }
  }

  function generatePractice(technique: string, current?: Game) {
    return withGeneration(async (seed, run, active) => {
      const games = roomStore.getSnapshot().games
      const title = `${techniqueLabel(technique)} practice`
      if (hasVariantPracticePuzzles(technique)) {
        const latest = current ?? games.find(game => game.practiceTechnique === technique)
        const previous = [latest?.variant?.puzzle, ...games.flatMap(game => game.id !== latest?.id && game.variant ? [game.variant.puzzle] : [])]
          .filter(puzzle => puzzle !== undefined)
        const { puzzle, rating, solution } = await generateVariantPracticePuzzle(technique, seed, previous, run)
        if (!active() || rating.status === 'stalled') return
        const id = variantIdForPuzzle(puzzle)
        if (id === 'classic') throw new Error('The practice puzzle is missing its rules.')
        const game = makeGame(createGameId(), title, puzzle.givens, 'generated')
        roomStore.add({ ...game, practiceTechnique: technique, difficulty: rating.status.solved, score: rating.points,
          variant: { id, puzzle, solution } })
        return
      }
      const previous = games.filter(game => !game.variant && !game.grid).map(game => game.givens)
      const { board, rating } = await generatePracticePuzzle(technique, seed, previous, run)
      if (!active() || rating.status === 'stalled') return
      const game = makeGame(createGameId(), title, board, 'generated')
      roomStore.add({ ...game, practiceTechnique: technique, difficulty: rating.status.solved, score: rating.score.points })
    })
  }

  function generate(preference: DifficultyPreference, onGenerated?: () => void, variant: NewPuzzleId = 'classic', options?: VariantGenerationOptions & { boxRows?: RectangularBoxRows; customMode?: CustomModeDefinition }) {
    return withGeneration(async (seed, run, active) => {
      if (options?.customMode) {
        const mode = options.customMode
        const auto = preference === 'auto'
        const difficulty = currentDifficulty(auto ? roomStore.getSnapshot().playerRating.recommended : preference)
        const controller = new AbortController()
        customSearch.current = controller
        const { generateCustomSudoku } = await import('../sudoku/custom-generation')
        const result = await generateCustomSudoku(mode.rules, difficulty, seed, roomStore.getSnapshot().games, {
          signal: controller.signal, negativeMarkers: mode.negativeMarkers, miracle: options.miracle,
        })
        if (!active() || controller.signal.aborted) return
        const id = variantIdForPuzzle(result.puzzle)
        if (id === 'classic') throw new Error('The generated puzzle is missing its custom rules.')
        const game = makeGame(createGameId(), nextPuzzleTitle(`${mode.name} `), result.puzzle.givens, 'generated')
        roomStore.add({ ...game, pendingSave: true, customMode: mode, difficulty, score: result.rating.points, ...(auto && { generatedWithAuto: true }),
          variant: { id, puzzle: result.puzzle, solution: result.solution },
          ratingAttempt: ratingAttemptFor({ difficulty, points: result.rating.points, scoringVersion: result.rating.scoringVersion,
            techniqueOrder: result.rating.techniqueOrder }, auto ? undefined : 'fixed') })
        onGenerated?.()
        return
      }
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
      if (variant === 'six' || variant === 'eight' || variant === 'jigsaw-five' || variant === 'jigsaw-seven') {
        const difficulty = miniDifficulty(preference)
        const size = rectangularPuzzleSize(variant)
        const grid = size ? rectangularGridForBoxRows(size, options?.boxRows)
          : variant === 'jigsaw-five' ? fiveJigsawForSeed(seed) : sevenJigsawForSeed(seed)
        const exclude = roomStore.playedSizedGivens(grid).map(givens => Array.from(givens, Number))
        const givens = (await run('boxRows' in grid
          ? { type: 'generate-rectangular', seed, difficulty, grid, exclude }
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
        const controller = new AbortController()
        customSearch.current = controller
        const result = await generatePlayableVariant(variant, difficulty, seed, roomStore.getSnapshot().games,
          { ...options, signal: controller.signal })
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
    }, options?.miracle ? 'No zero-given puzzle met these rules and difficulty in this search. Try again or change the selection.'
      : options?.customMode ? 'No puzzle was found with these rules at this difficulty. Try again or change the rules or difficulty.'
      : 'The engine couldn’t find a puzzle at this difficulty. Try again or choose an easier difficulty.')
  }

  return { busy, error, generate, generatePractice, cancelGeneration: () => customSearch.current?.abort() }
}


function nextPuzzleTitle(prefix = '') {
  const titles = new Set(roomStore.getSnapshot().games.map((game) => game.title))
  const title = (n: number) => `${prefix}Puzzle ${n}`
  let n = 1
  while (titles.has(title(n))) n++
  return title(n)
}
