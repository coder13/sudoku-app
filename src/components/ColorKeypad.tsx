import { useSyncExternalStore } from 'react'
import { ArrowUpDown, Eraser } from 'lucide-react'
import { alternateColorShade, COLORS, COLOR_FAMILIES, type ColorTarget } from '../sudoku/game'
import { shortcutLabel, shortcutStore } from '../sudoku/shortcuts'
import { Button } from './Button'
import { ColorTargetPicker } from './CellColorPalette'
import { colorToneStyle } from './color-tone'
import { PuzzleKeypad } from './PuzzleKeypad'

export type ColorKeypadProps = {
  selectedColor: number | null
  target: ColorTarget
  disabled: boolean
  onSelectColor: (color: number) => void
  onSwitchShade: () => void
  onTarget: (target: ColorTarget) => void
  onErase: () => void
}

/** Present the color choices and the controls that only apply while choosing a color. */
export function ColorKeypad({ selectedColor, target, disabled, onSelectColor, onSwitchShade, onTarget, onErase }: ColorKeypadProps) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const darkColors = selectedColor !== null && selectedColor > COLOR_FAMILIES.length
  const choices = COLOR_FAMILIES.map((_, index) => index + 1 + (darkColors ? COLOR_FAMILIES.length : 0))
  const alternate = selectedColor === null ? null : alternateColorShade(selectedColor)

  return (
    <div className="keypad-stack">
      <PuzzleKeypad variant="palette" label={target === 'candidate' ? 'Candidate colors' : 'Cell colors'}>
        {choices.map((color) => {
          const selected = selectedColor === color
          return (
            <button
              type="button"
              key={color}
              className={`key tone-key ${selected ? 'selected-key' : ''}`}
              style={colorToneStyle(color)}
              aria-label={COLORS[color - 1]}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectColor(color)}
            >
              <span className="swatch" />
            </button>
          )
        })}
      </PuzzleKeypad>
      <ColorTargetPicker target={target} disabled={disabled} onTarget={onTarget} />
      <Button
        type="button"
        className="color-shade-switch"
        title={`Switch color shade (${shortcutLabel(shortcuts.switchColorShade)})`}
        aria-keyshortcuts={shortcutLabel(shortcuts.switchColorShade)}
        disabled={disabled || alternate === null}
        onClick={onSwitchShade}
      >
        <ArrowUpDown size={15} aria-hidden="true" /> Switch shade <kbd aria-hidden="true">{shortcutLabel(shortcuts.switchColorShade)}</kbd>
      </Button>
      {target === 'candidate' && (
        <Button
          type="button"
          className="candidate-color-eraser"
          aria-label="Erase candidate color"
          aria-pressed={selectedColor === 0}
          aria-keyshortcuts="0 Delete Backspace"
          disabled={disabled}
          onClick={onErase}
        >
          <Eraser size={15} aria-hidden="true" /> Erase
        </Button>
      )}
    </div>
  )
}
