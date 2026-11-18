import { DifficultySelector } from './DifficultySelector'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, CircleCheck } from 'lucide-react'
import { DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { formatTime, isSolved, type Game } from '../sudoku/game'
import type { CellReferenceStyle } from '../sudoku/hints'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { generationVariant, variantDifficulties, variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { ActionHistoryPanel } from './ActionHistoryPanel'
import { collectionProgress, getGameCollection, nextCollectionPuzzle } from '../sudoku/collections'
import { openNextCollectionPuzzle } from '../sudoku/collection-play'
import { collectionDownloads } from '../sudoku/collection-downloads'
import { useOnlineStatus } from './useOnlineStatus'

export function CompletedPuzzle({ game, games, preferredDifficulty, ratingPending, shortcutEnabled, showGuides, cellReferenceStyle, onChooseDifficulty, onChooseVariant }: {
  game: Game
  games: Game[]
  preferredDifficulty: DifficultyPreference
  ratingPending: boolean
  shortcutEnabled: boolean
  showGuides: boolean
  cellReferenceStyle?: CellReferenceStyle
  onChooseDifficulty: () => void
  onChooseVariant: () => void
}) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended, results } = usePlayerRating()
  const heading = useRef<HTMLHeadingElement>(null)
  const [collectionError, setCollectionError] = useState('')
  const [loadingNext, setLoadingNext] = useState(false)
  const nextRequest = useRef<AbortController | null>(null)
  const online = useOnlineStatus()
  useEffect(() => () => nextRequest.current?.abort(), [game.id])
  useSyncExternalStore(collectionDownloads.subscribe, collectionDownloads.getSnapshot, collectionDownloads.getServerSnapshot)
  const collectionEntry = getGameCollection(game)
  const inCollection = Boolean(collectionEntry)
  const collectionDifficulty = collectionEntry?.puzzle.difficulty
  const collectionNext = collectionEntry && collectionDifficulty
    ? nextCollectionPuzzle(collectionEntry.collection, games, collectionDifficulty, collectionEntry.puzzle.id,
      online ? undefined : new Set(Object.keys(collectionDownloads.grids(collectionEntry.collection, games)))) : undefined
  const progress = collectionEntry && collectionDifficulty
    ? collectionProgress(collectionEntry.collection, games, collectionDifficulty) : undefined
  const recipe = generationVariant(game.variant)
  const needsChoice = !inCollection && Boolean(game.variant && !recipe)
  const nextDifficulty = variantDifficulty(recipe, preferredDifficulty)
  const nextLabel = needsChoice ? 'Choose another puzzle' : nextDifficulty === 'auto'
    ? `Next ${variantDifficultyLabel(recipe, 'auto', recommended)}` : `Next ${DIFFICULTY_LABELS[nextDifficulty].toLowerCase()} puzzle`
  const result = results.get(game.id)
  const ratingChange = result && Math.round(result.after) - Math.round(result.before)
  const difficultyLabel = game.difficulty ? DIFFICULTY_LABELS[game.difficulty] : 'Unrated'
  const ratingLabel = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : difficultyLabel
  const solved = games.filter(isSolved)
  const bestTime = solved.reduce((best, puzzle) =>
    !puzzle.timeUntracked && puzzle.difficulty === game.difficulty && puzzle.variant?.id === game.variant?.id
      ? Math.min(best, puzzle.elapsed) : best, Infinity)
  const canGenerate = !busy && !ratingPending
  const canPlayNext = collectionEntry ? Boolean(collectionNext) && !ratingPending && !loadingNext : canGenerate
  const playNext = useCallback(() => {
    if (!canPlayNext) return
    if (needsChoice) {
      onChooseVariant()
      return
    }
    if (inCollection) {
      if (nextRequest.current) return
      const request = new AbortController()
      nextRequest.current = request
      setCollectionError('')
      setLoadingNext(true)
      void openNextCollectionPuzzle(game.id, { online, signal: request.signal }).catch(reason => {
        if (!request.signal.aborted) setCollectionError(reason instanceof Error ? reason.message : 'The next puzzle could not be opened.')
      }).finally(() => {
        nextRequest.current = null
        setLoadingNext(false)
      })
    } else void generate(preferredDifficulty, undefined, recipe)
  }, [canPlayNext, inCollection, needsChoice, game.id, recipe, generate, onChooseVariant, online, preferredDifficulty])

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!shortcutEnabled || !canPlayNext) return
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || !shortcutMatches(event, shortcuts, 'nextPuzzle')) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, dialog'))) return
      event.preventDefault()
      playNext()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canPlayNext, playNext, shortcutEnabled, shortcuts])

  return (
    <section className={`board-frame completion-frame ${showGuides ? '' : 'guides-hidden'}`}
      aria-labelledby="completion-title">
      <div className="completion completion-results">
        <div className="completion-summary" role="region" aria-label="Solve details" tabIndex={0}>
          <header className="completion-heading">
            <span className="completion-icon" aria-hidden="true"><CircleCheck size={29} /></span>
            <h1 id="completion-title" ref={heading} tabIndex={-1}>Puzzle solved</h1>
            <p>{game.title}</p>
          </header>
          <dl className="completion-result">
            {!game.timeUntracked && <div><dt>Solve time</dt><dd>{formatTime(game.elapsed)}</dd></div>}
            <div>
              <dt>Difficulty</dt>
              <dd>
                {ratingPending ? <span role="status">Rating…</span> : ratingLabel}
                {game.generatedWithAuto && <small className="completion-mode">Auto</small>}
              </dd>
            </div>
          </dl>
          {result?.event.finish === 'solved' && ratingChange !== undefined ? <div className="completion-player-rating">
            <strong>Player rating {Math.round(result.after)} ({ratingChange >= 0 ? '+' : '−'}{Math.abs(ratingChange)})</strong>
            {result.speedBonus >= 0.05 && <small>Speed bonus +{Number(result.speedBonus.toFixed(1))}</small>}
            {result.fixedCalibration && <small>Auto will use {DIFFICULTY_LABELS[result.recommended]} when you choose it.</small>}
          </div> : null}
          <dl className="completion-stats">
            <div><dt>Puzzles solved</dt><dd>{solved.length}</dd></div>
            {!game.timeUntracked && game.difficulty && Number.isFinite(bestTime) &&
              <div><dt>Best {difficultyLabel.toLowerCase()} time</dt><dd>{formatTime(bestTime)}</dd></div>}
          </dl>
          <ActionHistoryPanel entries={game.actionHistory} cellReferenceStyle={cellReferenceStyle} difficulty={game.difficulty} />
        </div>
        <div className="completion-footer">
          {collectionEntry && progress && collectionDifficulty && <p className="completion-collection-progress">
            {collectionEntry.collection.title} · {DIFFICULTY_LABELS[collectionDifficulty]}<br />
            {progress.solved} {progress.solved === 1 ? 'puzzle' : 'puzzles'} solved
          </p>}
          {(collectionError || error) && <p className="form-error" role="alert">{collectionError || error}</p>}
          <div className="completion-actions">
            {collectionEntry && !collectionNext ? progress && progress.unplayed === 0 && progress['in-progress'] === 0
              ? <p className="completion-collection-complete" role="status">You solved all the puzzles at this difficulty.</p>
              : <p className="completion-collection-complete" role="status">Go online to play more puzzles at this difficulty.</p>
              : <button className="button primary completion-next" aria-keyshortcuts={shortcutLabel(shortcuts.nextPuzzle)} disabled={!canPlayNext}
              onClick={playNext}>
              {loadingNext ? 'Loading puzzle…' : collectionEntry ? 'Next puzzle in collection' : busy ? 'Generating…' : nextLabel}
              {!busy && !loadingNext && <ArrowRight size={18} aria-hidden="true" />}
            </button>}
            {collectionEntry ? <>
              <Link className="button secondary" to="/puzzles/collections" search={{ collection: collectionEntry.collection.id }}>Change collection difficulty</Link>
              <Link className="button secondary" to="/puzzles">Choose a different puzzle</Link>
            </> : !needsChoice && <>
              <button className="button secondary" onClick={onChooseDifficulty}>Choose difficulty</button>
              <button className="button secondary" aria-haspopup="dialog" disabled={busy} onClick={onChooseVariant}>Choose variant</button>
            </>}
          </div>
        </div>
      </div>
    </section>
  )
}

