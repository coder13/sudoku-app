import { useId, type ComponentType } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { BarChart3, Check, ChevronLeft, ChevronRight, Clock3, Dices, Grid3X3, Trophy } from 'lucide-react'
import { DIFFICULTY_LABELS, DIFFICULTY_SCORE_RANGES, formatPuzzleRating } from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { usePuzzleGeneration } from './usePuzzleGeneration'

type Section = 'puzzles' | 'new' | 'statistics'
type SectionItem = { id: Section; label: string; description: string; icon: ComponentType<{ size?: number }> }

const sections: SectionItem[] = [
  { id: 'puzzles', label: 'Your puzzles', description: 'Continue or switch puzzles', icon: Grid3X3 },
  { id: 'new', label: 'New puzzle', description: 'Choose a difficulty and start', icon: Dices },
  { id: 'statistics', label: 'Statistics', description: 'Review your solving history', icon: BarChart3 },
]
const sectionRoutes: Record<Section, '/puzzles/browse' | '/puzzles/new' | '/puzzles/statistics'> = {
  puzzles: '/puzzles/browse',
  new: '/puzzles/new',
  statistics: '/puzzles/statistics',
}

function MiniGrid({ values }: { values: string }) {
  return <span className="mini-grid" aria-hidden="true">
    {[...values].map((digit, index) => <i key={index} data-filled={digit !== '0'} />)}
  </span>
}

function puzzleStatus(game: Game) {
  if (game.source === 'draft') return 'Draft puzzle'
  const rating = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : 'Unrated'
  if (isSolved(game)) return `${rating} · Solved in ${formatTime(game.elapsed)}`
  if (game.started) return `${rating} · ${formatTime(game.elapsed)}`
  return `${rating} · Not started`
}

function PuzzleLibrary({ games, active, select }: { games: Game[]; active: string | null; select: (id: string) => void }) {
  return <section className="main-menu-section" aria-labelledby="puzzle-library-title">
    <header><h2 id="puzzle-library-title">Your puzzles</h2><p>Select a puzzle to continue solving.</p></header>
    {games.length ? <ul className="game-list main-puzzle-list">
      {games.map((game) => <li key={game.id}>
        <button className="game-row" aria-current={game.id === active ? 'true' : undefined} onClick={() => select(game.id)}>
          <MiniGrid values={valuesOf(game)} />
          <span className="game-row-copy"><strong>{game.title}</strong><small>{puzzleStatus(game)}</small></span>
          {game.id === active ? <span className="current-dot" aria-label="Current puzzle" /> : <ChevronRight className="row-arrow" size={18} aria-hidden="true" />}
        </button>
      </li>)}
    </ul> : <p className="main-menu-empty">You don’t have any saved puzzles yet.</p>}
  </section>
}

