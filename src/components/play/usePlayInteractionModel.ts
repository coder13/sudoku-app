import type { ColorTarget, Mode } from '../../sudoku/game'
import { onlyGivensSelected } from '../../sudoku/highlighting'
import { canStartCellSelectionDrag } from '../../sudoku/selection'

type Options = {
  draft: boolean
  disabled: boolean
  solved: boolean
  highlightMode: boolean
  colorMode: boolean
  eraseMode: boolean
  pencil: boolean
  pencilModifier: boolean
  brush: number | null
  cellBrush: number | null
  colorTarget: ColorTarget
  selectedColor: number | null
  cellColorsDisabled: boolean
  hintAnnotations: boolean
  mobileHintPreview: boolean
  sketchDrawing: boolean
  browsingStrongLinks: boolean
  selectedDigit: number | null
  highlightedDigitMask: number
  selected: readonly number[]
  values: string
  visibleGivens: string
  gridSize: number
  multi: boolean
  candidateMode: Mode
  doubleClickSingles: boolean
  interactionBlocked: boolean
}

/** Resolve mutually exclusive Play modes and the interactions the current host enables. */
export function usePlayInteractionModel({
  draft,
  disabled,
  solved,
  highlightMode,
  colorMode,
  eraseMode,
  pencil,
  pencilModifier,
  brush,
  cellBrush,
  colorTarget,
  selectedColor,
  cellColorsDisabled,
  hintAnnotations,
  mobileHintPreview,
  sketchDrawing,
  browsingStrongLinks,
  selectedDigit,
  highlightedDigitMask,
  selected,
  values,
  visibleGivens,
  gridSize,
  multi,
  candidateMode,
  doubleClickSingles,
  interactionBlocked,
}: Options) {
  const candidateBrush = colorTarget === 'candidate' && !cellColorsDisabled && !sketchDrawing && !hintAnnotations && !mobileHintPreview
    ? (colorMode ? selectedColor : brush)
    : null
  const paintingCandidates = candidateBrush !== null
  const colorPreviewColor = colorTarget === 'cell' ? cellBrush : candidateBrush
  const colorPreview = colorPreviewColor !== null && colorPreviewColor > 0 && !sketchDrawing && !browsingStrongLinks
    ? { target: colorTarget, color: colorPreviewColor }
    : undefined
  const canActivateTemporaryPencil = !pencil && !highlightMode && !colorMode && !eraseMode && !disabled && !draft && !solved &&
    !sketchDrawing && brush === null && !mobileHintPreview && !interactionBlocked
  const temporaryPencil = pencilModifier && canActivateTemporaryPencil
  const pencilActive = (pencil || temporaryPencil) && brush === null && !colorMode && !eraseMode
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencilActive ? candidateMode : 'value'
  const penOrPencil = !draft && !highlightMode && !colorMode && !eraseMode && brush === null
  const givenHighlightSelection = penOrPencil && onlyGivensSelected(visibleGivens, selected)
  const hasInputSelection = selected.length > 0 && !givenHighlightSelection
  const cellDrivenHighlight = givenHighlightSelection || (penOrPencil && !selectedDigit && !highlightedDigitMask && selected.length === 1 && values[selected[0]] !== '0')
  const canEditPencil = !disabled && !draft && pencilActive && !highlightMode && !paintingCandidates && !sketchDrawing && !browsingStrongLinks && !hintAnnotations
  const pencilGroup = canEditPencil ? highlightedDigitMask & ((1 << gridSize) - 1) : 0
  const canDragCandidates = canEditPencil && !pencilGroup && !multi && selectedDigit !== null && selectedDigit > 0
  const canSelectCellsByDrag = canStartCellSelectionDrag({
    highlightMode,
    penOrPencil: penOrPencil && !sketchDrawing && !browsingStrongLinks && !hintAnnotations,
    selectedDigit,
  })
  const pencilPreviewMask = pencilGroup || (canDragCandidates && selectedDigit ? 1 << (selectedDigit - 1) : 0)
  const canPreviewCandidates = Boolean(pencilPreviewMask) && (Boolean(pencilGroup) || selected.length === 0) && !solved &&
    !mobileHintPreview && !interactionBlocked
  const canHighlightCellCandidates = !disabled && !draft && !solved && !colorMode && !eraseMode && !sketchDrawing && brush === null &&
    !paintingCandidates && !hintAnnotations && !mobileHintPreview && !interactionBlocked
  const canDoubleClickSingle = doubleClickSingles && !draft && !solved && !pencilActive && !highlightMode && !colorMode && !eraseMode &&
    brush === null && selectedDigit === null && !hintAnnotations

  return {
    candidateBrush,
    paintingCandidates,
    colorPreview,
    canActivateTemporaryPencil,
    temporaryPencil,
    pencilActive,
    mode,
    penOrPencil,
    givenHighlightSelection,
    hasInputSelection,
    cellDrivenHighlight,
    canEditPencil,
    pencilGroup,
    canDragCandidates,
    canSelectCellsByDrag,
    pencilPreviewMask,
    canPreviewCandidates,
    canHighlightCellCandidates,
    canDoubleClickSingle,
  }
}
