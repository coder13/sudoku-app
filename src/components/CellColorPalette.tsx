import { ArrowUpDown, Check, Eraser } from 'lucide-react'
import { alternateColorShade, COLORS, COLOR_FAMILIES, type ColorTarget } from '../sudoku/game'

type Props = {
  target: ColorTarget
  onTarget: (target: ColorTarget) => void
  brush: number | null
  hasColors: boolean
  disabled: boolean
  onColor: (color: number) => void
  onStop: () => void
  onClear: () => void
}

export function ColorTargetPicker({ target, disabled, onTarget }: Pick<Props, 'target' | 'disabled' | 'onTarget'>) {
  return (
    <div className="input-switch" role="group" aria-label="Color target">
      <button type="button" aria-pressed={target === 'cell'} disabled={disabled} onClick={() => onTarget('cell')}>Cells</button>
      <button type="button" aria-pressed={target === 'candidate'} disabled={disabled} onClick={() => onTarget('candidate')}>Candidates</button>
    </div>
  )
}

export function ColorSwatches({ brush, disabled, onColor }: Pick<Props, 'brush' | 'disabled' | 'onColor'>) {
  const alternate = brush === null ? null : alternateColorShade(brush)
  return <div className="color-picker">
    <div className="cell-color-swatches" role="group" aria-label="Color shades">
      {['Light', 'Dark'].map((shade, row) => <div className="color-shade-row" key={shade}>
        <span className="color-shade-label">{shade}</span>
        {COLOR_FAMILIES.map((name, index) => {
          const color = row * COLOR_FAMILIES.length + index + 1
          const label = `${shade} ${name.toLowerCase()}`
          return <button type="button" className={`cell-color-swatch color-${color}`} key={name}
            aria-label={label} title={label} aria-pressed={brush === color} disabled={disabled}
            onClick={() => onColor(color)}>
            {brush === color && <Check size={16} aria-hidden="true" />}
          </button>
        })}
      </div>)}
    </div>
    <button type="button" className="button secondary color-shade-switch" disabled={disabled || alternate === null}
      title={alternate === null ? 'Choose a color first' : `Switch to ${COLORS[alternate - 1].toLowerCase()}`}
      onClick={() => { if (alternate !== null) onColor(alternate) }}>
      <ArrowUpDown size={15} aria-hidden="true" /> Switch shade
    </button>
  </div>
}

export function CellColorPalette({ target, onTarget, brush, hasColors, disabled, onColor, onStop, onClear }: Props) {
  const subject = target === 'cell' ? 'cells' : 'candidates'
  const instructions = disabled ? 'Coloring is available while playing.'
    : brush === null ? target === 'cell'
      ? 'Pick a color, then choose cells. You can also select cells first.'
      : 'Pick a color, then tap individual candidates.'
    : brush === 0 ? `Choose ${subject} to erase their color.` : `Choose ${subject} to paint ${COLORS[brush - 1].toLowerCase()}.`

  return (
    <section className="cell-color-palette" aria-label="Coloring">
      <ColorTargetPicker target={target} onTarget={onTarget} disabled={disabled} />
      <p aria-live="polite">{instructions}</p>
      <ColorSwatches brush={brush} disabled={disabled} onColor={onColor} />
      <p className="color-pair-help">Use light and dark shades of one color to mark the two sides of a strong link.</p>
      <div className="cell-color-actions">
        <button type="button" className="button secondary" aria-pressed={brush === 0} aria-label={`Erase ${target} color`}
          disabled={disabled} onClick={() => onColor(0)}><Eraser size={15} aria-hidden="true" /> Erase</button>
        <button type="button" className="button secondary" disabled={disabled || !hasColors}
          onClick={onClear}>Clear {target} colors</button>
        {brush !== null && <button type="button" className="button secondary" title="Stop coloring (Esc)"
          aria-label="Stop coloring" aria-keyshortcuts="Escape" onClick={onStop}>Done</button>}
      </div>
    </section>
  )
}
