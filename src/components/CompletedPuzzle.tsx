import { Button, buttonClassName } from './Button'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, CircleHelp, Lightbulb, Search } from 'lucide-react'
import { DIFFICULTY_LABELS, difficultyIndex, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { pointsPerSecondForSolve } from '../sudoku/difficulty-statistics'
import { EMPTY, formatTime, isSolved, type Game } from '../sudoku/game'
import { cellReference, techniqueLabel, type CellReferenceStyle } from '../sudoku/hints'
import { practiceTechniqueResult } from '../sudoku/action-history'
import { inProgress } from '../sudoku/puzzle-activity'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { gameGenerationVariant, gameVariantId, isSizedPuzzleId, miniDifficulty, sizedGridName } from '../sudoku/new-puzzle'
import { variantDifficulty, variantName } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { ActionHistoryPanel } from './ActionHistoryPanel'
import { collectionProgress, findCollectionGame, getGameCollection, nextCollectionPuzzle } from '../sudoku/collections'
import { openNextCollectionPuzzle } from '../sudoku/collection-play'
import { collectionDownloads } from '../sudoku/collection-downloads'
import { useOnlineStatus } from './useOnlineStatus'
import { puzzleGenerationRuleset } from '../sudoku/variant-rulesets'
import { PuzzleCompletionView, type CompletionFact } from './PuzzleCompletionView'
import { isJigsawGrid } from '../sudoku/grid'

function activePuzzleSummary(game: Game) {
  const rating = game.difficulty && formatPuzzleRating(game.difficulty, game.score)
  const name = game.grid && !game.algebraic ? sizedGridName(game.grid)
    : game.source === 'generated' && rating ? game.variant && variantName(game.variant) : game.title
  const progress = !game.started ? 'Not started' : game.timeUntracked ? 'In progress' : `${formatTime(game.elapsed)} played`
  return [name, rating, progress].filter(Boolean).join(' · ')
}

function formatRateChange(before: number, after: number) {
  const change = Number(after.toFixed(2)) - Number(before.toFixed(2))
  if (change === 0) return 'No change'
  return `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}`
}

function PracticeTechniqueResult({ technique, game, cellReferenceStyle }: {
  technique: string; game: Game; cellReferenceStyle: CellReferenceStyle
}) {
  const outcome = practiceTechniqueResult(technique, game.actionHistory)
  const name = techniqueLabel(technique)
  const labels = {
    found: { title: `${name} found`, Icon: Check },
    hint: { title: `${name} hint used`, Icon: Lightbulb },
    checking: { title: `Checking for ${name}…`, Icon: Search },
    unconfirmed: { title: `${name} unconfirmed`, Icon: CircleHelp },
  }
  const { title, Icon } = labels[outcome.status]
  let detail = outcome.status === 'checking' ? 'Matching your recorded moves.' : 'Review your moves in Action history.'
  if (outcome.action) {
    const { action } = outcome
    const candidate = 'place' in action ? action.place : action.eliminate
    const cell = cellReference(candidate.cell, cellReferenceStyle, game.difficulty ?? undefined)
    if ('place' in action) detail = outcome.status === 'hint'
      ? `You applied the hint to place ${candidate.digit} in ${cell}.`
      : `You placed ${candidate.digit} in ${cell}.`
    else detail = outcome.status === 'hint'
      ? `You applied the hint to remove ${candidate.digit} from ${cell}.`
      : `You removed ${candidate.digit} from ${cell}.`
  }

  return <div className="completion-practice" data-outcome={outcome.status} role="status" aria-atomic="true">
    <span className="completion-practice-icon"><Icon size={18} aria-hidden="true" /></span>
    <div><strong>{title}</strong><p>{detail}</p></div>
  </div>
}

/** Show solve results and continue a practice playlist, a collection, or ordinary Play. */
export function CompletedPuzzle({ game, games, catchUpPuzzle, preferredDifficulty, ratingPending, shortcutEnabled, showGuides,
  cellReferenceStyle, actionsTarget, onResumePuzzle, onChooseDifficulty, onChooseVariant }: {
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
  const { busy, error, generate, generatePractice, cancelGeneration } = usePuzzleGeneration()
  const { recommended, results } = usePlayerRating()
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
  const recipe = gameGenerationVariant(game)
  const ruleset = puzzleGenerationRuleset(game.variant?.puzzle)
  const boxRows = game.grid && !isJigsawGrid(game.grid) && 'boxRows' in game.grid && (game.grid.size === 6 || game.grid.size === 8)
    ? game.grid.boxRows : undefined
  const needsChoice = !inCollection && !recipe && !game.customMode
  const nextCollectionAttempt = collectionNext && findCollectionGame(collectionNext, games)
  const nextActive = catchUpPuzzle ?? inProgress(games).find(puzzle =>
    puzzle.id !== game.id && puzzle.id !== nextCollectionAttempt?.id && puzzle.source !== 'draft')
  const resumeFirst = Boolean(nextActive && inCollection && !collectionNext)
  const pairedActions = Boolean(nextActive && !inCollection)
  const sizedRecipe = isSizedPuzzleId(recipe)
  const difficultyPreference = game.difficulty ?? preferredDifficulty
  const nextDifficulty = game.customMode && game.generatedWithAuto ? 'auto'
    : sizedRecipe ? miniDifficulty(difficultyPreference) : variantDifficulty(recipe, difficultyPreference)
  const nextGrade = nextDifficulty === 'auto' ? variantDifficulty(sizedRecipe ? undefined : recipe, recommended) : nextDifficulty
  const nextLabel = game.practiceTechnique ? 'Next practice puzzle'
    : needsChoice ? 'Choose another puzzle' : `Next ${DIFFICULTY_LABELS[nextGrade].toLowerCase()} puzzle`
  const result = results.get(game.id)
  const ratingChange = result && Math.round(result.after) - Math.round(result.before)
  const difficultyLabel = game.difficulty ? DIFFICULTY_LABELS[game.difficulty] : 'Unrated'
  const ratingLabel = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : difficultyLabel
  const solved = games.filter(isSolved)
  const bestTime = solved.reduce((best, puzzle) =>
    !puzzle.timeUntracked && puzzle.difficulty === game.difficulty && gameVariantId(puzzle) === gameVariantId(game)
      ? Math.min(best, puzzle.elapsed) : best, Infinity)
  const canGenerate = !busy && !ratingPending
  const canPlayNext = collectionEntry ? Boolean(collectionNext) && !ratingPending && !loadingNext : canGenerate
  const playNext = useCallback(() => {
    if (!canPlayNext) return
    if (game.practiceTechnique) {
      void generatePractice(game.practiceTechnique, game)
      return
    }
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
    } else void generate(nextDifficulty, undefined, recipe, { ruleset, boxRows, customMode: game.customMode,
      miracle: game.source === 'generated' && !!game.variant && game.givens === EMPTY && difficultyIndex(nextGrade) >= difficultyIndex('hard') })
  }, [canPlayNext, inCollection, needsChoice, game, recipe, ruleset, boxRows,
    generate, generatePractice, onChooseVariant, online, nextDifficulty, nextGrade])
  const canResume = !busy && !loadingNext
  const resume = () => { if (nextActive && canResume) onResumePuzzle(nextActive.id) }
  const continuePlaying = resumeFirst ? resume : playNext
  const canContinue = resumeFirst ? canResume : canPlayNext
  const resumeAction = nextActive && (
    <Button variant={resumeFirst ? 'primary' : 'secondary'} className="completion-resume"
      aria-keyshortcuts={resumeFirst ? shortcutLabel(shortcuts.nextPuzzle) : undefined}
      disabled={!canResume} onClick={resume}>
      <span><strong>{catchUpPuzzle ? 'Catch up' : 'Play next active puzzle'}</strong><small>{activePuzzleSummary(nextActive)}</small></span>
      {!pairedActions && <ArrowRight size={18} aria-hidden="true" />}
    </Button>
  )

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
    <div className="completion-actions" data-paired-next={pairedActions || undefined}>
      {pairedActions && resumeAction}
      {collectionEntry && !collectionNext ? progress && progress.unplayed === 0 && progress['in-progress'] === 0
        ? <p className="completion-collection-complete" role="status">You solved all the puzzles at this difficulty.</p>
        : <p className="completion-collection-complete" role="status">Go online to play more puzzles at this difficulty.</p>
        : <Button variant="primary" className="completion-next" aria-keyshortcuts={shortcutLabel(shortcuts.nextPuzzle)}
          disabled={!canPlayNext} onClick={playNext}>
          {loadingNext ? 'Loading puzzle…' : collectionEntry ? 'Next puzzle in collection' : busy ? 'Generating…' : nextLabel}
          {!busy && !loadingNext && <ArrowRight size={18} aria-hidden="true" />}
        </Button>}
      {busy && game.customMode && <Button type="button" onClick={cancelGeneration}>Cancel generation</Button>}
      {inCollection && resumeAction}
      {collectionEntry ? <>
        <Link className={buttonClassName(nextActive ? 'quiet' : 'secondary')} to="/puzzles/collections" search={{ collection: collectionEntry.collection.id }}>Change collection difficulty</Link>
        <Link className={buttonClassName(nextActive ? 'quiet' : 'secondary')} to="/puzzles">Choose a different puzzle</Link>
      </> : !needsChoice && <>
        <Button disabled={busy} onClick={onChooseVariant}>Choose variant</Button>
        <Button disabled={busy} onClick={onChooseDifficulty}>Choose difficulty</Button>
      </>}
    </div>
  </div>

  const solveRate = ratingPending ? null : pointsPerSecondForSolve(game, games)
  const resultFacts: CompletionFact[] = [
    ...(!game.timeUntracked ? [{ label: 'Solve time', value: formatTime(game.elapsed) }] : []),
    { label: 'Difficulty', value: <>
      {ratingPending ? <span role="status">Rating…</span> : ratingLabel}
      {game.generatedWithAuto && <small>Auto</small>}
    </> },
  ]
  if (solveRate) {
    resultFacts.push(
      { label: 'Points per second', value: solveRate.puzzle.toFixed(2) },
      { label: 'Overall points per second', value: <>
        {solveRate.after.toFixed(2)}
        {solveRate.before !== null && <small>{formatRateChange(solveRate.before, solveRate.after)}</small>}
      </> },
    )
  }
  const rating = result?.event.finish === 'solved' && ratingChange !== undefined ? <div className="completion-player-rating">
    <strong>Player rating {Math.round(result.after)} ({ratingChange >= 0 ? '+' : '−'}{Math.abs(ratingChange)})</strong>
    {result.speedBonus >= 0.05 && <small>Speed bonus +{Number(result.speedBonus.toFixed(1))}</small>}
    {result.fixedCalibration && <small>Auto will use {DIFFICULTY_LABELS[result.recommended]} when you choose it.</small>}
  </div> : undefined
  const stats: CompletionFact[] = [
    { label: 'Puzzles solved', value: solved.length },
    ...(!game.timeUntracked && game.difficulty && Number.isFinite(bestTime)
      ? [{ label: `Best ${difficultyLabel.toLowerCase()} time`, value: formatTime(bestTime) }]
      : []),
  ]
  const practice = game.practiceTechnique && <PracticeTechniqueResult technique={game.practiceTechnique} game={game}
    cellReferenceStyle={cellReferenceStyle ?? 'concise'} />
  const details = <>
    <ActionHistoryPanel entries={game.actionHistory} gridSize={game.grid?.size} cellReferenceStyle={cellReferenceStyle} difficulty={game.difficulty} />
    {actionsTarget && collectionStatus}
  </>

  return <PuzzleCompletionView subtitle={game.title} showGuides={showGuides}
    practiceMode={Boolean(game.practiceTechnique)} practice={practice} results={resultFacts} rating={rating} stats={stats} details={details}
    actions={footer} actionsTarget={actionsTarget} />
}
