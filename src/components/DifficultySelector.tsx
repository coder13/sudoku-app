import { Button, IconButton } from './Button'
import { useId, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Dices } from 'lucide-react'
import { DIFFICULTY_LABELS, type DifficultyPreference } from '../sudoku/difficulty'
import { difficultyStatistics, type DifficultyStatistics } from '../sudoku/difficulty-statistics'
import type { Difficulty } from '../sudoku/engine'
import { formatTime } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { isSizedPuzzleId, miniDifficulties, miniDifficulty, type NewPuzzleId } from '../sudoku/new-puzzle'
import { variantDifficulties, variantDifficulty } from '../sudoku/variants'

export function DifficultySelector({ value, recommended, variant, disabled = false, onChange }: {
  value: DifficultyPreference
  recommended: Difficulty
  variant?: NewPuzzleId
  disabled?: boolean
  onChange: (value: DifficultyPreference) => void
}) {
  const { games } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const statistics = useMemo(() => difficultyStatistics(games, variant), [games, variant])
  const sized = isSizedPuzzleId(variant)
  const levels: readonly Difficulty[] = sized ? miniDifficulties : variantDifficulties(variant).filter((level): level is Difficulty => level !== 'auto')
  const selected = sized ? miniDifficulty(value) : variantDifficulty(variant, value === 'auto' ? recommended : value)
  return <DifficultyOptions levels={levels} selected={selected} statistics={statistics}
    disabled={disabled} onChange={onChange}
    auto={sized ? undefined : { active: value === 'auto', onChange: active => onChange(active ? 'auto' : selected) }} />
}

/** Use for the shared difficulty list on desktop and stepper on small screens. */
export function DifficultyOptions<Level extends Difficulty>({ levels, selected, statistics, descriptions, disabled = false, auto, onChange }: {
  levels: readonly Level[]
  selected: Level
  statistics: ReadonlyMap<Level, DifficultyStatistics> | null
  descriptions?: Readonly<Partial<Record<Level, string>>>
  disabled?: boolean
  auto?: { active: boolean; onChange: (active: boolean) => void }
  onChange: (level: Level) => void
}) {
  const id = useId()
  const index = levels.indexOf(selected)
  const loading = statistics === null
  const selectedStats = statistics?.get(selected)
  const selectedDescription = descriptions?.[selected]

  function averageTime(level: Level) {
    const seconds = statistics?.get(level)?.averageSeconds
    return seconds == null ? '–' : formatTime(seconds)
  }
  function move(offset: number) {
    const next = levels[index + offset]
    if (!disabled && next) onChange(next)
  }

  return <fieldset className="difficulty-selector" disabled={disabled}>
    <legend>Difficulty</legend>
    <div className="difficulty-list">
      {levels.map(level => {
        const levelId = `${id}-${level}`
        const description = descriptions?.[level]
        const describedBy = description ? `${levelId}-description ${levelId}-stats` : `${levelId}-stats`
        return <label key={level}>
          <input type="radio" name={id} value={level} checked={!auto?.active && selected === level}
            aria-labelledby={levelId + '-label'} aria-describedby={describedBy}
            onChange={() => onChange(level)} />
          <span className="difficulty-list-level">
            <span id={levelId + '-label'}>{DIFFICULTY_LABELS[level]}</span>
            {description && <span className="difficulty-level-description" id={levelId + '-description'}>{description}</span>}
          </span>
          <span className="difficulty-list-stats" id={levelId + '-stats'} aria-busy={loading}>
            {loading ? <span>Loading results…</span> : <>
              <span>{statistics.get(level)?.solved ?? 0} solved</span>
              <span aria-label={averageTime(level) === '–' ? 'No average time yet' : `Average time ${averageTime(level)}`}>
                Avg {averageTime(level)}
              </span>
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
          <strong>{DIFFICULTY_LABELS[selected]}</strong>
          <small>{index + 1} of {levels.length}</small>
          {selectedDescription && <span className="difficulty-level-description">{selectedDescription}</span>}
        </div>
        <IconButton type="button" aria-label="Increase difficulty"
          aria-describedby={`${id}-value`} disabled={disabled || index >= levels.length - 1} onClick={() => move(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </IconButton>
      </div>
      <dl className="difficulty-selection-stats" aria-label={`${DIFFICULTY_LABELS[selected]} results`} aria-busy={loading}>
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
