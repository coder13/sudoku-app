import { useMemo } from 'react'
import { withCellColors, type ColorTarget, type Game } from '../../sudoku/game'
import type { InputToolState } from '../../sudoku/input-tool-mode'
import { useCellPaintStroke } from './useCellPaintStroke'

export type CellPaintStroke = { gameId: string; brush: number; color: number; cells: ReadonlySet<number> }

type Options = {
  gameId: string
  game: Game
  selectedColor: number | null
  colorTarget: ColorTarget
  colorBrush: number | null
  savedInputTool: InputToolState
  cellColorsDisabled: boolean
  hintAnnotations: boolean
  mobileHintOpen: boolean
  playerVisualsSelected: boolean
  gridSize: number
  onPaint: (stroke: CellPaintStroke) => void
  onStrokeStart: (pointerId: number) => void
  onStrokeCell: (cell: number) => void
  capturePointer: (pointerId: number) => void
}

/** Derive mutually exclusive input presentation and the board's live paint preview. */
export function usePlayInputModel({
  gameId, game, selectedColor, colorTarget, colorBrush, savedInputTool, cellColorsDisabled, hintAnnotations, mobileHintOpen,
  playerVisualsSelected, gridSize, onPaint, onStrokeStart, onStrokeCell, capturePointer,
}: Options) {
  const canPaint = !cellColorsDisabled
  const mobileHintPreview = mobileHintOpen && !playerVisualsSelected
  const brush = canPaint && !hintAnnotations && !mobileHintPreview ? colorBrush : null
  const colorMode = brush === null && savedInputTool.override === 'color'
  const eraseMode = brush === null && savedInputTool.override === 'erase'
  const highlightMode = brush === null && savedInputTool.override === 'highlight'
  const pencil = savedInputTool.pencil && savedInputTool.override !== 'highlight'
  const cellBrush = colorTarget === 'cell' && canPaint && !hintAnnotations && !mobileHintPreview
    ? brush ?? (colorMode ? selectedColor : null) : null
  const cellPaint = useCellPaintStroke({ gameId, brush: cellBrush, gridSize, onPaint, onStrokeStart, onStrokeCell, capturePointer })
  const boardPosition = useMemo(() => {
    const position = game.position
    const preview = cellPaint.preview
    if (!preview || preview.gameId !== gameId || preview.brush !== cellBrush) return position
    return withCellColors(position, Array.from(preview.cells, cell => ({ cell, color: preview.color })))
  }, [game.position, cellPaint.preview, cellBrush, gameId])

  return { canPaint, mobileHintPreview, brush, colorMode, eraseMode, highlightMode, pencil, cellBrush, boardPosition, cellPaint }
}
