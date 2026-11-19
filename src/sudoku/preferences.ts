import { notifySettingsEdit } from './settings-events.ts'
import { clampAppTextZoom, DEFAULT_APP_TEXT_ZOOM } from './app-text-zoom.ts'
import { DEFAULT_DIFFICULTY, currentDifficulty, isDifficultyPreference, type DifficultyPreference } from './difficulty.ts'
import type { CandidateLayout, ErrorMode } from './game.ts'
import { clampGridTextScale, DEFAULT_GRID_TEXT_SCALE } from './grid-text-scale.ts'
import { DEFAULT_CELL_REFERENCE_STYLE, isCellReferenceStyle, type CellReferenceStyle } from './hints.ts'
import { DEFAULT_DARK_THEME, THEME_IDS_SET, type ThemeId } from './themes.ts'
import { isNewPuzzleId, isSizedPuzzleId, miniDifficulty, type NewPuzzleId } from './new-puzzle.ts'
import { variantDifficulty } from './variants.ts'
import { generationRuleset, type GenerationRulesetId } from './variant-rulesets.ts'

export {
  gridTextScalePercentage, MAX_GRID_TEXT_SCALE, MIN_GRID_TEXT_SCALE, stepGridTextScale,
} from './grid-text-scale.ts'

export type AdvancedModes = {
  candidateLayout: CandidateLayout
  colorsEnabled: boolean
  multiSelectButton: boolean
  autoGenerateCandidates: boolean
  doubleClickSingles: boolean
}

export type WorkspaceMode = 'standard' | 'advanced'

export type ColorMode = 'system' | 'light' | 'dark'
export type { ThemeId } from './themes.ts'
export type AppearancePreferences = {
  colorMode: ColorMode
  lightTheme: ThemeId
  darkTheme: ThemeId
  showGuides: boolean
  gridTextScale: number
  appTextZoom: number
}

export type CandidateHighlightStyle = 'text' | 'spotlight' | 'cell' | 'outline'
export type HighlightPreferences = {
  relatedCells: boolean
  matchingDigits: boolean
  matchingCandidates: boolean
  candidateStyle: CandidateHighlightStyle
}

export const DEFAULT_ADVANCED_MODES: AdvancedModes = {
  candidateLayout: 'grid',
  colorsEnabled: false,
  multiSelectButton: false,
  autoGenerateCandidates: false,
  doubleClickSingles: true,
}

export const DEFAULT_ERROR_MODE: ErrorMode = 'all'
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  colorMode: 'system',
  lightTheme: 'violet',
  darkTheme: DEFAULT_DARK_THEME,
  showGuides: false,
  gridTextScale: DEFAULT_GRID_TEXT_SCALE,
  appTextZoom: DEFAULT_APP_TEXT_ZOOM,
}
export const DEFAULT_HIGHLIGHT_PREFERENCES: HighlightPreferences = {
  relatedCells: true,
  matchingDigits: true,
  matchingCandidates: true,
  candidateStyle: 'cell',
}
export const DEFAULT_INPUT_SIZE = 210
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'standard'
export const MIN_INPUT_SIZE = 162
export const MAX_INPUT_SIZE = 234
export const INPUT_SIZE_STEP = 12
export const ADVANCED_MODE_KEY = 'sudoku-app:v1:advanced-modes'
export const ERROR_MODE_KEY = 'sudoku-app:v1:error-mode'
export const INPUT_SIZE_KEY = 'sudoku-app:v1:input-size'
export const PANEL_HEIGHT_KEY = 'sudoku-app:v1:input-panel-height'
export const APPEARANCE_KEY = 'sudoku-app:v1:appearance'
export const HIGHLIGHT_KEY = 'sudoku-app:v1:highlighting'
export const WORKSPACE_MODE_KEY = 'sudoku-app:v1:workspace-mode'
export const DIFFICULTY_KEY = 'sudoku-app:v1:difficulty'
export const NEW_PUZZLE_KEY = 'sudoku-app:v1:new-puzzle'
export const CELL_REFERENCE_STYLE_KEY = 'sudoku-app:v1:hint-cell-reference-style'

