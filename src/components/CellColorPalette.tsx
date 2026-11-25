import { Button } from './Button'
import { ArrowUpDown, Check, Eraser, Link2 } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { alternateColorShade, COLORS, COLOR_FAMILIES, type ColorTarget } from '../sudoku/game'
import { COLOR_GROUP_CONTINUATION_ENABLED } from '../sudoku/feature-flags'
import { shortcutLabel, shortcutStore } from '../sudoku/shortcuts'

type Props = {
  target: ColorTarget
  onTarget: (target: ColorTarget) => void
  brush: number | null
  hasColors: boolean
  disabled: boolean
  onColor: (color: number) => void
  onSwitchShade: () => void
  onStop: () => void
  onClear: () => void
  canContinueGroup: boolean
  groupMessage?: string
  onContinueGroup: () => void
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
  return <div className="color-picker">
    <div className="cell-color-swatches" role="group" aria-label="Color shades">
      {['Light', 'Dark'].map((shade, row) => <div className="color-shade-row" key={shade}>
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
  </div>
}

export function CellColorPalette({ target, onTarget, brush, hasColors, disabled, onColor, onSwitchShade, onStop, onClear,
  canContinueGroup, groupMessage, onContinueGroup }: Props) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const shadeKey = shortcutLabel(shortcuts.switchColorShade)
  const alternate = brush === null ? null : alternateColorShade(brush)
  return (
    <section className="cell-color-palette" aria-label="Coloring">
      <ColorSwatches brush={brush} disabled={disabled} onColor={onColor} />
      <ColorTargetPicker target={target} onTarget={onTarget} disabled={disabled} />
      <div className="cell-color-actions">
        <Button type="button" className="color-shade-switch" aria-label="Switch shade" aria-keyshortcuts={shadeKey}
          disabled={disabled || alternate === null}
          title={alternate === null ? 'Choose a color first' : `Switch to ${COLORS[alternate - 1].toLowerCase()} (${shadeKey})`}
          onClick={onSwitchShade}><ArrowUpDown size={15} aria-hidden="true" /></Button>
        <Button type="button" aria-pressed={brush === 0} aria-label={`Erase ${target} color`}
          disabled={disabled} onClick={() => onColor(0)}><Eraser size={15} aria-hidden="true" /> Erase</Button>
        <Button type="button" disabled={disabled || !hasColors}
          onClick={onClear}>Clear {target} colors</Button>
        {brush !== null && <Button type="button" title="Stop coloring (Esc)"
          aria-label="Stop coloring" aria-keyshortcuts="Escape" onClick={onStop}>Done</Button>}
      </div>
      {COLOR_GROUP_CONTINUATION_ENABLED && <div className="color-link-tools">
        {groupMessage && <p className="color-link-message" aria-live="polite">{groupMessage}</p>}
        <Button type="button" className="color-strong-links" disabled={disabled || !canContinueGroup}
          title="Follow strong links from your starting mark, keeping its color pair and existing shades."
          onClick={onContinueGroup}><Link2 size={16} aria-hidden="true" /> Continue this group</Button>
      </div>}
    </section>
  )
}
