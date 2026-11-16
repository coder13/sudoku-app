import { useEffect, useRef, useState } from 'react'
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
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const choices = props.mode === 'color' ? COLORS.map((_, i) => i + 1) : DIGITS
  const counts = Array(10).fill(0) as number[]
  for (const value of props.values) counts[Number(value)]++

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
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

  return (
    <>
      <section className="surface controls" aria-label="Sudoku controls">
        <div className={`controls-heading ${props.draft ? 'draft-controls' : ''}`}>
          <div className="control-modes">
            {!props.draft && (
              <button className="button quiet pencil-button" aria-pressed={props.pencil && !props.colorMode} aria-keyshortcuts="P"
                onClick={props.togglePencil} disabled={props.disabled}>
                <Pencil size={17} /><span>Pencil</span>
              </button>
            )}
            {!props.draft && props.advancedModes.colorsEnabled && (
              <button className="button quiet color-mode-button" aria-pressed={props.colorMode} aria-keyshortcuts="B"
                onClick={props.toggleColorMode} disabled={props.disabled}>
                <Palette size={17} /><span>Color</span>
              </button>
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
          </div>
          {!props.draft && props.pencil && props.advancedModes.candidateLayout === 'center-corner' && (
            <div className="candidate-kind" role="group" aria-label="Candidate position">
              <button aria-pressed={props.candidateKind === 'center'} onClick={() => props.setCandidateKind('center')}>Center</button>
              <button aria-pressed={props.candidateKind === 'corner'} onClick={() => props.setCandidateKind('corner')}>Corner</button>
            </div>
          )}
        </div>

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

        <div className="edit-actions" role="group" aria-label="Edit puzzle">
          <button className="button quiet" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo"><Undo2 size={17} /><span>Undo</span></button>
          <button className="button quiet" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo"><Redo2 size={17} /><span>Redo</span></button>
          <button className="button quiet" onClick={() => props.input(0)} disabled={props.disabled} aria-label="Erase"><Delete size={17} /><span>Erase</span></button>
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
