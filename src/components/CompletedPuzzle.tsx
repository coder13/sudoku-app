import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Sparkles } from 'lucide-react'
import { DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference } from '../sudoku/difficulty'
import { formatTime, isSolved, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { techniqueHistory } from '../sudoku/technique-history'
import type { PuzzleTechniqueUse } from '../sudoku/technique-progress'
import { variantDifficulties, variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'

function techniqueUseDescription({ independent, hints }: PuzzleTechniqueUse) {
  if (independent && hints) return 'Detected in your solve and shown in hints'
  if (independent) return 'Detected in your solve'
  return 'Shown in hints'
}

export function CompletionTechniques({ techniques }: { techniques: PuzzleTechniqueUse[] | null }) {
  return <details className="completion-techniques">
    <summary>
      <span className="completion-techniques-title"><Sparkles size={16} aria-hidden="true" /><strong>Techniques used</strong></span>
      <small>{techniques === null ? 'Checking…' : techniques.length ? `${techniques.length} detected` : 'None'}</small>
      <ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="completion-techniques-panel">
      {techniques === null ? <p role="status">Checking this solve…</p>
        : techniques.length === 0 ? <p>No techniques were detected for this solve.</p>
          : <ul>{techniques.map((use) => <li key={use.technique}>
            <strong>{techniqueLabel(use.technique)}</strong>
            <small>{techniqueUseDescription(use)}</small>
          </li>)}</ul>}
    </div>
  </details>
}

export function CompletedPuzzle({ game, games, preferredDifficulty, ratingPending, shortcutEnabled, showGuides, onChooseDifficulty, onChooseVariant }: {
  game: Game
  games: Game[]
  preferredDifficulty: DifficultyPreference
  ratingPending: boolean
  shortcutEnabled: boolean
  showGuides: boolean
  onChooseDifficulty: () => void
  onChooseVariant: () => void
}) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended, results } = usePlayerRating()
  const heading = useRef<HTMLHeadingElement>(null)
  const [techniques, setTechniques] = useState<PuzzleTechniqueUse[] | null>(null)
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
    let current = true
    setTechniques(null)
    void techniqueHistory.readPuzzle(game)
      .then((uses) => { if (current) setTechniques(uses) })
      .catch(() => { if (current) setTechniques([]) })
    return () => { current = false }
  }, [game.id])

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
        <CompletionTechniques techniques={techniques} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="completion-actions">
          <button className="button primary completion-next" aria-keyshortcuts={shortcutLabel(shortcuts.nextPuzzle)} disabled={!canGenerate}
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
  const mounted = useRef(true)
  const [pendingDifficulty, setPendingDifficulty] = useState<DifficultyPreference | null>(null)

  useEffect(() => {
    mounted.current = true
    heading.current?.focus({ preventScroll: true })
    return () => { mounted.current = false }
  }, [])

  async function selectDifficulty(difficulty: DifficultyPreference) {
    if (busy) return
    setPendingDifficulty(difficulty)
    await generate(difficulty, () => onChange(difficulty), variant)
    if (mounted.current) setPendingDifficulty(null)
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
        <div className="difficulty-options" role="radiogroup" aria-label="Next puzzle difficulty" aria-busy={busy}>
          {variantDifficulties(variant).map((difficulty) => {
            const label = variantDifficultyLabel(variant, difficulty, recommended)
            const selected = difficulty === variantDifficulty(variant, value)
            const generating = pendingDifficulty === difficulty
            return (
              <button key={difficulty} role="radio" aria-checked={selected} disabled={busy}
                onClick={() => { void selectDifficulty(difficulty) }}>
                <span>{generating ? `Generating ${label.toLowerCase()}…` : label}</span>
                {selected && !generating && <Check size={19} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