const ERROR_MODES = new Set<ErrorMode>(['all', 'incorrect', 'none'])
const COLOR_MODES = new Set<ColorMode>(['system', 'light', 'dark'])
const CANDIDATE_HIGHLIGHT_STYLES = new Set<CandidateHighlightStyle>(['text', 'spotlight', 'cell', 'outline'])

export function readPreferences(storage?: Pick<Storage, 'getItem'>) {
  let advancedModes = DEFAULT_ADVANCED_MODES
  let errorMode = DEFAULT_ERROR_MODE
  let inputSize = DEFAULT_INPUT_SIZE
  let appearance = DEFAULT_APPEARANCE
  let highlighting = DEFAULT_HIGHLIGHT_PREFERENCES
  let difficulty: DifficultyPreference = DEFAULT_DIFFICULTY
  let cellReferenceStyle = DEFAULT_CELL_REFERENCE_STYLE
  let workspaceMode = DEFAULT_WORKSPACE_MODE
  try {
    const target = storage ?? localStorage
    const savedWorkspaceMode = target.getItem(WORKSPACE_MODE_KEY)
    if (savedWorkspaceMode === 'standard' || savedWorkspaceMode === 'advanced') workspaceMode = savedWorkspaceMode
    const savedDifficulty = target.getItem(DIFFICULTY_KEY)
    if (isDifficultyPreference(savedDifficulty)) difficulty = savedDifficulty === 'auto' ? 'auto' : currentDifficulty(savedDifficulty)
    const savedCellReferenceStyle = target.getItem(CELL_REFERENCE_STYLE_KEY)
    if (isCellReferenceStyle(savedCellReferenceStyle)) cellReferenceStyle = savedCellReferenceStyle
    const savedErrorMode = target.getItem(ERROR_MODE_KEY) as ErrorMode | null
    if (savedErrorMode && ERROR_MODES.has(savedErrorMode)) errorMode = savedErrorMode
    const savedModes = JSON.parse(target.getItem(ADVANCED_MODE_KEY) ?? 'null') as Partial<AdvancedModes> | null
    if (savedModes && (savedModes.candidateLayout === 'grid' || savedModes.candidateLayout === 'center-corner')) {
      advancedModes = {
        candidateLayout: savedModes.candidateLayout,
        colorsEnabled: savedModes.colorsEnabled === true,
        multiSelectButton: savedModes.multiSelectButton === true,
        autoGenerateCandidates: savedModes.autoGenerateCandidates === true,
        doubleClickSingles: savedModes.doubleClickSingles !== false,
      }
    }
    const savedInputSizeText = target.getItem(INPUT_SIZE_KEY)
    const savedInputSize = Number(savedInputSizeText)
    if (savedInputSizeText !== null && Number.isFinite(savedInputSize)) {
      inputSize = Math.min(MAX_INPUT_SIZE, Math.max(MIN_INPUT_SIZE, savedInputSize))
    }
    const savedAppearance = JSON.parse(target.getItem(APPEARANCE_KEY) ?? 'null') as
      (Partial<AppearancePreferences> & { themeDefaultsVersion?: number }) | null
    if (savedAppearance) {
      const darkTheme = savedAppearance.themeDefaultsVersion !== 2 && savedAppearance.darkTheme === 'violet'
        ? DEFAULT_APPEARANCE.darkTheme : savedAppearance.darkTheme
      appearance = {
        colorMode: savedAppearance.colorMode && COLOR_MODES.has(savedAppearance.colorMode)
          ? savedAppearance.colorMode : DEFAULT_APPEARANCE.colorMode,
        lightTheme: savedAppearance.lightTheme && THEME_IDS_SET.has(savedAppearance.lightTheme)
          ? savedAppearance.lightTheme : DEFAULT_APPEARANCE.lightTheme,
        darkTheme: darkTheme && THEME_IDS_SET.has(darkTheme) ? darkTheme : DEFAULT_APPEARANCE.darkTheme,
        showGuides: savedAppearance.showGuides === true,
        gridTextScale: clampGridTextScale(savedAppearance.gridTextScale),
        appTextZoom: typeof savedAppearance.appTextZoom === 'number' && Number.isFinite(savedAppearance.appTextZoom)
          ? clampAppTextZoom(Math.round(savedAppearance.appTextZoom)) : DEFAULT_APP_TEXT_ZOOM,
      }
    }
    const savedHighlighting = JSON.parse(target.getItem(HIGHLIGHT_KEY) ?? 'null') as
      (Partial<HighlightPreferences> & { defaultsVersion?: number }) | null
    if (savedHighlighting) {
      const candidateStyle = savedHighlighting.defaultsVersion !== 2 && savedHighlighting.candidateStyle === 'text'
        ? DEFAULT_HIGHLIGHT_PREFERENCES.candidateStyle : savedHighlighting.candidateStyle
      highlighting = {
        relatedCells: savedHighlighting.relatedCells !== false,
        matchingDigits: savedHighlighting.matchingDigits !== false,
        matchingCandidates: savedHighlighting.matchingCandidates !== false,
        candidateStyle: candidateStyle && CANDIDATE_HIGHLIGHT_STYLES.has(candidateStyle)
          ? candidateStyle : DEFAULT_HIGHLIGHT_PREFERENCES.candidateStyle,
      }
    }
  } catch { /* Keep defaults when preferences cannot be read. */ }
  return { advancedModes, errorMode, inputSize, appearance, highlighting, difficulty, cellReferenceStyle, workspaceMode }
}

