import { Button, IconButton, buttonClassName, iconButtonClassName } from './Button'
import { DifficultySelector } from './DifficultySelector'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getRouteApi, Link, useCanGoBack, useLocation, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ArrowRight, BarChart3, BookOpen, CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, Dices, FileUp, Grid3X3, MoreHorizontal, PencilLine, Trophy } from 'lucide-react'
import {
  DIFFICULTY_LABELS, formatPuzzleRating, isDifficulty, statisticsDifficulties, type DifficultyPreference,
} from '../sudoku/difficulty'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { inProgress, matchesSolvedFilters, solvedHistory, type SolvedPuzzleFilters } from '../sudoku/puzzle-activity'
import { techniqueLabel } from '../sudoku/hints'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { techniqueHistory } from '../sudoku/technique-history'
import { MIN_TECHNIQUE_PUZZLES } from '../sudoku/technique-progress'
import { gameVariantId, isGameVariantId, miniDifficulty, MINI_NAME, MINI_RULE, newPuzzleVariants, type NewPuzzleId } from '../sudoku/new-puzzle'
import { VARIANTS, PUZZLE_VARIANTS, variantDifficulty, variantDifficultyLabel } from '../sudoku/variants'
import { ManagePuzzle } from './PuzzleDialogs'
import { VariantPreview } from './VariantPreview'
import { VariantRulesetSelector } from './VariantRulesetSelector'
import { generationRuleset, type GenerationRulesetId } from '../sudoku/variant-rulesets'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { PuzzleCollections } from './PuzzleCollections'
import { SelectControl } from './SelectControl'
import { collectionDifficulties, getCollectionPuzzle, getCollection } from '../sudoku/collections'

const sections = {
  puzzles: { to: '/puzzles/browse', label: 'Active Puzzles', icon: Grid3X3 },
  new: { to: '/puzzles/new', label: 'New puzzle', icon: Dices },
  solved: { to: '/puzzles/solved', label: 'Solved puzzles', icon: Trophy },
  collections: { to: '/puzzles/collections', label: 'Collections', icon: BookOpen },
  statistics: { to: '/puzzles/statistics', label: 'Statistics', icon: BarChart3 },
} as const
type Section = keyof typeof sections
const newPuzzleRoute = getRouteApi('/puzzles/new')
const collectionRoute = getRouteApi('/puzzles/collections')
const solvedRoute = getRouteApi('/puzzles/solved')

declare module '@tanstack/history' {
  interface HistoryState {
    fromPuzzleVariantPicker?: boolean
  }
}

function MiniGrid({ values, size }: { values: string; size?: number }) {
  return <span className="mini-grid" data-size={size} aria-hidden="true">
    {[...values].map((digit, index) => <i key={index} data-filled={digit !== '0'} />)}
  </span>
}

function puzzleStatus(game: Game) {
  if (game.source === 'draft') return 'Draft puzzle'
  if (isSolved(game)) return game.timeUntracked ? 'Solved' : `Solved in ${formatTime(game.elapsed)}`
  if (game.started) return game.timeUntracked ? 'In progress' : formatTime(game.elapsed)
  return 'Not started'
}

