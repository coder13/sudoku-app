import {
  Check, Delete, Frame, Hash, Layers2, Palette, Redo2, ScanLine, Undo2, WandSparkles,
} from 'lucide-react'
import { COLORS, DIGITS, type Mode } from '../sudoku/game'

const MODES = [
  { id: 'value', label: 'Digit', key: 'N', icon: Hash },
  { id: 'center', label: 'Center', key: 'C', icon: ScanLine },
  { id: 'corner', label: 'Corner', key: 'X', icon: Frame },
  { id: 'color', label: 'Color', key: 'B', icon: Palette },
] as const

export type Feedback = { text: string; tone: 'error' | 'success' | 'neutral' }

type Props = {
  mode: Mode
  setMode: (mode: Mode) => void
  values: string
  multi: boolean
  toggleMulti: () => void
  input: (digit: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  check: () => void
  notes: () => void
  disabled: boolean
  busy: boolean
  draft: boolean
  feedback: Feedback | null
}

export function Controls(props: Props) {
  const choices = props.mode === 'color' ? COLORS.map((_, i) => i + 1) : DIGITS
  const counts = Array(10).fill(0) as number[]
  for (const value of props.values) counts[Number(value)]++

  return (
    <section className="surface controls" aria-labelledby="controls-heading">
      <div className={`controls-heading ${props.draft ? 'draft-controls' : ''}`}>
        <h2 id="controls-heading">Controls</h2>
        <div className="control-modes">
          {!props.draft && (
            <div className="modes" role="group" aria-label="Input mode">
              {MODES.map(({ id, label, key, icon: Icon }) => (
                <button key={id} type="button" aria-pressed={props.mode === id} aria-keyshortcuts={key} title={`${label} (${key})`}
                  disabled={props.disabled} onClick={() => props.setMode(id)}>
                  <Icon size={16} aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
          )}
          <button className="icon-button multi-button" title="Select multiple cells" aria-label="Select multiple cells" aria-pressed={props.multi} onClick={props.toggleMulti} disabled={props.disabled}><Layers2 size={18} /></button>
        </div>
      </div>

      <div className={`keypad ${props.mode === 'color' ? 'palette' : ''}`} role="group" aria-label={props.mode === 'color' ? 'Cell colors' : 'Number pad'}>
        {choices.map((digit) => (
          <button type="button" key={digit} className={`key ${props.mode === 'color' ? `tone-key color-${digit}` : ''} ${!props.draft && props.mode === 'value' && counts[digit] === 9 ? 'all-placed' : ''}`}
            aria-label={props.mode === 'color' ? COLORS[digit - 1] : `Enter ${digit}`} disabled={props.disabled} onClick={() => props.input(digit)}>
            {props.mode === 'color' ? <span className="swatch" /> : <span>{digit}</span>}
          </button>
        ))}
        <button type="button" className="key mobile-erase" aria-label="Erase" disabled={props.disabled} onClick={() => props.input(0)}><Delete size={20} /></button>
      </div>

      <div className="edit-actions" role="group" aria-label="Edit puzzle">
        <button className="button quiet" onClick={props.undo} disabled={props.disabled || !props.canUndo} aria-label="Undo"><Undo2 size={17} /><span>Undo</span></button>
        <button className="button quiet" onClick={props.redo} disabled={props.disabled || !props.canRedo} aria-label="Redo"><Redo2 size={17} /><span>Redo</span></button>
        <button className="button quiet desktop-erase" onClick={() => props.input(0)} disabled={props.disabled} aria-label="Erase"><Delete size={17} /><span>Erase</span></button>
      </div>

      <div className="verify-actions" role="group" aria-label="Puzzle checks">
        {!props.draft && <button className="button secondary notes-action" onClick={props.notes} disabled={props.disabled || props.busy}><WandSparkles size={16} /> Auto notes</button>}
        <button className="button soft check-action" onClick={props.check} disabled={props.disabled || props.busy}><Check size={18} /> {props.draft ? 'Validate puzzle' : 'Check puzzle'}</button>
      </div>
      <div className={`control-feedback ${props.feedback?.tone ?? ''}`} role="status">
        {props.feedback?.text}
      </div>
    </section>
  )
}