function NewPuzzleSection({ difficulty, setDifficulty, done }: {
  difficulty: Difficulty
  setDifficulty: (difficulty: Difficulty) => void
  done: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const group = useId()
  return <section className="main-menu-section" aria-labelledby="puzzles-new-title">
    <header><h2 id="puzzles-new-title">New puzzle</h2><p>Choose the difficulty before starting.</p></header>
    <fieldset className="main-difficulty-options" disabled={busy}>
      <legend className="sr-only">Puzzle difficulty</legend>
      {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((value) => <label key={value}>
        <input type="radio" name={group} value={value} checked={difficulty === value}
          onChange={() => setDifficulty(value)} />
        <span>{DIFFICULTY_LABELS[value]}</span>
        <small className="main-difficulty-score">{DIFFICULTY_SCORE_RANGES[value]}</small>
        {difficulty === value && <Check size={18} aria-hidden="true" />}
      </label>)}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary main-start-puzzle" disabled={busy} onClick={() => { void generate(difficulty, done) }}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : `Start ${DIFFICULTY_LABELS[difficulty].toLowerCase()} puzzle`}
    </button>
  </section>
}

function Statistics({ games }: { games: Game[] }) {
  const solved = games.filter(isSolved)
  const inProgress = games.filter((game) => game.started && !isSolved(game) && game.source !== 'draft')
  const totalTime = games.reduce((sum, game) => sum + game.elapsed, 0)
  const difficultyRows = Object.entries(DIFFICULTY_LABELS).map(([difficulty, label]) => {
    const matching = solved.filter((game) => game.difficulty === difficulty)
    return { difficulty, label, solved: matching.length, best: matching.length ? Math.min(...matching.map((game) => game.elapsed)) : null }
  })
  return <section className="main-menu-section" aria-labelledby="statistics-title">
    <header><h2 id="statistics-title">Statistics</h2><p>Your solving history on this device.</p></header>
    <dl className="main-stat-cards">
      <div><Trophy size={18} aria-hidden="true" /><dt>Puzzles solved</dt><dd>{solved.length}</dd></div>
      <div><Grid3X3 size={18} aria-hidden="true" /><dt>In progress</dt><dd>{inProgress.length}</dd></div>
      <div><Clock3 size={18} aria-hidden="true" /><dt>Total solving time</dt><dd>{formatTime(totalTime)}</dd></div>
      <div><BarChart3 size={18} aria-hidden="true" /><dt>Saved puzzles</dt><dd>{games.filter(isPuzzleSaved).length}</dd></div>
    </dl>
    <div className="difficulty-statistics" role="table" aria-label="Statistics by difficulty">
      <div role="row" className="difficulty-statistics-heading"><span role="columnheader">Difficulty</span><span role="columnheader">Solved</span><span role="columnheader">Best time</span></div>
      {difficultyRows.map((row) => <div role="row" key={row.difficulty}><strong role="cell">{row.label}</strong><span role="cell">{row.solved}</span><span role="cell">{row.best === null ? '—' : formatTime(row.best)}</span></div>)}
    </div>
  </section>
}

export function PuzzlesPage({ games, active, difficulty, setDifficulty }: {
  games: Game[]
  active: string | null
  difficulty: Difficulty
  setDifficulty: (difficulty: Difficulty) => void
}) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const section: Section | null = pathname.endsWith('/browse') ? 'puzzles'
    : pathname.endsWith('/new') ? 'new'
      : pathname.endsWith('/statistics') ? 'statistics' : null

  function play() {
    void navigate({ to: '/' })
  }

  function selectPuzzle(id: string) {
    roomStore.select(id)
    play()
  }

  function content(current: Section) {
    if (current === 'puzzles') return <PuzzleLibrary games={games} active={active} select={selectPuzzle} />
    if (current === 'new') return <NewPuzzleSection difficulty={difficulty} setDifficulty={setDifficulty} done={play} />
    return <Statistics games={games} />
  }

  const sectionItem = section ? sections.find(({ id }) => id === section)! : null
  const navigation = <nav className="main-menu-mobile-list puzzles-section-links" aria-label="Puzzles sections">
    {sections.map((item) => { const Icon = item.icon; return <Link key={item.id} to={sectionRoutes[item.id]}>
      <span className="main-menu-icon"><Icon size={21} /></span>
      <span><strong>{item.label}</strong><small>{item.description}</small></span>
      <ChevronRight size={19} />
    </Link> })}
  </nav>

  return <main className={`puzzles-page ${section ? 'puzzles-subscreen' : ''}`}>
    <header className="puzzles-page-heading">
      {section && <Link to="/puzzles" className="icon-button puzzles-back" aria-label="Back to Puzzles"><ChevronLeft size={21} /></Link>}
      <h1>{sectionItem?.label ?? 'Puzzles'}</h1>
    </header>
    <div className="main-menu-desktop">
      <nav className="main-menu-tabs" aria-label="Puzzles sections">
        {sections.map((item) => { const Icon = item.icon; return <Link key={item.id} to={sectionRoutes[item.id]}><Icon size={18} />{item.label}</Link> })}
      </nav>
      <div className="main-menu-panel">{section ? content(section) : <section className="puzzles-overview"><h2>Puzzles</h2><p>Continue solving, start a new puzzle, or review your statistics.</p>{navigation}</section>}</div>
    </div>
    <div className="main-menu-mobile">
      {section ? content(section) : navigation}
    </div>
    <Outlet />
  </main>
}
