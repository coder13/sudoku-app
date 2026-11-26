export type InputToolOverride = 'highlight' | 'color' | 'erase' | null
export type InputToolState = { pencil: boolean; override: InputToolOverride }

export type InputToolAction =
  | { type: 'select-pencil'; pencil: boolean }
  | { type: 'toggle'; mode: Exclude<InputToolOverride, null> }
  | { type: 'set-override'; override: InputToolOverride }
  | { type: 'clear' }
  | { type: 'disable-erase' }
  | { type: 'reset'; pencil: boolean }

export type SavedInputToolPreferences = {
  pencil: boolean
  highlightMode: boolean
  colorMode: boolean
  eraseMode: boolean
}

/** Resolve the saved booleans into one exclusive tool state. */
export function inputToolStateFromPreferences(preferences: SavedInputToolPreferences): InputToolState {
  const override = preferences.eraseMode ? 'erase'
    : preferences.colorMode ? 'color'
      : preferences.highlightMode ? 'highlight' : null
  return { pencil: preferences.pencil, override }
}

/** Project the typed tool state into the existing persisted preference shape. */
export function inputToolPreferencesFromState(state: InputToolState): SavedInputToolPreferences {
  return {
    pencil: state.pencil,
    highlightMode: state.override === 'highlight',
    colorMode: state.override === 'color',
    eraseMode: state.override === 'erase',
  }
}

/** Apply shared Pen, Pencil, Highlight, Color, and Erase transitions. */
export function transitionInputTool(state: InputToolState, action: InputToolAction): InputToolState {
  switch (action.type) {
    case 'select-pencil': return { pencil: action.pencil, override: null }
    case 'toggle': return { ...state, override: state.override === action.mode ? null : action.mode }
    case 'set-override': return state.override === action.override ? state : { ...state, override: action.override }
    case 'clear': return state.override === null ? state : { ...state, override: null }
    case 'disable-erase': return state.override === 'erase' ? { ...state, override: null } : state
    case 'reset': return { pencil: action.pencil, override: null }
  }
}
