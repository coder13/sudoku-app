import {
  type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode, type Ref, type SetStateAction,
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import { Check, Delete, Eraser, Highlighter, Layers2, ListChecks, Palette, Pencil, Redo2, Undo2 } from 'lucide-react'
import { COLORS, DIGITS, type ColorTarget, type Mode } from '../sudoku/game'
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
  colorTarget: ColorTarget
  setColorTarget: (target: ColorTarget) => void
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
  const colors = props.mode === 'color'
  const candidateColors = colors && props.colorTarget === 'candidate'
  const choices = colors ? COLORS.map((_, i) => i + 1) : DIGITS
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
            <button className="icon-button history-button" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo" title="Undo"><Undo2 size={18} /></button>
            <button className="icon-button history-button" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo" title="Redo"><Redo2 size={18} /></button>
            {props.onCheck && <button className="icon-button puzzle-check-button" onClick={props.onCheck} disabled={props.disabled}
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
                <button aria-pressed={props.candidateKind === 'center'} disabled={props.disabled} onClick={() => props.setCandidateKind('center')}>Center</button>
                <button aria-pressed={props.candidateKind === 'corner'} disabled={props.disabled} onClick={() => props.setCandidateKind('corner')}>Corner</button>
              </div>
            )}
            {colors && <ColorTargetPicker target={props.colorTarget} disabled={props.disabled} onTarget={props.setColorTarget} />}
            <div className={`keypad ${colors ? 'palette' : ''}`} role="group" aria-label={candidateColors ? 'Candidate colors' : colors ? 'Cell colors' : 'Digit pad'}>
              {choices.map((digit) => {
                const armed = props.selectedDigit === digit
                const digitLabel = `${props.hasCellSelection ? 'Enter' : armed ? 'Deselect' : 'Select'} ${digit}`
                return (
                  <button type="button" key={digit}
                    className={`key ${colors ? `tone-key color-${digit}` : ''} ${!props.draft && props.mode === 'value' && counts[digit] === 9 ? 'all-placed' : ''} ${armed ? 'selected-key' : ''}`}
                    aria-label={colors ? COLORS[digit - 1] : digitLabel}
                    aria-keyshortcuts={colors ? `${digit}` : `Shift+${digit} F${digit}`}
                    aria-pressed={armed} disabled={props.disabled}
                    onClick={() => props.input(digit)}>
                    {colors ? <span className="swatch" /> : <span>{digit}</span>}
                  </button>
                )
              })}
            </div>
            {candidateColors && <button type="button" className="button secondary candidate-color-eraser"
              aria-label="Erase candidate color" aria-pressed={props.selectedDigit === 0} aria-keyshortcuts="0 Delete Backspace"
              disabled={props.disabled} onClick={() => props.input(0)}><Eraser size={15} aria-hidden="true" /> Erase</button>}
          </div>

          <div className="side-actions right-actions" role="group" aria-label="Input modes">
            {!props.draft && (
              <button className="icon-button pencil-button" title={`Pencil mode (${shortcutLabel(shortcuts.pencilMode)}) · Cmd+1–9 or Ctrl+1–9 toggles candidates in selected cells`} aria-label="Pencil mode"
                aria-pressed={props.pencil && !props.colorMode} aria-keyshortcuts={shortcutLabel(shortcuts.pencilMode)} onClick={props.togglePencil} disabled={props.disabled}>
                <Pencil size={18} />
              </button>
            )}
            {!props.draft && (
              <button className="icon-button highlight-mode-button" title={`Highlight mode (${shortcutLabel(shortcuts.highlightMode)}) · edits selected cells`}
                aria-label="Highlight mode" aria-pressed={props.highlightMode} aria-keyshortcuts={shortcutLabel(shortcuts.highlightMode)}
                onClick={props.toggleHighlightMode} disabled={props.disabled}>
                <Highlighter size={18} />
              </button>
            )}
            {!props.draft && props.advancedModes.colorsEnabled && (
              <button className="icon-button color-mode-button" title={`Color mode (${shortcutLabel(shortcuts.colorMode)})`} aria-label="Color mode"
                aria-pressed={props.colorMode} aria-keyshortcuts={shortcutLabel(shortcuts.colorMode)} onClick={props.toggleColorMode} disabled={props.disabled}>
                <Palette size={18} />
              </button>
            )}
            {!props.draft && (props.compact || mobile || props.advancedModes.multiSelectButton) && (
              <button className="icon-button multi-select-button" onClick={props.toggleMulti} disabled={props.disabled}
                aria-label="Multi-select" title="Multi-select" aria-pressed={props.multi}>
                <Layers2 size={18} />
              </button>
            )}
            <button className="icon-button erase-mode-button" onClick={props.toggleEraseMode} disabled={props.disabled}
              aria-label="Erase mode" title={`Erase mode (${shortcutLabel(shortcuts.eraseMode)})`}
              aria-keyshortcuts={shortcutLabel(shortcuts.eraseMode)} aria-pressed={props.eraseMode}><Delete size={18} /></button>
          </div>
      </div>

    </section>
  )
}
