import type { Dispatch, SetStateAction } from 'react'
import type { Candidate } from '../../sudoku/engine'
import {
  alternateColorShade,
  clearCandidateColors,
  enter,
  paintCandidates,
  paintCells,
  toggleCandidateColor,
  type ColorTarget,
  type Game,
} from '../../sudoku/game'
import type { ColorContinuation } from '../../sudoku/strong-link-colors'

type Options = {
  puzzle: {
    id: string
    position: Game['position']
    selectedCells: readonly number[]
    coloringDigit: number | null
  }
  continuation: ColorContinuation | null
  state: {
    target: ColorTarget
    selectedColor: number | null
    brush: number | null
    candidateBrush: number | null
    colorMode: boolean
  }
  capability: {
    canPaint: boolean
    cellColorsDisabled: boolean
    sketchDrawing: boolean
  }
  actions: {
    setTarget: (target: ColorTarget) => void
    setSelectedColor: Dispatch<SetStateAction<number | null>>
    setColorBrush: Dispatch<SetStateAction<number | null>>
    setSelectedDigit: Dispatch<SetStateAction<number | null>>
    setEraseMode: Dispatch<SetStateAction<boolean>>
    setSavedHighlightMode: Dispatch<SetStateAction<boolean>>
    setActive: Dispatch<SetStateAction<number>>
    setSelected: Dispatch<SetStateAction<number[]>>
    setLastColoredCandidate: Dispatch<SetStateAction<{ gameId: string; candidate: Candidate } | null>>
    clearHighlightedDigits: () => void
    setHighlightCandidatePairs: Dispatch<SetStateAction<boolean>>
    leaveChainInput: (switchMobileToDigits?: boolean) => void
    changeHintVisuals: (visuals: 'hint' | 'player') => void
    edit: (transform: (current: Game) => Game) => void
  }
}

/** Own color palette actions while leaving tool switching and board placement to the host. */
export function usePlayColorActions({ puzzle, continuation, state, capability, actions }: Options) {
  const { id, position, selectedCells, coloringDigit } = puzzle
  const { target, selectedColor, brush, candidateBrush, colorMode } = state
  const { canPaint, cellColorsDisabled, sketchDrawing } = capability
  const {
    setTarget, setSelectedColor, setColorBrush, setSelectedDigit, setEraseMode, setSavedHighlightMode,
    setActive, setSelected, setLastColoredCandidate, clearHighlightedDigits, setHighlightCandidatePairs,
    leaveChainInput, changeHintVisuals, edit,
  } = actions

  function changeColorTarget(next: ColorTarget) {
    if (next === target) return
    setTarget(next)
    changeHintVisuals('player')
  }

  function chooseColor(color: number) {
    if (!canPaint) return
    leaveChainInput(false)
    if (brush === color) {
      setColorBrush(null)
      return
    }
    setEraseMode(false)
    setSavedHighlightMode(false)
    if (color > 0) setSelectedColor(color)
    if (target === 'cell' && selectedCells.length) {
      edit(current => enter(current, [...selectedCells], 'color', color))
      setSelectedDigit(coloringDigit)
    }
    changeHintVisuals('player')
    setColorBrush(color)
  }

  function highlightColorDigit(digit: number | null) {
    setSelected([])
    clearHighlightedDigits()
    setHighlightCandidatePairs(false)
    setSelectedDigit(digit)
  }

  function switchColorShade() {
    if (cellColorsDisabled || sketchDrawing) return
    const color = colorMode ? selectedColor : brush
    const alternate = color === null ? null : alternateColorShade(color)
    if (alternate === null) return
    if (colorMode) setSelectedColor(alternate)
    else {
      setColorBrush(alternate)
      setSelectedColor(alternate)
    }
  }

  function clearColors() {
    edit(target === 'candidate'
      ? clearCandidateColors
      : current => enter(current, current.position.colors.map((_, index) => index), 'color', 0))
    setColorBrush(null)
    setSelectedColor(null)
  }

  function colorCandidate(candidate: Candidate) {
    if (candidateBrush === null) return
    setActive(candidate.cell)
    setSelected([])
    setLastColoredCandidate({ gameId: id, candidate })
    edit(current => toggleCandidateColor(current, candidate, candidateBrush))
  }

  function continueColorGroup() {
    if (!canPaint || continuation?.status !== 'ready') return
    const { marks } = continuation
    edit(current => current.position !== position ? current : target === 'cell' ? paintCells(current, marks) : paintCandidates(current, marks))
  }

  return { changeColorTarget, chooseColor, highlightColorDigit, switchColorShade, clearColors, colorCandidate, continueColorGroup }
}
