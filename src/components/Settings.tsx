import { type CSSProperties, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Lightbulb, Maximize2, Minus, PenTool, Plus, SlidersHorizontal } from 'lucide-react'
import { DIGITS, type ErrorMode } from '../sudoku/game'
import {
  INPUT_SIZE_STEP, MAX_INPUT_SIZE, MIN_INPUT_SIZE, type AdvancedModes,
} from '../sudoku/preferences'
import { Modal } from './Modal'

type Section = 'appearance' | 'input' | 'solving' | 'hints'

const sections: { id: Section; label: string; description: string; icon: typeof Eye }[] = [
  { id: 'appearance', label: 'Look & feel', description: 'Size and layout of the controls', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
]

function SettingsSection({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, inputSize, setInputSize, onResize, draft }: {
  section: Section
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  inputSize: number
  setInputSize: (size: number) => void
  onResize: () => void
  draft: boolean
}) {
  if (section === 'appearance') {
    return (
      <div className="settings-section">
        <h3>Look & feel</h3>
        <p className="settings-intro">Adjust the input controls to fit your screen and hands.</p>
        <div className="input-size-setting">
          <div className="setting-row-heading"><span><strong>Digit size</strong><small>Preview the number buttons at their current size.</small></span>
            <div className="size-stepper" role="group" aria-label="Digit size">
              <button className="icon-button" aria-label="Decrease digit size" disabled={inputSize <= MIN_INPUT_SIZE}
                onClick={() => setInputSize(Math.max(MIN_INPUT_SIZE, inputSize - INPUT_SIZE_STEP))}><Minus size={18} /></button>
              <button className="icon-button" aria-label="Increase digit size" disabled={inputSize >= MAX_INPUT_SIZE}
                onClick={() => setInputSize(Math.min(MAX_INPUT_SIZE, inputSize + INPUT_SIZE_STEP))}><Plus size={18} /></button>
            </div>
          </div>
          <div className="keypad settings-keypad-preview" aria-label="Digit size preview"
            style={{ '--preview-input-size': `${inputSize}px` } as CSSProperties}>
            {DIGITS.map((digit) => <span className="key" key={digit}>{digit}</span>)}
          </div>
        </div>
        <button className="resize-panels-option" onClick={onResize}>
          <span className="settings-menu-icon"><Maximize2 size={20} /></span>
          <span><strong>Resize panels</strong><small>Open the puzzle and drag the input panel to the height you want.</small></span>
          <ChevronRight size={19} />
        </button>
        <div className="settings-placeholder"><Eye size={20} /><span><strong>More look & feel options</strong><small>Additional appearance controls will be available here.</small></span></div>
      </div>
    )
  }

  if (section === 'input') {
    return (
      <div className="settings-section">
        <h3>Input controls</h3>
        <p className="settings-intro">Choose how digits, candidates, and selection tools work.</p>
        <div className="advanced-options">
          <fieldset>
            <legend>Candidate layout</legend>
            <label>
              <input type="radio" name="candidate-layout" value="grid" checked={advancedModes.candidateLayout === 'grid'}
                onChange={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'grid' })} />
              <span><strong>Grid</strong><small>Place every candidate in its fixed position in a 3×3 grid.</small></span>
            </label>
            <label>
              <input type="radio" name="candidate-layout" value="center-corner" checked={advancedModes.candidateLayout === 'center-corner'}
                onChange={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'center-corner' })} />
              <span><strong>Center and corner</strong><small>Choose whether pencil marks go in the center or corners.</small></span>
            </label>
          </fieldset>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.colorsEnabled}
              onChange={(event) => setAdvancedModes({ ...advancedModes, colorsEnabled: event.target.checked })} />
            <span><strong>Enable Color tab</strong><small>Add cell coloring to the input controls.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.multiSelectButton}
              onChange={(event) => setAdvancedModes({ ...advancedModes, multiSelectButton: event.target.checked })} />
            <span><strong>Show Multi-select button</strong><small>Desktop users can always use Shift and Ctrl/⌘ to select multiple cells.</small></span>
          </label>
        </div>
      </div>
    )
  }

  if (section === 'solving') {
    return (
      <div className="settings-section">
        <h3>Solving style</h3>
        <p className="settings-intro">Choose how the app responds while you solve.</p>
        {!draft ? (
          <label className="advanced-select settings-select">
            <span><strong>Error display</strong><small>Choose when mistakes are highlighted.</small></span>
            <select value={errorMode}
              onChange={(event) => setErrorMode(event.target.value as ErrorMode)}>
              <option value="all">Flag all errors immediately</option>
              <option value="incorrect">Flag incorrect digits immediately</option>
              <option value="none">Don’t flag errors</option>
            </select>
          </label>
        ) : (
          <div className="settings-placeholder"><SlidersHorizontal size={20} /><span><strong>Solving options</strong><small>These options become available while solving a puzzle.</small></span></div>
        )}
      </div>
    )
  }

  return (
    <div className="settings-section">
      <h3>Hints</h3>
      <p className="settings-intro">Control the help you receive while solving.</p>
      <div className="settings-placeholder"><Lightbulb size={20} /><span><strong>Hint options</strong><small>Hint controls will be available here when hints are added.</small></span></div>
    </div>
  )
}

export function Settings({ close, advancedModes, setAdvancedModes, errorMode, setErrorMode, inputSize, setInputSize, onResize, draft }: {
  close: () => void
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  inputSize: number
  setInputSize: (size: number) => void
  onResize: () => void
  draft: boolean
}) {
  const [section, setSection] = useState<Section>('appearance')
  const [mobileSection, setMobileSection] = useState<Section | null>(null)
  const current = sections.find((item) => item.id === mobileSection)

  return (
    <Modal title="Settings" onClose={close} className="settings-dialog">
      <div className="settings-desktop">
        <nav className="settings-tabs" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
          {sections.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} role="tab" aria-selected={section === item.id} onClick={() => setSection(item.id)}>
                <Icon size={18} /><span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="settings-panel" role="tabpanel">
          <SettingsSection section={section} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
            errorMode={errorMode} setErrorMode={setErrorMode} inputSize={inputSize} setInputSize={setInputSize}
            onResize={onResize} draft={draft} />
        </div>
      </div>

      <div className="settings-mobile">
        {mobileSection === null ? (
          <nav className="settings-mobile-menu" aria-label="Settings sections">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} onClick={() => setMobileSection(item.id)}>
                  <span className="settings-menu-icon"><Icon size={20} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ChevronRight size={19} />
                </button>
              )
            })}
          </nav>
        ) : (
          <div className="settings-mobile-section">
            <button className="settings-back" onClick={() => setMobileSection(null)}><ChevronLeft size={19} /> All settings</button>
            <span className="mobile-section-label">{current?.label}</span>
            <SettingsSection section={mobileSection} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
              errorMode={errorMode} setErrorMode={setErrorMode} inputSize={inputSize} setInputSize={setInputSize}
              onResize={onResize} draft={draft} />
          </div>
        )}
      </div>
    </Modal>
  )
}
