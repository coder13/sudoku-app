import { Button, IconButton } from './Button'
import { useId, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Dices } from 'lucide-react'
import { DIFFICULTY_LABELS, type DifficultyPreference } from '../sudoku/difficulty'
import { isCustomDifficultyId, type CustomDifficultyId, type CustomDifficultyProfile } from '../sudoku/custom-difficulties'
import { difficultyStatistics, recordDifficultySolve, summarizeDifficultySolves, type DifficultyStatistics, type DifficultyTotals } from '../sudoku/difficulty-statistics'
import type { Difficulty } from '../sudoku/engine'
import { formatTime, isSolved } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { isSizedPuzzleId, miniDifficulties, miniDifficulty, type NewPuzzleId } from '../sudoku/new-puzzle'
import { variantDifficulties, variantDifficulty } from '../sudoku/variants'

export function DifficultySelector({ value, recommended, variant, disabled = false, onChange, custom }: {
  value: DifficultyPreference
  recommended: Difficulty
  variant?: NewPuzzleId
  disabled?: boolean
  onChange: (value: DifficultyPreference) => void
  custom?: { profiles: readonly CustomDifficultyProfile[]; selected?: CustomDifficultyId; onSelect: (id: CustomDifficultyId) => void }
}) {
  const { games } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const includeCustom = Boolean(custom)
  const statistics = useMemo(() => {
    const base: Map<Difficulty | CustomDifficultyId, DifficultyStatistics> = difficultyStatistics(games, variant)
    if (includeCustom) {
      const totals: DifficultyTotals<CustomDifficultyId> = new Map()
      for (const game of games) {
        if (game.customDifficulty && game.started && isSolved(game)) {
          recordDifficultySolve(totals, game.customDifficulty.id, game.timeUntracked ? undefined : game.elapsed)
        }
      }
      for (const [id, stats] of summarizeDifficultySolves(totals)) base.set(id, stats)
    }
    return base
  }, [games, variant, includeCustom])
  const sized = isSizedPuzzleId(variant)
  const levels: readonly Difficulty[] = sized ? miniDifficulties : variantDifficulties(variant).filter((level): level is Difficulty => level !== 'auto')
  const selected = sized ? miniDifficulty(value) : variantDifficulty(variant, value === 'auto' ? recommended : value)
  const profiles = new Map(custom?.profiles.map(profile => [profile.id, profile.name]))
  const activeCustom = custom?.selected && profiles.has(custom.selected) ? custom.selected : undefined
  return <DifficultyOptions levels={[...levels, ...profiles.keys()]} selected={activeCustom ?? selected} statistics={statistics}
    label={level => isCustomDifficultyId(level) ? profiles.get(level) ?? level : DIFFICULTY_LABELS[level]}
    disabled={disabled} onChange={level => isCustomDifficultyId(level) ? custom?.onSelect(level) : onChange(level)}
    auto={sized ? undefined : { active: !activeCustom && value === 'auto', onChange: active => {
      if (active || !activeCustom) onChange(active ? 'auto' : selected)
    } }} />
}

/** Use for the shared difficulty list on desktop and stepper on small screens. */
export function DifficultyOptions<Level extends string>({ levels, selected, statistics, disabled = false, auto, onChange, label }: {
  levels: readonly Level[]
  selected: Level
  statistics: ReadonlyMap<Level, DifficultyStatistics> | null
  disabled?: boolean
  auto?: { active: boolean; onChange: (active: boolean) => void }
  onChange: (level: Level) => void
  label?: (level: Level) => string
}) {
  const id = useId()
  const index = levels.indexOf(selected)
  const loading = statistics === null
  const selectedStats = statistics?.get(selected)
  const name = (level: Level) => label?.(level) ?? DIFFICULTY_LABELS[level as Difficulty] ?? level

  function averageTime(level: Level) {
    const seconds = statistics?.get(level)?.averageSeconds
    return seconds == null ? '–' : formatTime(seconds)
  }
  function move(offset: number) {
    const next = levels[index + offset]
    if (!disabled && next) onChange(next)
  }

  return <fieldset className="difficulty-selector" disabled={disabled}>
    <legend className="sr-only">Difficulty</legend>
    <div className="difficulty-list">
      <div className="difficulty-list-stats difficulty-list-heading" aria-hidden="true">
        <span>Solved</span>
        <span>Average time</span>
      </div>
      {levels.map((level) => {
        const time = averageTime(level)
        return <label key={level}>
          <input type="radio" name={id} value={level} checked={!auto?.active && selected === level}
            aria-labelledby={`${id}-${level}-label`} aria-describedby={`${id}-${level}-stats`}
            onChange={() => onChange(level)} />
          <span id={`${id}-${level}-label`}>{name(level)}</span>
          <span className="difficulty-list-stats" id={`${id}-${level}-stats`} aria-busy={loading}>
            {loading ? <span>Loading results…</span> : <>
              <span>{statistics.get(level)?.solved ?? 0}<span className="sr-only"> solved</span></span>
              <span>{time === '–' ? <>
                <span className="sr-only">No average time yet</span><span aria-hidden="true">{time}</span>
              </> : <><span className="sr-only">Average time </span>{time}</>}</span>
            </>}
          </span>
        </label>
      })}
    </div>
    <div className="difficulty-mobile">
      <div className="difficulty-stepper-control" onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          event.stopPropagation()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}>
        <IconButton type="button" aria-label="Decrease difficulty"
          aria-describedby={`${id}-value`} disabled={disabled || index <= 0} onClick={() => move(-1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </IconButton>
        <div className="difficulty-stepper-value" id={`${id}-value`} role="status" aria-live="polite" aria-atomic="true">
          <strong>{name(selected)}</strong>
          <small>{index + 1} of {levels.length}</small>
        </div>
        <IconButton type="button" aria-label="Increase difficulty"
          aria-describedby={`${id}-value`} disabled={disabled || index >= levels.length - 1} onClick={() => move(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </IconButton>
      </div>
      <dl className="difficulty-selection-stats" aria-label={`${name(selected)} results`} aria-busy={loading}>
        <div><dt>Solved</dt><dd aria-label={loading ? 'Loading results' : undefined}>{loading ? '–' : selectedStats?.solved ?? 0}</dd></div>
        <div><dt>Average time</dt><dd aria-label={!loading && averageTime(selected) === '–' ? 'No average time yet' : undefined}>{averageTime(selected)}</dd></div>
      </dl>
    </div>
    {auto && <label className="difficulty-selector-auto">
      <input type="checkbox" checked={auto.active} onChange={(event) => auto.onChange(event.target.checked)} />
      Adjust difficulty automatically
    </label>}
  </fieldset>
}

/** Use to present the selected puzzle, difficulty controls, and start action. */
export function PuzzleDifficultyStep({ name, preview, children, busy = false, disabled, error, startLabel, onStart, actions }: {
  name: string
  preview: ReactNode
  children: ReactNode
  busy?: boolean
  disabled?: boolean
  error?: string | null
  startLabel: string
  onStart: () => void
  actions?: ReactNode
}) {
  return <section className="main-menu-section new-puzzle-step" aria-labelledby="puzzles-page-title">
    <p className="new-puzzle-variant-summary">{preview}<span>{name}</span></p>
    {children}
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button variant="primary" className="puzzle-start-button" disabled={busy || disabled} onClick={onStart}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : startLabel}
    </Button>
    {actions}
  </section>
}
