import { useCallback, useReducer } from 'react'
import type { Mode } from '../sudoku/game'
import { transitionInputTool, type InputToolState } from '../sudoku/input-tool-mode'

/** Own lesson input-mode state and expose the transitions shared by its controls. */
export function useLessonInputMode(initialPencil: boolean, candidateMode: Exclude<Mode, 'value' | 'color'>) {
  const [state, dispatch] = useReducer(transitionInputTool, { pencil: initialPencil, override: null } satisfies InputToolState)
  const savedPencil = state.pencil
  const highlightMode = state.override === 'highlight'
  const colorMode = state.override === 'color'
  const eraseMode = state.override === 'erase'
  const pencil = savedPencil && state.override === null
  const mode: Mode = colorMode ? 'color' : pencil ? candidateMode : 'value'

  const selectPencil = useCallback((next: boolean) => dispatch({ type: 'select-pencil', pencil: next }), [])
  const toggleHighlight = useCallback(() => dispatch({ type: 'toggle', mode: 'highlight' }), [])
  const toggleColor = useCallback(() => dispatch({ type: 'toggle', mode: 'color' }), [])
  const toggleErase = useCallback(() => dispatch({ type: 'toggle', mode: 'erase' }), [])
  const clearOverride = useCallback(() => dispatch({ type: 'clear' }), [])
  const disableErase = useCallback(() => dispatch({ type: 'disable-erase' }), [])
  const reset = useCallback((nextPencil: boolean) => dispatch({ type: 'reset', pencil: nextPencil }), [])
  const cycleDigitMode = useCallback(() => {
    if (pencil) toggleHighlight()
    else selectPencil(!highlightMode)
  }, [highlightMode, pencil, selectPencil, toggleHighlight])

  return {
    savedPencil,
    pencil,
    highlightMode,
    colorMode,
    eraseMode,
    mode,
    selectPencil,
    toggleHighlight,
    toggleColor,
    toggleErase,
    clearOverride,
    disableErase,
    cycleDigitMode,
    reset,
  }
}
