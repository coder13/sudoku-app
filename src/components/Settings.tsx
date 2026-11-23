import { Button, IconButton, iconButtonClassName } from './Button'
import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, EyeOff, Highlighter, Keyboard, Layers2, Lightbulb, Minus, Monitor, Palette, PanelsTopLeft, PenTool, Pin, Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { MAX_APP_TEXT_ZOOM, MIN_APP_TEXT_ZOOM, stepAppTextZoom } from '../sudoku/app-text-zoom'
import { CHAIN_COLORS, type ChainColorPair } from '../sudoku/chain-sketch'
import { type ErrorMode } from '../sudoku/game'
import { CELL_REFERENCE_LABELS, type CellReferenceStyle } from '../sudoku/hints'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { PINNABLE_ACTIONS, type PinnedAction } from '../sudoku/pinned-actions'
import {
  CANDIDATE_TEXT_SIZES, gridTextScalePercentage, INPUT_SIZE_STEP, MAX_GRID_TEXT_SCALE, MAX_INPUT_SIZE, MIN_GRID_TEXT_SCALE, MIN_INPUT_SIZE,
  PUZZLE_BORDER_WIDTHS, stepGridTextScale,
  type AdvancedModes, type AppearancePreferences, type HighlightPreferences, type ThemeId, type WorkspaceMode,
} from '../sudoku/preferences'
import { syncStepTitles, type SyncStep } from '../sudoku/sync-steps'
import { THEME_OPTIONS, themePreview } from '../sudoku/themes'
import { resetDesktopPanelLayout } from './DesktopDockLayout'
import { ChainSwatches } from './ChainsPanel'
import { DeviceSyncSettings } from './DeviceSyncSettings'
import { KeyboardShortcutSettings } from './KeyboardShortcutSettings'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'
import { VariantPreview } from './VariantPreview'
import { useExperimentalMode, usePlayPreference } from './usePlayPreference'

export type SettingsSection = 'appearance' | 'input' | 'puzzle-buttons' | 'highlighting' | 'chain-colors' | 'solving' | 'hints' | 'shortcuts' | 'device-sync'
type Section = SettingsSection
type GeneralSection = Exclude<Section, 'device-sync' | 'shortcuts' | 'appearance' | 'puzzle-buttons' | 'highlighting' | 'chain-colors'>

const sections: { id: Section; label: string; description: string; icon: typeof Eye }[] = [
  { id: 'appearance', label: 'Look & feel', description: 'Theme, grid labels, and sizing', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'puzzle-buttons', label: 'Puzzle buttons', description: 'Shortcuts pinned below the grid', icon: Pin },
  { id: 'highlighting', label: 'Highlighting', description: 'Cells, digits, and candidates', icon: Highlighter },
  { id: 'chain-colors', label: 'Chain colors', description: 'Color pairs for drawing chains', icon: Palette },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'View and customize key bindings', icon: Keyboard },
  { id: 'device-sync', label: 'Device sync', description: 'Link and manage devices', icon: Monitor },
]
const screenLabels: Record<Section, string> = {
  appearance: 'Look & feel',
  input: 'Input controls',
  'puzzle-buttons': 'Puzzle buttons',
  highlighting: 'Highlighting',
  'chain-colors': 'Chain colors',
  solving: 'Solving style',
  hints: 'Hints',
  shortcuts: 'Keyboard shortcuts',
  'device-sync': 'Device sync',
}

declare module '@tanstack/history' {
  interface HistoryState {
    fromSettingsOverview?: boolean
  }
}

