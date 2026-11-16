import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleCheck } from 'lucide-react'
import { DIFFICULTY_LABELS, formatPuzzleRating } from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import { formatTime, isSolved, type Game } from '../sudoku/game'
import { usePuzzleGeneration } from './usePuzzleGeneration'

export function CompletedPuzzle({ game, games, preferredDifficulty, ratingPending, shortcutEnabled, showGuides, onChooseDifficulty }: {
  game: Game
  games: Game[]
  preferredDifficulty: Difficulty
  ratingPending: boolean
  shortcutEnabled: boolean
  showGuides: boolean
  onChooseDifficulty: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const heading = useRef<HTMLHeadingElement>(null)
  const nextDifficulty = preferredDifficulty
  const difficultyLabel = game.difficulty ? DIFFICULTY_LABELS[game.difficulty] : 'Unrated'
  const ratingLabel = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : difficultyLabel
  const solved = games.filter(isSolved)
  const bestTime = solved.reduce((best, puzzle) =>
    puzzle.difficulty === game.difficulty ? Math.min(best, puzzle.elapsed) : best, Infinity)
  const canGenerate = !busy && !ratingPending

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!shortcutEnabled || !canGenerate) return
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.key.toLowerCase() !== 'n' ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, dialog'))) return
      event.preventDefault()
      void generate(nextDifficulty)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canGenerate, generate, nextDifficulty, shortcutEnabled])

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
            <dd>{ratingPending ? <span role="status">Rating…</span> : ratingLabel}</dd>
          </div>
        </dl>
        <dl className="completion-stats">
          <div><dt>Puzzles solved</dt><dd>{solved.length}</dd></div>
          {game.difficulty && <div><dt>Best {difficultyLabel.toLowerCase()} time</dt><dd>{formatTime(bestTime)}</dd></div>}
        </dl>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="completion-actions">
          <button className="button secondary" onClick={onChooseDifficulty}>Choose difficulty</button>
          <button className="button primary completion-next" aria-keyshortcuts="N" disabled={!canGenerate}
            onClick={() => { void generate(nextDifficulty) }}>
            {busy ? 'Generating…' : `Next ${DIFFICULTY_LABELS[nextDifficulty].toLowerCase()} puzzle`}
            {!busy && <><ArrowRight size={18} aria-hidden="true" /><kbd aria-hidden="true">N</kbd></>}
          </button>
        </div>
      </div>
    </section>
  )
}

export function PuzzleDifficulty({ value, showGuides, onChange, onBack }: {
  value: Difficulty
  showGuides: boolean
  onChange: (difficulty: Difficulty) => void
  onBack: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null)

  useEffect(() => {
    mounted.current = true
    heading.current?.focus({ preventScroll: true })
    return () => { mounted.current = false }
  }, [])

  async function selectDifficulty(difficulty: Difficulty) {
    if (busy) return
    onChange(difficulty)
    setPendingDifficulty(difficulty)
    await generate(difficulty)
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
          {Object.entries(DIFFICULTY_LABELS).map(([difficulty, label]) => {
            const selected = difficulty === value
            const generating = pendingDifficulty === difficulty
            return (
              <button key={difficulty} role="radio" aria-checked={selected} disabled={busy}
                onClick={() => { void selectDifficulty(difficulty as Difficulty) }}>
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
