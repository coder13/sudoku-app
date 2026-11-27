import type { Dispatch, MutableRefObject, SetStateAction, MouseEvent as ReactMouseEvent } from 'react'
import type { Candidate } from '../../sudoku/engine'
import {
  completeCandidateMasks,
  enter,
  hintEliminations,
  marksOf,
  onlyCandidate,
  toggleCandidateGroup,
  valuesOf,
  type ColorTarget,
  type Game,
  type Mode,
} from '../../sudoku/game'
import { givenDigitAt, type DigitHighlightMatch } from '../../sudoku/highlighting'
import { rectangleSelection } from '../../sudoku/selection'
import { observeTechniqueActions } from '../../sudoku/technique-history'
import { playerActions } from '../../sudoku/technique-progress'
import type { CandidatePress, PendingDoubleClickSingle } from './play-gesture-types'
import type { CandidatePaintMode } from './useCandidatePaintDrag'

type Options = {
  puzzle: {
    game: Game
    values: string
    visibleGivens: string
    gridSize: number
    completed: boolean
    draft: boolean
    trial?: boolean
  }
  selection: {
    selected: readonly number[]
    anchor: number
    multi: boolean
    setActive: (cell: number) => void
    setAnchor: (cell: number) => void
    setSelected: Dispatch<SetStateAction<number[]>>
  }
  input: {
    mode: Mode
    candidateMode: CandidatePaintMode
    colorMode: boolean
    eraseMode: boolean
    highlightMode: boolean
    pencilActive: boolean
    pencilGroup: number
    selectedDigit: number | null
    selectedColor: number | null
    highlightedDigitMask: number
    digitHighlightMatch: DigitHighlightMatch
    colorTarget: ColorTarget
    cellBrush: number | null
  }
  capability: {
    desktop: boolean
    canPreviewCandidates: boolean
    pencilPreviewMask: number
    canDoubleClickSingle: boolean
  }
  gestures: {
    candidatePress: MutableRefObject<CandidatePress | null>
    suppressCellClick: MutableRefObject<boolean>
    pendingDoubleClickSingle: MutableRefObject<PendingDoubleClickSingle | null>
    suppressHoldClick: (event: ReactMouseEvent) => boolean
    cellHighlightMask: (cell: number) => number
  }
  actions: {
    edit: (transform: (current: Game) => Game) => void
    enterFromInput: (cells: readonly number[], digit: number, mode: Mode, options?: { toggleValue?: boolean }) => void
    highlightCellCandidates: (mask: number) => void
    toggleDigitHighlight: (digit: number, match: DigitHighlightMatch) => void
    setSelectedDigit: Dispatch<SetStateAction<number | null>>
  }
}

/** Own the puzzle action and selection policy for a direct cell click or double-click. */
export function usePlayCellActions({ puzzle, selection, input, capability, gestures, actions }: Options) {
  const { game, values, visibleGivens, gridSize, completed, draft, trial } = puzzle
  const { selected, anchor, multi, setActive, setAnchor, setSelected } = selection
  const { mode, candidateMode, colorMode, eraseMode, highlightMode, pencilActive, pencilGroup,
    selectedDigit, selectedColor, highlightedDigitMask, digitHighlightMatch, colorTarget, cellBrush } = input
  const { desktop, canPreviewCandidates, pencilPreviewMask, canDoubleClickSingle } = capability
  const { candidatePress, suppressCellClick, pendingDoubleClickSingle, suppressHoldClick, cellHighlightMask } = gestures
  const { edit, enterFromInput, highlightCellCandidates, toggleDigitHighlight, setSelectedDigit } = actions

  function clickCell(index: number, event: ReactMouseEvent) {
    if (suppressHoldClick(event)) return
    if (desktop && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const mask = cellHighlightMask(index)
      if (mask) highlightCellCandidates(mask)
      return
    }
    const press = candidatePress.current
    if (press && event.detail > 0) {
      // Touch can generate a click after pointerup, even after leaving an implicitly captured cell.
      candidatePress.current = null
      if (press.cancelled || press.cell !== index || !canPreviewCandidates || values[index] !== '0' ||
        press.mask !== pencilPreviewMask || press.mode !== candidateMode) return
    }
    const doubleClickEligible = canDoubleClickSingle && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    if (!doubleClickEligible || pendingDoubleClickSingle.current?.index !== index) pendingDoubleClickSingle.current = null
    if (event.detail === 1) {
      const digit = doubleClickEligible ? onlyCandidate(game.position.center[index] | game.position.corner[index]) : null
      pendingDoubleClickSingle.current = digit !== null ? { index, digit, game } : null
    }
    if (event.detail > 1 && doubleClickEligible && pendingDoubleClickSingle.current) return
    if (suppressCellClick.current && event.detail > 0) {
      suppressCellClick.current = false
      return
    }
    setActive(index)
    if (cellBrush !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit(current => enter(current, [index], 'color', cellBrush))
      setSelected([])
      return
    }
    const givenDigit = givenDigitAt(visibleGivens, index)
    const armedInput = colorMode ? (colorTarget === 'cell' ? selectedColor : null) : selectedDigit
    if (eraseMode && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit(current => enter(current, [index], 'value', 0))
      setSelected([])
      return
    }
    if (pencilGroup && !givenDigit && values[index] === '0' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit(current => {
        const next = toggleCandidateGroup(current, index, candidateMode, pencilGroup)
        if (!trial && !completed) {
          const actionsForEdit = marksOf(pencilGroup).flatMap(digit => playerActions(current, next, [index], candidateMode, digit))
          if (actionsForEdit.length) void observeTechniqueActions(current, actionsForEdit, 'independent', hintEliminations(
            valuesOf(current), completeCandidateMasks(current), current.position.eliminations, gridSize
          ))
        }
        return next
      })
      return
    }
    const selectingMultiple = multi || (!pencilActive && (event.metaKey || event.ctrlKey))
    if (!givenDigit && !highlightMode && !selected.length && armedInput !== null && !highlightedDigitMask &&
      !event.shiftKey && !selectingMultiple) {
      enterFromInput([index], armedInput, mode, { toggleValue: !draft && mode === 'value' })
      return
    }
    if (givenDigit && highlightMode) toggleDigitHighlight(givenDigit, digitHighlightMatch)
    else if (!highlightedDigitMask) {
      if (givenDigit) setSelectedDigit(givenDigit)
      else if (!highlightMode) setSelectedDigit(null)
    }
    if (event.shiftKey && selected.length) setSelected(rectangleSelection(anchor, index, gridSize))
    else {
      setAnchor(index)
      setSelected(current => multi || event.metaKey || event.ctrlKey
        ? current.includes(index) ? current.filter(cell => cell !== index) : [...current, index]
        : current.length === 1 && current[0] === index ? [] : [index])
    }
  }

  function doubleClickCell(index: number, event: ReactMouseEvent) {
    if (!canDoubleClickSingle || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    const pending = pendingDoubleClickSingle.current?.index === index ? pendingDoubleClickSingle.current : null
    pendingDoubleClickSingle.current = null
    if (!pending || pending.game.position !== game.position || valuesOf(pending.game)[index] !== '0') return
    event.preventDefault()
    setActive(index)
    setAnchor(index)
    setSelected([index])
    enterFromInput([index], pending.digit, 'value')
  }

  return { clickCell, doubleClickCell }
}
