import {
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  useEffect, useRef, useState,
} from 'react'
import {
  Check, Delete, Ellipsis, Layers2, Palette, Pencil, Redo2, Settings, SlidersHorizontal, Undo2,
} from 'lucide-react'
import { COLORS, DIGITS, type CandidateLayout, type ErrorMode, type Mode } from '../sudoku/game'
import { Modal } from './Modal'

export type Feedback = { text: string; tone: 'error' | 'success' | 'neutral' }

type Props = {
  mode: Mode
  pencil: boolean
  togglePencil: () => void
  candidateKind: 'center' | 'corner'
  setCandidateKind: (kind: 'center' | 'corner') => void
  advancedModes: { candidateLayout: CandidateLayout; colorsEnabled: boolean; multiSelectButton: boolean }
  setAdvancedModes: (modes: { candidateLayout: CandidateLayout; colorsEnabled: boolean; multiSelectButton: boolean }) => void
  advancedOpen: boolean
  setAdvancedOpen: (open: boolean) => void
  colorMode: boolean
  toggleColorMode: () => void
  selectedDigit: number | null
  hasCellSelection: boolean
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  values: string
  multi: boolean
  toggleMulti: () => void
  manage: () => void
  input: (digit: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  check: () => void
  disabled: boolean
  busy: boolean
  draft: boolean
  feedback: Feedback | null
}

export function Controls(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [panelHeight, setPanelHeight] = useState(280)
  const [panelBounds, setPanelBounds] = useState({ min: 250, max: 420 })
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  function checkPuzzle() {
    setMenuOpen(false)
    props.check()
  }

  function openAdvanced() {
    setMenuOpen(false)
    props.setAdvancedOpen(true)
  }

  function toggleMulti() {
    setMenuOpen(false)
    props.toggleMulti()
  }

  function openPuzzleOptions() {
    setMenuOpen(false)
    props.manage()
  }

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
    <>
      <section className="surface controls" aria-label="Sudoku controls"
        style={{ '--controls-height': `${panelHeight}px` } as CSSProperties}>
        {mobile && (
          <button className="resize-handle" aria-label="Resize input panel" role="separator" aria-orientation="horizontal"
            aria-valuemin={panelBounds.min} aria-valuemax={panelBounds.max} aria-valuenow={panelHeight}
            onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize}
            onKeyDown={resizeWithKeyboard}><span /></button>
        )}

        <div className="control-overflow" ref={menuRef}>
          <button ref={menuButtonRef} className="icon-button control-menu-trigger" title="More actions" aria-label="More actions"
            aria-expanded={menuOpen} aria-controls="control-menu" onClick={() => setMenuOpen((open) => !open)} disabled={props.disabled}>
            <Ellipsis size={19} />
          </button>
          {menuOpen && (
            <div className="control-menu" id="control-menu">
              <button onClick={checkPuzzle} disabled={props.busy}><Check size={17} /> {props.draft ? 'Validate puzzle' : 'Check puzzle'}</button>
              {(mobile || props.advancedModes.multiSelectButton) && (
                <button onClick={toggleMulti} aria-pressed={props.multi}><Layers2 size={17} /> Multi-select {props.multi ? 'on' : 'off'}</button>
              )}
              <button onClick={openPuzzleOptions}><Settings size={17} /> Puzzle options</button>
              <button onClick={openAdvanced}><SlidersHorizontal size={17} /> Input settings</button>
            </div>
          )}
        </div>

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

      {props.advancedOpen && (
        <Modal title="Input settings" onClose={() => props.setAdvancedOpen(false)}>
          <div className="advanced-options">
            <fieldset>
              <legend>Candidate layout</legend>
              <label>
                <input type="radio" name="candidate-layout" value="grid" checked={props.advancedModes.candidateLayout === 'grid'}
                  onChange={() => props.setAdvancedModes({ ...props.advancedModes, candidateLayout: 'grid' })} />
                <span><strong>Grid</strong><small>Place every candidate in its fixed position in a 3×3 grid.</small></span>
              </label>
              <label>
                <input type="radio" name="candidate-layout" value="center-corner" checked={props.advancedModes.candidateLayout === 'center-corner'}
                  onChange={() => props.setAdvancedModes({ ...props.advancedModes, candidateLayout: 'center-corner' })} />
                <span><strong>Center and corner</strong><small>Choose whether pencil marks go in the center or corners.</small></span>
              </label>
            </fieldset>
            <label className="advanced-toggle">
              <input type="checkbox" checked={props.advancedModes.colorsEnabled}
                onChange={(event) => props.setAdvancedModes({ ...props.advancedModes, colorsEnabled: event.target.checked })} />
              <span><strong>Enable Color tab</strong><small>Add cell coloring to the input controls.</small></span>
            </label>
            <label className="advanced-toggle">
              <input type="checkbox" checked={props.advancedModes.multiSelectButton}
                onChange={(event) => props.setAdvancedModes({ ...props.advancedModes, multiSelectButton: event.target.checked })} />
              <span><strong>Show Multi-select button</strong><small>Desktop users can always use Shift and Ctrl/⌘ to select multiple cells.</small></span>
            </label>
            {!props.draft && (
              <label className="advanced-select" htmlFor="advanced-error-mode">
                <span><strong>Error display</strong><small>Choose when mistakes are highlighted.</small></span>
                <select id="advanced-error-mode" value={props.errorMode} disabled={props.disabled}
                  onChange={(event) => props.setErrorMode(event.target.value as ErrorMode)}>
                  <option value="all">Flag all errors immediately</option>
                  <option value="incorrect">Flag incorrect digits immediately</option>
                  <option value="none">Don’t flag errors</option>
                </select>
              </label>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
