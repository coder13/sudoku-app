import type { Dispatch, ReactNode, Ref, SetStateAction } from 'react'
import type { PlayGrid } from '../sudoku/grid'
import type { ColorTarget, Mode } from '../sudoku/game'
import type { DigitHighlightMatch } from '../sudoku/highlighting'
import type { AdvancedModes } from '../sudoku/preferences'
import type { CandidateDigitColorSummary } from './play/play-model'

export type ControlsProps = {
  digits: {
    mode: Mode
    pencil: boolean
    candidateKind: 'center' | 'corner'
    setCandidateKind: (kind: 'center' | 'corner') => void
    selectedDigit: number | null
    highlightedDigitMask?: number
    pinnedDigitMask?: number
    onTogglePinnedDigit?: (digit: number, match?: DigitHighlightMatch) => void
    onToggleDigitHighlight?: (digit: number, match: DigitHighlightMatch) => void
    digitHighlightMatch?: DigitHighlightMatch
    onDigitHighlightMatchChange?: (match: DigitHighlightMatch) => void
    hasCellSelection: boolean
    values: string
    gridSize?: PlayGrid['size']
    input: (digit: number) => void
    candidateDigitColors?: readonly CandidateDigitColorSummary[]
    digitPaintColor?: number
    onPaintDigit?: (digit: number) => void
    onSelectDigit?: (digit: number) => void
  }
  tools: {
    togglePencil: () => void
    colorMode: boolean
    toggleColorMode?: () => void
    colorsActive?: boolean
    paintCandidateGroupAvailable?: boolean
    onPaintCandidateGroup?: () => void
    clearDigitHighlightsAvailable?: boolean
    onClearDigitHighlights?: () => void
    onSwitchShade: () => void
    eraseMode: boolean
    toggleEraseMode: () => void
    highlightMode: boolean
    toggleHighlightMode: () => void
    chainDrawing?: boolean
    multi: boolean
    toggleMulti: () => void
    showMultiSelectButton?: boolean
    colorTarget: ColorTarget
    setColorTarget: (target: ColorTarget) => void
  }
  history: {
    undo: () => void
    redo: () => void
    canUndo: boolean
    canRedo: boolean
    historyDisabled?: boolean
  }
  actions: {
    onCheck?: () => void
    onActions?: () => void
    actionsMenu?: ReactNode
    actionsButtonRef?: Ref<HTMLButtonElement>
    actionsOpen?: boolean
    reserveSolvingSlots?: boolean
    inputTools?: ReactNode
  }
  layout: {
    advancedModes: AdvancedModes
    compact?: boolean
    draft: boolean
    disabled: boolean
    inputSize: number
    panelHeight: number
    setPanelHeight: Dispatch<SetStateAction<number>>
    beginResize: () => void
  }
}
