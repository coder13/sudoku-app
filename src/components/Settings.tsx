import { type CSSProperties, useId } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, Highlighter, Lightbulb, Minus, PanelsTopLeft, PenTool, Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { DIGITS, type ErrorMode } from '../sudoku/game'
import { CELL_REFERENCE_LABELS, type CellReferenceStyle } from '../sudoku/hints'
import {
  gridTextScalePercentage, INPUT_SIZE_STEP, MAX_GRID_TEXT_SCALE, MAX_INPUT_SIZE, MIN_GRID_TEXT_SCALE, MIN_INPUT_SIZE,
  stepGridTextScale,
  type AdvancedModes, type AppearancePreferences, type CandidateHighlightStyle, type ColorMode,
  type HighlightPreferences, type ThemeId, type WorkspaceMode,
} from '../sudoku/preferences'
import { THEME_OPTIONS, themePreview } from '../sudoku/themes'
import { resetDesktopPanelLayout } from './DesktopDockLayout'
import { Modal } from './Modal'

export type SettingsSection = 'appearance' | 'input' | 'highlighting' | 'solving' | 'hints'
type Section = SettingsSection

const sections: { id: Section; label: string; description: string; icon: typeof Eye }[] = [
  { id: 'appearance', label: 'Look & feel', description: 'Theme, size, and grid layout', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'highlighting', label: 'Highlighting', description: 'Cells, digits, and candidates', icon: Highlighter },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
]
const screenLabels: Record<Section, string> = {
  appearance: 'Look & feel',
  input: 'Input controls',
  highlighting: 'Highlighting',
  solving: 'Solving style',
  hints: 'Hints',
}

const candidateStyles: { id: CandidateHighlightStyle; label: string; description: string }[] = [
  { id: 'text', label: 'Candidate color', description: 'Change only the matching candidate’s color.' },
  { id: 'spotlight', label: 'Candidate spot', description: 'Add a small background behind the matching candidate.' },
  { id: 'cell', label: 'Cell tint', description: 'Tint every cell that contains the matching candidate.' },
  { id: 'outline', label: 'Cell outline', description: 'Outline every cell that contains the matching candidate.' },
]

