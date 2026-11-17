import {
  type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode, type Ref, type SetStateAction,
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import { ArrowUpDown, Check, Delete, Eraser, Highlighter, Layers2, ListChecks, Palette, Pencil, Redo2, Undo2 } from 'lucide-react'
import { alternateColorShade, COLORS, COLOR_FAMILIES, DIGITS, type ColorTarget, type Mode } from '../sudoku/game'
import type { AdvancedModes } from '../sudoku/preferences'
import { shortcutLabel, shortcutStore } from '../sudoku/shortcuts'
import { ColorTargetPicker } from './CellColorPalette'
import { MOBILE_LAYOUT_QUERY } from './mobile-layout'

type Props = {
  mode: Mode
  pencil: boolean
  togglePencil: () => void
  candidateKind: 'center' | 'corner'
  setCandidateKind: (kind: 'center' | 'corner') => void
  advancedModes: AdvancedModes
  colorMode: boolean
  toggleColorMode: () => void
  onOpenColors?: () => void
  colorsActive?: boolean
  colorTarget: ColorTarget
  setColorTarget: (target: ColorTarget) => void
  onSwitchShade: () => void
  eraseMode: boolean
  toggleEraseMode: () => void
  highlightMode: boolean
  toggleHighlightMode: () => void
  selectedDigit: number | null
  hasCellSelection: boolean
  values: string
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
  multi: boolean
  toggleMulti: () => void
}

export function Controls(props: Props) {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [mobile, setMobile] = useState(false)
  const [panelBounds, setPanelBounds] = useState({ min: 250, max: 420 })
  const drag = useRef<{ y: number; height: number } | null>(null)
  const editsDisabled = props.disabled || props.chainDrawing
  const colors = !props.chainDrawing && props.mode === 'color'
  const candidateColors = colors && props.colorTarget === 'candidate'
  const darkColors = props.selectedDigit !== null && props.selectedDigit > COLOR_FAMILIES.length
  const choices = colors ? COLOR_FAMILIES.map((_, index) => index + 1 + (darkColors ? COLOR_FAMILIES.length : 0)) : DIGITS
  const alternate = props.selectedDigit === null ? null : alternateColorShade(props.selectedDigit)
  const counts = Array(10).fill(0) as number[]
  for (const value of props.values) counts[Number(value)]++

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

  return (
    <section className={`surface controls${props.compact ? ' compact-controls' : ''}`} aria-label="Sudoku controls"
      style={{ '--controls-height': `${props.panelHeight}px`, '--input-size': `${props.inputSize}px` } as CSSProperties}>
      {!props.compact && <button className="resize-handle" aria-label="Resize input panel" role="separator" aria-orientation="horizontal"
        aria-valuemin={panelBounds.min} aria-valuemax={panelBounds.max} aria-valuenow={props.panelHeight}
        onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}><span /></button>}

      <div className="controls-content">
          <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
            <button className="icon-button history-button" onClick={props.undo} disabled={editsDisabled || !props.canUndo} aria-label="Undo" title="Undo"><Undo2 size={18} /></button>
            <button className="icon-button history-button" onClick={props.redo} disabled={editsDisabled || !props.canRedo} aria-label="Redo" title="Redo"><Redo2 size={18} /></button>
            {props.onCheck && <button className="icon-button puzzle-check-button" onClick={props.onCheck} disabled={editsDisabled}
              aria-label="Check puzzle" title="Check puzzle"><Check size={20} /></button>}
            {props.onActions && (
              <div className="controls-actions-wrap">
                <button type="button" ref={props.actionsButtonRef} className="icon-button actions-key"
                  aria-label="Actions" title={`Actions (${shortcutLabel(shortcuts.actions)})`} disabled={props.disabled} aria-expanded={props.actionsOpen}
                  aria-keyshortcuts={shortcutLabel(shortcuts.actions)}
                  aria-controls={props.actionsOpen ? (props.compact ? 'mobile-actions-menu' : 'input-actions-menu') : undefined}
                  aria-haspopup={props.compact ? 'dialog' : undefined} onClick={props.onActions}>
                  <ListChecks size={20} aria-hidden="true" />
                </button>
                {props.actionsMenu}
              </div>
            )}
          </div>

          <div className="keypad-stack">
            {!props.draft && props.pencil && props.advancedModes.candidateLayout === 'center-corner' && (
              <div className="input-switch" role="group" aria-label="Candidate position">
                <button aria-pressed={props.candidateKind === 'center'} disabled={editsDisabled} onClick={() => props.setCandidateKind('center')}>Center</button>
                <button aria-pressed={props.candidateKind === 'corner'} disabled={editsDisabled} onClick={() => props.setCandidateKind('corner')}>Corner</button>
              </div>
            )}
            {colors && <ColorTargetPicker target={props.colorTarget} disabled={props.disabled} onTarget={props.setColorTarget} />}
            <div className={`keypad ${colors ? 'palette' : ''}`} role="group" aria-label={candidateColors ? 'Candidate colors' : colors ? 'Cell colors' : 'Digit pad'}>
              {choices.map((digit) => {
                const armed = props.selectedDigit === digit
                const digitLabel = props.chainDrawing ? `${armed ? 'Clear highlight for' : 'Highlight'} ${digit}`
                  : `${props.hasCellSelection ? 'Enter' : armed ? 'Deselect' : 'Select'} ${digit}`
                return (
                  <button type="button" key={digit}
                    className={`key ${colors ? `tone-key color-${digit}` : ''} ${!props.draft && !colors && counts[digit] === 9 ? 'all-placed' : ''} ${armed ? 'selected-key' : ''}`}
                    aria-label={colors ? COLORS[digit - 1] : digitLabel}
                    aria-keyshortcuts={colors ? digit <= 9 ? `${digit}` : undefined : `${props.chainDrawing ? `${digit} ` : ''}Shift+${digit} F${digit}`}
                    aria-pressed={armed} disabled={props.disabled}
                    onClick={() => props.input(digit)}>
                    {colors ? <span className="swatch" /> : <span>{digit}</span>}
                  </button>
                )
              })}
            </div>
            {colors && <button type="button" className="button secondary color-shade-switch"
              title={`Switch color shade (${shortcutLabel(shortcuts.switchColorShade)})`}
              aria-keyshortcuts={shortcutLabel(shortcuts.switchColorShade)}
              disabled={props.disabled || alternate === null} onClick={props.onSwitchShade}>
              <ArrowUpDown size={15} aria-hidden="true" /> Switch shade <kbd aria-hidden="true">{shortcutLabel(shortcuts.switchColorShade)}</kbd>
            </button>}
            {candidateColors && <button type="button" className="button secondary candidate-color-eraser"
              aria-label="Erase candidate color" aria-pressed={props.selectedDigit === 0} aria-keyshortcuts="0 Delete Backspace"
              disabled={props.disabled} onClick={() => props.input(0)}><Eraser size={15} aria-hidden="true" /> Erase</button>}
          </div>

          <div className="side-actions right-actions" role="group" aria-label="Input modes">
            {!props.draft && (
              <button className="icon-button pencil-button" title={`Pencil mode (${shortcutLabel(shortcuts.pencilMode)}) · Drag with a mouse and a chosen digit to add or remove candidates · Cmd+1–9 or Ctrl+1–9 toggles candidates in selected cells`} aria-label="Pencil mode"
                aria-pressed={props.pencil && !props.colorMode} aria-keyshortcuts={shortcutLabel(shortcuts.pencilMode)} onClick={props.togglePencil} disabled={editsDisabled}>
                <Pencil size={18} />
              </button>
            )}
            {!props.draft && (
              <button className="icon-button highlight-mode-button"
                title={props.chainDrawing ? `Clear digit highlight (${shortcutLabel(shortcuts.highlightMode)})` : `Highlight mode (${shortcutLabel(shortcuts.highlightMode)}) · edits selected cells`}
                aria-label={props.chainDrawing ? 'Clear digit highlight' : 'Highlight mode'}
                aria-pressed={props.chainDrawing ? undefined : props.highlightMode} aria-keyshortcuts={shortcutLabel(shortcuts.highlightMode)}
                onClick={props.chainDrawing ? () => props.input(0) : props.toggleHighlightMode}
                disabled={props.disabled || (props.chainDrawing && props.selectedDigit === null)}>
                <Highlighter size={18} />
              </button>
            )}
            {!props.draft && (props.advancedModes.colorsEnabled || props.onOpenColors) && (
              <button className="icon-button color-mode-button" title={`${props.onOpenColors ? 'Colors' : 'Color mode'} (${shortcutLabel(shortcuts.colorMode)})`}
                aria-label={props.onOpenColors ? 'Open colors panel' : 'Color mode'}
                aria-pressed={props.colorMode || props.colorsActive || false} aria-keyshortcuts={shortcutLabel(shortcuts.colorMode)}
                onClick={props.onOpenColors ?? props.toggleColorMode} disabled={props.onOpenColors ? props.disabled : editsDisabled}>
                <Palette size={18} />
              </button>
            )}
            {!props.draft && (props.compact || mobile || props.advancedModes.multiSelectButton) && (
              <button className="icon-button multi-select-button" onClick={props.toggleMulti} disabled={editsDisabled}
                aria-label="Multi-select" title="Multi-select" aria-pressed={props.multi}>
                <Layers2 size={18} />
              </button>
            )}
            <button className="icon-button erase-mode-button" onClick={props.toggleEraseMode} disabled={editsDisabled}
              aria-label="Erase mode" title={`Erase mode (${shortcutLabel(shortcuts.eraseMode)})`}
              aria-keyshortcuts={shortcutLabel(shortcuts.eraseMode)} aria-pressed={props.eraseMode}><Delete size={18} /></button>
          </div>
      </div>

    </section>
  )
}
