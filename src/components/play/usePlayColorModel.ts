import { useMemo } from 'react'
import type { Candidate, VariantPuzzle } from '../../sudoku/engine'
import { cellReference, type CellReferenceStyle } from '../../sudoku/hints'
import type { ColorTarget, Game } from '../../sudoku/game'
import { continueStrongLinkColors } from '../../sudoku/strong-link-colors'
import { COLOR_GROUP_CONTINUATION_ENABLED } from '../../sudoku/feature-flags'

type Options = {
  game: Game
  puzzle?: VariantPuzzle
  values: string
  displayedCandidates: number[] | null
  toolMasks: number[] | null
  candidatesLoading: boolean
  selected: readonly number[]
  active: number
  coloringDigit: number | null
  lastColoredCandidate: { gameId: string; candidate: Candidate } | null
  colorTarget: ColorTarget
  colorsVisible: boolean
  cellReferenceStyle: CellReferenceStyle
  gridSize: number
}

/** Resolve the coloring start point, group continuation, and its actionable status. */
export function usePlayColorModel({
  game, puzzle, values, displayedCandidates, toolMasks, candidatesLoading, selected, active, coloringDigit, lastColoredCandidate,
  colorTarget, colorsVisible, cellReferenceStyle, gridSize,
}: Options) {
  const colorLinkMasks = displayedCandidates && toolMasks &&
    !toolMasks.some((mask, cell) => values[cell] === '0' && !mask) ? toolMasks : null
  const paintedStart = lastColoredCandidate?.gameId === game.id && lastColoredCandidate.candidate.cell === active
    ? lastColoredCandidate.candidate : null
  const colorStartCell = selected.length > 1 ? null : selected[0] ?? active
  const colorStartDigit = colorTarget === 'candidate' && !selected.length && paintedStart ? paintedStart.digit : coloringDigit
  const colorStart = useMemo(() => colorStartCell !== null && colorStartDigit
    ? { cell: colorStartCell, digit: colorStartDigit } : null, [colorStartCell, colorStartDigit])
  const colorContinuation = useMemo(() => COLOR_GROUP_CONTINUATION_ENABLED && !game.grid && colorsVisible && colorLinkMasks && colorStart
    ? continueStrongLinkColors(colorLinkMasks, colorStart, game.position, colorTarget, puzzle) : null,
  [COLOR_GROUP_CONTINUATION_ENABLED, colorsVisible, colorLinkMasks, colorStart, game.position, colorTarget, puzzle, game.grid])
  const colorStartLocation = colorStart && cellReference(colorStart.cell, cellReferenceStyle, game.difficulty ?? undefined, gridSize)
  const colorConflict = colorContinuation?.conflicts[0]
  const colorConflictLocation = colorConflict && cellReference(colorConflict.cell, cellReferenceStyle, game.difficulty ?? undefined, gridSize)
  const remainingColors = colorContinuation?.marks.length ?? 0
  const colorSubject = colorTarget === 'cell' ? 'cell' : 'candidate'
  const canContinueColorGroup = colorContinuation?.status === 'ready'
  const colorGroupMessage = selected.length > 1 ? 'Select one starting cell to continue its group.'
    : !colorStart ? colorTarget === 'candidate' ? 'Color a starting candidate, then continue its group.' : undefined
    : !displayedCandidates ? 'Generate candidates in every empty cell first.'
    : candidatesLoading ? 'Loading candidates…'
    : !colorLinkMasks ? 'Check the grid and candidates before coloring links.'
    : colorContinuation?.status === 'uncolored' ? colorTarget === 'cell'
      ? `Color ${colorStartLocation} to start a group for ${colorStart.digit}.`
      : `Color ${colorStart.digit} in ${colorStartLocation} to start a group.`
    : colorContinuation?.status === 'missing-candidate' ? undefined
    : colorContinuation?.status === 'no-links' ? undefined
    : colorContinuation?.status === 'link-conflict' ? 'This group cannot alternate shades. Check its candidates.'
    : colorConflict ? `The color at ${colorConflictLocation} conflicts with this group. Adjust or erase that color.`
    : colorContinuation?.status === 'complete' ? `The group for ${colorStart.digit} at ${colorStartLocation} is fully colored.`
    : `Continue ${colorStart.digit} from ${colorStartLocation}: ${remainingColors} more ${colorSubject}${remainingColors === 1 ? '' : 's'}.`

  return { colorLinkMasks, colorStart, colorContinuation, canContinueColorGroup, colorGroupMessage }
}
