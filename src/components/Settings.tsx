import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, Lightbulb, Maximize2, Minus, PenTool, Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { DIGITS, type ErrorMode } from '../sudoku/game'
import {
  INPUT_SIZE_STEP, MAX_INPUT_SIZE, MIN_INPUT_SIZE,
  type AdvancedModes, type AppearancePreferences, type ColorMode, type ThemeId,
} from '../sudoku/preferences'
import { Modal } from './Modal'

type Section = 'appearance' | 'input' | 'solving' | 'hints'

const sections: { id: Section; label: string; description: string; icon: typeof Eye }[] = [
  { id: 'appearance', label: 'Look & feel', description: 'Theme, size, and board layout', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
]
const screenLabels: Record<Section, string> = {
  appearance: 'Look & feel',
  input: 'Input controls',
  solving: 'Solving style',
  hints: 'Hints',
}
const screenIds = new Set<Section>(Object.keys(screenLabels) as Section[])
const themeNames: Record<ThemeId, string> = { violet: 'Violet', ocean: 'Ocean', forest: 'Forest' }

function ThemeSettings({ appearance, setAppearance }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
}) {
  const colorModeName = `color-mode-${useId()}`
  return (
    <div className="settings-section theme-settings">
      <h3>Theme</h3>
      <p className="settings-intro">Choose when light and dark appearances are used, then select a palette for each.</p>
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
          <span><strong>Light theme</strong><small>Palette used when the app is light.</small></span>
          <span className={`theme-preview light ${appearance.lightTheme}`} aria-hidden="true"><i /><i /><i /></span>
          <select aria-label="Light theme" value={appearance.lightTheme}
            onChange={(event) => setAppearance({ ...appearance, lightTheme: event.target.value as ThemeId })}>
            {Object.entries(themeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="settings-select theme-select">
          <span><strong>Dark theme</strong><small>Palette used when the app is dark.</small></span>
          <span className={`theme-preview dark ${appearance.darkTheme}`} aria-hidden="true"><i /><i /><i /></span>
          <select aria-label="Dark theme" value={appearance.darkTheme}
            onChange={(event) => setAppearance({ ...appearance, darkTheme: event.target.value as ThemeId })}>
            {Object.entries(themeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

function SizeSettings({ inputSize, setInputSize, onResize }: {
  inputSize: number
  setInputSize: (size: number) => void
  onResize: () => void
}) {
  return (
    <div className="settings-section size-settings">
      <h3>Size & layout</h3>
      <p className="settings-intro">Adjust the number buttons and input panel to fit your screen and hands.</p>
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
        <span><strong>Panel size</strong><small>Open the puzzle and drag the input panel to the height you want.</small></span>
        <ChevronRight size={19} />
      </button>
    </div>
  )
}

function GuideSetting({ appearance, setAppearance, heading = true }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  heading?: boolean
}) {
  return (
    <div className="settings-section guide-settings">
      {heading && <h3>Board</h3>}
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

function AppearanceSettings({ appearance, setAppearance, inputSize, setInputSize, onResize }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  inputSize: number
  setInputSize: (size: number) => void
  onResize: () => void
}) {
  return (
    <div className="appearance-flat-settings">
      <ThemeSettings appearance={appearance} setAppearance={setAppearance} />
      <SizeSettings inputSize={inputSize} setInputSize={setInputSize} onResize={onResize} />
      <GuideSetting appearance={appearance} setAppearance={setAppearance} />
    </div>
  )
}

function GeneralSettings({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft }: {
  section: Exclude<Section, 'appearance'>
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  draft: boolean
}) {
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
      <div className="settings-section mobile-title-duplicate">
        <h3>Solving style</h3>
        <p className="settings-intro">Choose how the app responds while you solve.</p>
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
          <div className="settings-placeholder"><SlidersHorizontal size={20} /><span><strong>Solving options</strong><small>These options become available while solving a puzzle.</small></span></div>
        )}
      </div>
    )
  }

  return (
    <div className="settings-section mobile-title-duplicate">
      <h3>Hints</h3>
      <p className="settings-intro">Control the help you receive while solving.</p>
      <div className="settings-placeholder"><Lightbulb size={20} /><span><strong>Hint options</strong><small>Hint controls will be available here when hints are added.</small></span></div>
    </div>
  )
}

type SettingsProps = {
  close: () => void
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  inputSize: number
  setInputSize: (size: number) => void
  onResize: () => void
  draft: boolean
}

export function Settings({
  close, advancedModes, setAdvancedModes, appearance, setAppearance, errorMode, setErrorMode,
  inputSize, setInputSize, onResize, draft,
}: SettingsProps) {
  const [section, setSection] = useState<Section>('appearance')
  const [mobileScreens, setMobileScreens] = useState<Section[]>([])
  const mobileScreensRef = useRef<Section[]>([])
  const navigationId = useRef(`settings-${Math.random().toString(36).slice(2)}`)
  const historyEnabled = useRef(typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
  const historyInitialized = useRef(false)
  const afterClose = useRef<(() => void) | null>(null)
  const mobileScreen = mobileScreens.at(-1) ?? null
  const previousScreen = mobileScreens.at(-2) ?? null

  function setMobileStack(next: Section[]) {
    mobileScreensRef.current = next
    setMobileScreens(next)
  }

  function historyState(next: Section[]) {
    return {
      ...(window.history.state ?? {}),
      settingsNavigation: { id: navigationId.current, screens: next },
    }
  }

  useEffect(() => {
    if (!historyEnabled.current) return
    if (!historyInitialized.current) {
      window.history.pushState(historyState([]), '')
      historyInitialized.current = true
    }

    function handlePopState(event: PopStateEvent) {
      const navigation = event.state?.settingsNavigation
      if (navigation?.id === navigationId.current && Array.isArray(navigation.screens)) {
        const next = navigation.screens.filter((screen: unknown): screen is Section =>
          typeof screen === 'string' && screenIds.has(screen as Section))
        setMobileStack(next)
        return
      }
      const callback = afterClose.current
      afterClose.current = null
      close()
      callback?.()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function openMobileScreen(next: Section) {
    const stack = [...mobileScreensRef.current, next]
    setMobileStack(stack)
    if (historyEnabled.current) window.history.pushState(historyState(stack), '')
  }

  function backMobileScreen() {
    if (!mobileScreensRef.current.length) return
    if (historyEnabled.current && window.history.state?.settingsNavigation?.id === navigationId.current) {
      window.history.back()
      return
    }
    setMobileStack(mobileScreensRef.current.slice(0, -1))
  }

  function exitSettings(callback?: () => void) {
    if (historyEnabled.current && window.history.state?.settingsNavigation?.id === navigationId.current) {
      afterClose.current = callback ?? null
      window.history.go(-(mobileScreensRef.current.length + 1))
      return
    }
    close()
    callback?.()
  }

  function renderGeneral(currentSection: Exclude<Section, 'appearance'>) {
    return <GeneralSettings section={currentSection} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
      errorMode={errorMode} setErrorMode={setErrorMode} draft={draft} />
  }

  function renderMobileScreen(screen: Section) {
    if (screen === 'appearance') {
      return <AppearanceSettings appearance={appearance} setAppearance={setAppearance} inputSize={inputSize}
        setInputSize={setInputSize} onResize={() => exitSettings(onResize)} />
    }
    return renderGeneral(screen)
  }

  return (
    <Modal title={mobileScreen ? screenLabels[mobileScreen] : 'Settings'} onClose={() => exitSettings()}
      className={`settings-dialog ${mobileScreen ? 'settings-subscreen' : ''}`}
      leading={mobileScreen ? (
        <button className="icon-button settings-header-back"
          aria-label={`Back to ${previousScreen ? screenLabels[previousScreen] : 'settings'}`} onClick={backMobileScreen}>
          <ChevronLeft size={21} />
        </button>
      ) : undefined}>
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
          {section === 'appearance' ? (
            <AppearanceSettings appearance={appearance} setAppearance={setAppearance} inputSize={inputSize}
              setInputSize={setInputSize} onResize={onResize} />
          ) : renderGeneral(section)}
        </div>
      </div>

      <div className="settings-mobile">
        {mobileScreen === null ? (
          <nav className="settings-mobile-menu" aria-label="Settings sections">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} onClick={() => openMobileScreen(item.id)}>
                  <span className="settings-menu-icon"><Icon size={20} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ChevronRight size={19} />
                </button>
              )
            })}
          </nav>
        ) : (
          <div className="settings-mobile-section">{renderMobileScreen(mobileScreen)}</div>
        )}
      </div>
    </Modal>
  )
}
