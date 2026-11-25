import { Button, IconButton, buttonClassName, iconButtonClassName } from './Button'
import { DifficultySelector, PuzzleDifficultyStep } from './DifficultySelector'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getRouteApi, Link, useCanGoBack, useLocation, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ArrowRight, BarChart3, CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, Dices, FileUp, Grid3X3, MoreHorizontal, SlidersHorizontal, Trophy } from 'lucide-react'
import {
  DIFFICULTY_LABELS, formatPuzzleRating, isDifficulty, statisticsDifficulties, type DifficultyPreference,
} from '../sudoku/difficulty'
import { createGameId, formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { inProgress, matchesSolvedFilters, solvedHistory, type SolvedPuzzleFilters } from '../sudoku/puzzle-activity'
import {
  CUSTOM_MODES_KEY, coreSudokuModes, customModeDifficulties, customRuleIds, customRules, markerOptions, readSudokuModes,
  selectedMarkerRules, writeSudokuModes, type CustomDifficulty, type CustomRule, type MarkerRule, type SudokuMode,
} from '../sudoku/custom-modes'
import { techniqueLabel } from '../sudoku/hints'
import { rectangularGridForBoxRows, rectangularLayouts, type RectangularBoxRows } from '../sudoku/grid'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { techniqueHistory } from '../sudoku/technique-history'
import { MIN_TECHNIQUE_PUZZLES } from '../sudoku/technique-progress'
import {
  ALGEBRAIC_CAGES_NAME, EIGHT_NAME, FIVE_JIGSAW_NAME, gameVariantId, isGameVariantId, isSizedPuzzleId,
  newPuzzleDifficulty, MINI_NAME, SEVEN_BOXLESS_NAME, SEVEN_JIGSAW_NAME, SIX_NAME, rectangularBoxRows,
  rectangularPuzzleSize, sizedGridName, sizedPuzzleOptions, type NewPuzzleId, type SizedPuzzleId,
} from '../sudoku/new-puzzle'
import { VARIANTS, PUZZLE_VARIANTS, variantDifficultyLabel, variantName } from '../sudoku/variants'
import { ManagePuzzle } from './PuzzleDialogs'
import { VariantPreview } from './VariantPreview'
import { VariantRulesetSelector } from './VariantRulesetSelector'
import { generationRuleset, type GenerationRulesetId } from '../sudoku/variant-rulesets'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { PuzzlesSectionNav, puzzleSections, type PuzzleSection } from './PuzzlesSectionNav'
import { PuzzleCollections } from './PuzzleCollections'
import { SelectControl } from './SelectControl'
import { collectionDifficulties, getCollectionPuzzle, getCollection } from '../sudoku/collections'
import { PuzzleRowContent } from './PuzzleRowContent'

const newPuzzleRoute = getRouteApi('/puzzles/new')
const collectionRoute = getRouteApi('/puzzles/collections')
const solvedRoute = getRouteApi('/puzzles/solved')

declare module '@tanstack/history' {
  interface HistoryState {
    fromPuzzleVariantPicker?: boolean
  }
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
        const variantLabel = variant === 'algebraic-cages' ? ALGEBRAIC_CAGES_NAME
          : game.grid ? sizedGridName(game.grid)
          : variant === 'mixed' && !game.variant?.fog ? 'Mixed rules' : variantName(game.variant)
        const detail = (manage
          ? [useRatingTitle && variant !== 'classic' && variantLabel, !useRatingTitle && rating, puzzleStatus(game)]
          : [variantLabel, rating || 'Unrated', !game.timeUntracked && formatTime(game.elapsed)]).filter(Boolean).join(' · ')
        return <li key={game.id} className={manageable ? 'game-row-with-options' : undefined}>
          <Link className="game-row" aria-current={game.id === active ? 'true' : undefined} to="/" search={{ puzzle: game.id }}>
            <PuzzleRowContent values={valuesOf(game)} size={game.grid?.size} title={name} detail={detail}
              trailing={game.id === active ? <span className="current-dot" aria-label="Current puzzle" />
                : <ChevronRight className="row-arrow" size={18} aria-hidden="true" />} />
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
        <option value="six">{SIX_NAME}</option>
        <option value="jigsaw-five">{FIVE_JIGSAW_NAME}</option>
        <option value="jigsaw-seven">{SEVEN_JIGSAW_NAME}</option>
        <option value="eight">{EIGHT_NAME}</option>
        <option value="boxless-seven">{SEVEN_BOXLESS_NAME}</option>
        <option value="algebraic-cages">{ALGEBRAIC_CAGES_NAME}</option>
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

function CoreSudokuChooser({ modes, difficulty }: { modes: readonly SudokuMode[]; difficulty: DifficultyPreference }) {
  return <section className="main-menu-section new-puzzle-step sudoku-mode-chooser" aria-labelledby="puzzles-page-title">
    <ul className="sudoku-mode-list">
      {coreSudokuModes.map(variant => <li key={variant}>
        <Link to="/puzzles/new/difficulty" search={{ variant, difficulty: newPuzzleDifficulty(variant, difficulty) }} state={{ fromPuzzleVariantPicker: true }}>
          <VariantPreview variant={variant} />
          <span>{variant === 'diagonal' ? 'X Sudoku' : VARIANTS[variant].name}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </li>)}
      {modes.map(mode => <li key={mode.id}>
        <Link to="/puzzles/new/difficulty" search={{ mode: mode.id }} state={{ fromPuzzleVariantPicker: true }}>
          <Grid3X3 size={20} aria-hidden="true" /><span>{mode.name}</span><ChevronRight size={18} aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
    <Link className={buttonClassName('primary')} to="/import"><FileUp size={18} aria-hidden="true" />Import puzzle</Link>
    <Link className={buttonClassName()} to="/puzzles/new/custom" state={{ fromPuzzleVariantPicker: true }}>
      <SlidersHorizontal size={18} aria-hidden="true" />Generate a custom puzzle
    </Link>
    <Link to="/puzzles/games" state={{ fromSudokuVariant: true }} className={buttonClassName('quiet')}>Change game type</Link>
  </section>
}

function CustomDifficultyField({ levels, value, disabled, onChange }: {
  levels: readonly CustomDifficulty[]
  value: CustomDifficulty
  disabled: boolean
  onChange: (value: CustomDifficulty) => void
}) {
  return <label className="dialog-form">Difficulty
    <SelectControl value={value} disabled={disabled} onChange={event => {
      const level = levels.find(item => item === event.currentTarget.value)
      if (level) onChange(level)
    }}>
      {levels.map(level => <option key={level} value={level}>{DIFFICULTY_LABELS[level]}</option>)}
    </SelectControl>
  </label>
}

function CustomModeBuilder({ mode, modes, onSave }: { mode?: SudokuMode; modes: readonly SudokuMode[]; onSave: (mode: SudokuMode) => SudokuMode }) {
  const { busy, error, generate, cancelGeneration } = usePuzzleGeneration()
  const [name, setName] = useState(mode?.name ?? '')
  const [rules, setRules] = useState<readonly CustomRule[]>(mode?.rules ?? [])
  const [negativeMarkers, setNegativeMarkers] = useState<readonly MarkerRule[]>(mode?.negativeMarkers ?? [])
  const [filter, setFilter] = useState('')
  const [level, setLevel] = useState<CustomDifficulty>('medium')
  const modeId = useRef(mode?.id)
  const [savedMessage, setSavedMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const query = filter.trim().toLowerCase()
  const visible = customRuleIds.filter(rule => customRules[rule].name.toLowerCase().includes(query))
  const markerRules = selectedMarkerRules(rules)
  const levels = customModeDifficulties(rules)
  const difficulty = levels.includes(level) ? level : 'medium'
  const definition = { name: name.trim() || 'Custom Sudoku', rules, ...(negativeMarkers.length && { negativeMarkers }) }

  function changeRule(rule: CustomRule, enabled: boolean) {
    const next = enabled ? [...rules, rule] : rules.filter(item => item !== rule)
    setRules(next)
    const nextMarkers = selectedMarkerRules(next)
    setNegativeMarkers(current => current.filter(marker => nextMarkers.includes(marker)))
    setSavedMessage('')
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !rules.length) return
    try {
      modeId.current ??= createGameId()
      onSave({ id: modeId.current, ...definition })
      setSavedMessage('Mode saved.')
      setSaveError('')
    } catch {
      setSaveError('Could not save this mode on this device.')
      setSavedMessage('')
    }
  }
  return <section className="main-menu-section new-puzzle-step sudoku-mode-builder" aria-labelledby="puzzles-page-title">
    {modes.length > 0 && <section className="sudoku-saved-modes">
      <h2>Saved modes</h2>
      <ul className="sudoku-mode-list">
        {modes.map(saved => <li key={saved.id}>
          <Link to="/puzzles/new/difficulty" search={{ mode: saved.id }} state={{ fromPuzzleVariantPicker: true }}><span>{saved.name}</span><ChevronRight size={18} aria-hidden="true" /></Link>
          <Link to="/puzzles/new/custom" search={{ mode: saved.id }} state={{ fromPuzzleVariantPicker: true }} className={buttonClassName('quiet')} aria-label={`Edit ${saved.name}`}>Edit</Link>
        </li>)}
      </ul>
    </section>}
    <form className="sudoku-mode-form" onSubmit={save}>
      <label className="dialog-form">Mode name
        <input value={name} maxLength={48} onChange={event => { setName(event.currentTarget.value); setSavedMessage('') }} />
      </label>
      <div className="sudoku-selected-rules" aria-live="polite">{rules.length
        ? rules.map(rule => customRules[rule].name).join(' · ') : 'Choose rules for a generated puzzle.'}</div>
      <label className="dialog-form">Find a rule
        <input type="search" value={filter} onChange={event => setFilter(event.currentTarget.value)} />
      </label>
      <fieldset className="sudoku-custom-rule-list" disabled={busy}>
        <legend>Rules</legend>
        {visible.length ? visible.map(rule => <label key={rule}>
          <input type="checkbox" checked={rules.includes(rule)} onChange={event => changeRule(rule, event.currentTarget.checked)} />
          <span><strong>{customRules[rule].name}</strong><small>{customRules[rule].rule}</small></span>
        </label>) : <p>No rules match your search.</p>}
      </fieldset>
      {markerRules.length > 0 && <fieldset className="sudoku-custom-rule-list" disabled={busy}>
        <legend>Unmarked edges</legend>
        <p className="sudoku-mode-note">These settings apply to cells sharing an edge.</p>
        {markerRules.map(marker => <label key={marker}>
          <input type="checkbox" checked={negativeMarkers.includes(marker)} onChange={event => {
            const enabled = event.currentTarget.checked
            setNegativeMarkers(current => enabled ? [...current, marker] : current.filter(item => item !== marker))
            setSavedMessage('')
          }} />
          {markerOptions[marker].label}
        </label>)}
      </fieldset>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      {savedMessage && <p role="status">{savedMessage} It appears in the main mode list on this device and linked devices after sync.</p>}
      <Button type="submit" disabled={busy || !name.trim() || !rules.length}>Save mode</Button>
      <CustomDifficultyField levels={levels} value={difficulty} disabled={busy} onChange={setLevel} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="button" variant="primary" disabled={busy || !rules.length} onClick={() => void generate(difficulty, undefined, 'classic', {
        customMode: definition,
      })}><Dices size={18} aria-hidden="true" />{busy ? 'Generating…' : 'Generate puzzle'}</Button>
      {busy && <Button type="button" onClick={cancelGeneration}>Cancel generation</Button>}
    </form>
  </section>
}

function CustomModeDifficulty({ mode }: { mode: SudokuMode }) {
  const levels = customModeDifficulties(mode.rules)
  const [level, setLevel] = useState<CustomDifficulty>('medium')
  const { busy, error, generate, cancelGeneration } = usePuzzleGeneration()
  return <PuzzleDifficultyStep name={mode.name} preview={<Grid3X3 size={28} aria-hidden="true" />} busy={busy} error={error}
    startLabel={`Start ${DIFFICULTY_LABELS[level].toLowerCase()} puzzle`}
    onStart={() => void generate(level, undefined, 'classic', { customMode: { name: mode.name, rules: mode.rules, negativeMarkers: mode.negativeMarkers } })}
    actions={busy ? <Button type="button" onClick={cancelGeneration}>Cancel generation</Button>
      : <Link to="/puzzles/new/custom" search={{ mode: mode.id }} state={{ fromPuzzleVariantPicker: true }}
        className={buttonClassName('quiet')}>Edit mode</Link>}>
    <p>{mode.rules.map(rule => customRules[rule].name).join(' · ')}</p>
    {!!mode.negativeMarkers?.length && <p>{mode.negativeMarkers.map(marker => markerOptions[marker].label).join(' · ')}</p>}
    <CustomDifficultyField levels={levels} value={level} disabled={busy} onChange={setLevel} />
  </PuzzleDifficultyStep>
}

function CustomPuzzleGeneration({ variant, boxRows, difficulty, mode, modes, onSave }: {
  variant?: SizedPuzzleId
  boxRows?: RectangularBoxRows
  difficulty: DifficultyPreference
  mode?: SudokuMode
  modes: readonly SudokuMode[]
  onSave: (mode: SudokuMode) => SudokuMode
}) {
  const navigate = useNavigate()
  const size = rectangularPuzzleSize(variant)
  return <div className="main-menu-section new-puzzle-step">
    {!mode && <label className="dialog-form">Grid
      <SelectControl value={variant ?? 'classic'} onChange={({ currentTarget: { value } }) => {
        void navigate({ to: '/puzzles/new/custom', search: isSizedPuzzleId(value) ? { variant: value, difficulty } : { difficulty },
          replace: true, resetScroll: false, state: previous => ({ fromPuzzleVariantPicker: previous.fromPuzzleVariantPicker }) })
      }}>
        <option value="classic">9 × 9 Sudoku</option>
        {Object.entries(sizedPuzzleOptions).map(([id, { name }]) => <option key={id} value={id}>
          {id === 'mini' || id === 'algebraic-cages' ? `4 × 4 ${name}` : name}
        </option>)}
      </SelectControl>
    </label>}
    {variant ? <>
      <p className="new-puzzle-variant-summary"><VariantPreview variant={variant} boxRows={boxRows} /><span>{sizedPuzzleOptions[variant].name}</span></p>
      <p>{sizedPuzzleOptions[variant].rule}</p>
      {size && <label className="dialog-form">Box layout
        <SelectControl value={boxRows ?? 2} onChange={({ currentTarget: { value } }) => {
          void navigate({ to: '/puzzles/new/custom', search: { variant, boxRows: rectangularBoxRows(variant, Number(value)), difficulty },
            replace: true, resetScroll: false, state: previous => ({ fromPuzzleVariantPicker: previous.fromPuzzleVariantPicker }) })
        }}>
          {rectangularLayouts(size).map(layout => <option key={layout.boxRows} value={layout.boxRows}>
            {layout.boxRows} × {layout.boxColumns} boxes
          </option>)}
        </SelectControl>
      </label>}
      <Link to="/puzzles/new/difficulty" search={{ variant, boxRows, difficulty: newPuzzleDifficulty(variant, difficulty) }} state={{ fromPuzzleVariantPicker: true }}
        className={buttonClassName('primary')}>Continue <ArrowRight size={18} aria-hidden="true" /></Link>
    </> : <CustomModeBuilder key={mode?.id ?? 'new'} mode={mode} modes={modes} onSave={onSave} />}
  </div>
}

function NewPuzzleVariant({ variant, ruleset, difficulty }: {
  variant: Exclude<NewPuzzleId, SizedPuzzleId>
  ruleset?: GenerationRulesetId
  difficulty: DifficultyPreference
}) {
  const navigate = useNavigate()
  const choices: readonly NewPuzzleId[] = coreSudokuModes.some(mode => mode === variant) ? coreSudokuModes : [...coreSudokuModes, variant]
  const index = choices.indexOf(variant)
  const { name, rule } = VARIANTS[variant]

  function browse(direction: number) {
    const count = choices.length
    const next = choices[(index + direction + count) % count]
    void navigate({ to: '/puzzles/new', search: { variant: next, difficulty }, replace: true, resetScroll: false, viewTransition: false })
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
        <div><h2>{name}</h2><small>{index + 1} of {choices.length}</small></div>
        <p>{rule}</p>
      </div>
    </div>
    <VariantRulesetSelector variant={variant} value={ruleset} onChange={next => {
      void navigate({ to: '/puzzles/new', search: { variant, ruleset: next, difficulty }, replace: true, resetScroll: false })
    }} />
    <Link to="/puzzles/new/difficulty" search={{ variant, ruleset, difficulty: newPuzzleDifficulty(variant, difficulty) }} state={{ fromPuzzleVariantPicker: true }}
      className={buttonClassName('primary')}>Continue <ArrowRight size={18} aria-hidden="true" /></Link>
    <Link className={buttonClassName()} to="/import"><FileUp size={18} aria-hidden="true" />Import puzzle</Link>
    <Link to="/puzzles/games" state={{ fromSudokuVariant: true }} className={buttonClassName('quiet')}>Change game type</Link>
  </section>
}

function NewPuzzleDifficulty({ variant, ruleset, boxRows, difficulty, save }: {
  variant: NewPuzzleId
  ruleset?: GenerationRulesetId
  difficulty: DifficultyPreference
  boxRows?: RectangularBoxRows
  save: (preference: NewPuzzlePreference) => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const navigate = useNavigate()
  const sized = isSizedPuzzleId(variant)
  const preset = sized ? undefined : generationRuleset(variant, ruleset)
  const { recommended } = usePlayerRating()
  const autoLabel = variantDifficultyLabel(sized ? undefined : variant, 'auto', recommended)
  function start() {
    const onGenerated = () => {
      save({ variant, difficulty, boxRows, ...(preset ? { ruleset: preset.id } : {}) })
    }
    void generate(difficulty, onGenerated, variant, { ruleset: preset?.id, boxRows })
  }

  const coreMode = coreSudokuModes.find(id => id === variant)
  const name = preset?.name ?? (sized ? sizedPuzzleOptions[variant].name : variant === 'diagonal' ? 'X Sudoku' : VARIANTS[variant].name)
  const rectangularSize = rectangularPuzzleSize(variant)
  const layout = rectangularSize ? rectangularGridForBoxRows(rectangularSize, boxRows) : undefined
  return <PuzzleDifficultyStep name={name} preview={<VariantPreview variant={variant} ruleset={ruleset} boxRows={boxRows} />}
    busy={busy} error={error} onStart={start}
    startLabel={difficulty === 'auto' ? `Start ${autoLabel}` : `Start ${DIFFICULTY_LABELS[difficulty].toLowerCase()} puzzle`}>
    {coreMode && <p>{VARIANTS[coreMode].rule}</p>}
    {layout && <p>{layout.boxRows} × {layout.boxColumns} boxes</p>}
    {!sized && <VariantRulesetSelector variant={variant} value={ruleset} disabled={busy} onChange={next => {
      void navigate({ to: '/puzzles/new/difficulty', search: { variant, ruleset: next, difficulty },
        replace: true, state: true, resetScroll: false, viewTransition: false })
    }} />}
    <DifficultySelector value={difficulty} recommended={recommended} variant={variant} disabled={busy} onChange={next => {
      void navigate({ to: '/puzzles/new/difficulty', search: { variant, ruleset, boxRows, difficulty: next },
        replace: true, state: true, resetScroll: false, viewTransition: false })
    }} />
  </PuzzleDifficultyStep>
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

export function PuzzlesPage({ games, active, setDifficulty, newPuzzlePreference, rememberNewPuzzle, preferencesReady, loadingPuzzles, error }: {
  games: Game[]
  active: string | null
  setDifficulty: (difficulty: DifficultyPreference) => void
  newPuzzlePreference: NewPuzzlePreference
  rememberNewPuzzle: (preference: NewPuzzlePreference) => void
  preferencesReady: boolean
  loadingPuzzles: boolean
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
  const newPuzzleSearch = newPuzzleRoute.useSearch({ shouldThrow: false })
  const customGrid = isSizedPuzzleId(newPuzzleSearch?.variant) ? newPuzzleSearch.variant : undefined
  const customScreen = routeId === '/puzzles/new/custom' || routeId === '/puzzles/new' && Boolean(customGrid)
  const section = difficultyScreen || customScreen ? 'new'
    : (Object.keys(puzzleSections) as PuzzleSection[]).find((id) => puzzleSections[id].to === routeId) ?? 'puzzles'
  const collectionSearch = collectionRoute.useSearch({ shouldThrow: false })
  const collection = getCollection(collectionSearch?.collection)
  const collectionPuzzle = getCollectionPuzzle(collectionSearch?.collection, collectionSearch?.puzzle)?.puzzle
  const collectionDifficulty = collectionPuzzle?.difficulty ?? (collection && collectionSearch?.difficulty &&
    collectionDifficulties(collection).includes(collectionSearch.difficulty) ? collectionSearch.difficulty : undefined)
  const [savedModes, setSavedModes] = useState<readonly SudokuMode[] | null>(null)
  useEffect(() => {
    const refreshModes = (event: StorageEvent) => {
      if (event.key && event.key !== CUSTOM_MODES_KEY) return
      setSavedModes(readSudokuModes())
    }
    setSavedModes(readSudokuModes())
    window.addEventListener('storage', refreshModes)
    return () => window.removeEventListener('storage', refreshModes)
  }, [])
  const modes = savedModes ?? []
  const mode = modes.find(item => item.id === newPuzzleSearch?.mode)
  const openRemembered = section === 'new' && !difficultyScreen && !customScreen && !newPuzzleSearch?.mode
    && !newPuzzleSearch?.variant && newPuzzleSearch?.step !== 'variant'
  const screen = section === 'new' ? difficultyScreen || openRemembered ? 'difficulty' : customScreen ? 'custom' : 'variant' : undefined
  function saveMode(saved: SudokuMode) {
    const current = readSudokuModes()
    const next = current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]
    writeSudokuModes(next)
    setSavedModes(next)
    return saved
  }
  const variant = newPuzzleSearch?.variant ?? newPuzzlePreference.variant
  const rememberedVariant = variant === newPuzzlePreference.variant ? newPuzzlePreference : undefined
  const ruleset = isSizedPuzzleId(variant) ? undefined : generationRuleset(variant, newPuzzleSearch?.ruleset ?? rememberedVariant?.ruleset)?.id
  const boxRows = rectangularBoxRows(variant, newPuzzleSearch?.boxRows ?? rememberedVariant?.boxRows)
    ?? (rectangularPuzzleSize(variant) ? 2 : undefined)
  const sizedDifficulty = difficultyScreen && isSizedPuzzleId(variant)
  const variantBack = difficultyScreen && !sizedDifficulty && !newPuzzleSearch?.mode
    && !coreSudokuModes.some(mode => mode === variant)
  const requestedDifficulty = newPuzzleSearch?.difficulty ?? newPuzzlePreference.difficulty
  const difficulty = newPuzzleDifficulty(variant, requestedDifficulty)
  const pageTitle = screen === 'difficulty' ? 'Choose difficulty'
    : screen === 'custom' ? 'Generate a custom puzzle'
      : screen === 'variant' ? newPuzzleSearch?.variant ? 'Choose a variant' : 'Choose a Sudoku mode'
      : section === 'puzzles' ? 'Puzzles'
        : collectionPuzzle?.title ?? (collectionDifficulty ? `${DIFFICULTY_LABELS[collectionDifficulty]} puzzles` : collection?.title) ?? puzzleSections[section].label

  useEffect(() => {
    if (openRemembered && preferencesReady) {
      void router.navigate({ to: '/puzzles/new/difficulty', search: { variant, difficulty, ruleset, boxRows },
        replace: true, viewTransition: false })
    }
  }, [openRemembered, preferencesReady, router, variant, difficulty, ruleset, boxRows])

  useEffect(() => {
    if (screen) heading.current?.focus({ preventScroll: true })
  }, [screen, newPuzzleSearch?.mode])

  function savePuzzlePreference(preference: NewPuzzlePreference) {
    rememberNewPuzzle(preference)
    if (!isSizedPuzzleId(preference.variant)) setDifficulty(preference.difficulty)
  }

  function content(current: PuzzleSection) {
    if (current === 'puzzles') return <PuzzleLibrary games={games} active={active} manage={setManagingId} loading={loadingPuzzles} />
    if (current === 'solved') return <SolvedPuzzleLibrary games={games} active={active} loading={loadingPuzzles} />
    if (current === 'collections') return <PuzzleCollections key={`${collectionSearch?.collection}:${collectionDifficulty}:${collectionSearch?.puzzle}`}
      games={games} />
    if (current === 'new') {
      if ((customScreen || difficultyScreen) && newPuzzleSearch?.mode) {
        if (savedModes === null) return <p className="main-menu-empty" role="status">Loading saved mode…</p>
        if (!mode) return <section className="main-menu-section new-puzzle-step" aria-labelledby="puzzles-page-title">
          <p>This mode is not available on this device yet. If it was saved on another linked device, wait for sync to finish.</p>
          <Link to="/puzzles/new/custom" className={buttonClassName('primary')}>Generate a custom puzzle</Link>
        </section>
        if (difficultyScreen) return <CustomModeDifficulty key={mode.id} mode={mode} />
      }
      if (customScreen) return <CustomPuzzleGeneration variant={customGrid} boxRows={boxRows} difficulty={requestedDifficulty} mode={mode} modes={modes} onSave={saveMode} />
      if (!difficultyScreen && !newPuzzleSearch?.variant && !openRemembered) {
        return <CoreSudokuChooser modes={modes} difficulty={requestedDifficulty} />
      }
      if (!preferencesReady || openRemembered) return <p className="main-menu-empty" role="status">Loading…</p>
      if (difficultyScreen) {
        return <NewPuzzleDifficulty key={variant} variant={variant} ruleset={ruleset} boxRows={boxRows}
          difficulty={difficulty} save={savePuzzlePreference} />
      }
      if (!isSizedPuzzleId(variant)) return <NewPuzzleVariant variant={variant} ruleset={ruleset} difficulty={requestedDifficulty} />
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
          : difficultyScreen || customScreen ? (fromVariantPicker && canGoBack
            ? <IconButton className="puzzles-back" aria-label="Back" onClick={() => router.history.back()}><ChevronLeft size={21} /></IconButton>
            : <Link to={sizedDifficulty ? '/puzzles/new/custom' : '/puzzles/new'}
              search={sizedDifficulty ? { variant, boxRows, difficulty: requestedDifficulty }
                : variantBack ? { variant, ruleset, difficulty: requestedDifficulty }
                  : { step: 'variant', difficulty: requestedDifficulty }} replace
              className={iconButtonClassName('secondary', 'puzzles-back')}
              aria-label={sizedDifficulty ? 'Back to custom puzzle setup' : variantBack ? 'Back to variant' : 'Back to Sudoku modes'}><ChevronLeft size={21} /></Link>)
            : section !== 'puzzles' && <Link to="/puzzles/browse" className={iconButtonClassName('secondary', 'puzzles-back')} aria-label="Back to puzzles"><ChevronLeft size={21} /></Link>}
        <h1 id="puzzles-page-title" ref={heading} tabIndex={screen ? -1 : undefined}>{pageTitle}</h1>
      </header>
      <PuzzlesSectionNav active={section} />
      <div className="main-menu-panel motion-screen" key={screen ?? section}>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        {content(section)}
      </div>
    </div>
    {section === 'puzzles' && managing && <ManagePuzzle game={managing} close={() => setManagingId(null)} />}
  </main>
}
