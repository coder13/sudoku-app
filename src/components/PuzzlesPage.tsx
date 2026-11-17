import { DifficultyStepper } from './DifficultyStepper'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import { getRouteApi, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { BarChart3, ChevronLeft, ChevronRight, Clock3, Dices, Grid3X3, MoreHorizontal, Trophy } from 'lucide-react'
import {
  DIFFICULTY_LABELS, formatPuzzleRating, type DifficultyPreference,
} from '../sudoku/difficulty'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { MIN_TECHNIQUE_PUZZLES } from '../sudoku/technique-progress'
import { VARIANTS, variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { StopPlaying } from './PuzzleDialogs'
import { useMobileLayout } from './mobile-layout'
import { MobileNewPuzzle, type MobileNewPuzzleScreen } from './MobileNewPuzzle'
import { VariantSelector } from './VariantSelector'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'

type Section = 'puzzles' | 'new' | 'statistics'
type SectionItem = { id: Section; label: string; description: string; icon: ComponentType<{ size?: number }> }

const sections: SectionItem[] = [
  { id: 'puzzles', label: 'Your puzzles', description: 'Continue or switch puzzles', icon: Grid3X3 },
  { id: 'new', label: 'New puzzle', description: 'Choose a variant and difficulty', icon: Dices },
  { id: 'statistics', label: 'Statistics', description: 'Review your solving history', icon: BarChart3 },
]
const sectionRoutes: Record<Section, '/puzzles/browse' | '/puzzles/new' | '/puzzles/statistics'> = {
  puzzles: '/puzzles/browse',
  new: '/puzzles/new',
  statistics: '/puzzles/statistics',
}
const newPuzzleRoute = getRouteApi('/puzzles/new')
const newPuzzleTitle: Record<MobileNewPuzzleScreen, string> = {
  variant: 'Choose a variant', difficulty: 'Choose difficulty', start: 'New puzzle',
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

function PuzzleLibrary({ games, active, select, manage }: {
  games: Game[]; active: string | null; select: (id: string) => void; manage: (id: string) => void
}) {
  const title = useId()
  const activePuzzles = games.filter((game) => !isSolved(game) && !game.savedForLater)
  const saved = games.filter((game) => !isSolved(game) && game.savedForLater)
  const variantOrder = Object.keys(VARIANTS) as VariantId[]
  const difficultyOrder = [...Object.keys(DIFFICULTY_LABELS), 'unrated']
  const solved = games.filter(isSolved).sort((left, right) => {
    const leftVariant = left.variant?.id ?? 'classic'
    const rightVariant = right.variant?.id ?? 'classic'
    return variantOrder.indexOf(leftVariant) - variantOrder.indexOf(rightVariant) ||
      difficultyOrder.indexOf(left.difficulty ?? 'unrated') - difficultyOrder.indexOf(right.difficulty ?? 'unrated') ||
      right.created - left.created || left.title.localeCompare(right.title)
  })
  const solvedGroups = solved.reduce<Array<{
    key: string; variant: VariantId; difficulty: Game['difficulty']; games: Game[]
  }>>((groups, game) => {
    const variant = game.variant?.id ?? 'classic'
    const key = `${variant}:${game.difficulty ?? 'unrated'}`
    const current = groups.at(-1)
    if (current?.key === key) current.games.push(game)
    else groups.push({ key, variant, difficulty: game.difficulty, games: [game] })
    return groups
  }, [])

  function list(items: Game[]) {
    return <ul className="game-list main-puzzle-list">
      {items.map((game) => {
        const manageable = game.source !== 'draft' && !isSolved(game)
        return <li key={game.id} className={manageable ? 'game-row-with-options' : undefined}>
          <button className="game-row" aria-current={game.id === active ? 'true' : undefined} onClick={() => select(game.id)}>
            <MiniGrid values={valuesOf(game)} />
            <span className="game-row-copy"><strong>{game.title}</strong><small>{puzzleStatus(game)}</small></span>
            {game.id === active ? <span className="current-dot" aria-label="Current puzzle" /> : <ChevronRight className="row-arrow" size={18} aria-hidden="true" />}
          </button>
          {manageable && <button type="button" className="icon-button borderless game-row-options" aria-haspopup="dialog"
            aria-label={`Options for ${game.title}`} onClick={() => manage(game.id)}><MoreHorizontal size={19} aria-hidden="true" /></button>}
        </li>
      })}
    </ul>
  }

  return <section className="main-menu-section" aria-labelledby={title}>
    <header><h2 id={title}>Your puzzles</h2><p>Continue an active puzzle or review a solved puzzle.</p></header>
    <section className="puzzle-library-section" aria-labelledby={`${title}-active`}>
      <h3 id={`${title}-active`}>Active puzzles</h3>
      {activePuzzles.length > 0 ? list(activePuzzles) : <p className="main-menu-empty">You don’t have any active puzzles.</p>}
    </section>
    {saved.length > 0 && <section className="puzzle-library-section saved-for-later" aria-labelledby={`${title}-saved`}>
      <h3 id={`${title}-saved`}>Saved for later</h3>
      {list(saved)}
    </section>}
    <section className="puzzle-library-section solved-puzzles" aria-labelledby={`${title}-solved`}>
      <h3 id={`${title}-solved`}>Solved puzzles</h3>
      {solvedGroups.length > 0 ? solvedGroups.map((group) => <section className="solved-puzzle-group" key={group.key}
        aria-labelledby={`${title}-${group.key}`}>
        <h4 id={`${title}-${group.key}`}>{VARIANTS[group.variant].name} · {group.difficulty ? DIFFICULTY_LABELS[group.difficulty] : 'Unrated'}</h4>
        {list(group.games)}
      </section>) : <p className="main-menu-empty">You haven’t solved any puzzles yet.</p>}
    </section>
  </section>
}

function NewPuzzleSection({ difficulty, remembered, save, done }: {
  difficulty: DifficultyPreference
  remembered: NewPuzzlePreference | null
  save: (preference: NewPuzzlePreference) => void
  done: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [variant, setVariant] = useState<VariantId>(remembered?.variant ?? 'classic')
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = variantDifficulty(variant, selection ?? remembered?.difficulty ?? difficulty)
  const autoLabel = variantDifficultyLabel(variant, 'auto', recommended)
  const group = useId()

  function start() {
    const onGenerated = () => {
      save({ variant, difficulty: selected })
      done()
    }
    void generate(selected, onGenerated, variant)
  }

  return <section className="main-menu-section" aria-labelledby={`${group}-title`}>
    <header><h2 id={`${group}-title`}>New puzzle</h2></header>
    <VariantSelector value={variant} onChange={setVariant} busy={busy} />
    <DifficultyStepper value={selected} recommended={recommended} variant={variant} disabled={busy} onChange={setSelection} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary main-start-puzzle" disabled={busy} onClick={start}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : selected === 'auto'
        ? `Start ${autoLabel}` : `Start ${DIFFICULTY_LABELS[selected].toLowerCase()} puzzle`}
    </button>
  </section>
}

function Statistics({ games }: { games: Game[] }) {
  const { rating, recommended, count } = usePlayerRating()
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
      <div><Trophy size={18} aria-hidden="true" /><dt>{count ? 'Player rating' : 'Starting rating'}</dt><dd>{Math.round(rating)}</dd></div>
      <div><Dices size={18} aria-hidden="true" /><dt>Auto difficulty</dt><dd>{DIFFICULTY_LABELS[recommended]}</dd></div>
      <div><Trophy size={18} aria-hidden="true" /><dt>Puzzles solved</dt><dd>{solved.length}</dd></div>
      <div><Grid3X3 size={18} aria-hidden="true" /><dt>In progress</dt><dd>{inProgress.length}</dd></div>
      <div><Clock3 size={18} aria-hidden="true" /><dt>Total solving time</dt><dd>{formatTime(totalTime)}</dd></div>
      <div><BarChart3 size={18} aria-hidden="true" /><dt>Saved puzzles</dt><dd>{games.filter(isPuzzleSaved).length}</dd></div>
    </dl>
    <div className="difficulty-statistics" role="table" aria-label="Statistics by difficulty">
      <div role="row" className="difficulty-statistics-heading"><span role="columnheader">Difficulty</span><span role="columnheader">Solved</span><span role="columnheader">Best time</span></div>
      {difficultyRows.map((row) => <div role="row" key={row.difficulty}><strong role="cell">{row.label}</strong><span role="cell">{row.solved}</span><span role="cell">{row.best === null ? '—' : formatTime(row.best)}</span></div>)}
    </div>
    <TechniqueStatistics />
  </section>
}

function TechniqueStatistics() {
  const progress = useSyncExternalStore(techniqueHistory.subscribe, techniqueHistory.getSnapshot, techniqueHistory.getServerSnapshot)
  const heading = useId()
  return <section className="technique-statistics" aria-labelledby={heading}>
    <h3 id={heading}>Solving techniques</h3>
    {progress.length === 0 ? <p>As you play, moves with a clear explanation will appear here.</p> : <>
      <p>Each move counts toward the simplest technique that explains it. Each puzzle counts equally toward a technique estimate.</p>
      <table aria-labelledby={heading}>
        <thead><tr><th scope="col">Technique</th><th scope="col">On your own</th><th scope="col">With hints</th><th scope="col">Estimate</th></tr></thead>
        <tbody>{progress.map(({ technique, withoutHints, withHints, puzzles, independence }) =>
          <tr key={technique}>
            <th scope="row">{techniqueLabel(technique)}</th>
            <td>{withoutHints}</td><td>{withHints}</td>
            <td>{independence === null ? `${puzzles} of ${MIN_TECHNIQUE_PUZZLES} puzzles` : `${independence}% on your own`}</td>
          </tr>)}</tbody>
      </table>
    </>}
  </section>
}

export function PuzzlesPage({ games, active, difficulty, setDifficulty, newPuzzlePreference, rememberNewPuzzle, preferencesReady, onCreatePuzzle }: {
  games: Game[]
  active: string | null
  difficulty: DifficultyPreference
  setDifficulty: (difficulty: DifficultyPreference) => void
  newPuzzlePreference: NewPuzzlePreference | null
  rememberNewPuzzle: (preference: NewPuzzlePreference) => void
  preferencesReady: boolean
  onCreatePuzzle: () => void
}) {
  const navigate = useNavigate()
  const mobile = useMobileLayout()
  const heading = useRef<HTMLHeadingElement>(null)
  const [managingId, setManagingId] = useState<string | null>(null)
  const managing = games.find((game) => game.id === managingId)
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  const section: Section | null = routeId === sectionRoutes.puzzles ? 'puzzles'
    : routeId === sectionRoutes.new ? 'new'
      : routeId === sectionRoutes.statistics ? 'statistics' : null
  const newPuzzleSearch = newPuzzleRoute.useSearch({ shouldThrow: false })
  const mobileNewPuzzle = mobile && section === 'new'
  const screen = mobileNewPuzzle && preferencesReady
    ? newPuzzleSearch?.step ?? (newPuzzlePreference ? 'start' : 'variant')
    : undefined
  const variant = newPuzzleSearch?.variant ?? newPuzzlePreference?.variant ?? 'classic'
  const backToVariant = screen === 'difficulty' && (!newPuzzlePreference || newPuzzlePreference.variant !== variant)
  const backToStart = newPuzzlePreference && (screen === 'variant' || screen === 'difficulty')

  useEffect(() => {
    if (screen) heading.current?.focus({ preventScroll: true })
  }, [screen, variant])

  function play() {
    void navigate({ to: '/' })
  }

  function selectPuzzle(id: string) {
    roomStore.select(id)
    play()
  }

  function savePuzzlePreference(preference: NewPuzzlePreference) {
    rememberNewPuzzle(preference)
    setDifficulty(preference.difficulty)
  }

  function content(current: Section) {
    if (current === 'puzzles') return <PuzzleLibrary games={games} active={active} select={selectPuzzle} manage={setManagingId} />
    if (current === 'new') return preferencesReady && <NewPuzzleSection difficulty={difficulty}
      remembered={newPuzzlePreference} save={savePuzzlePreference} done={play} />
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
      {backToVariant ? <Link to="/puzzles/new" search={{ step: 'variant' }} replace
        className="icon-button puzzles-back" aria-label="Back to variants"><ChevronLeft size={21} /></Link>
        : backToStart ? <Link to="/puzzles/new" search={{}} replace
          className="icon-button puzzles-back" aria-label="Back to New puzzle"><ChevronLeft size={21} /></Link>
          : section && <Link to="/puzzles" className="icon-button puzzles-back" aria-label="Back to Puzzles"><ChevronLeft size={21} /></Link>}
      <h1 id="puzzles-page-title" ref={heading} tabIndex={screen ? -1 : undefined}>{screen ? newPuzzleTitle[screen] : sectionItem?.label ?? 'Puzzles'}</h1>
    </header>
    {!mobileNewPuzzle && <div className="main-menu-desktop">
      <nav className="main-menu-tabs" aria-label="Puzzles sections">
        {sections.map((item) => { const Icon = item.icon; return <Link key={item.id} to={sectionRoutes[item.id]}><Icon size={18} />{item.label}</Link> })}
      </nav>
      <div className="main-menu-panel motion-screen" key={section ?? 'overview'}>{section ? content(section) : <section className="puzzles-overview"><h2>Puzzles</h2><p>Continue solving, start a new puzzle, or review your statistics.</p>{navigation}</section>}</div>
    </div>}
    {(section !== 'new' || mobileNewPuzzle) && <div className="main-menu-mobile motion-screen" key={`mobile-${screen ?? section ?? 'overview'}`}>
      {mobileNewPuzzle ? screen && <MobileNewPuzzle screen={screen} variant={variant} remembered={newPuzzlePreference}
        remember={rememberNewPuzzle} done={(preference) => { setDifficulty(preference.difficulty); play() }} onCreate={onCreatePuzzle} />
        : section ? content(section) : navigation}
    </div>}
    <Outlet />
    {section === 'puzzles' && managing && <StopPlaying game={managing} close={() => setManagingId(null)} />}
  </main>
}
