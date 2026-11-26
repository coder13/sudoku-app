import type { Game, Mode, EnterOptions, ColorTarget } from '../../sudoku/game'
import { candidateCount, completeCandidateMasks, digitsFromMask, enter, hasCandidate, hintEliminations, valuesOf } from '../../sudoku/game'
import type { AdvancedModes } from '../../sudoku/preferences'
import { onlyGivensSelected } from '../../sudoku/highlighting'
import { playerActions } from '../../sudoku/technique-progress'
import { observeTechniqueActions } from '../../sudoku/technique-history'
import { COLORS } from '../../sudoku/game'

type Options = {
  puzzle: {
    values: string
    visibleGivens: string
    gridSize: number
    selected: readonly number[]
    completed: boolean
    draft: boolean
  }
  state: {
    mode: Mode
    highlightMode: boolean
    selectedDigit: number | null
    highlightedDigitMask: number
    brush: number | null
    colorBrush: number | null
    colorTarget: ColorTarget
    givenHighlightSelection: boolean
    multi: boolean
  }
  modes: Pick<AdvancedModes,
    'autoRemoveCandidates' | 'autoRemoveCandidateVariants' | 'autoPlaceNakedSingles'
  >
  actions: {
    edit: (transform: (current: Game) => Game) => void
    clearHighlightedDigits: () => void
    paintCandidateDigits: (digits: readonly number[], color: number) => void
    changeHintVisuals: (visuals: 'hint' | 'player') => void
    leaveChainInput: (switchMobileToDigits?: boolean) => void
    setSelectedDigit: (digit: number | null | ((current: number | null) => number | null)) => void
    setSelected: (cells: number[]) => void
    setHighlightCandidatePairs: (selected: boolean) => void
    setSelectedColor: (update: number | null | ((current: number | null) => number | null)) => void
    setColorBrush: (brush: number | null) => void
    setEraseMode: (enabled: boolean) => void
    placeNakedSingles: (game: Game) => void | Promise<void>
  }
}

/** Route keypad input through the active Play mode while keeping entry edits reusable. */
export function usePlayEntryActions({ puzzle, state, modes, actions }: Options) {
  const { values, visibleGivens, gridSize, selected, completed, draft } = puzzle
  const { mode, highlightMode, selectedDigit, highlightedDigitMask, brush, colorBrush, colorTarget,
    givenHighlightSelection, multi } = state
  const { edit, clearHighlightedDigits, paintCandidateDigits, changeHintVisuals, leaveChainInput,
    setSelectedDigit, setSelected, setHighlightCandidatePairs, setSelectedColor, setColorBrush,
    setEraseMode, placeNakedSingles } = actions

  function enterFromInput(cells: readonly number[], digit: number, inputMode: Mode, options?: EnterOptions) {
    if (inputMode === 'color') changeHintVisuals('player')
    let placement: Game | undefined
    edit(current => {
      const next = enter(current, [...cells], inputMode, digit, {
        removeCandidates: modes.autoRemoveCandidates,
        variantRules: modes.autoRemoveCandidateVariants,
        ...options,
      })
      const playerActionsForEdit = playerActions(current, next, cells, inputMode, digit)
      if (playerActionsForEdit.length && !completed)
        void observeTechniqueActions(current, playerActionsForEdit, 'independent', hintEliminations(
          valuesOf(current), completeCandidateMasks(current), current.position.eliminations, gridSize
        ))
      if (modes.autoPlaceNakedSingles && !draft && !completed && !next.paused && inputMode === 'value' && digit &&
        cells.some(cell => next.position.entries[cell] === String(digit) && current.position.entries[cell] !== String(digit)))
        placement = next
      return next
    })
    if (placement) void placeNakedSingles(placement)
  }

  function input(digit: number, inputMode: Mode = highlightMode ? 'value' : mode, selectedCells: readonly number[] = selected, placeInSelection = false) {
    if (inputMode !== 'color' && digit > gridSize) return
    if (brush !== null && inputMode === 'value') {
      if (digit > 0) {
        const paintHighlightedGroup = candidateCount(highlightedDigitMask) > 1 && hasCandidate(highlightedDigitMask, digit)
        paintCandidateDigits(paintHighlightedGroup ? digitsFromMask(highlightedDigitMask, gridSize) : [digit], brush)
      }
      return
    }
    if (colorBrush !== null) setColorBrush(null)
    let cells = [...selectedCells]
    if (inputMode === 'color') {
      leaveChainInput(false)
      clearHighlightedDigits()
      if (digit > COLORS.length) return
      changeHintVisuals('player')
      if (colorTarget === 'candidate') {
        setSelectedColor(current => current === digit ? null : digit)
        return
      }
      if (digit > 0) setEraseMode(false)
      if (!cells.length) {
        setSelectedColor(current => digit === 0 || current === digit ? null : digit)
        return
      }
      edit(current => enter(current, cells, inputMode, digit))
      return
    }
    if (digit > 0 && givenHighlightSelection) {
      setSelected([])
      cells = []
    }
    if (!cells.length || digit === 0) clearHighlightedDigits()
    if (digit > 0) setEraseMode(false)
    if (cells.length && (highlightMode || placeInSelection || multi)) {
      if (highlightMode && !placeInSelection && inputMode === 'value' && digit > 0 && onlyGivensSelected(visibleGivens, cells)) {
        clearHighlightedDigits()
        setSelected([])
        setHighlightCandidatePairs(false)
        setSelectedDigit(digit)
        return
      }
      enterFromInput(cells, digit, inputMode, { allowMultipleValues: inputMode === 'value' })
      return
    }
    if (highlightMode && inputMode !== 'value') return
    if (!cells.length) {
      setHighlightCandidatePairs(false)
      const wasHighlighted = digit > 0 && highlightedDigitMask === 1 << (digit - 1)
      setSelectedDigit(current => digit === 0 || current === digit || wasHighlighted ? null : digit)
      return
    }
    enterFromInput(cells, digit, inputMode)
  }

  return { input, enterFromInput }
}