function PuzzleRows({ puzzles, active, manage }: {
  puzzles: readonly Game[]; active: string | null; manage?: (id: string) => void
}) {
  const List = manage ? 'ul' : 'ol'
  return <List className="game-list main-puzzle-list" role="list">
      {puzzles.map(game => {
        const manageable = manage && game.source !== 'draft'
        const rating = game.difficulty && formatPuzzleRating(game.difficulty, game.score)
        const useRatingTitle = manageable && game.source === 'generated' && /\bPuzzle \d+$/.test(game.title)
        const name = useRatingTitle ? rating || 'Unrated' : game.title
        const variant = gameVariantId(game)
        const variantLabel = variant === 'mini' ? MINI_NAME : variant === 'mixed' ? 'Mixed rules' : PUZZLE_VARIANTS[variant].name
        const detail = (manage
          ? [useRatingTitle && variant !== 'classic' && variantLabel, !useRatingTitle && rating, puzzleStatus(game)]
          : [variantLabel, rating || 'Unrated', !game.timeUntracked && formatTime(game.elapsed)]).filter(Boolean).join(' · ')
        return <li key={game.id} className={manageable ? 'game-row-with-options' : undefined}>
          <Link className="game-row" aria-current={game.id === active ? 'true' : undefined} to="/" search={{ puzzle: game.id }}>
            <MiniGrid values={valuesOf(game)} size={game.grid?.size} />
            <span className="game-row-copy"><strong>{name}</strong><small>{detail}</small></span>
            {game.id === active ? <span className="current-dot" aria-label="Current puzzle" /> : <ChevronRight className="row-arrow" size={18} aria-hidden="true" />}
          </Link>
          {manageable && manage && <IconButton type="button" variant="quiet" className="game-row-options" aria-haspopup="dialog"
            aria-label={`Options for ${name}`} onClick={() => manage(game.id)}><MoreHorizontal size={19} aria-hidden="true" /></IconButton>}
        </li>
      })}
  </List>
}

