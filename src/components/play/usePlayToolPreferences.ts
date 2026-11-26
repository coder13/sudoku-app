import { useCallback, useSyncExternalStore, type SetStateAction } from 'react'
import { defaultDigitHighlight, type DigitHighlight, type PlaySession, type PlaySessionField, type PlaySessionUpdate } from '../../sudoku/play-session'
import { inputToolStateFromPreferences, type InputToolOverride } from '../../sudoku/input-tool-mode'
import { playPreferenceStore, type PlayPreferences } from '../../sudoku/play-preferences'

type Options = {
  gridSize: number
  session: PlaySession | null
  updateSession: <K extends PlaySessionField>(field: K, value: PlaySessionUpdate<K>) => void
}

function usePlayPreferenceSetter<Key extends keyof PlayPreferences>(key: Key) {
  return useCallback((value: SetStateAction<PlayPreferences[Key]>) => playPreferenceStore.set(key, value), [key])
}

/** Bind persistent input-tool preferences and puzzle-scoped digit highlights for a Play host. */
export function usePlayToolPreferences({ gridSize, session, updateSession }: Options) {
  const preferences = useSyncExternalStore(playPreferenceStore.subscribe, playPreferenceStore.getSnapshot, playPreferenceStore.getServerSnapshot)
  const preferredDigit = preferences.selectedDigit
  const setSelectedDigit = usePlayPreferenceSetter('selectedDigit')
  const selectedDigit = preferredDigit !== null && preferredDigit <= gridSize ? preferredDigit : null
  const digitHighlight = session?.digitHighlight ?? defaultDigitHighlight
  const setDigitHighlight = useCallback((value: SetStateAction<DigitHighlight>) => {
    updateSession('digitHighlight', value)
  }, [updateSession])
  const highlightedDigitMask = digitHighlight.mask

  const selectedColor = preferences.selectedColor
  const setSelectedColor = usePlayPreferenceSetter('selectedColor')
  const colorTarget = preferences.colorTarget
  const setColorTarget = usePlayPreferenceSetter('colorTarget')
  const colorBrush = preferences.colorBrush
  const setColorBrush = usePlayPreferenceSetter('colorBrush')
  const highlightCandidatePairs = preferences.highlightCandidatePairs
  const setHighlightCandidatePairs = usePlayPreferenceSetter('highlightCandidatePairs')
  const savedHighlightMode = preferences.highlightMode
  const setSavedHighlightMode = usePlayPreferenceSetter('highlightMode')
  const savedPencil = preferences.pencil
  const setPencil = usePlayPreferenceSetter('pencil')
  const candidateKind = preferences.candidateKind
  const setCandidateKind = usePlayPreferenceSetter('candidateKind')
  const savedColorMode = preferences.colorMode
  const setColorMode = usePlayPreferenceSetter('colorMode')
  const savedEraseMode = preferences.eraseMode
  const setEraseMode = usePlayPreferenceSetter('eraseMode')
  const savedInputTool = inputToolStateFromPreferences({
    pencil: savedPencil,
    highlightMode: savedHighlightMode,
    colorMode: savedColorMode,
    eraseMode: savedEraseMode,
  })
  const setInputToolOverride = useCallback((override: InputToolOverride) => {
    playPreferenceStore.transitionInputTool({ type: 'set-override', override })
  }, [])
  const toggleInputToolOverride = useCallback((mode: Exclude<InputToolOverride, null>) => {
    playPreferenceStore.transitionInputTool({ type: 'toggle', mode })
  }, [])
  const selectInputToolPencil = useCallback((pencil: boolean) => {
    playPreferenceStore.transitionInputTool({ type: 'select-pencil', pencil })
  }, [])

  return {
    selectedDigit, setSelectedDigit,
    digitHighlight, setDigitHighlight, highlightedDigitMask,
    selectedColor, setSelectedColor, colorTarget, setColorTarget, colorBrush, setColorBrush,
    highlightCandidatePairs, setHighlightCandidatePairs,
    savedHighlightMode, setSavedHighlightMode,
    savedPencil, setPencil,
    candidateKind, setCandidateKind,
    savedColorMode, setColorMode,
    savedEraseMode, setEraseMode,
    savedInputTool,
    setInputToolOverride, toggleInputToolOverride, selectInputToolPencil,
  }
}
