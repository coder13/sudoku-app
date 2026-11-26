import { useMemo } from 'react'
import { chainCandidate, chainNodeCandidates, makeChainGraph } from '../sudoku/chains'
import type { VariantPuzzle } from '../sudoku/engine'
import { hasUniquenessProof, type Game } from '../sudoku/game'
import type { SubsetContext } from '../sudoku/subsets'
import { useChainSketch } from './useChainSketch'
import { useStrongLinkOverlay } from './useStrongLinkOverlay'

type Options = {
  game: Game
  masks: readonly number[] | null
  puzzle?: VariantPuzzle
  sketch: {
    canDraw: boolean
    canErase: boolean
    graphCurrent: boolean
    canAnalyze: boolean
    startHighlightDigit: number | null
    drawingIntent: boolean | null
    setDrawingIntent: (intent: boolean) => void
    updateGame?: (change: (current: Game) => Game) => void
    subsetContext?: SubsetContext
  }
  strongLinks: { visible: boolean; digitMask: number }
}

/** Compose the reusable chain graph, sketch, and strong-link annotation capability. */
export function useChainCapability({ game, masks, puzzle, sketch: sketchOptions, strongLinks: strongLinkOptions }: Options) {
  const sets = game.subsetWorkspace?.sets
  const unique = !game.variant && hasUniquenessProof(game)
  const graph = useMemo(() => masks ? makeChainGraph(masks, puzzle, sets, unique) : null, [masks, puzzle, sets, unique])
  const sketch = useChainSketch(game, graph, sketchOptions)
  const selectedCandidates = useMemo(() => sketch.grouping
    ? sketch.groupSelection.map(chainCandidate)
    : sketch.pending === null ? [] : chainNodeCandidates(sketch.pending), [sketch.grouping, sketch.groupSelection, sketch.pending])
  const strongLinkOverlay = useStrongLinkOverlay(
    strongLinkOptions.visible ? graph : null,
    strongLinkOptions.digitMask,
    sketch.annotations,
    sketch.colorPairs,
    sketch.usedColorPairs,
    sketch.assignedColors
  )

  return { graph, sketch, selectedCandidates, strongLinkOverlay }
}
