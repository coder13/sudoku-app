import { useId } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  currentDifficulty, DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS, type DifficultyPreference,
} from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import { variantDifficulties, variantDifficulty, type VariantId } from '../sudoku/variants'

export function DifficultyStepper({ value, recommended, variant, disabled = false, onChange }: {
  value: DifficultyPreference
  recommended: Difficulty
  variant?: VariantId
  disabled?: boolean
  onChange: (value: DifficultyPreference) => void
}) {
  const id = useId()
  const levels = variantDifficulties(variant).filter((level): level is Difficulty => level !== 'auto')
  const selected = variantDifficulty(variant, value === 'auto' ? recommended : value) as Difficulty
  const index = levels.indexOf(selected)
  function move(offset: number) {
    const next = levels[index + offset]
    if (!disabled && next) onChange(next)
  }

  return <fieldset className="difficulty-stepper" disabled={disabled}>
    <legend>Difficulty</legend>
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
    <p className="difficulty-stepper-description">{DIFFICULTY_DESCRIPTIONS[currentDifficulty(selected)]}</p>
    <label className="difficulty-stepper-auto">
      <input type="checkbox" checked={value === 'auto'} onChange={(event) => onChange(event.target.checked ? 'auto' : selected)} />
      Adjust difficulty automatically
    </label>
  </fieldset>
}