export function saveWorkspaceMode(value: WorkspaceMode) {
  try { localStorage.setItem(WORKSPACE_MODE_KEY, value); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveCellReferenceStyle(value: CellReferenceStyle) {
  try { localStorage.setItem(CELL_REFERENCE_STYLE_KEY, value); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveDifficulty(value: DifficultyPreference) {
  try { localStorage.setItem(DIFFICULTY_KEY, value); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export type NewPuzzlePreference = { variant: NewPuzzleId; difficulty: DifficultyPreference; ruleset?: GenerationRulesetId; boxRows?: 2 | 3 }

export function readNewPuzzlePreference(storage?: Pick<Storage, 'getItem'>): NewPuzzlePreference | null {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(NEW_PUZZLE_KEY) ?? 'null') as Partial<NewPuzzlePreference> | null
    if (isNewPuzzleId(value?.variant) && isDifficultyPreference(value.difficulty)) {
      if (isSizedPuzzleId(value.variant)) return { variant: value.variant, difficulty: miniDifficulty(value.difficulty),
        ...(value.variant === 'six' && (value.boxRows === 2 || value.boxRows === 3) ? { boxRows: value.boxRows } : {}) }
      const ruleset = generationRuleset(value.variant, value.ruleset)
      return { variant: value.variant, difficulty: variantDifficulty(value.variant, value.difficulty),
        ...(ruleset ? { ruleset: ruleset.id } : {}) }
    }
  } catch { /* Use the variant picker when the preference is unavailable. */ }
  return null
}

export function saveNewPuzzlePreference(value: NewPuzzlePreference) {
  try { localStorage.setItem(NEW_PUZZLE_KEY, JSON.stringify(value)); notifySettingsEdit() }
  catch { /* The choice remains active for this session. */ }
}

export function saveAdvancedModes(value: AdvancedModes) {
  try { localStorage.setItem(ADVANCED_MODE_KEY, JSON.stringify(value)); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveErrorMode(value: ErrorMode) {
  try { localStorage.setItem(ERROR_MODE_KEY, value); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveInputSize(value: number) {
  try { localStorage.setItem(INPUT_SIZE_KEY, String(value)); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveAppearance(value: AppearancePreferences) {
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...value, themeDefaultsVersion: 2 })); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function saveHighlightPreferences(value: HighlightPreferences) {
  try { localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify({ ...value, defaultsVersion: 2 })); notifySettingsEdit() }
  catch { /* The setting remains active for this session. */ }
}

export function readPanelHeight() {
  try {
    const value = Number(localStorage.getItem(PANEL_HEIGHT_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch { return null }
}

export function savePanelHeight(value: number) {
  try { localStorage.setItem(PANEL_HEIGHT_KEY, String(value)) }
  catch { /* The setting remains active for this session. */ }
}
