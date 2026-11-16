import type { CandidateLayout, ErrorMode } from './game'

export type AdvancedModes = {
  candidateLayout: CandidateLayout
  colorsEnabled: boolean
  multiSelectButton: boolean
}

export const DEFAULT_ADVANCED_MODES: AdvancedModes = {
  candidateLayout: 'grid',
  colorsEnabled: false,
  multiSelectButton: false,
}

export const DEFAULT_ERROR_MODE: ErrorMode = 'all'
export const ADVANCED_MODE_KEY = 'sudoku-app:v1:advanced-modes'
export const ERROR_MODE_KEY = 'sudoku-app:v1:error-mode'

const ERROR_MODES = new Set<ErrorMode>(['all', 'incorrect', 'none'])

export function readPreferences() {
  let advancedModes = DEFAULT_ADVANCED_MODES
  let errorMode = DEFAULT_ERROR_MODE
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
  } catch { /* Keep defaults when preferences cannot be read. */ }
  return { advancedModes, errorMode }
}

export function saveAdvancedModes(value: AdvancedModes) {
  try { localStorage.setItem(ADVANCED_MODE_KEY, JSON.stringify(value)) }
  catch { /* The setting remains active for this session. */ }
}

export function saveErrorMode(value: ErrorMode) {
  try { localStorage.setItem(ERROR_MODE_KEY, value) }
  catch { /* The setting remains active for this session. */ }
}
