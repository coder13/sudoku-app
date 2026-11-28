import { PlayActionsButton } from './PlayActionsButton'
import { IconButton } from './Button'
import { type CSSProperties, useMemo, useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { shortcutLabel, shortcutStore } from '../sudoku/shortcuts'
import { PuzzleHistoryActions } from './PuzzleHistoryActions'
import { DigitSelector } from './DigitSelector'
import { mergeRefs } from './merge-refs'
import { usePlayLayoutAnchors } from './play-layout-anchors'
import { useControlsPanelResize } from './useControlsPanelResize'
import { ControlModeActions } from './ControlModeActions'
import type { ControlsProps } from './ControlsTypes'
export type { ControlsProps } from './ControlsTypes'

export function Controls({ digits, tools, history, actions, layout }: ControlsProps) {
  const layoutAnchors = usePlayLayoutAnchors()
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const { mobile, controlsRoot, resizeHandleProps } = useControlsPanelResize({
    compact: layout.compact,
    workspaceRoot: layoutAnchors?.workspace,
    draft: layout.draft,
    inputSize: layout.inputSize,
    panelHeight: layout.panelHeight,
    setPanelHeight: layout.setPanelHeight,
    beginResize: layout.beginResize,
    pencil: digits.pencil,
    candidateLayout: layout.advancedModes.candidateLayout,
  })
  const controlsRef = useMemo(() => mergeRefs(controlsRoot, layoutAnchors?.controls), [layoutAnchors])
  const editsDisabled = layout.disabled || tools.chainDrawing
  const historyDisabled = history.historyDisabled ?? layout.disabled
  return (
    <section
      ref={controlsRef}
      className={`surface controls${layout.compact ? ' compact-controls' : ''}`}
      aria-label="Sudoku controls"
      data-grid-click-away-controls
      style={{ '--controls-height': `${layout.panelHeight}px`, '--input-size': `${layout.inputSize}px` } as CSSProperties}
    >
      {!layout.compact && (
        <button className="resize-handle" {...resizeHandleProps}>
          <span />
        </button>
      )}

      <div className="controls-content">
        <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
          <PuzzleHistoryActions
            undo={history.undo}
            redo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            disabled={historyDisabled}
          />
          {actions.onCheck && (
            <IconButton className="puzzle-check-button" onClick={actions.onCheck} disabled={editsDisabled} aria-label="Check puzzle" title="Check puzzle">
              <Check size={20} />
            </IconButton>
          )}
          {actions.onActions ? (
            <div className="controls-actions-wrap">
              <PlayActionsButton
                ref={actions.actionsButtonRef}
                mobile={Boolean(layout.compact)}
                open={Boolean(actions.actionsOpen)}
                title={`Actions (${shortcutLabel(shortcuts.actions)})`}
                disabled={layout.disabled}
                aria-keyshortcuts={shortcutLabel(shortcuts.actions)}
                onClick={actions.onActions}
              />
              {actions.actionsMenu}
            </div>
          ) : (
            actions.reserveSolvingSlots && <span className="controls-actions-space" aria-hidden="true" />
          )}
          {actions.inputTools}
        </div>

        <DigitSelector digits={digits} tools={tools} layout={layout} />

        <ControlModeActions
          digits={digits}
          tools={tools}
          layout={layout}
          mobile={mobile}
          showColorButton={!layout.compact || !actions.onActions}
        />
      </div>
    </section>
  )
}
