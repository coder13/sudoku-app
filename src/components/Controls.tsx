import {
  type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect, useRef, useState,
} from 'react'
import { Delete, Palette, Pencil, Redo2, Undo2 } from 'lucide-react'
import { COLORS, DIGITS, type Mode } from '../sudoku/game'
import type { AdvancedModes } from '../sudoku/preferences'

export type Feedback = { text: string; tone: 'error' | 'success' | 'neutral' }

type Props = {
  mode: Mode
  pencil: boolean
  togglePencil: () => void
  candidateKind: 'center' | 'corner'
  setCandidateKind: (kind: 'center' | 'corner') => void
  advancedModes: AdvancedModes
  colorMode: boolean
  toggleColorMode: () => void
  eraseMode: boolean
  toggleEraseMode: () => void
  selectedDigit: number | null
  hasCellSelection: boolean
  values: string
  input: (digit: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  disabled: boolean
  draft: boolean
  inputSize: number
  panelHeight: number
  setPanelHeight: Dispatch<SetStateAction<number>>
  beginResize: () => void
  feedback: Feedback | null
}

export function Controls(props: Props) {
  const [mobile, setMobile] = useState(false)
  const [panelBounds, setPanelBounds] = useState({ min: 250, max: 420 })
  const drag = useRef<{ y: number; height: number } | null>(null)
  const choices = props.mode === 'color' ? COLORS.map((_, i) => i + 1) : DIGITS
  const counts = Array(10).fill(0) as number[]
  for (const value of props.values) counts[Number(value)]++

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
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
  }, [props.advancedModes.candidateLayout, props.draft, props.inputSize, props.pencil, props.setPanelHeight])

  useEffect(() => {
    if (!mobile) return
    document.documentElement.style.setProperty('--mobile-controls-height', `${props.panelHeight}px`)
  }, [mobile, props.panelHeight])

  useEffect(() => {
    const clamped = Math.min(panelBounds.max, Math.max(panelBounds.min, props.panelHeight))
    if (clamped !== props.panelHeight) props.setPanelHeight(clamped)
  }, [panelBounds, props.panelHeight, props.setPanelHeight])

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
    <section className="surface controls" aria-label="Sudoku controls"
      style={{ '--controls-height': `${props.panelHeight}px`, '--input-size': `${props.inputSize}px` } as CSSProperties}>
      <button className="resize-handle" aria-label="Resize input panel" role="separator" aria-orientation="horizontal"
        aria-valuemin={panelBounds.min} aria-valuemax={panelBounds.max} aria-valuenow={props.panelHeight}
        onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}><span /></button>

      <div className="controls-content">
          <div className="side-actions left-actions" role="group" aria-label="History actions">
            <button className="icon-button" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo" title="Undo"><Undo2 size={18} /></button>
            <button className="icon-button" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo" title="Redo"><Redo2 size={18} /></button>
          </div>

          <div className="keypad-stack">
            {!props.draft && props.pencil && props.advancedModes.candidateLayout === 'center-corner' && (
              <div className="candidate-kind" role="group" aria-label="Candidate position">
                <button aria-pressed={props.candidateKind === 'center'} onClick={() => props.setCandidateKind('center')}>Center</button>
                <button aria-pressed={props.candidateKind === 'corner'} onClick={() => props.setCandidateKind('corner')}>Corner</button>
              </div>
            )}
            <div className={`keypad ${props.mode === 'color' ? 'palette' : ''}`} role="group" aria-label={props.mode === 'color' ? 'Cell colors' : 'Number pad'}>
              {choices.map((digit) => {
                const armed = !props.hasCellSelection && props.selectedDigit === digit
                return (
                  <button type="button" key={digit}
                    className={`key ${props.mode === 'color' ? `tone-key color-${digit}` : ''} ${!props.draft && props.mode === 'value' && counts[digit] === 9 ? 'all-placed' : ''} ${armed ? 'selected-key' : ''}`}
                    aria-label={props.mode === 'color' ? COLORS[digit - 1] : `${props.hasCellSelection ? 'Enter' : armed ? 'Deselect' : 'Select'} ${digit}`}
                    aria-pressed={armed} disabled={props.disabled} onClick={() => props.input(digit)}>
                    {props.mode === 'color' ? <span className="swatch" /> : <span>{digit}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="side-actions right-actions" role="group" aria-label="Input modes">
            {!props.draft && (
              <button className="icon-button pencil-button" title="Pencil mode" aria-label="Pencil mode"
                aria-pressed={props.pencil && !props.colorMode} aria-keyshortcuts="P" onClick={props.togglePencil} disabled={props.disabled}>
                <Pencil size={18} />
              </button>
            )}
            {!props.draft && props.advancedModes.colorsEnabled && (
              <button className="icon-button color-mode-button" title="Color mode" aria-label="Color mode"
                aria-pressed={props.colorMode} aria-keyshortcuts="B" onClick={props.toggleColorMode} disabled={props.disabled}>
                <Palette size={18} />
              </button>
            )}
            <button className="icon-button erase-mode-button" onClick={props.toggleEraseMode} disabled={props.disabled}
              aria-label="Erase mode" title="Erase mode" aria-pressed={props.eraseMode}><Delete size={18} /></button>
          </div>
      </div>

      <div className={`control-feedback ${props.feedback?.tone ?? ''}`} role="status">
        {props.feedback?.text}
      </div>
    </section>
  )
}
