import { Button, buttonClassName } from './Button'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, CircleCheck } from 'lucide-react'
import { DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { formatTime, isSolved, type Game } from '../sudoku/game'
import type { CellReferenceStyle } from '../sudoku/hints'
import { inProgress } from '../sudoku/puzzle-activity'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { generationVariant, variantDifficulties, variantDifficulty, variantDifficultyLabel, variantName } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { ActionHistoryPanel } from './ActionHistoryPanel'
import { collectionProgress, findCollectionGame, getGameCollection, nextCollectionPuzzle } from '../sudoku/collections'
import { openNextCollectionPuzzle } from '../sudoku/collection-play'
import { collectionDownloads } from '../sudoku/collection-downloads'
import { useOnlineStatus } from './useOnlineStatus'

function activePuzzleSummary(game: Game) {
  const rating = game.difficulty && formatPuzzleRating(game.difficulty, game.score)
  const name = game.source === 'generated' && rating ? game.variant && variantName(game.variant) : game.title
  const progress = !game.started ? 'Not started' : game.timeUntracked ? 'In progress' : `${formatTime(game.elapsed)} played`
  return [name, rating, progress].filter(Boolean).join(' · ')
}

/** Show solve results and continue with the next active puzzle, a collection puzzle, or a new puzzle. */
export function CompletedPuzzle({ game, games, catchUpPuzzle, preferredDifficulty, ratingPending, shortcutEnabled, showGuides, cellReferenceStyle, actionsTarget, onResumePuzzle, onChooseDifficulty, onChooseVariant }: {
  game: Game
  games: Game[]
  catchUpPuzzle?: Game
  preferredDifficulty: DifficultyPreference
  ratingPending: boolean
  shortcutEnabled: boolean
  showGuides: boolean
  cellReferenceStyle?: CellReferenceStyle
  actionsTarget?: HTMLElement | null
  onResumePuzzle: (id: string) => void
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
  const nextCollectionAttempt = collectionNext && findCollectionGame(collectionNext, games)
  const nextActive = catchUpPuzzle ?? inProgress(games).find(puzzle =>
    puzzle.id !== game.id && puzzle.id !== nextCollectionAttempt?.id && puzzle.source !== 'draft')
  const resumeFirst = Boolean(nextActive && (!inCollection || !collectionNext))
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
  const canResume = !busy && !loadingNext
  const resume = () => { if (nextActive && canResume) onResumePuzzle(nextActive.id) }
  const continuePlaying = resumeFirst ? resume : playNext
  const canContinue = resumeFirst ? canResume : canPlayNext
  const resumeAction = nextActive && (
    <Button variant={resumeFirst ? 'primary' : 'secondary'} className="completion-resume"
      aria-keyshortcuts={resumeFirst ? shortcutLabel(shortcuts.nextPuzzle) : undefined}
      disabled={!canResume} onClick={resume}>
      <span><strong>{catchUpPuzzle ? 'Catch up' : 'Play next active puzzle'}</strong><small>{activePuzzleSummary(nextActive)}</small></span>
      <ArrowRight size={18} aria-hidden="true" />
    </Button>
  )

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!shortcutEnabled || !canContinue) return
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || !shortcutMatches(event, shortcuts, 'nextPuzzle')) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, dialog'))) return
      event.preventDefault()
      continuePlaying()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canContinue, continuePlaying, shortcutEnabled, shortcuts])

  const collectionStatus = collectionEntry && progress && collectionDifficulty && <p className="completion-collection-progress">
    {collectionEntry.collection.title} · {DIFFICULTY_LABELS[collectionDifficulty]}<br />
    {progress.solved} {progress.solved === 1 ? 'puzzle' : 'puzzles'} solved
  </p>
  const footer = <div className="completion-footer">
    {!actionsTarget && collectionStatus}
    {(collectionError || error) && <p className="form-error" role="alert">{collectionError || error}</p>}
    <div className="completion-actions">
      {!inCollection && nextActive ? <>
        {resumeAction}
        <Button className="completion-next" disabled={busy} onClick={onChooseVariant}>New puzzle</Button>
      </> : <>
        {collectionEntry && !collectionNext ? progress && progress.unplayed === 0 && progress['in-progress'] === 0
          ? <p className="completion-collection-complete" role="status">You solved all the puzzles at this difficulty.</p>
          : <p className="completion-collection-complete" role="status">Go online to play more puzzles at this difficulty.</p>
          : <Button variant="primary" className="completion-next" aria-keyshortcuts={shortcutLabel(shortcuts.nextPuzzle)}
            disabled={!canPlayNext} onClick={playNext}>
            {loadingNext ? 'Loading puzzle…' : collectionEntry ? 'Next puzzle in collection' : busy ? 'Generating…' : nextLabel}
            {!busy && !loadingNext && <ArrowRight size={18} aria-hidden="true" />}
          </Button>}
        {resumeAction}
        {collectionEntry ? <>
          <Link className={buttonClassName(nextActive ? 'quiet' : 'secondary')} to="/puzzles/collections" search={{ collection: collectionEntry.collection.id }}>Change collection difficulty</Link>
          <Link className={buttonClassName(nextActive ? 'quiet' : 'secondary')} to="/puzzles">Choose a different puzzle</Link>
        </> : !needsChoice && <>
          <Button disabled={busy} onClick={onChooseDifficulty}>Choose difficulty</Button>
          <Button disabled={busy} onClick={onChooseVariant}>Choose variant</Button>
        </>}
      </>}
    </div>
  </div>

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
          {actionsTarget && collectionStatus}
        </div>
        {actionsTarget ? createPortal(footer, actionsTarget) : footer}
      </div>
    </section>
  )
}