function SolvedPuzzleLibrary({ games, active, loading }: { games: Game[]; active: string | null; loading: boolean }) {
  const id = useId()
  const dateToggle = useRef<HTMLButtonElement>(null)
  const [datesOpen, setDatesOpen] = useState(false)
  const filters = solvedRoute.useSearch()
  const navigate = solvedRoute.useNavigate()
  const history = useMemo(() => solvedHistory(games), [games])
  const filtered = history.filter(puzzle => matchesSolvedFilters(puzzle, filters))
  const dateActive = Boolean(filters.from || filters.to)
  const dateLabel = dateActive ? 'Date range (active)' : 'Date range'
  const invalidRange = Boolean(filters.from && filters.to && filters.to < filters.from)

  function setFilters(search: SolvedPuzzleFilters) {
    void navigate({ search, replace: true, resetScroll: false, viewTransition: false })
  }

  return <div className="main-menu-section puzzle-library solved-puzzles">
    <div className="solved-filter-bar" role="group" aria-label="Solved puzzle filters">
      <SelectControl aria-label="Variant" value={filters.variant ?? ''} onChange={({ currentTarget: { value } }) => {
        setFilters({ ...filters, variant: isGameVariantId(value) ? value : undefined })
      }}>
        <option value="">{filters.variant ? 'All variants' : 'Variant'}</option>
        {Object.entries(PUZZLE_VARIANTS).map(([id, variant]) => <option key={id} value={id}>{variant.name}</option>)}
        <option value="mini">{MINI_NAME}</option>
        <option value="mixed">Mixed rules</option>
      </SelectControl>
      <SelectControl aria-label="Difficulty" value={filters.difficulty ?? ''} onChange={({ currentTarget: { value } }) => {
        setFilters({ ...filters, difficulty: isDifficulty(value) || value === 'unrated' ? value : undefined })
      }}>
        <option value="">{filters.difficulty ? 'All difficulties' : 'Difficulty'}</option>
        {Object.entries(DIFFICULTY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        <option value="unrated">Unrated</option>
      </SelectControl>
      <IconButton ref={dateToggle} className="solved-date-toggle" aria-label={dateLabel} title={dateLabel}
        aria-controls={id} aria-expanded={datesOpen} data-active={dateActive || undefined} onClick={() => setDatesOpen(open => !open)}>
        <CalendarRange size={19} aria-hidden="true" />
      </IconButton>
    </div>
    <fieldset id={id} className="solved-date-fields" hidden={!datesOpen}>
      <legend className="sr-only">Date range</legend>
      <label>From<input type="date" value={filters.from ?? ''} max={filters.to}
        onChange={({ currentTarget: { value } }) => setFilters({ ...filters, from: value || undefined })} /></label>
      <label>To<input type="date" value={filters.to ?? ''} min={filters.from} aria-invalid={invalidRange || undefined}
        aria-describedby={invalidRange ? `${id}-dates` : undefined}
        onChange={({ currentTarget: { value } }) => setFilters({ ...filters, to: value || undefined })} /></label>
      {dateActive && <Button variant="quiet" className="solved-date-clear" onClick={() => {
        setFilters({ ...filters, from: undefined, to: undefined })
        setDatesOpen(false)
        dateToggle.current?.focus()
      }}>Clear dates</Button>}
    </fieldset>
    {invalidRange ? <p className="main-menu-empty" role="status" id={`${id}-dates`}>Choose an end date on or after the start date.</p>
      : filtered.length > 0 ? <PuzzleRows puzzles={filtered.map(({ game }) => game)} active={active} />
        : loading ? <p className="main-menu-empty" role="status">Loading puzzles…</p>
          : <p className="main-menu-empty" role="status">{history.length ? 'No solved puzzles match these filters.' : 'No solved puzzles yet.'}</p>}
  </div>
}

function PuzzleLibrary({ games, active, manage, loading }: {
  games: Game[]; active: string | null; manage: (id: string) => void; loading: boolean
}) {
  const title = useId()

  const activePuzzles = inProgress(games)
  const saved = games.filter((game) => !isSolved(game) && (game.savedForLater || game.archived))
  return <div className="main-menu-section puzzle-library">
    {activePuzzles.length > 0 ? <section className="puzzle-library-section" aria-labelledby={`${title}-active`}>
      <h2 id={`${title}-active`}>Active Puzzles</h2>
      <PuzzleRows puzzles={activePuzzles} active={active} manage={manage} />
    </section> : loading ? <p className="main-menu-empty" role="status">Loading puzzles…</p>
      : <Link className={buttonClassName('primary', 'puzzle-empty-action')} to="/puzzles/new">
        <Dices size={18} aria-hidden="true" />Start a new puzzle
      </Link>}
    {saved.length > 0 && <section className="puzzle-library-section saved-for-later" aria-labelledby={`${title}-saved`}>
      <h2 id={`${title}-saved`}>Saved for later</h2>
      <PuzzleRows puzzles={saved} active={active} manage={manage} />
    </section>}
  </div>
}

function NewPuzzleVariant({ variant, ruleset, onCreate }: {
  variant: NewPuzzleId
  ruleset?: GenerationRulesetId
  onCreate: (variant: NewPuzzleId) => void
}) {
  const navigate = useNavigate()
  const index = newPuzzleVariants.indexOf(variant)
  const { name, rule } = variant === 'mini' ? { name: MINI_NAME, rule: MINI_RULE } : VARIANTS[variant]

  function browse(direction: number) {
    const count = newPuzzleVariants.length
    const next = newPuzzleVariants[(index + direction + count) % count]
    void navigate({ to: '/puzzles/new', search: { variant: next }, replace: true, resetScroll: false, viewTransition: false })
  }

  return <section className="main-menu-section new-puzzle-step" aria-labelledby="puzzles-page-title">
    <div className="new-puzzle-variant-picker" onKeyDown={(event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      browse(event.key === 'ArrowLeft' ? -1 : 1)
    }}>
      <IconButton aria-label="Previous variant" onClick={() => browse(-1)}>
        <ChevronLeft size={22} aria-hidden="true" />
      </IconButton>
      <div className="new-puzzle-variant-preview"><VariantPreview variant={variant} ruleset={ruleset} /></div>
      <IconButton aria-label="Next variant" onClick={() => browse(1)}>
        <ChevronRight size={22} aria-hidden="true" />
      </IconButton>
      <div className="new-puzzle-variant-copy" aria-live="polite" aria-atomic="true">
        <div><h2>{name}</h2><small>{index + 1} of {newPuzzleVariants.length}</small></div>
        <p>{rule}</p>
      </div>
    </div>
    {variant !== 'mini' && <VariantRulesetSelector variant={variant} value={ruleset} onChange={next => {
      void navigate({ to: '/puzzles/new', search: { variant, ruleset: next }, replace: true, resetScroll: false })
    }} />}
    <Link to="/puzzles/new/difficulty" search={{ variant, ruleset }} state={{ fromPuzzleVariantPicker: true }}
      className={buttonClassName('primary')}>Continue <ArrowRight size={18} aria-hidden="true" /></Link>
    <Link to="/puzzles/games" state={{ fromSudokuVariant: true }} className={buttonClassName('quiet')}>
      Change game type
    </Link>
    <div className="new-puzzle-actions">
      <Button onClick={() => onCreate(variant)}><PencilLine size={18} aria-hidden="true" />Create puzzle</Button>
      <Link className={buttonClassName()} to="/import"><FileUp size={18} aria-hidden="true" />Import puzzle</Link>
    </div>
  </section>
}

function NewPuzzleDifficulty({ variant, ruleset, difficulty, save }: {
  variant: NewPuzzleId
  ruleset?: GenerationRulesetId
  difficulty: DifficultyPreference
  save: (preference: NewPuzzlePreference) => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const navigate = useNavigate()
  const preset = variant === 'mini' ? undefined : generationRuleset(variant, ruleset)
  const { recommended } = usePlayerRating()
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = variant === 'mini' ? miniDifficulty(selection ?? difficulty) : variantDifficulty(variant, selection ?? difficulty)
  const autoLabel = variantDifficultyLabel(variant === 'mini' ? undefined : variant, 'auto', recommended)
  function start() {
    const onGenerated = () => {
      save({ variant, difficulty: selected, ...(preset ? { ruleset: preset.id } : {}) })
    }
    void generate(selected, onGenerated, variant, { ruleset: preset?.id })
  }

  return <section className="main-menu-section new-puzzle-step" aria-labelledby="puzzles-page-title">
    <p className="new-puzzle-variant-summary">
      <VariantPreview variant={variant} ruleset={ruleset} />
      <span>{preset?.name ?? (variant === 'mini' ? MINI_NAME : VARIANTS[variant].name)}</span>
    </p>
    {variant !== 'mini' && <VariantRulesetSelector variant={variant} value={ruleset} disabled={busy} onChange={next => {
      void navigate({ to: '/puzzles/new/difficulty', search: { variant, ruleset: next }, replace: true, resetScroll: false })
    }} />}
    <DifficultySelector value={selected} recommended={recommended} variant={variant} disabled={busy} onChange={setSelection} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button variant="primary" className="puzzle-start-button" disabled={busy} onClick={start}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : selected === 'auto'
        ? `Start ${autoLabel}` : `Start ${DIFFICULTY_LABELS[selected].toLowerCase()} puzzle`}
    </Button>
  </section>
}

function Statistics({ games }: { games: Game[] }) {
  const { rating, recommended, count } = usePlayerRating()
  const solved = games.filter(isSolved)
  const inProgress = games.filter((game) => game.started && !isSolved(game) && game.source !== 'draft')
  const timedGames = games.filter((game) => !game.timeUntracked && game.source !== 'draft' && (game.started || game.elapsed > 0))
  const totalTime = timedGames.reduce((sum, game) => sum + game.elapsed, 0)
  const difficultyRows = statisticsDifficulties(solved.map((game) => game.difficulty)).map((difficulty) => {
    const matching = solved.filter((game) => game.difficulty === difficulty)
    const best = matching.reduce((time, game) => game.timeUntracked ? time : Math.min(time, game.elapsed), Infinity)
    return { difficulty, label: DIFFICULTY_LABELS[difficulty], solved: matching.length, best }
  })
  return <section className="main-menu-section" aria-labelledby="puzzles-page-title">
    <dl className="main-stat-cards">
      <div><Trophy size={18} aria-hidden="true" /><dt>{count ? 'Player rating' : 'Starting rating'}</dt><dd>{Math.round(rating)}</dd></div>
      <div><Dices size={18} aria-hidden="true" /><dt>Auto difficulty</dt><dd>{DIFFICULTY_LABELS[recommended]}</dd></div>
      <div><Trophy size={18} aria-hidden="true" /><dt>Puzzles solved</dt><dd>{solved.length}</dd></div>
      <div><Grid3X3 size={18} aria-hidden="true" /><dt>In progress</dt><dd>{inProgress.length}</dd></div>
      {timedGames.length > 0 && <div><Clock3 size={18} aria-hidden="true" /><dt>Total solving time</dt><dd>{formatTime(totalTime)}</dd></div>}
      <div><BarChart3 size={18} aria-hidden="true" /><dt>Saved puzzles</dt><dd>{games.filter(isPuzzleSaved).length}</dd></div>
    </dl>
    <div className="difficulty-statistics" role="table" aria-label="Statistics by difficulty">
      <div role="row" className="difficulty-statistics-heading"><span role="columnheader">Difficulty</span><span role="columnheader">Solved</span><span role="columnheader">Best time</span></div>
      {difficultyRows.map((row) => <div role="row" key={row.difficulty}><strong role="cell">{row.label}</strong><span role="cell">{row.solved}</span><span role="cell">{Number.isFinite(row.best) ? formatTime(row.best) : '—'}</span></div>)}
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

export function PuzzlesPage({ games, active, setDifficulty, newPuzzlePreference, rememberNewPuzzle, preferencesReady, loadingPuzzles, onCreatePuzzle, error }: {
  games: Game[]
  active: string | null
  setDifficulty: (difficulty: DifficultyPreference) => void
  newPuzzlePreference: NewPuzzlePreference
  rememberNewPuzzle: (preference: NewPuzzlePreference) => void
  preferencesReady: boolean
  loadingPuzzles: boolean
  onCreatePuzzle: (variant: NewPuzzleId) => void
  error?: string
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const fromVariantPicker = useLocation({ select: (location) => location.state.fromPuzzleVariantPicker })
  const heading = useRef<HTMLHeadingElement>(null)
  const [managingId, setManagingId] = useState<string | null>(null)
  const managing = games.find((game) => game.id === managingId)
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId })
  const difficultyScreen = routeId === '/puzzles/new/difficulty'
  const section = difficultyScreen ? 'new'
    : (Object.keys(sections) as Section[]).find((id) => sections[id].to === routeId) ?? 'puzzles'
  const collectionSearch = collectionRoute.useSearch({ shouldThrow: false })
  const collection = getCollection(collectionSearch?.collection)
  const collectionPuzzle = getCollectionPuzzle(collectionSearch?.collection, collectionSearch?.puzzle)?.puzzle
  const collectionDifficulty = collectionPuzzle?.difficulty ?? (collection && collectionSearch?.difficulty &&
    collectionDifficulties(collection).includes(collectionSearch.difficulty) ? collectionSearch.difficulty : undefined)
  const newPuzzleSearch = newPuzzleRoute.useSearch({ shouldThrow: false })
  const screen = section === 'new' ? difficultyScreen ? 'difficulty' : 'variant' : undefined
  const variant = newPuzzleSearch?.variant ?? newPuzzlePreference.variant
  const ruleset = variant === 'mini' ? undefined : generationRuleset(variant, newPuzzleSearch?.ruleset ?? newPuzzlePreference.ruleset)?.id
  const pageTitle = screen === 'difficulty' ? 'Choose difficulty'
    : screen === 'variant' ? 'Choose a variant'
      : section === 'puzzles' ? 'Puzzles'
        : collectionPuzzle?.title ?? (collectionDifficulty ? `${DIFFICULTY_LABELS[collectionDifficulty]} puzzles` : collection?.title) ?? sections[section].label

  useEffect(() => {
    if (screen) heading.current?.focus({ preventScroll: true })
  }, [screen])

  function savePuzzlePreference(preference: NewPuzzlePreference) {
    rememberNewPuzzle(preference)
    if (preference.variant !== 'mini') setDifficulty(preference.difficulty)
  }

  function content(current: Section) {
    if (current === 'puzzles') return <PuzzleLibrary games={games} active={active} manage={setManagingId} loading={loadingPuzzles} />
    if (current === 'solved') return <SolvedPuzzleLibrary games={games} active={active} loading={loadingPuzzles} />
    if (current === 'collections') return <PuzzleCollections key={`${collectionSearch?.collection}:${collectionDifficulty}:${collectionSearch?.puzzle}`}
      games={games} />
    if (current === 'new') {
      if (!preferencesReady) return <p className="main-menu-empty" role="status">Loading…</p>
      return difficultyScreen
        ? <NewPuzzleDifficulty key={variant} variant={variant} ruleset={ruleset} difficulty={newPuzzlePreference.difficulty} save={savePuzzlePreference} />
        : <NewPuzzleVariant variant={variant} ruleset={ruleset} onCreate={onCreatePuzzle} />
    }
    return <Statistics games={games} />
  }

  return <main className={`puzzles-page ${section === 'puzzles' ? 'puzzles-home' : 'puzzles-subscreen'}${screen ? ' new-puzzle-page' : ''}${difficultyScreen ? ' puzzles-difficulty-page' : ''}`}>
    <div className="puzzles-layout">
      <header className="puzzles-page-heading">
        {section === 'collections' && collectionSearch?.collection ? <Link to="/puzzles/collections"
          search={collectionSearch.puzzle ? { ...collectionSearch, difficulty: collectionDifficulty ?? undefined, puzzle: undefined }
            : collectionDifficulty ? { collection: collectionSearch.collection } : {}}
          className={iconButtonClassName('secondary', 'puzzles-back')} aria-label={collectionSearch.puzzle ? 'Back to collection puzzles'
            : collectionDifficulty ? 'Change collection difficulty' : 'Browse all collections'}><ChevronLeft size={21} /></Link>
          : difficultyScreen ? (fromVariantPicker && canGoBack
            ? <IconButton className="puzzles-back" aria-label="Back to variant" onClick={() => router.history.back()}><ChevronLeft size={21} /></IconButton>
            : <Link to="/puzzles/new" search={{ variant, ruleset }} replace className={iconButtonClassName('secondary', 'puzzles-back')}
              aria-label="Back to variant"><ChevronLeft size={21} /></Link>)
            : section !== 'puzzles' && <Link to="/puzzles/browse" className={iconButtonClassName('secondary', 'puzzles-back')} aria-label="Back to puzzles"><ChevronLeft size={21} /></Link>}
        <h1 id="puzzles-page-title" ref={heading} tabIndex={screen ? -1 : undefined}>{pageTitle}</h1>
      </header>
      <nav className="main-menu-tabs" aria-label="Puzzles sections">
        {Object.entries(sections).map(([id, { to, label, icon: Icon }]) => (
          <Link key={id} to={to} search={{}} data-section={id} aria-current={section === id ? 'page' : undefined}
            activeOptions={{ exact: id !== 'new', includeSearch: false }}><Icon size={18} aria-hidden="true" />{label}</Link>
        ))}
      </nav>
      <div className="main-menu-panel motion-screen" key={screen ?? section}>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        {content(section)}
      </div>
    </div>
    {section === 'puzzles' && managing && <ManagePuzzle game={managing} close={() => setManagingId(null)} />}
  </main>
}
