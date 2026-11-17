import { DifficultySelector } from './DifficultySelector'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, CircleCheck } from 'lucide-react'
import { DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { formatTime, isSolved, type Game } from '../sudoku/game'
import type { CellReferenceStyle } from '../sudoku/hints'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { ActionHistoryPanel } from './ActionHistoryPanel'

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
  const nextDifficulty = variantDifficulty(game.variant?.id, preferredDifficulty)
  const nextLabel = nextDifficulty === 'auto'
    ? `Next ${variantDifficultyLabel(game.variant?.id, 'auto', recommended)}` : `Next ${DIFFICULTY_LABELS[nextDifficulty].toLowerCase()} puzzle`
  const result = results.get(game.id)
  const ratingChange = result && Math.round(result.after) - Math.round(result.before)
  const difficultyLabel = game.difficulty ? DIFFICULTY_LABELS[game.difficulty] : 'Unrated'
  const ratingLabel = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : difficultyLabel
  const solved = games.filter(isSolved)
  const bestTime = solved.reduce((best, puzzle) =>
    puzzle.difficulty === game.difficulty && puzzle.variant?.id === game.variant?.id ? Math.min(best, puzzle.elapsed) : best, Infinity)
  const canGenerate = !busy && !ratingPending

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!shortcutEnabled || !canGenerate) return
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || !shortcutMatches(event, shortcuts, 'nextPuzzle')) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, dialog'))) return
      event.preventDefault()
      void generate(preferredDifficulty, undefined, game.variant?.id)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canGenerate, game.variant?.id, generate, preferredDifficulty, shortcutEnabled, shortcuts])

  return (
    <section className={`board-frame completion-frame ${showGuides ? '' : 'guides-hidden'}`}
      aria-labelledby="completion-title">
      <div className="completion">
        <header className="completion-heading">
          <span className="completion-icon" aria-hidden="true"><CircleCheck size={29} /></span>
          <h1 id="completion-title" ref={heading} tabIndex={-1}>Puzzle solved</h1>
          <p>{game.title}</p>
        </header>
        <dl className="completion-result">
          <div><dt>Solve time</dt><dd>{formatTime(game.elapsed)}</dd></div>
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
          {game.difficulty && <div><dt>Best {difficultyLabel.toLowerCase()} time</dt><dd>{formatTime(bestTime)}</dd></div>}
        </dl>
        <ActionHistoryPanel entries={game.actionHistory} cellReferenceStyle={cellReferenceStyle} difficulty={game.difficulty} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="completion-actions">
          <button className="button primary completion-next puzzle-start-button" aria-keyshortcuts={shortcutLabel(shortcuts.nextPuzzle)} disabled={!canGenerate}
            onClick={() => { void generate(preferredDifficulty, undefined, game.variant?.id) }}>
            {busy ? 'Generating…' : nextLabel}
            {!busy && <ArrowRight size={18} aria-hidden="true" />}
          </button>
          <button className="button secondary" onClick={onChooseDifficulty}>Choose difficulty</button>
          <button className="button secondary" aria-haspopup="dialog" disabled={busy} onClick={onChooseVariant}>Choose variant</button>
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
