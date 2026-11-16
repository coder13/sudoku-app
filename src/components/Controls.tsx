import {
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
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
  feedback: Feedback | null
}

export function Controls(props: Props) {
  const [mobile, setMobile] = useState(false)
  const [panelHeight, setPanelHeight] = useState(280)
  const [panelBounds, setPanelBounds] = useState({ min: 250, max: 420 })
  const drag = useRef<{ y: number; height: number } | null>(null)
  const choices = props.mode === 'color' ? COLORS.map((_, i) => i + 1) : DIGITS
  const counts = Array(10).fill(0) as number[]
  for (const value of props.values) counts[Number(value)]++

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => {
      setMobile(query.matches)
      const min = 250
      const max = Math.min(430, Math.max(min, Math.round(window.innerHeight * .56)))
      setPanelBounds({ min, max })
      if (query.matches) {
        let saved = 0
        try { saved = Number(localStorage.getItem('sudoku-app:v1:input-panel-height')) }
        catch { /* Use the viewport-based default when preferences cannot be read. */ }
        setPanelHeight(Math.min(max, Math.max(min, Number.isFinite(saved) && saved > 0 ? saved : Math.round(window.innerHeight * .32))))
      }
    }
    update()
    query.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (!mobile) return
    document.documentElement.style.setProperty('--mobile-controls-height', `${panelHeight}px`)
    try { localStorage.setItem('sudoku-app:v1:input-panel-height', String(panelHeight)) }
    catch { /* Resizing still works for this session. */ }
  }, [mobile, panelHeight])

  function resizePanel(next: number) {
    setPanelHeight(Math.min(panelBounds.max, Math.max(panelBounds.min, Math.round(next))))
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    drag.current = { y: event.clientY, height: panelHeight }
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
    if (event.key === 'ArrowUp') resizePanel(panelHeight + 16)
    else if (event.key === 'ArrowDown') resizePanel(panelHeight - 16)
    else if (event.key === 'Home') resizePanel(panelBounds.min)
    else if (event.key === 'End') resizePanel(panelBounds.max)
    else return
    event.preventDefault()
  }

  return (
    <section className="surface controls" aria-label="Sudoku controls"
      style={{ '--controls-height': `${panelHeight}px` } as CSSProperties}>
      {mobile && (
        <button className="resize-handle" aria-label="Resize input panel" role="separator" aria-orientation="horizontal"
          aria-valuemin={panelBounds.min} aria-valuemax={panelBounds.max} aria-valuenow={panelHeight}
          onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize}
          onKeyDown={resizeWithKeyboard}><span /></button>
      )}

      <div className="controls-content">
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

          <div className="side-actions" role="group" aria-label="Input actions">
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
            <button className="icon-button" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo" title="Undo"><Undo2 size={18} /></button>
            <button className="icon-button" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo" title="Redo"><Redo2 size={18} /></button>
            <button className="icon-button" onClick={() => props.input(0)} disabled={props.disabled} aria-label="Erase" title="Erase"><Delete size={18} /></button>
          </div>
      </div>

      <div className={`control-feedback ${props.feedback?.tone ?? ''}`} role="status">
        {props.feedback?.text}
      </div>
    </section>
  )
}