function SettingsNavigation({ mobile = false, overview = false }: { mobile?: boolean; overview?: boolean }) {
  return <nav className={mobile ? 'settings-mobile-menu' : 'settings-tabs'} aria-label="Settings sections">
    {sections.map(({ id, label, description, icon: Icon }) => {
      const route = id === 'device-sync' ? { to: '/settings/device-sync' as const, state: { syncBack: overview ? 'settings' as const : undefined } }
        : {
          to: '/settings/$section' as const, params: { section: id },
          state: id === 'shortcuts' ? { fromSettingsOverview: overview } : undefined,
        }
      return <Link key={id} {...route}>
        {mobile ? <>
          <span className="settings-menu-icon"><Icon size={20} /></span>
          <span><strong>{label}</strong><small>{description}</small></span>
          <ChevronRight size={19} />
        </> : <><Icon size={18} /><span>{label}</span></>}
      </Link>
    })}
  </nav>
}

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
            <span><strong>Matching candidates</strong><small>Highlight cells with a candidate matching the active digit.</small></span>
          </label>
        </fieldset>
        <p className="settings-intro">Press Shift+1–9 to match any selected digit or Cmd/Ctrl+1–9 with no cells selected to match all selected digits. You can also touch and hold a digit on the keypad or Shift-click it.</p>
      </div>
    </div>
  )
}
const screenIds = new Set<Section>(Object.keys(screenLabels) as Section[])

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && screenIds.has(value as Section)
}

function ChainColorSettings() {
  const [pairs, setPairs] = usePlayPreference('chainColorPairs')

  return <div className="settings-section mobile-title-duplicate">
    <h3>Chain colors</h3>
    <div className="advanced-options chain-pair-settings">
      {pairs.map((pair, index) => {
        const name = `Pair ${index + 1}`
        return <fieldset key={name}>
          <legend>{name} <ChainSwatches first={pair[0]} second={pair[1]} /></legend>
          {(['First color', 'Second color'] as const).map((label, slot) => (
            <label key={label} className="advanced-select settings-select">
              <strong>{label}</strong>
              <SelectControl aria-label={`${name} ${label.toLowerCase()}`} value={pair[slot]}
                onChange={event => {
                  const color = CHAIN_COLORS.find(option => option === event.target.value)
                  if (!color) return
                  setPairs(current => current.map((currentPair, pairIndex): ChainColorPair => pairIndex !== index
                    ? currentPair : slot === 0 ? [color, currentPair[1]] : [currentPair[0], color]))
                }}>
                {CHAIN_COLORS.map(color => <option key={color} value={color} disabled={color === pair[1 - slot]}>{color}</option>)}
              </SelectControl>
            </label>
          ))}
        </fieldset>
      })}
    </div>
  </div>
}


