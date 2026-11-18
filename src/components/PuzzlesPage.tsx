import { DifficultySelector } from './DifficultySelector'
import { SinclairOption } from './SinclairOption'
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import { getRouteApi, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { BarChart3, BookOpen, Check, ChevronLeft, ChevronRight, Clock3, Dices, FileUp, Grid3X3, MoreHorizontal, Trophy } from 'lucide-react'
import {
  DIFFICULTY_LABELS, formatPuzzleRating, statisticsDifficulties, type DifficultyPreference,
} from '../sudoku/difficulty'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { roomStore } from '../sudoku/storage'
import { techniqueHistory } from '../sudoku/technique-history'
import { MIN_TECHNIQUE_PUZZLES } from '../sudoku/technique-progress'
import { VARIANTS, PUZZLE_VARIANTS, variantDifficulty, variantDifficultyLabel, type VariantId, type PuzzleVariantId } from '../sudoku/variants'
import { ManagePuzzle } from './PuzzleDialogs'
import { useMobileLayout } from './mobile-layout'
import { MobileNewPuzzle, type MobileNewPuzzleScreen } from './MobileNewPuzzle'
import { VariantSelector } from './VariantSelector'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { PuzzleCollections } from './PuzzleCollections'
import { collectionDifficulties, getCollectionPuzzle, getCollection } from '../sudoku/collections'

type Section = 'puzzles' | 'new' | 'collections' | 'statistics'
type SectionItem = { id: Section; label: string; description: string; icon: ComponentType<{ size?: number }> }

const sections: SectionItem[] = [
  { id: 'puzzles', label: 'Your puzzles', description: 'Continue or switch puzzles', icon: Grid3X3 },
  { id: 'new', label: 'New puzzle', description: 'Choose a variant and difficulty, or import a puzzle', icon: Dices },
  { id: 'collections', label: 'Collections', description: 'Explore selected puzzle sets', icon: BookOpen },
  { id: 'statistics', label: 'Statistics', description: 'Review your solving history', icon: BarChart3 },
]
const sectionRoutes: Record<Section, '/puzzles/browse' | '/puzzles/new' | '/puzzles/collections' | '/puzzles/statistics'> = {
  puzzles: '/puzzles/browse',
  new: '/puzzles/new',
  collections: '/puzzles/collections',
  statistics: '/puzzles/statistics',
}
const newPuzzleRoute = getRouteApi('/puzzles/new')
const collectionRoute = getRouteApi('/puzzles/collections')
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
  if (isSolved(game)) return game.timeUntracked ? `${rating} · Solved` : `${rating} · Solved in ${formatTime(game.elapsed)}`
  if (game.started) return `${rating} · ${game.timeUntracked ? 'In progress' : formatTime(game.elapsed)}`
  return `${rating} · Not started`
}

function PuzzleLibrary({ games, active, select, manage }: {
  games: Game[]; active: string | null; select: (id: string) => void; manage: (id: string) => void
}) {
  const title = useId()
  const activePuzzles = games.filter((game) => !isSolved(game) && !game.savedForLater)
  const saved = games.filter((game) => !isSolved(game) && game.savedForLater)
  const variantOrder: PuzzleVariantId[] = [...Object.keys(PUZZLE_VARIANTS) as Exclude<PuzzleVariantId, 'mixed'>[], 'mixed']
  const difficultyOrder = [...Object.keys(DIFFICULTY_LABELS), 'unrated']
  const solved = games.filter(isSolved).sort((left, right) => {
    const leftVariant = left.variant?.id ?? 'classic'
    const rightVariant = right.variant?.id ?? 'classic'
    return variantOrder.indexOf(leftVariant) - variantOrder.indexOf(rightVariant) ||
      difficultyOrder.indexOf(left.difficulty ?? 'unrated') - difficultyOrder.indexOf(right.difficulty ?? 'unrated') ||
      right.created - left.created || left.title.localeCompare(right.title)
  })
  const solvedGroups = solved.reduce<Array<{
    key: string; variant: PuzzleVariantId; difficulty: Game['difficulty']; games: Game[]
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
        <h4 id={`${title}-${group.key}`}>{group.variant === 'mixed' ? 'Mixed rules' : PUZZLE_VARIANTS[group.variant].name} · {group.difficulty ? DIFFICULTY_LABELS[group.difficulty] : 'Unrated'}</h4>
        {list(group.games)}
      </section>) : <p className="main-menu-empty">You haven’t solved any puzzles yet.</p>}
    </section>
  </section>
}

