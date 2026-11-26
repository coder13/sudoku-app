import { useId, type CSSProperties } from 'react'
import { Eye, EyeOff, Layers2, Minus, PanelsTopLeft, Plus } from 'lucide-react'
import { Button, IconButton } from './Button'
import { MAX_APP_TEXT_ZOOM, MIN_APP_TEXT_ZOOM, stepAppTextZoom } from '../sudoku/app-text-zoom'
import {
  CANDIDATE_TEXT_SIZES, gridTextScalePercentage, INPUT_SIZE_STEP, MAX_GRID_TEXT_SCALE, MAX_INPUT_SIZE,
  MIN_GRID_TEXT_SCALE, MIN_INPUT_SIZE, PUZZLE_BORDER_WIDTHS, stepGridTextScale,
  type AppearancePreferences, type ThemeId, type WorkspaceMode,
} from '../sudoku/preferences'
import { THEME_OPTIONS, themePreview } from '../sudoku/themes'
import { SelectControl } from './SelectControl'
import { SettingOption } from './SettingOption'
import { SettingToggle } from './SettingToggle'
import { VariantPreview } from './VariantPreview'

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
      <SettingToggle className="appearance-toggle" label="Flat appearance" labelId={flatAppearanceId}
        description="Remove shadows and simplify the keypad in all themes."
        descriptionId={`${flatAppearanceId}-description`} leading={<span className="settings-menu-icon" aria-hidden="true"><Layers2 size={20} /></span>}
        checked={appearance.flatAppearance}
        onChange={flatAppearance => setAppearance({ ...appearance, flatAppearance })} />
    </div>
  )
}

export function SizeSettings({ appearance, setAppearance, inputSize, setInputSize, onResetLayout }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  inputSize: number
  setInputSize: (size: number) => void
  onResetLayout: () => void
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
      <div className="desktop-layout-setting">
        <span className="settings-menu-icon"><PanelsTopLeft size={20} /></span>
        <span><strong>Layout</strong><small>Restore default puzzle and input sizes, mobile panel order, and desktop panel positions.</small></span>
        <Button onClick={onResetLayout}>Reset layout</Button>
      </div>
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
      <SettingToggle className="appearance-toggle" label="Show row and column numbers"
        description="Display the 1–9 row and column labels around the Sudoku grid."
        leading={<span className="settings-menu-icon" aria-hidden="true">
          {appearance.showGuides ? <Eye size={20} /> : <EyeOff size={20} />}
        </span>}
        checked={appearance.showGuides} onChange={showGuides => setAppearance({ ...appearance, showGuides })} />
    </div>
  )
}

export function AppearanceSettings({ appearance, setAppearance, inputSize, setInputSize, workspaceMode, setWorkspaceMode, onResetLayout }: {
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  inputSize: number
  setInputSize: (size: number) => void
  workspaceMode: WorkspaceMode
  setWorkspaceMode?: (mode: WorkspaceMode) => void
  onResetLayout: () => void
}) {
  const workspaceModeGroup = useId()
  return (
    <div className="appearance-flat-settings">
      {setWorkspaceMode && <div className="settings-section workspace-mode-settings">
        <h3>Workspace</h3>
        <p className="settings-intro">Choose a focused layout or a full desktop workspace.</p>
        <fieldset className="workspace-mode-options">
          <legend className="sr-only">Workspace mode</legend>
          <SettingOption name={workspaceModeGroup} value="standard" label="Standard"
            description="Keep the puzzle and input controls in a fixed, uncluttered layout."
            checked={workspaceMode === 'standard'} onSelect={() => setWorkspaceMode('standard')} />
          <SettingOption name={workspaceModeGroup} value="advanced" label="Advanced"
            description="Use a full desktop workspace with named, movable, resizable panels and additional puzzle data."
            checked={workspaceMode === 'advanced'} onSelect={() => setWorkspaceMode('advanced')} />
        </fieldset>
      </div>}
      <ThemeSettings appearance={appearance} setAppearance={setAppearance} />
      <SizeSettings appearance={appearance} setAppearance={setAppearance}
        inputSize={inputSize} setInputSize={setInputSize} onResetLayout={onResetLayout} />
    </div>
  )
}
