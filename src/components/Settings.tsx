import { useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Lightbulb, PenTool, SlidersHorizontal } from 'lucide-react'
import type { ErrorMode } from '../sudoku/game'
import type { AdvancedModes } from '../sudoku/preferences'
import { Modal } from './Modal'

type Section = 'appearance' | 'input' | 'solving' | 'hints'

const sections: { id: Section; label: string; description: string; icon: typeof Eye }[] = [
  { id: 'appearance', label: 'Appearance', description: 'How the board and app look', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
]

function SettingsSection({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft }: {
  section: Section
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  draft: boolean
}) {
  if (section === 'appearance') {
    return (
      <div className="settings-section">
        <h3>Appearance</h3>
        <p className="settings-intro">Control how Sudoku looks on this device.</p>
        <div className="settings-placeholder"><Eye size={20} /><span><strong>Appearance options</strong><small>More appearance controls will be available here.</small></span></div>
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

export function Settings({ close, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft }: {
  close: () => void
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
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
            errorMode={errorMode} setErrorMode={setErrorMode} draft={draft} />
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
              errorMode={errorMode} setErrorMode={setErrorMode} draft={draft} />
          </div>
        )}
      </div>
    </Modal>
  )
}