function NewPuzzleSection({ preference, save, done }: {
  preference: NewPuzzlePreference
  save: (preference: NewPuzzlePreference) => void
  done: () => void
}) {
  const { busy, busyLabel, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [variant, setVariant] = useState<VariantId>(preference.variant)
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = variantDifficulty(variant, selection ?? preference.difficulty)
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
    <header className="new-puzzle-heading">
      <h2 id={`${group}-title`}>New puzzle</h2>
      <Link className="button secondary" to="/import" disabled={busy}><FileUp size={18} aria-hidden="true" /> Import a puzzle</Link>
    </header>
    <VariantSelector value={variant} onChange={setVariant} busy={busy} />
    <DifficultySelector value={selected} recommended={recommended} variant={variant} disabled={busy} onChange={setSelection} />
    <SinclairOption disabled={busy} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary main-start-puzzle puzzle-start-button" disabled={busy} onClick={start}>
      <Dices size={18} aria-hidden="true" /> {busy ? busyLabel : selected === 'auto'
        ? `Start ${autoLabel}` : `Start ${DIFFICULTY_LABELS[selected].toLowerCase()} puzzle`}
    </button>
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
  return <section className="main-menu-section" aria-labelledby="statistics-title">
    <header><h2 id="statistics-title">Statistics</h2><p>Your solving history on this device.</p></header>
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

export function PuzzlesPage({ games, active, setDifficulty, newPuzzlePreference, rememberNewPuzzle, preferencesReady, onCreatePuzzle }: {
  games: Game[]
  active: string | null
  setDifficulty: (difficulty: DifficultyPreference) => void
  newPuzzlePreference: NewPuzzlePreference
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
      : routeId === sectionRoutes.statistics ? 'statistics'
        : routeId === sectionRoutes.collections ? 'collections' : null
  const requestedCollection = collectionRoute.useSearch({ shouldThrow: false })
  // The static page is built without a query string, including the offline copy.
  const collectionSearch = preferencesReady ? requestedCollection : undefined
  const collection = getCollection(collectionSearch?.collection)
  const collectionPuzzle = getCollectionPuzzle(collectionSearch?.collection, collectionSearch?.puzzle)?.puzzle
  const collectionDifficulty = collectionPuzzle?.difficulty ?? (collection && collectionSearch?.difficulty &&
    collectionDifficulties(collection).includes(collectionSearch.difficulty) ? collectionSearch.difficulty : undefined)
  const newPuzzleSearch = newPuzzleRoute.useSearch({ shouldThrow: false })
  const mobileNewPuzzle = mobile && section === 'new'
  const screen = mobileNewPuzzle && preferencesReady ? newPuzzleSearch?.step ?? 'start' : undefined
  const variant = newPuzzleSearch?.variant ?? newPuzzlePreference.variant
  const backToStart = screen === 'variant' || screen === 'difficulty'

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
    if (current === 'collections') return <PuzzleCollections key={`${collectionSearch?.collection}:${collectionDifficulty}:${collectionSearch?.puzzle}`}
      search={collectionSearch ?? {}} games={games} onPlay={play} />
    if (current === 'new') return preferencesReady && <NewPuzzleSection preference={newPuzzlePreference} save={savePuzzlePreference} done={play} />
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
      {section === 'collections' && (collectionSearch?.collection || collectionSearch?.variant) ? <Link to="/puzzles/collections"
        search={collectionSearch.puzzle ? { ...collectionSearch, difficulty: collectionDifficulty ?? undefined, puzzle: undefined }
          : collectionDifficulty ? { variant: collection?.variant, collection: collectionSearch.collection }
            : collection ? { variant: collection.variant } : {}}
        className="icon-button puzzles-back" aria-label={collectionSearch.puzzle ? 'Back to collection puzzles'
          : collectionDifficulty ? 'Change collection difficulty' : collection ? 'Choose another collection' : 'Choose another variant'}><ChevronLeft size={21} /></Link>
        : backToStart ? <Link to="/puzzles/new" search={{}} replace
          className="icon-button puzzles-back" aria-label="Back to New puzzle"><ChevronLeft size={21} /></Link>
          : section && <Link to="/puzzles" className="icon-button puzzles-back" aria-label="Back to Puzzles"><ChevronLeft size={21} /></Link>}
      <h1 id="puzzles-page-title" ref={heading} tabIndex={screen ? -1 : undefined}>{screen ? newPuzzleTitle[screen]
        : collectionPuzzle?.title ?? (collectionDifficulty ? `${DIFFICULTY_LABELS[collectionDifficulty]} puzzles` : collection?.title) ?? sectionItem?.label ?? 'Puzzles'}</h1>
    </header>
    {!mobileNewPuzzle && <div className="main-menu-desktop">
      <nav className="main-menu-tabs" aria-label="Puzzles sections">
        {sections.map((item) => { const Icon = item.icon; return <Link key={item.id} to={sectionRoutes[item.id]}><Icon size={18} />{item.label}</Link> })}
      </nav>
      <div className="main-menu-panel motion-screen" key={section ?? 'overview'}>{section ? (!mobile || section !== 'collections') && content(section) : <section className="puzzles-overview"><h2>Puzzles</h2><p>Continue solving, start a new puzzle, explore a collection, or review your statistics.</p>{navigation}</section>}</div>
    </div>}
    {(section !== 'new' || mobileNewPuzzle) && <div className="main-menu-mobile motion-screen" key={`mobile-${screen ?? section ?? 'overview'}`}>
      {mobileNewPuzzle ? screen && <MobileNewPuzzle screen={screen} variant={variant} preference={newPuzzlePreference}
        remember={rememberNewPuzzle} done={(preference) => { savePuzzlePreference(preference); play() }} onCreate={onCreatePuzzle} />
        : section ? (mobile || section !== 'collections') && content(section) : navigation}
    </div>}
    <Outlet />
    {section === 'puzzles' && managing && <ManagePuzzle game={managing} close={() => setManagingId(null)} />}
  </main>
}