export function HighlightSettings({ highlighting, setHighlighting }: {
  highlighting: HighlightPreferences
  setHighlighting: (highlighting: HighlightPreferences) => void
}) {
  return (
    <div className="settings-section mobile-title-duplicate">
      <h3>Highlighting</h3>
      <p className="settings-intro">Choose what follows the active cell or selected digit.</p>
      <div className="advanced-options">
        <fieldset>
          <legend>Automatic highlights</legend>
          <label className="advanced-toggle">
            <input type="checkbox" checked={highlighting.relatedCells}
              onChange={(event) => setHighlighting({ ...highlighting, relatedCells: event.target.checked })} />
            <span><strong>Related cells</strong><small>Highlight the cells that share a house with the active cell.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={highlighting.matchingDigits}
              onChange={(event) => setHighlighting({ ...highlighting, matchingDigits: event.target.checked })} />
            <span><strong>Matching digits</strong><small>Highlight every cell containing the active digit.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={highlighting.matchingCandidates}
              onChange={(event) => setHighlighting({ ...highlighting, matchingCandidates: event.target.checked })} />
            <span><strong>Matching candidates</strong><small>Highlight candidates matching the active digit.</small></span>
          </label>
        </fieldset>
        <fieldset className="highlight-style-options" disabled={!highlighting.matchingCandidates}>
          <legend>Candidate highlight style</legend>
          {candidateStyles.map((style) => (
            <label key={style.id}>
              <input type="radio" name="candidate-highlight-style" value={style.id}
                checked={highlighting.candidateStyle === style.id}
                onChange={() => setHighlighting({ ...highlighting, candidateStyle: style.id })} />
              <span><strong>{style.label}</strong><small>{style.description}</small></span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}
const screenIds = new Set<Section>(Object.keys(screenLabels) as Section[])

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && screenIds.has(value as Section)
}

export function ThemePreview({ theme, mode }: { theme: ThemeId; mode: 'light' | 'dark' }) {
  const preview = themePreview(theme, mode)
  return (
    <span className="theme-preview" style={{ background: preview.background, borderColor: preview.border }} aria-hidden="true">
      {preview.colors.map((color, index) => <i key={`${index}-${color}`} style={{ background: color }} />)}
    </span>
  )
}

export function ThemeSettings({ appearance, setAppearance }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
}) {
  const colorModeName = `color-mode-${useId()}`
  return (
    <div className="settings-section theme-settings">
      <h3>Theme</h3>
      <p className="settings-intro">Choose how the app looks in light and dark mode.</p>
      <fieldset className="theme-mode-setting">
        <legend>Appearance</legend>
        <div className="theme-mode-options">
          {(['system', 'light', 'dark'] as ColorMode[]).map((mode) => (
            <label key={mode}>
              <input type="radio" name={colorModeName} value={mode} checked={appearance.colorMode === mode}
                onChange={() => setAppearance({ ...appearance, colorMode: mode })} />
              <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
            </label>
          ))}
        </div>
        <small>System follows your device’s light or dark preference automatically.</small>
      </fieldset>
      <div className="theme-palette-settings">
        <label className="settings-select theme-select">
          <strong>Light theme</strong>
          <ThemePreview theme={appearance.lightTheme} mode="light" />
          <select aria-label="Light theme" value={appearance.lightTheme}
            onChange={(event) => setAppearance({ ...appearance, lightTheme: event.target.value as ThemeId })}>
            {THEME_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="settings-select theme-select">
          <strong>Dark theme</strong>
          <ThemePreview theme={appearance.darkTheme} mode="dark" />
          <select aria-label="Dark theme" value={appearance.darkTheme}
            onChange={(event) => setAppearance({ ...appearance, darkTheme: event.target.value as ThemeId })}>
            {THEME_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

export function SizeSettings({ appearance, setAppearance, inputSize, setInputSize, workspaceMode }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  inputSize: number
  setInputSize: (size: number) => void
  workspaceMode: WorkspaceMode
}) {
  return (
    <div className="settings-section size-settings">
      <h3>Size & layout</h3>
      <p className="settings-intro">Adjust puzzle text, digit buttons, and the input panel.</p>
      <div className="setting-row-heading grid-text-size-setting">
        <span><strong>Puzzle text size</strong><small>Adjust digits and candidates in the Sudoku grid.</small></span>
        <div className="size-stepper" role="group" aria-label="Puzzle text size">
          <button className="icon-button" aria-label="Decrease puzzle text size"
            disabled={appearance.gridTextScale <= MIN_GRID_TEXT_SCALE}
            onClick={() => setAppearance({
              ...appearance,
              gridTextScale: stepGridTextScale(appearance.gridTextScale, -1),
            })}><Minus size={18} /></button>
          <output aria-label="Puzzle text size percentage">{gridTextScalePercentage(appearance.gridTextScale)}%</output>
          <button className="icon-button" aria-label="Increase puzzle text size"
            disabled={appearance.gridTextScale >= MAX_GRID_TEXT_SCALE}
            onClick={() => setAppearance({
              ...appearance,
              gridTextScale: stepGridTextScale(appearance.gridTextScale, 1),
            })}><Plus size={18} /></button>
        </div>
      </div>
      <div className="input-size-setting">
        <div className="setting-row-heading"><span><strong>Digit size</strong><small>Preview the digit buttons at their current size.</small></span>
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
      {workspaceMode === 'advanced' && <div className="desktop-layout-setting">
        <span className="settings-menu-icon"><PanelsTopLeft size={20} /></span>
        <span><strong>Advanced panel layout</strong><small>Restore the default positions and sizes for every named panel.</small></span>
        <button className="button secondary" onClick={resetDesktopPanelLayout}>Reset</button>
      </div>}
    </div>
  )
}

export function GuideSetting({ appearance, setAppearance, heading = true }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  heading?: boolean
}) {
  return (
    <div className="settings-section guide-settings">
      {heading && <h3>Grid</h3>}
      <label className="appearance-toggle">
        <input type="checkbox" checked={appearance.showGuides}
          onChange={(event) => setAppearance({ ...appearance, showGuides: event.target.checked })} />
        <span className="settings-menu-icon" aria-hidden="true">
          {appearance.showGuides ? <Eye size={20} /> : <EyeOff size={20} />}
        </span>
        <span><strong>Row and column guides</strong><small>Show the 1–9 labels around the Sudoku grid.</small></span>
      </label>
    </div>
  )
}

export function AppearanceSettings({ appearance, setAppearance, inputSize, setInputSize, workspaceMode, setWorkspaceMode }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  inputSize: number
  setInputSize: (size: number) => void
  workspaceMode: WorkspaceMode
  setWorkspaceMode?: (mode: WorkspaceMode) => void
}) {
  return (
    <div className="appearance-flat-settings">
      {setWorkspaceMode && <div className="settings-section workspace-mode-settings">
        <h3>Workspace</h3>
        <p className="settings-intro">Choose a focused layout or a full desktop workspace.</p>
        <fieldset className="workspace-mode-options">
          <legend className="sr-only">Workspace mode</legend>
          <label>
            <input type="radio" name="workspace-mode" value="standard" checked={workspaceMode === 'standard'}
              onChange={() => setWorkspaceMode('standard')} />
            <span><strong>Standard</strong><small>Keep the puzzle and input controls in a fixed, uncluttered layout.</small></span>
          </label>
          <label>
            <input type="radio" name="workspace-mode" value="advanced" checked={workspaceMode === 'advanced'}
              onChange={() => setWorkspaceMode('advanced')} />
            <span><strong>Advanced</strong><small>Use a full desktop workspace with named, movable, resizable panels and additional puzzle data.</small></span>
          </label>
        </fieldset>
      </div>}
      <ThemeSettings appearance={appearance} setAppearance={setAppearance} />
      <GuideSetting appearance={appearance} setAppearance={setAppearance} />
      <SizeSettings appearance={appearance} setAppearance={setAppearance}
        inputSize={inputSize} setInputSize={setInputSize} workspaceMode={workspaceMode} />
    </div>
  )
}

const cellReferenceDescriptions: Record<CellReferenceStyle, string> = {
  automatic: 'Use concise references for Hard, Unfair, and Extreme techniques.',
  concise: 'Show cells as r1c6.',
  verbose: 'Show cells as row 1, column 6.',
}
const cellReferenceStyles = Object.keys(CELL_REFERENCE_LABELS) as CellReferenceStyle[]

export function GeneralSettings({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft,
  cellReferenceStyle, setCellReferenceStyle,
}: {
  section: Exclude<Section, 'appearance' | 'highlighting'>
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  draft: boolean
  cellReferenceStyle: CellReferenceStyle
  setCellReferenceStyle: (style: CellReferenceStyle) => void
}) {
  const cellReferenceGroup = useId()
  if (section === 'input') {
    return (
      <div className="settings-section mobile-title-duplicate">
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
              <span><strong>Center and corner</strong><small>Choose whether candidates appear in the center or corners.</small></span>
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
      <div className="settings-section mobile-title-duplicate">
        <h3>Solving style</h3>
        <p className="settings-intro">Choose how the app responds while you solve.</p>
        <div className="advanced-options">
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.autoGenerateCandidates}
              onChange={(event) => setAdvancedModes({ ...advancedModes, autoGenerateCandidates: event.target.checked })} />
            <span><strong>Automatically generate candidates</strong><small>Add every valid candidate when you start or open a puzzle.</small></span>
          </label>
          {!draft ? (
            <label className="advanced-select settings-select">
              <span><strong>Error display</strong><small>Choose when mistakes are highlighted.</small></span>
              <select value={errorMode} onChange={(event) => setErrorMode(event.target.value as ErrorMode)}>
                <option value="all">Flag all errors immediately</option>
                <option value="incorrect">Flag incorrect digits immediately</option>
                <option value="none">Don’t flag errors</option>
              </select>
            </label>
          ) : (
            <div className="settings-placeholder"><SlidersHorizontal size={20} /><span><strong>Error display</strong><small>Error options become available while solving a puzzle.</small></span></div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section mobile-title-duplicate">
      <h3>Hints</h3>
      <div className="advanced-options">
        <fieldset>
          <legend>Cell references</legend>
          {cellReferenceStyles.map((style) => (
            <label key={style}>
              <input type="radio" name={cellReferenceGroup} value={style} checked={cellReferenceStyle === style}
                onChange={() => setCellReferenceStyle(style)} />
              <span><strong>{CELL_REFERENCE_LABELS[style]}</strong><small>{cellReferenceDescriptions[style]}</small></span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

type SettingsProps = {
  close: () => void
  section?: SettingsSection | null
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  highlighting: HighlightPreferences
  setHighlighting: (highlighting: HighlightPreferences) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  inputSize: number
  setInputSize: (size: number) => void
  draft: boolean
  cellReferenceStyle: CellReferenceStyle
  setCellReferenceStyle: (style: CellReferenceStyle) => void
  workspaceMode: WorkspaceMode
  setWorkspaceMode?: (mode: WorkspaceMode) => void
}

export function Settings({
  close, section = null, advancedModes, setAdvancedModes, appearance, setAppearance, highlighting, setHighlighting, errorMode, setErrorMode,
  inputSize, setInputSize, draft, cellReferenceStyle, setCellReferenceStyle, workspaceMode, setWorkspaceMode,
}: SettingsProps) {
  function exitSettings(callback?: () => void) {
    close()
    callback?.()
  }

  function renderGeneral(currentSection: Exclude<Section, 'appearance' | 'highlighting'>) {
    return <GeneralSettings section={currentSection} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
      errorMode={errorMode} setErrorMode={setErrorMode} draft={draft}
      cellReferenceStyle={cellReferenceStyle} setCellReferenceStyle={setCellReferenceStyle} />
  }

  function renderSection(screen: Section) {
    if (screen === 'appearance') {
      return <AppearanceSettings appearance={appearance} setAppearance={setAppearance} inputSize={inputSize}
        setInputSize={setInputSize} workspaceMode={workspaceMode} setWorkspaceMode={setWorkspaceMode} />
    }
    if (screen === 'highlighting') {
      return <HighlightSettings highlighting={highlighting} setHighlighting={setHighlighting} />
    }
    return renderGeneral(screen)
  }

  return (
    <Modal title={section ? screenLabels[section] : 'Settings'} onClose={() => exitSettings()}
      className={`settings-dialog ${section ? 'settings-subscreen' : ''}`}
      leading={section ? (
        <Link to="/settings" className="icon-button settings-header-back" aria-label="Back to Settings">
          <ChevronLeft size={21} />
        </Link>
      ) : undefined}>
      <div className="settings-desktop">
        <nav className="settings-tabs" aria-label="Settings sections">
          {sections.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.id} to="/settings/$section" params={{ section: item.id }}>
                <Icon size={18} /><span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="settings-panel">
          {section ? renderSection(section) : <div className="settings-overview"><h3>Settings</h3><p>Choose a section to configure the app.</p></div>}
        </div>
      </div>

      <div className="settings-mobile">
        {section === null ? (
          <nav className="settings-mobile-menu" aria-label="Settings sections">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.id} to="/settings/$section" params={{ section: item.id }}>
                  <span className="settings-menu-icon"><Icon size={20} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ChevronRight size={19} />
                </Link>
              )
            })}
          </nav>
        ) : (
          <div className="settings-mobile-section">{renderSection(section)}</div>
        )}
      </div>
    </Modal>
  )
}