export function PuzzleDifficulty({ value, showGuides, variant, onChange, onBack }: {
  value: DifficultyPreference
  variant?: VariantId
  showGuides: boolean
  onChange: (difficulty: DifficultyPreference) => void
  onBack: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const heading = useRef<HTMLHeadingElement>(null)
  const [selection, setSelection] = useState<DifficultyPreference>(value)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])

  async function selectDifficulty(difficulty: DifficultyPreference) {
    if (busy) return
    await generate(difficulty, () => onChange(difficulty), variant)
  }

  return (
    <section className={`board-frame completion-frame ${showGuides ? '' : 'guides-hidden'}`}
      aria-labelledby="difficulty-title">
      <div className="completion difficulty-choice">
        <header className="difficulty-heading">
          <button className="icon-button borderless difficulty-back" onClick={onBack} disabled={busy} aria-label="Back to results">
            <ArrowLeft size={19} />
          </button>
          <div>
            <h1 id="difficulty-title" ref={heading} tabIndex={-1}>Choose difficulty</h1>
            <p>For the next generated puzzle</p>
          </div>
        </header>
        {error && <p className="form-error" role="alert">{error}</p>}
        <DifficultySelector value={selection} recommended={recommended} variant={variant} disabled={busy} onChange={setSelection} />
        <button type="button" className="button primary puzzle-start-button" disabled={busy} onClick={() => { void selectDifficulty(selection) }}>
          {busy ? 'Generating…' : 'Start puzzle'} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
