import type { CandidateLayout, ErrorMode } from './game'
import { DEFAULT_DARK_THEME, THEME_IDS_SET, type ThemeId } from './themes'

export type AdvancedModes = {
  candidateLayout: CandidateLayout
  colorsEnabled: boolean
  multiSelectButton: boolean
}

export type ColorMode = 'system' | 'light' | 'dark'
export type { ThemeId } from './themes'
export type AppearancePreferences = {
  colorMode: ColorMode
  lightTheme: ThemeId
  darkTheme: ThemeId
  showGuides: boolean
}

export const DEFAULT_ADVANCED_MODES: AdvancedModes = {
  candidateLayout: 'grid',
  colorsEnabled: false,
  multiSelectButton: false,
}

export const DEFAULT_ERROR_MODE: ErrorMode = 'all'
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  colorMode: 'system',
  lightTheme: 'violet',
  darkTheme: DEFAULT_DARK_THEME,
  showGuides: true,
}
export const DEFAULT_INPUT_SIZE = 210
export const MIN_INPUT_SIZE = 162
export const MAX_INPUT_SIZE = 234
export const INPUT_SIZE_STEP = 12
export const ADVANCED_MODE_KEY = 'sudoku-app:v1:advanced-modes'
export const ERROR_MODE_KEY = 'sudoku-app:v1:error-mode'
export const INPUT_SIZE_KEY = 'sudoku-app:v1:input-size'
export const PANEL_HEIGHT_KEY = 'sudoku-app:v1:input-panel-height'
export const APPEARANCE_KEY = 'sudoku-app:v1:appearance'

const ERROR_MODES = new Set<ErrorMode>(['all', 'incorrect', 'none'])
const COLOR_MODES = new Set<ColorMode>(['system', 'light', 'dark'])

export function readPreferences() {
  let advancedModes = DEFAULT_ADVANCED_MODES
  let errorMode = DEFAULT_ERROR_MODE
  let inputSize = DEFAULT_INPUT_SIZE
  let appearance = DEFAULT_APPEARANCE
  try {
    const savedErrorMode = localStorage.getItem(ERROR_MODE_KEY) as ErrorMode | null
    if (savedErrorMode && ERROR_MODES.has(savedErrorMode)) errorMode = savedErrorMode
    const savedModes = JSON.parse(localStorage.getItem(ADVANCED_MODE_KEY) ?? 'null') as Partial<AdvancedModes> | null
    if (savedModes && (savedModes.candidateLayout === 'grid' || savedModes.candidateLayout === 'center-corner')) {
      advancedModes = {
        candidateLayout: savedModes.candidateLayout,
        colorsEnabled: savedModes.colorsEnabled === true,
        multiSelectButton: savedModes.multiSelectButton === true,
      }
    }
    const savedInputSizeText = localStorage.getItem(INPUT_SIZE_KEY)
    const savedInputSize = Number(savedInputSizeText)
    if (savedInputSizeText !== null && Number.isFinite(savedInputSize)) {
      inputSize = Math.min(MAX_INPUT_SIZE, Math.max(MIN_INPUT_SIZE, savedInputSize))
    }
    const savedAppearance = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null') as
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
        showGuides: savedAppearance.showGuides !== false,
      }
    }
  } catch { /* Keep defaults when preferences cannot be read. */ }
  return { advancedModes, errorMode, inputSize, appearance }
}

export function saveAdvancedModes(value: AdvancedModes) {
  try { localStorage.setItem(ADVANCED_MODE_KEY, JSON.stringify(value)) }
  catch { /* The setting remains active for this session. */ }
}

export function saveErrorMode(value: ErrorMode) {
  try { localStorage.setItem(ERROR_MODE_KEY, value) }
  catch { /* The setting remains active for this session. */ }
}

export function saveInputSize(value: number) {
  try { localStorage.setItem(INPUT_SIZE_KEY, String(value)) }
  catch { /* The setting remains active for this session. */ }
}

export function saveAppearance(value: AppearancePreferences) {
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...value, themeDefaultsVersion: 2 })) }
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
