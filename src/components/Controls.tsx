import type { PlayGrid } from '../sudoku/grid'
import { PlayActionsButton } from './PlayLayout'
import { Button, IconButton } from './Button'
import {
  type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode, type Ref, type SetStateAction,
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowUpDown, Check, Delete, Eraser, Highlighter, Layers2, Palette, Pencil, Redo2, Undo2 } from 'lucide-react'
import { alternateColorShade, candidateCount, COLORS, COLOR_FAMILIES, DIGITS, hasCandidate, placedDigitCounts, type ColorTarget, type Mode } from '../sudoku/game'
import type { DigitHighlightMatch } from '../sudoku/highlighting'
import type { AdvancedModes } from '../sudoku/preferences'
import { penPencilShortcutKeys, shortcutLabel, shortcutStore } from '../sudoku/shortcuts'
import { ColorTargetPicker } from './CellColorPalette'
import { CandidatePositionSwitch, PuzzleKeypad } from './PuzzleKeypad'
import { MOBILE_LAYOUT_QUERY } from './mobile-layout'
import { useTouchHold } from './useTouchHold'

type Props = {
  mode: Mode
  pencil: boolean
  togglePencil: () => void
  candidateKind: 'center' | 'corner'
  setCandidateKind: (kind: 'center' | 'corner') => void
  advancedModes: AdvancedModes
  colorMode: boolean
  toggleColorMode?: () => void
  colorsActive?: boolean
  colorTarget: ColorTarget
  setColorTarget: (target: ColorTarget) => void
  onSwitchShade: () => void
  eraseMode: boolean
  toggleEraseMode: () => void
  highlightMode: boolean
  toggleHighlightMode: () => void
  selectedDigit: number | null
  highlightedDigitMask?: number
  onToggleDigitHighlight?: (digit: number, match: DigitHighlightMatch) => void
  digitHighlightMatch?: DigitHighlightMatch
  onDigitHighlightMatchChange?: (match: DigitHighlightMatch) => void
  hasCellSelection: boolean
  values: string
  gridSize?: PlayGrid['size']
  input: (digit: number) => void
  undo: () => void
  redo: () => void
  onCheck?: () => void
  onActions?: () => void
  actionsMenu?: ReactNode
  actionsButtonRef?: Ref<HTMLButtonElement>
  actionsOpen?: boolean
  compact?: boolean
  chainDrawing?: boolean
  canUndo: boolean
  canRedo: boolean
  disabled: boolean
  draft: boolean
  inputSize: number
  panelHeight: number
  setPanelHeight: Dispatch<SetStateAction<number>>
  beginResize: () => void
  showMultiSelectButton?: boolean
  multi: boolean
  toggleMulti: () => void
}