function PuzzleButtonSettings() {
  const [pinned, setPinned] = usePlayPreference('pinnedActions')
  const ordered = [
    ...pinned.map(id => PINNABLE_ACTIONS.find(action => action.id === id))
      .filter((action): action is typeof PINNABLE_ACTIONS[number] => action !== undefined),
    ...PINNABLE_ACTIONS.filter(action => !pinned.includes(action.id)),
  ]

  function move(id: PinnedAction, direction: -1 | 1) {
    setPinned(current => {
      const index = current.indexOf(id)
      if (index < 0 || index + direction < 0 || index + direction >= current.length) return current
      const next = [...current]
      ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
      return next
    })
  }

  return <div className="settings-section mobile-title-duplicate">
    <h3>Puzzle buttons</h3>
    <p className="settings-intro">Pin buttons to the bottom of your puzzle card. Choose their order with the arrows. Unpinned actions stay in the menus.</p>
    <div className="pinned-action-settings" aria-label="Puzzle footer buttons">
      {ordered.map(({ id, label, description }) => {
        const index = pinned.indexOf(id)
        return <div className="pinned-action-row" key={id}>
          <label className="advanced-toggle">
            <input type="checkbox" checked={index !== -1}
              onChange={event => setPinned(current => event.target.checked
                ? current.includes(id) ? current : [...current, id]
                : current.filter(action => action !== id))} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>
          {index !== -1 && <div className="pinned-action-reorder" role="group" aria-label={'Order for ' + label}>
            <span className="pinned-action-order" aria-label={'Position ' + (index + 1)}>{index + 1}</span>
            <IconButton variant="quiet" aria-label={'Move ' + label + ' up'} disabled={index === 0}
              onClick={() => move(id, -1)}><ArrowUp size={17} /></IconButton>
            <IconButton variant="quiet" aria-label={'Move ' + label + ' down'} disabled={index === pinned.length - 1}
              onClick={() => move(id, 1)}><ArrowDown size={17} /></IconButton>
          </div>}
        </div>
      })}
    </div>
  </div>
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
  const flatAppearanceId = useId()
  return (
    <div className="settings-section theme-settings">
      <h3>Themes</h3>
      <p className="settings-intro">Choose a palette for each color mode.</p>
      <div className="theme-palette-settings">
        <label className="settings-select theme-select">
          <strong>Light theme</strong>
          <ThemePreview theme={appearance.lightTheme} mode="light" />
          <SelectControl aria-label="Light theme" value={appearance.lightTheme}
            onChange={(event) => setAppearance({ ...appearance, lightTheme: event.target.value as ThemeId })}>
            {THEME_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </SelectControl>
        </label>
        <label className="settings-select theme-select">
          <strong>Dark theme</strong>
          <ThemePreview theme={appearance.darkTheme} mode="dark" />
          <SelectControl aria-label="Dark theme" value={appearance.darkTheme}
            onChange={(event) => setAppearance({ ...appearance, darkTheme: event.target.value as ThemeId })}>
            {THEME_OPTIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </SelectControl>
        </label>
      </div>
      <label className="appearance-toggle">
        <input type="checkbox" checked={appearance.flatAppearance} aria-labelledby={flatAppearanceId}
          aria-describedby={`${flatAppearanceId}-description`}
          onChange={(event) => setAppearance({ ...appearance, flatAppearance: event.target.checked })} />
        <span className="settings-menu-icon" aria-hidden="true"><Layers2 size={20} /></span>
        <span><strong id={flatAppearanceId}>Flat appearance</strong>
          <small id={`${flatAppearanceId}-description`}>Remove shadows and simplify the keypad in all themes.</small></span>
      </label>
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
      <div className="setting-row-heading text-size-setting">
        <span><strong>App text size</strong><small>Scale all text, including grid and keypad digits.</small></span>
        <div className="size-stepper" role="group" aria-label="App text size">
          <IconButton aria-label="Decrease app text size"
            disabled={appearance.appTextZoom <= MIN_APP_TEXT_ZOOM}
            onClick={() => setAppearance({
              ...appearance,
              appTextZoom: stepAppTextZoom(appearance.appTextZoom, -1),
            })}><Minus size={18} /></IconButton>
          <output aria-label="App text size percentage">{appearance.appTextZoom}%</output>
          <IconButton aria-label="Increase app text size"
            disabled={appearance.appTextZoom >= MAX_APP_TEXT_ZOOM}
            onClick={() => setAppearance({
              ...appearance,
              appTextZoom: stepAppTextZoom(appearance.appTextZoom, 1),
            })}><Plus size={18} /></IconButton>
        </div>
      </div>
      <GuideSetting appearance={appearance} setAppearance={setAppearance} heading={false} />
      <label className="settings-select settings-select-inline">
        <strong>Puzzle border thickness</strong>
        <span className="puzzle-border-options">
          <span className="puzzle-border-preview"
            style={{ '--puzzle-border-width': appearance.puzzleBorderWidth + 'px' } as CSSProperties}>
            <VariantPreview variant="classic" />
          </span>
          <SelectControl aria-label="Puzzle border thickness" value={appearance.puzzleBorderWidth}
            onChange={event => {
              const width = Number(event.currentTarget.value)
              setAppearance({ ...appearance, puzzleBorderWidth: PUZZLE_BORDER_WIDTHS.find(option => option === width) ?? 2 })
            }}>
            {PUZZLE_BORDER_WIDTHS.map(width => <option key={width} value={width}>{width} px</option>)}
          </SelectControl>
        </span>
      </label>
      <label className="settings-select settings-select-inline">
        <span><strong>Puzzle controls position</strong><small>Place the difficulty, timer, pause button, and puzzle menu above or below the grid.</small></span>
        <SelectControl aria-label="Puzzle controls position" value={appearance.puzzleControlsPosition}
          onChange={(event) => setAppearance({ ...appearance, puzzleControlsPosition: event.target.value === 'bottom' ? 'bottom' : 'top' })}>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </SelectControl>
      </label>
      <div className="setting-row-heading text-size-setting">
        <span><strong>Puzzle text size</strong><small>Adjust digits and candidates in the Sudoku grid.</small></span>
        <div className="size-stepper" role="group" aria-label="Puzzle text size">
          <IconButton aria-label="Decrease puzzle text size"
            disabled={appearance.gridTextScale <= MIN_GRID_TEXT_SCALE}
            onClick={() => setAppearance({
              ...appearance,
              gridTextScale: stepGridTextScale(appearance.gridTextScale, -1),
            })}><Minus size={18} /></IconButton>
          <output aria-label="Puzzle text size percentage">{gridTextScalePercentage(appearance.gridTextScale)}%</output>
          <IconButton aria-label="Increase puzzle text size"
            disabled={appearance.gridTextScale >= MAX_GRID_TEXT_SCALE}
            onClick={() => setAppearance({
              ...appearance,
              gridTextScale: stepGridTextScale(appearance.gridTextScale, 1),
            })}><Plus size={18} /></IconButton>
        </div>
      </div>
      <label className="setting-row-heading">
        <span><strong>Candidate size</strong><small>Scale candidates relative to the puzzle text size.</small></span>
        <SelectControl value={appearance.candidateTextSize} onChange={(event) => {
          const candidateTextSize = CANDIDATE_TEXT_SIZES.find(size => size === Number(event.target.value))
          if (candidateTextSize) setAppearance({ ...appearance, candidateTextSize })
        }}>
          {CANDIDATE_TEXT_SIZES.map(size => <option key={size} value={size}>{size}%</option>)}
        </SelectControl>
      </label>
      <div className="input-size-setting setting-row-heading">
        <span><strong>Digit size</strong><small>Adjust the digit buttons.</small></span>
        <div className="size-stepper" role="group" aria-label="Digit size">
          <IconButton aria-label="Decrease digit size" disabled={inputSize <= MIN_INPUT_SIZE}
            onClick={() => setInputSize(Math.max(MIN_INPUT_SIZE, inputSize - INPUT_SIZE_STEP))}><Minus size={18} /></IconButton>
          <IconButton aria-label="Increase digit size" disabled={inputSize >= MAX_INPUT_SIZE}
            onClick={() => setInputSize(Math.min(MAX_INPUT_SIZE, inputSize + INPUT_SIZE_STEP))}><Plus size={18} /></IconButton>
        </div>
      </div>
      {workspaceMode === 'advanced' && <div className="desktop-layout-setting">
        <span className="settings-menu-icon"><PanelsTopLeft size={20} /></span>
        <span><strong>Advanced panel layout</strong><small>Restore the default positions and sizes for every named panel.</small></span>
        <Button onClick={resetDesktopPanelLayout}>Reset</Button>
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
    <div className={heading ? 'settings-section guide-settings' : 'guide-settings'}>
      {heading && <h3>Grid</h3>}
      <label className="appearance-toggle">
        <input type="checkbox" checked={appearance.showGuides}
          onChange={(event) => setAppearance({ ...appearance, showGuides: event.target.checked })} />
        <span className="settings-menu-icon" aria-hidden="true">
          {appearance.showGuides ? <Eye size={20} /> : <EyeOff size={20} />}
        </span>
        <span><strong>Show row and column numbers</strong><small>Display the 1–9 row and column labels around the Sudoku grid.</small></span>
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
  const workspaceModeGroup = useId()
  return (
    <div className="appearance-flat-settings">
      {setWorkspaceMode && <div className="settings-section workspace-mode-settings">
        <h3>Workspace</h3>
        <p className="settings-intro">Choose a focused layout or a full desktop workspace.</p>
        <fieldset className="workspace-mode-options">
          <legend className="sr-only">Workspace mode</legend>
          <label>
            <input type="radio" name={workspaceModeGroup} value="standard" checked={workspaceMode === 'standard'}
              onChange={() => setWorkspaceMode('standard')} />
            <span><strong>Standard</strong><small>Keep the puzzle and input controls in a fixed, uncluttered layout.</small></span>
          </label>
          <label>
            <input type="radio" name={workspaceModeGroup} value="advanced" checked={workspaceMode === 'advanced'}
              onChange={() => setWorkspaceMode('advanced')} />
            <span><strong>Advanced</strong><small>Use a full desktop workspace with named, movable, resizable panels and additional puzzle data.</small></span>
          </label>
        </fieldset>
      </div>}
      <ThemeSettings appearance={appearance} setAppearance={setAppearance} />
      <SizeSettings appearance={appearance} setAppearance={setAppearance}
        inputSize={inputSize} setInputSize={setInputSize} workspaceMode={workspaceMode} />
    </div>
  )
}

const cellReferenceDescriptions: Record<CellReferenceStyle, string> = {
  automatic: 'Use concise references for Tricky and higher techniques.',
  concise: 'Show cells as r1c6.',
  verbose: 'Show cells as row 1, column 6.',
}
const cellReferenceStyles = Object.keys(CELL_REFERENCE_LABELS) as CellReferenceStyle[]

function PuzzleTimingSettings() {
  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  return <fieldset>
    <legend>Timer and pause</legend>
    <label className="advanced-toggle">
      <input type="checkbox" checked={timing.showTimer}
        onChange={(event) => puzzleTiming.set('showTimer', event.target.checked)} />
      <span><strong>Show timer while solving</strong><small>Hide the clock during play and still see your time in the results.</small></span>
    </label>
    <label className="advanced-toggle">
      <input type="checkbox" checked={timing.showPause}
        onChange={(event) => puzzleTiming.set('showPause', event.target.checked)} />
      <span><strong>Show pause button</strong><small>Keep a pause control next to the grid.</small></span>
    </label>
    <label className="advanced-toggle">
      <input type="checkbox" checked={timing.pauseOnOpen}
        onChange={(event) => puzzleTiming.set('pauseOnOpen', event.target.checked)} />
      <span><strong>Pause on open</strong><small>Pause the puzzle when you open the app. Turn this off to reopen it as you left it.</small></span>
    </label>
    <label className="advanced-toggle">
      <input type="checkbox" checked={timing.trackTime}
        onChange={(event) => puzzleTiming.set('trackTime', event.target.checked)} />
      <span><strong>Track solve time</strong><small>Turning this off makes the current solve untimed.</small></span>
    </label>
  </fieldset>
}

export function GeneralSettings({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft,
  cellReferenceStyle, setCellReferenceStyle, onApplyPaperStyle, paperStyleApplied,
}: {
  section: GeneralSection
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  draft: boolean
  cellReferenceStyle: CellReferenceStyle
  setCellReferenceStyle: (style: CellReferenceStyle) => void
  onApplyPaperStyle?: () => void
  paperStyleApplied?: boolean
}) {
  const candidateLayoutGroup = useId()
  const cellReferenceGroup = useId()
  const [experimentalMode, setExperimentalMode] = useExperimentalMode()
  if (section === 'input') {
    return (
      <div className="settings-section mobile-title-duplicate">
        <h3>Input controls</h3>
        <div className="advanced-options input-control-options">
          <fieldset>
            <legend>Candidate layout</legend>
            <label>
              <input type="radio" name={candidateLayoutGroup} value="grid" checked={advancedModes.candidateLayout === 'grid'}
                onChange={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'grid' })} />
              <span><strong>Grid</strong><small>Use fixed positions in a 3×3 grid.</small></span>
            </label>
            <label>
              <input type="radio" name={candidateLayoutGroup} value="center-corner" checked={advancedModes.candidateLayout === 'center-corner'}
                onChange={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'center-corner' })} />
              <span><strong>Center and corner</strong><small>Place candidates in cell centers or corners.</small></span>
            </label>
          </fieldset>
          <label className="advanced-select settings-select">
            <span><strong>Keypad progress</strong><small>Choose how the keypad shows your progress for each digit.</small></span>
            <SelectControl value={advancedModes.keypadProgress}
              onChange={(event) => setAdvancedModes({ ...advancedModes, keypadProgress: event.target.value as AdvancedModes['keypadProgress'] })}>
              <option value="dim">Dim when complete</option>
              <option value="count">Show remaining count</option>
              <option value="off">Off</option>
            </SelectControl>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.colorsEnabled}
              onChange={(event) => setAdvancedModes({ ...advancedModes, colorsEnabled: event.target.checked })} />
            <span><strong>Color mode</strong><small>Add colors to cells and candidates.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.multiSelectButton}
              onChange={(event) => setAdvancedModes({ ...advancedModes, multiSelectButton: event.target.checked })} />
            <span><strong>Multi-select button</strong><small>Show the Multi-select button in the Advanced desktop workspace.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.doubleClickSingles}
              onChange={(event) => setAdvancedModes({ ...advancedModes, doubleClickSingles: event.target.checked })} />
            <span><strong>Double-click naked singles</strong><small>Place a naked single with a double-click.</small></span>
          </label>
          <p className="settings-intro">With no cell selected, tap a digit first, then tap cells to place it.</p>
        </div>
      </div>
    )
  }

  if (section === 'solving') {
    return (
      <div className="settings-section mobile-title-duplicate">
        <h3>Solving style</h3>
        <div className="advanced-options">
          <PuzzleTimingSettings />
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.autoGenerateCandidates}
              onChange={(event) => setAdvancedModes({ ...advancedModes, autoGenerateCandidates: event.target.checked })} />
            <span><strong>Automatically generate candidates</strong><small>Add candidates once per puzzle and again after a reset.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.autoRemoveCandidates}
              onChange={(event) => setAdvancedModes({ ...advancedModes, autoRemoveCandidates: event.target.checked })} />
            <span><strong>Automatically remove candidates</strong><small>Remove candidates that a digit placement rules out.</small></span>
          </label>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedModes.autoPlaceNakedSingles}
              onChange={(event) => setAdvancedModes({ ...advancedModes, autoPlaceNakedSingles: event.target.checked })} />
            <span><strong>Automatically place naked singles</strong><small>After you place a digit, also place any available naked singles.</small></span>
          </label>
          {!draft ? (
            <label className="advanced-select settings-select">
              <span><strong>Error display</strong><small>Choose when mistakes are highlighted.</small></span>
              <SelectControl value={errorMode} onChange={(event) => setErrorMode(event.target.value as ErrorMode)}>
                <option value="conflicts">Flag conflicts only</option>
                <option value="all">Flag all errors immediately</option>
                <option value="incorrect">Flag incorrect digits immediately</option>
                <option value="none">Don’t flag errors</option>
              </SelectControl>
            </label>
          ) : (
            <div className="settings-placeholder"><SlidersHorizontal size={20} /><span><strong>Error display</strong><small>Error options become available while solving a puzzle.</small></span></div>
          )}
          {onApplyPaperStyle && <div className="setting-row-heading">
            <span><strong>Paper style</strong><small>Hide the timer and turn off solving aids, error feedback, and automatic highlights.</small></span>
            <Button onClick={onApplyPaperStyle} disabled={paperStyleApplied}
              aria-label={paperStyleApplied ? 'Paper style applied' : 'Apply Paper style'}>{paperStyleApplied ? 'Applied' : 'Apply'}</Button>
          </div>}
          <label className="advanced-toggle">
            <input type="checkbox" checked={experimentalMode}
              onChange={(event) => setExperimentalMode(event.target.checked)} />
            <span><strong>Experimental mode</strong><small>Show tools in development, such as Subsets.</small></span>
          </label>
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
  syncStep?: SyncStep | null
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
  close, section = null, syncStep = null, advancedModes, setAdvancedModes, appearance, setAppearance, highlighting, setHighlighting, errorMode, setErrorMode,
  inputSize, setInputSize, draft, cellReferenceStyle, setCellReferenceStyle, workspaceMode, setWorkspaceMode,
}: SettingsProps) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { syncBack, fromSettingsOverview } = useLocation({ select: location => location.state })
  const syncing = section === 'device-sync'
  const editingShortcuts = section === 'shortcuts'
  const singlePanel = syncing || editingShortcuts
  const heading = useRef<HTMLHeadingElement>(null)
  const wasSinglePanel = useRef(false)

  useEffect(() => {
    if (singlePanel || wasSinglePanel.current) heading.current?.focus({ preventScroll: true })
    wasSinglePanel.current = singlePanel
  }, [section, singlePanel, syncStep])

  const syncParent = syncStep === null ? 'settings'
    : syncStep === 'recover' || (syncStep === 'confirm' && syncBack === 'scan') ? 'scan' : 'start'
  const syncBackLabels = { settings: 'Back to Settings', scan: 'Back to scanner', start: 'Back to Device sync' }

  function backFromSync() {
    if (canGoBack && syncBack === syncParent) router.history.back()
    else if (syncParent === 'settings') void router.navigate({ to: '/settings', replace: true })
    else if (syncParent === 'scan') void router.navigate({
      to: '/settings/device-sync/$step', params: { step: 'scan' }, replace: true,
    })
    else void router.navigate({ to: '/settings/device-sync', replace: true })
  }

  function backFromShortcuts() {
    if (canGoBack && fromSettingsOverview) router.history.back()
    else void router.navigate({ to: '/settings', replace: true })
  }

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const paperStyleApplied = !timing.showTimer && errorMode === 'none' && advancedModes.keypadProgress === 'off' &&
    !advancedModes.autoGenerateCandidates && !advancedModes.autoRemoveCandidates && !advancedModes.autoPlaceNakedSingles &&
    !advancedModes.doubleClickSingles && !highlighting.relatedCells && !highlighting.matchingDigits && !highlighting.matchingCandidates

  function applyPaperStyle() {
    setAdvancedModes({ ...advancedModes, autoGenerateCandidates: false, autoRemoveCandidates: false,
      autoPlaceNakedSingles: false, doubleClickSingles: false, keypadProgress: 'off' })
    setHighlighting({ ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false })
    setErrorMode('none')
    puzzleTiming.set('showTimer', false)
  }

  function exitSettings(callback?: () => void) {
    close()
    callback?.()
  }

  function renderGeneral(currentSection: GeneralSection) {
    return <GeneralSettings section={currentSection} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
      errorMode={errorMode} setErrorMode={setErrorMode} draft={draft}
      cellReferenceStyle={cellReferenceStyle} setCellReferenceStyle={setCellReferenceStyle}
      onApplyPaperStyle={applyPaperStyle} paperStyleApplied={paperStyleApplied} />
  }

  function renderSection(screen: Exclude<Section, 'device-sync'>) {
    if (screen === 'appearance') {
      return <AppearanceSettings appearance={appearance} setAppearance={setAppearance} inputSize={inputSize}
        setInputSize={setInputSize} workspaceMode={workspaceMode} setWorkspaceMode={setWorkspaceMode} />
    }
    if (screen === 'highlighting') {
      return <HighlightSettings highlighting={highlighting} setHighlighting={setHighlighting} />
    }
    if (screen === 'chain-colors') return <ChainColorSettings />
    if (screen === 'puzzle-buttons') return <PuzzleButtonSettings />
    if (screen === 'shortcuts') return <KeyboardShortcutSettings />
    return renderGeneral(screen)
  }

  const title = syncing && syncStep ? syncStepTitles[syncStep] : section ? screenLabels[section] : 'Settings'
  return (
    <Modal title={title} titleRef={heading} onClose={() => exitSettings()}
      className={`settings-dialog ${section ? 'settings-subscreen' : ''}`}
      leading={syncing ? (
        <IconButton className="settings-header-back"
          aria-label={syncBackLabels[syncParent]}
          onClick={backFromSync}><ChevronLeft size={21} /></IconButton>
      ) : editingShortcuts ? (
        <IconButton className="settings-header-back" aria-label="Back to Settings" onClick={backFromShortcuts}>
          <ChevronLeft size={21} />
        </IconButton>
      ) : section ? (
        <Link to="/settings" className={iconButtonClassName('secondary', 'settings-header-back')} aria-label="Back to Settings">
          <ChevronLeft size={21} />
        </Link>
      ) : undefined}>
      <div className={`settings-desktop${singlePanel ? ' settings-single-panel' : ''}`}>
        <SettingsNavigation overview={section === null} />
        <div className="settings-panel motion-screen" key={section ?? 'overview'}>
          {syncing ? <DeviceSyncSettings step={syncStep} onBack={backFromSync} />
            : section ? renderSection(section)
              : <div className="settings-overview"><h3>Settings</h3><p>Choose a section to configure the app.</p></div>}
        </div>
      </div>

      {!singlePanel && <div className="settings-mobile">
        {section === null ? (
          <SettingsNavigation mobile overview />
        ) : (
          <div className="settings-mobile-section motion-screen" key={section}>{renderSection(section)}</div>
        )}
      </div>}
    </Modal>
  )
}
