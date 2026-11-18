import { useId, useMemo, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DIFFICULTY_LABELS, type DifficultyPreference } from '../sudoku/difficulty'
import { difficultyStatistics } from '../sudoku/difficulty-statistics'
import type { Difficulty } from '../sudoku/engine'
import { formatTime } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { variantDifficulties, variantDifficulty, type VariantId } from '../sudoku/variants'

export function DifficultySelector({ value, recommended, variant, disabled = false, onChange }: {
  value: DifficultyPreference
  recommended: Difficulty
  variant?: VariantId
  disabled?: boolean
  onChange: (value: DifficultyPreference) => void
}) {
  const id = useId()
  const { games } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const statistics = useMemo(() => difficultyStatistics(games, variant), [games, variant])
  const levels = variantDifficulties(variant).filter((level): level is Difficulty => level !== 'auto')
  const selected = variantDifficulty(variant, value === 'auto' ? recommended : value) as Difficulty
  const index = levels.indexOf(selected)
  const selectedStats = statistics.get(selected)

  function averageTime(level: Difficulty) {
    const seconds = statistics.get(level)?.averageSeconds
    return seconds == null ? '–' : formatTime(seconds)
  }
  function move(offset: number) {
    const next = levels[index + offset]
    if (!disabled && next) onChange(next)
  }

  return <fieldset className="difficulty-selector" disabled={disabled}>
    <legend>Difficulty</legend>
    <div className="difficulty-list">
      {levels.map((level) => <label key={level}>
        <input type="radio" name={id} value={level} checked={value !== 'auto' && selected === level}
          aria-labelledby={`${id}-${level}-label`} aria-describedby={`${id}-${level}-stats`}
          onChange={() => onChange(level)} />
        <span id={`${id}-${level}-label`}>{DIFFICULTY_LABELS[level]}</span>
        <span className="difficulty-list-stats" id={`${id}-${level}-stats`}>
          <span>{statistics.get(level)?.solved ?? 0} solved</span>
          <span aria-label={averageTime(level) === '–' ? 'No average time yet' : `Average time ${averageTime(level)}`}>
            Avg {averageTime(level)}
          </span>
        </span>
      </label>)}
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
        <button type="button" className="icon-button" aria-label="Decrease difficulty"
          aria-describedby={`${id}-value`} disabled={disabled || index <= 0} onClick={() => move(-1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="difficulty-stepper-value" id={`${id}-value`} role="status" aria-live="polite" aria-atomic="true">
          <strong>{DIFFICULTY_LABELS[selected]}</strong>
          <small>{index + 1} of {levels.length}</small>
        </div>
        <button type="button" className="icon-button" aria-label="Increase difficulty"
          aria-describedby={`${id}-value`} disabled={disabled || index >= levels.length - 1} onClick={() => move(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
      <dl className="difficulty-selection-stats" aria-label={`${DIFFICULTY_LABELS[selected]} results`}>
        <div><dt>Solved</dt><dd>{selectedStats?.solved ?? 0}</dd></div>
        <div><dt>Average time</dt><dd aria-label={averageTime(selected) === '–' ? 'No average time yet' : undefined}>{averageTime(selected)}</dd></div>
      </dl>
    </div>
    <label className="difficulty-selector-auto">
      <input type="checkbox" checked={value === 'auto'} onChange={(event) => onChange(event.target.checked ? 'auto' : selected)} />
      Auto adjusts difficulty gradually
    </label>
  </fieldset>
}
