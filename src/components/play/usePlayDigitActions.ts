import type { Dispatch, SetStateAction } from 'react'
import { candidateCount, digitsFromMask, hasCandidate, paintCandidateGroup, type Game } from '../../sudoku/game'
import { defaultDigitHighlight, type DigitHighlight } from '../../sudoku/play-session'
import type { DigitHighlightMatch } from '../../sudoku/highlighting'

type Options = {
  puzzle: { gridSize: number }
  selection: {
    selectedDigit: number | null
    highlightedDigitMask: number
    cellDrivenHighlight: boolean
    brush: number | null
  }
  capability: { canPaint: boolean }
  actions: {
    setDigitHighlight: Dispatch<SetStateAction<DigitHighlight>>
    setSelectedDigit: Dispatch<SetStateAction<number | null>>
    setHighlightCandidatePairs: Dispatch<SetStateAction<boolean>>
    setSelected: Dispatch<SetStateAction<number[]>>
    setColorBrush: Dispatch<SetStateAction<number | null>>
    setEraseMode: Dispatch<SetStateAction<boolean>>
    edit: (transform: (current: Game) => Game) => void
  }
}

/** Own digit selection and candidate-paint operations shared by the keypad and board. */
export function usePlayDigitActions({ puzzle: { gridSize }, selection, capability: { canPaint }, actions }: Options) {
  const { selectedDigit, highlightedDigitMask, cellDrivenHighlight, brush } = selection
  const { setDigitHighlight, setSelectedDigit, setHighlightCandidatePairs, setSelected, setColorBrush, setEraseMode, edit } = actions

  function paintCandidateDigits(digits: readonly number[], color: number) {
    if (!canPaint || !digits.length) return
    edit(current => paintCandidateGroup(current, digits, color))
  }

  function paintSelectedCandidateDigits(color: number) {
    const mask = highlightedDigitMask || (selectedDigit === null ? 0 : 1 << (selectedDigit - 1))
    if (mask) paintCandidateDigits(digitsFromMask(mask, gridSize), color)
  }

  function paintCandidateDigit(digit: number, color: number) {
    const paintGroup = candidateCount(highlightedDigitMask) > 1 && hasCandidate(highlightedDigitMask, digit)
    paintCandidateDigits(paintGroup ? digitsFromMask(highlightedDigitMask, gridSize) : [digit], color)
  }

  function clearHighlightedDigits() {
    setDigitHighlight(current => current.mask ? { ...defaultDigitHighlight, match: current.match } : current)
  }

  function clearDigitSelection() {
    clearHighlightedDigits()
    setSelectedDigit(null)
    setHighlightCandidatePairs(false)
  }

  function showDigitHighlights(mask: SetStateAction<number>, match: DigitHighlightMatch) {
    setDigitHighlight(current => ({
      mask: typeof mask === 'function' ? mask(current.mask) : mask,
      match,
    }))
    setSelectedDigit(null)
    setHighlightCandidatePairs(false)
    setColorBrush(null)
    setEraseMode(false)
  }

  function toggleDigitHighlight(digit: number, match: DigitHighlightMatch) {
    if (cellDrivenHighlight) setSelected([])
    const previous = selectedDigit ? 1 << (selectedDigit - 1) : 0
    if (brush !== null) {
      const currentMask = highlightedDigitMask || previous
      const mask = currentMask ^ (1 << (digit - 1))
      setDigitHighlight({ mask, match })
      setSelectedDigit(null)
      setHighlightCandidatePairs(false)
      setEraseMode(false)
      return
    }
    showDigitHighlights(current => (current || previous) ^ (1 << (digit - 1)), match)
  }

  function changeDigitHighlightMatch(match: DigitHighlightMatch) {
    setDigitHighlight(current => ({ ...current, match }))
  }

  return {
    paintCandidateDigits,
    paintCandidateDigit,
    paintSelectedCandidateDigits,
    clearHighlightedDigits,
    clearDigitSelection,
    showDigitHighlights,
    toggleDigitHighlight,
    changeDigitHighlightMatch,
  }
}
