import { Check, Eraser } from 'lucide-react'
import { COLORS } from '../sudoku/game'

type Props = {
  brush: number | null
  hasColors: boolean
  disabled: boolean
  onColor: (color: number) => void
  onStop: () => void
  onClear: () => void
}

export function CellColorPalette({ brush, hasColors, disabled, onColor, onStop, onClear }: Props) {
  const instructions = disabled ? 'Cell coloring is available while playing.'
    : brush === null ? 'Pick a color, then choose cells. To color a selection, choose the cells first.'
    : brush === 0 ? 'Choose cells to erase their color.' : `Choose cells to paint ${COLORS[brush - 1].toLowerCase()}.`

  return (
    <section className="cell-color-palette" aria-label="Cell coloring">
      <p aria-live="polite">{instructions}</p>
      <div className="cell-color-swatches" role="group" aria-label="Cell colors">
        {COLORS.map((name, index) => (
          <button type="button" className={`cell-color-swatch color-${index + 1}`} key={name}
            aria-label={name} title={name} aria-pressed={brush === index + 1} disabled={disabled}
            onClick={() => onColor(index + 1)}>
            {brush === index + 1 && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="cell-color-actions">
        <button type="button" className="button secondary" aria-pressed={brush === 0} aria-label="Erase cell color"
          disabled={disabled} onClick={() => onColor(0)}><Eraser size={15} aria-hidden="true" /> Erase</button>
        <button type="button" className="button secondary" disabled={disabled || !hasColors}
          onClick={onClear}>Clear all colors</button>
        {brush !== null && <button type="button" className="button secondary" title="Stop coloring (Esc)"
          aria-label="Stop coloring" aria-keyshortcuts="Escape" onClick={onStop}>Done</button>}
      </div>
    </section>
  )
}
