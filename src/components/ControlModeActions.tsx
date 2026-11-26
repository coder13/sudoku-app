import { Button, IconButton } from './Button'
import { candidateCount } from '../sudoku/game'
import { penPencilShortcutKeys, shortcutLabel, shortcutStore } from '../sudoku/shortcuts'
import { useSyncExternalStore } from 'react'
import { Delete, Highlighter, Layers2, ListX, Palette, Paintbrush, Pencil } from 'lucide-react'
import type { AdvancedModes } from '../sudoku/preferences'
import type { ControlsProps } from './ControlsTypes'

type Props = {
  digits: Pick<ControlsProps['digits'], 'pencil' | 'highlightedDigitMask' | 'digitHighlightMatch' | 'onDigitHighlightMatchChange'>
  tools: Pick<ControlsProps['tools'],
    | 'togglePencil' | 'colorMode' | 'toggleColorMode' | 'colorsActive'
    | 'paintCandidateGroupAvailable' | 'onPaintCandidateGroup'
    | 'clearDigitHighlightsAvailable' | 'onClearDigitHighlights'
    | 'eraseMode' | 'toggleEraseMode' | 'highlightMode' | 'toggleHighlightMode'
    | 'chainDrawing' | 'multi' | 'toggleMulti' | 'showMultiSelectButton'
  >
  layout: {
    advancedModes: Pick<AdvancedModes, 'colorsEnabled' | 'multiSelectButton'>
    compact?: boolean
    draft: boolean
    disabled: boolean
  }
  mobile: boolean
  showColorButton: boolean
}

/** Present the core input modes first, with conditional multi-digit and color actions after them. */
export function ControlModeActions({ digits, tools, layout, mobile, showColorButton }: Props) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const penPencilKeys = penPencilShortcutKeys(shortcuts).map(shortcutLabel)
  const editsDisabled = layout.disabled || tools.chainDrawing
  const highlightedDigitMask = digits.highlightedDigitMask ?? 0
  const digitHighlightMatch = digits.digitHighlightMatch ?? 'all'
  const matchLabel = digitHighlightMatch === 'all' ? 'All' : 'Any'
  const nextMatch = digitHighlightMatch === 'all' ? 'any' : 'all'
  const hasMultipleHighlights = candidateCount(highlightedDigitMask) > 1

  return (
    <div className="side-actions right-actions" role="group" aria-label="Input modes">
      <div className="right-actions-primary">
        {!layout.draft && (
          <IconButton
            className="pencil-button"
            title={`Pencil mode · Use ${penPencilKeys.join(' / ')} to cycle Pen, Pencil, and Highlight · Hold keypad digits or use Shift+digit to select a group, then tap a cell to toggle it`}
            aria-label="Pencil mode"
            aria-pressed={!tools.chainDrawing && digits.pencil && !tools.colorMode}
            onClick={tools.togglePencil}
            disabled={layout.disabled}
          >
            <Pencil size={18} />
          </IconButton>
        )}
        {!layout.draft && (
          <div className="highlight-controls">
            <IconButton
              className="highlight-mode-button"
              title={`Highlight mode (${shortcutLabel(shortcuts.highlightMode)}) · edits selected cells`}
              aria-label="Highlight mode"
              aria-pressed={!tools.chainDrawing && tools.highlightMode}
              aria-keyshortcuts={shortcutLabel(shortcuts.highlightMode)}
              onClick={tools.toggleHighlightMode}
              disabled={layout.disabled}
            >
              <Highlighter size={18} aria-hidden="true" />
            </IconButton>
          </div>
        )}
        {!layout.draft && (tools.showMultiSelectButton || layout.compact || mobile || layout.advancedModes.multiSelectButton) && (
          <IconButton
            className="multi-select-button"
            onClick={tools.toggleMulti}
            disabled={editsDisabled}
            aria-label="Multi-select"
            title="Multi-select"
            aria-pressed={tools.multi}
          >
            <Layers2 size={18} />
          </IconButton>
        )}
        <IconButton
          className="erase-mode-button"
          onClick={tools.toggleEraseMode}
          disabled={editsDisabled}
          aria-label="Erase mode"
          title={`Erase mode (${shortcutLabel(shortcuts.eraseMode)})`}
          aria-keyshortcuts={shortcutLabel(shortcuts.eraseMode)}
          aria-pressed={tools.eraseMode}
        >
          <Delete size={18} />
        </IconButton>
      </div>
      <div className="right-actions-secondary">
        {tools.clearDigitHighlightsAvailable && hasMultipleHighlights && tools.onClearDigitHighlights && (
          <IconButton
            className="clear-digit-highlights-button"
            title="Clear digit highlights"
            aria-label="Clear digit highlights"
            onClick={tools.onClearDigitHighlights}
            disabled={editsDisabled}
          >
            <ListX size={18} />
          </IconButton>
        )}
        {layout.compact && tools.paintCandidateGroupAvailable && tools.onPaintCandidateGroup && (
          <IconButton
            className="candidate-group-paint-button"
            title="Paint selected candidate digits"
            aria-label="Paint selected candidate digits"
            onClick={tools.onPaintCandidateGroup}
            disabled={editsDisabled}
          >
            <Paintbrush size={18} />
          </IconButton>
        )}
        {!layout.draft && showColorButton && layout.advancedModes.colorsEnabled && tools.toggleColorMode && (
          <IconButton
            className="color-mode-button"
            title={`Colors or target mode (${shortcutLabel(shortcuts.colorMode)})`}
            aria-label={`Colors or target mode (${shortcutLabel(shortcuts.colorMode)})`}
            aria-pressed={tools.colorMode || tools.colorsActive || false}
            aria-keyshortcuts={shortcutLabel(shortcuts.colorMode)}
            onClick={tools.toggleColorMode}
            disabled={editsDisabled}
          >
            <Palette size={18} />
          </IconButton>
        )}
        {hasMultipleHighlights && !tools.chainDrawing && digits.onDigitHighlightMatchChange && (
          <Button
            className="candidate-match-button"
            data-no-panel-hold
            disabled={editsDisabled}
            aria-label={`${matchLabel} selected candidates. Switch to ${nextMatch}.`}
            onClick={() => digits.onDigitHighlightMatchChange?.(nextMatch)}
          >
            {matchLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