export function Controls(props: Props) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const penPencilKeys = penPencilShortcutKeys(shortcuts).map(shortcutLabel)
  const [mobile, setMobile] = useState(false)
  const [panelBounds, setPanelBounds] = useState({ min: 250, max: 420 })
  const drag = useRef<{ y: number; height: number } | null>(null)
  const editsDisabled = props.disabled || props.chainDrawing
  const colors = !props.chainDrawing && props.mode === 'color'
  const toggleDigitHighlight = !props.disabled && !colors ? props.onToggleDigitHighlight : undefined
  const canHighlightDigits = Boolean(toggleDigitHighlight)
  const changeDigitHighlightMatch = props.onDigitHighlightMatchChange
  const highlightedDigitMask = props.highlightedDigitMask ?? 0
  const digitHighlightMatch = props.digitHighlightMatch ?? 'all'
  const matchLabel = digitHighlightMatch === 'all' ? 'All' : 'Any'
  const nextMatch = digitHighlightMatch === 'all' ? 'any' : 'all'
  const digitHold = useTouchHold(canHighlightDigits)
  const candidateColors = colors && props.colorTarget === 'candidate'
  const darkColors = props.selectedDigit !== null && props.selectedDigit > COLOR_FAMILIES.length
  const gridSize = props.gridSize ?? 9
  const choices = colors ? COLOR_FAMILIES.map((_, index) => index + 1 + (darkColors ? COLOR_FAMILIES.length : 0)) : DIGITS.slice(0, gridSize)
  const alternate = props.selectedDigit === null ? null : alternateColorShade(props.selectedDigit)
  const counts = placedDigitCounts(props.values)

  useEffect(() => {
    if (props.compact) return
    const query = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const update = () => {
      setMobile(query.matches)
      const candidateControls = !props.draft && props.pencil && props.advancedModes.candidateLayout === 'center-corner' ? 44 : 0
      const min = Math.max(210, props.inputSize + candidateControls + 42)
      const max = Math.min(430, Math.max(min, Math.round(window.innerHeight * .56)))
      setPanelBounds({ min, max })
      if (query.matches) {
        props.setPanelHeight((current) => Math.min(max, Math.max(min, current || Math.round(window.innerHeight * .32))))
      }
    }
    update()
    query.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [props.advancedModes.candidateLayout, props.compact, props.draft, props.inputSize, props.pencil, props.setPanelHeight])

  useEffect(() => {
    if (!mobile || props.compact) return
    document.documentElement.style.setProperty('--mobile-controls-height', `${props.panelHeight}px`)
  }, [mobile, props.compact, props.panelHeight])

  useEffect(() => {
    if (props.compact) return
    const clamped = Math.min(panelBounds.max, Math.max(panelBounds.min, props.panelHeight))
    if (clamped !== props.panelHeight) props.setPanelHeight(clamped)
  }, [panelBounds, props.compact, props.panelHeight, props.setPanelHeight])

  function resizePanel(next: number) {
    props.setPanelHeight(Math.min(panelBounds.max, Math.max(panelBounds.min, Math.round(next))))
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    props.beginResize()
    drag.current = { y: event.clientY, height: props.panelHeight }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function continueResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return
    resizePanel(drag.current.height + drag.current.y - event.clientY)
  }

  function finishResize(event: ReactPointerEvent<HTMLButtonElement>) {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowUp') resizePanel(props.panelHeight + 16)
    else if (event.key === 'ArrowDown') resizePanel(props.panelHeight - 16)
    else if (event.key === 'Home') resizePanel(panelBounds.min)
    else if (event.key === 'End') resizePanel(panelBounds.max)
    else return
    props.beginResize()
    event.preventDefault()
  }

  function clickDigit(event: ReactMouseEvent<HTMLButtonElement>, digit: number) {
    if (digitHold.suppressClick(event)) return
    if (toggleDigitHighlight && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      digitHold.rememberClick(event.currentTarget)
      toggleDigitHighlight(digit, event.shiftKey ? 'any' : 'all')
    } else props.input(digit)
  }

  function digitContextMenu(event: ReactMouseEvent<HTMLButtonElement>, digit: number) {
    if (!toggleDigitHighlight || digitHold.suppressContextMenu(event)) return
    if (event.ctrlKey) {
      // macOS can route Control-click through the context menu event.
      event.preventDefault()
      digitHold.rememberClick(event.currentTarget)
      toggleDigitHighlight(digit, event.shiftKey ? 'any' : 'all')
    }
  }

  return (
    <section className={`surface controls${props.compact ? ' compact-controls' : ''}`} aria-label="Sudoku controls"
      style={{ '--controls-height': `${props.panelHeight}px`, '--input-size': `${props.inputSize}px` } as CSSProperties}>
      {!props.compact && <button className="resize-handle" aria-label="Resize input panel" role="separator" aria-orientation="horizontal"
        aria-valuemin={panelBounds.min} aria-valuemax={panelBounds.max} aria-valuenow={props.panelHeight}
        onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}><span /></button>}

      <div className="controls-content">
          <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
            <IconButton className="history-button" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo" title="Undo"><Undo2 size={18} /></IconButton>
            <IconButton className="history-button" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo" title="Redo"><Redo2 size={18} /></IconButton>
            {props.onCheck && <IconButton className="puzzle-check-button" onClick={props.onCheck} disabled={editsDisabled}
              aria-label="Check puzzle" title="Check puzzle"><Check size={20} /></IconButton>}
            {props.onActions && (
              <div className="controls-actions-wrap">
                <PlayActionsButton ref={props.actionsButtonRef} mobile={Boolean(props.compact)} open={Boolean(props.actionsOpen)}
                  title={`Actions (${shortcutLabel(shortcuts.actions)})`} disabled={props.disabled}
                  aria-keyshortcuts={shortcutLabel(shortcuts.actions)} onClick={props.onActions} />
                {props.actionsMenu}
              </div>
            )}
          </div>

          <div className="keypad-stack">
            {!props.draft && props.pencil && props.advancedModes.candidateLayout === 'center-corner' && (
              <CandidatePositionSwitch position={props.candidateKind} disabled={editsDisabled} onChange={props.setCandidateKind} />
            )}
            {colors && <ColorTargetPicker target={props.colorTarget} disabled={props.disabled} onTarget={props.setColorTarget} />}
            <PuzzleKeypad variant={colors ? 'palette' : gridSize === 4 ? 'mini' : gridSize === 6 ? 'six' : undefined}
              label={candidateColors ? 'Candidate colors' : colors ? 'Cell colors' : 'Digit pad'}>
              {choices.map((digit) => {
                const highlighted = hasCandidate(highlightedDigitMask, digit)
                const singleHighlight = highlightedDigitMask === (1 << (digit - 1))
                const armed = props.selectedDigit === digit || (props.chainDrawing ? highlighted : canHighlightDigits && singleHighlight)
                const pressed = armed || (canHighlightDigits && highlighted)
                const progress = props.draft || colors ? 'off' : props.advancedModes.keypadProgress
                const remaining = Math.max(0, gridSize - counts[digit])
                const digitLabel = props.chainDrawing ? `${armed ? 'Clear highlight for' : 'Highlight'} ${digit}`
                  : `${props.hasCellSelection ? 'Enter' : armed ? 'Deselect' : 'Select'} ${digit}`
                return (
                  <button type="button" key={digit}
                    className={`key ${colors ? `tone-key color-${digit}` : ''} ${progress === 'dim' && counts[digit] === gridSize ? 'all-placed' : ''} ${pressed ? 'selected-key' : ''}`}
                    aria-label={colors ? COLORS[digit - 1] : progress === 'count' ? `${digitLabel}, ${remaining} remaining` : digitLabel}
                    aria-keyshortcuts={colors ? digit <= 9 ? `${digit}` : undefined : [
                      props.chainDrawing && digit, `Shift+${digit}`, `F${digit}`,
                      canHighlightDigits && !props.eraseMode && `Control+${digit} Meta+${digit}`,
                    ].filter(Boolean).join(' ')}
                    aria-pressed={pressed} disabled={props.disabled} data-no-panel-hold={canHighlightDigits || undefined}
                    onPointerDown={(event) => digitHold.start(event, toggleDigitHighlight && (() => toggleDigitHighlight(digit, props.compact ? digitHighlightMatch : 'all')))}
                    onPointerMove={digitHold.move}
                    onContextMenu={(event) => digitContextMenu(event, digit)} onClick={(event) => clickDigit(event, digit)}>
                    {colors ? <span className="swatch" /> : <span>{digit}</span>}
                    {progress === 'count' && <span className="key-remaining" aria-hidden="true">{remaining}</span>}
                  </button>
                )
              })}
            </PuzzleKeypad>
            {colors && <Button type="button" className="color-shade-switch"
              title={`Switch color shade (${shortcutLabel(shortcuts.switchColorShade)})`}
              aria-keyshortcuts={shortcutLabel(shortcuts.switchColorShade)}
              disabled={props.disabled || alternate === null} onClick={props.onSwitchShade}>
              <ArrowUpDown size={15} aria-hidden="true" /> Switch shade <kbd aria-hidden="true">{shortcutLabel(shortcuts.switchColorShade)}</kbd>
            </Button>}
            {candidateColors && <Button type="button" className="candidate-color-eraser"
              aria-label="Erase candidate color" aria-pressed={props.selectedDigit === 0} aria-keyshortcuts="0 Delete Backspace"
              disabled={props.disabled} onClick={() => props.input(0)}><Eraser size={15} aria-hidden="true" /> Erase</Button>}
          </div>

          <div className="side-actions right-actions" role="group" aria-label="Input modes">
            {!props.draft && (
              <IconButton className="pencil-button" title={`Pencil mode · Use ${penPencilKeys.join(' / ')} to cycle Pen, Pencil, and Highlight · Drag with a mouse and a chosen digit to add or remove candidates`} aria-label="Pencil mode"
                aria-pressed={!props.chainDrawing && props.pencil && !props.colorMode} onClick={props.togglePencil} disabled={props.disabled}>
                <Pencil size={18} />
              </IconButton>
            )}
            {!props.draft && (
              <div className="highlight-controls" data-match-control={Boolean(changeDigitHighlightMatch) || undefined}>
                <IconButton className="highlight-mode-button"
                  title={`Highlight mode (${shortcutLabel(shortcuts.highlightMode)}) · edits selected cells`}
                  aria-label="Highlight mode"
                  aria-pressed={!props.chainDrawing && props.highlightMode} aria-keyshortcuts={shortcutLabel(shortcuts.highlightMode)}
                  onClick={props.toggleHighlightMode} disabled={props.disabled}>
                  <Highlighter size={18} />
                </IconButton>
                {candidateCount(highlightedDigitMask) > 1 && !props.chainDrawing && changeDigitHighlightMatch && (
                  <Button className="candidate-match-button" data-no-panel-hold disabled={editsDisabled}
                    aria-label={`${matchLabel} selected candidates. Switch to ${nextMatch}.`}
                    onClick={() => changeDigitHighlightMatch(nextMatch)}>{matchLabel}</Button>
                )}
              </div>
            )}
            {!props.draft && !(props.compact && props.onActions) && props.advancedModes.colorsEnabled && props.toggleColorMode && (
              <IconButton className="color-mode-button" title={`Color mode (${shortcutLabel(shortcuts.colorMode)})`}
                aria-label="Color mode"
                aria-pressed={props.colorMode || props.colorsActive || false} aria-keyshortcuts={shortcutLabel(shortcuts.colorMode)}
                onClick={props.toggleColorMode} disabled={editsDisabled}>
                <Palette size={18} />
              </IconButton>
            )}
            {!props.draft && (props.showMultiSelectButton || props.compact || mobile || props.advancedModes.multiSelectButton) && (
              <IconButton className="multi-select-button" onClick={props.toggleMulti} disabled={editsDisabled}
                aria-label="Multi-select" title="Multi-select" aria-pressed={props.multi}>
                <Layers2 size={18} />
              </IconButton>
            )}
            <IconButton className="erase-mode-button" onClick={props.toggleEraseMode} disabled={editsDisabled}
              aria-label="Erase mode" title={`Erase mode (${shortcutLabel(shortcuts.eraseMode)})`}
              aria-keyshortcuts={shortcutLabel(shortcuts.eraseMode)} aria-pressed={props.eraseMode}><Delete size={18} /></IconButton>
          </div>
      </div>

    </section>
  )
}
