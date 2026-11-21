import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  type AppearancePreferences,
} from '../../src/sudoku/preferences'
import { DEFAULT_DIFFICULTY } from '../../src/sudoku/difficulty'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'

export * from '../../src/sudoku/preferences'

let appearanceOverrides: Partial<AppearancePreferences> = {}

export function seedAppearance(overrides: Partial<AppearancePreferences>) {
  appearanceOverrides = overrides
  return () => { appearanceOverrides = {} }
}

export function readPreferences() {
  return {
    advancedModes: DEFAULT_ADVANCED_MODES,
    appearance: {
      ...DEFAULT_APPEARANCE,
      colorMode: document.documentElement.dataset.colorMode === 'dark' ? 'dark' as const : 'light' as const,
      ...appearanceOverrides,
    },
    errorMode: DEFAULT_ERROR_MODE,
    highlighting: DEFAULT_HIGHLIGHT_PREFERENCES,
    inputSize: DEFAULT_INPUT_SIZE,
    difficulty: DEFAULT_DIFFICULTY,
    cellReferenceStyle: DEFAULT_CELL_REFERENCE_STYLE,
  }
}

export const readPanelHeight = () => null
export const saveAdvancedModes = () => {}
export const saveAppearance = () => {}
export const saveCellReferenceStyle = () => {}
export const saveDifficulty = () => {}
export const saveErrorMode = () => {}
export const saveHighlightPreferences = () => {}
export const saveInputSize = () => {}
export const savePanelHeight = () => {}
