import { useCallback, useMemo } from 'react'
import { playSession } from '../../sudoku/play-session'
import { onlyCandidate, type Game } from '../../sudoku/game'
import type { VariantPuzzle } from '../../sudoku/engine'
import { CLASSIC_GRID } from '../../sudoku/grid'
import type { SubsetContext } from '../../sudoku/subsets'
import { candidateToolMasks } from './play-model'
import { useChainCapability } from '../useChainCapability'

type Options = {
  game: Game
  puzzle?: VariantPuzzle
  visibleCells?: ReadonlySet<number>
  values: string
  masks: number[] | null | undefined
  noteMasks?: number[] | null
  notesMatch: boolean
  displayedCandidates: number[] | null
  eliminations?: number[]
  toolMasks: number[] | null
  drawingIntent: boolean | null
  highlightedDigitMask: number
  coloringDigit: number | null
  savedHighlightMode: boolean
  colorsActive: boolean
  colorMode: boolean
  eraseMode: boolean
  brush: number | null
  draft: boolean
  solved: boolean
  completed: boolean
  disabled: boolean
  chainsPanelOpen: boolean
  chainsVisible: boolean
  startDrawingOnOpen: boolean
  showStrongLinks: boolean
  hintVisualsActive: boolean
}

/** Own the chain graph, drawing sketch, and strong-link view as one play capability. */
export function usePlayChainModel({
  game, puzzle, visibleCells, values, masks, noteMasks, notesMatch, displayedCandidates, eliminations, toolMasks, drawingIntent,
  highlightedDigitMask, coloringDigit, savedHighlightMode, colorsActive, colorMode, eraseMode, brush,
  draft, solved, completed, disabled, chainsPanelOpen, chainsVisible, startDrawingOnOpen, showStrongLinks, hintVisualsActive,
}: Options) {
  const chainDrawingRequested = drawingIntent ?? (game.chainSketch?.pending != null)
  const chainsActive = !colorsActive && !game.grid && (chainDrawingRequested || startDrawingOnOpen || showStrongLinks)
  const showChainSketches = !colorsActive && (chainsActive || !game.grid && Boolean(game.chainSketch))
  const chainMasks = useMemo(() => {
    if ((!showChainSketches && !chainsPanelOpen) || draft || solved) return null
    return notesMatch ? toolMasks : candidateToolMasks(noteMasks, values, displayedCandidates, eliminations)
  }, [showChainSketches, chainsPanelOpen, draft, solved, notesMatch, toolMasks, noteMasks, values, displayedCandidates, eliminations])
  const missingChainCandidates = chainMasks?.some((mask, cell) => !mask && values[cell] === '0')
  const canAnalyzeChains = Boolean(masks && !missingChainCandidates && !disabled)
  const playerHighlightMask = colorMode || eraseMode ? 0 : highlightedDigitMask
  const startHighlightDigit = playerHighlightMask ? onlyCandidate(playerHighlightMask) : coloringDigit
  const setDrawingIntent = useCallback((intent: boolean) => playSession.set(game.id, 'drawingIntent', intent), [game.id])
  const strongLinkMask = highlightedDigitMask || (coloringDigit === null ? 0 : 1 << (coloringDigit - 1))
  const strongLinksVisible = !savedHighlightMode && brush === null && showStrongLinks && chainsActive && canAnalyzeChains && !hintVisualsActive
  const subsetContext = useMemo<SubsetContext | undefined>(() => game.grid ? undefined : ({
    grid: CLASSIC_GRID, values, masks: chainMasks, puzzle, visibleCells,
  }), [game.grid, values, chainMasks, puzzle, visibleCells])
  const chainCapability = useChainCapability({
    game,
    masks: chainMasks,
    puzzle,
    sketch: {
      canDraw: chainsActive && !completed,
      canErase: chainsVisible && !colorsActive && !game.grid && !completed,
      graphCurrent: Boolean(masks),
      canAnalyze: canAnalyzeChains,
      startHighlightDigit,
      drawingIntent: savedHighlightMode || colorsActive ? false : drawingIntent,
      setDrawingIntent,
      subsetContext,
    },
    strongLinks: { visible: strongLinksVisible, digitMask: strongLinkMask },
  })
  const { graph: chainGraph, sketch, selectedCandidates: selectedChainCandidates, strongLinkOverlay: strongLinks } = chainCapability
  const canApplyChainEdits = chainsPanelOpen && Boolean(chainMasks && canAnalyzeChains && sketch.allActions.length)
  const chainHighlightDigit = sketch.active.highlightedDigit
  const browsingStrongLinks = strongLinksVisible && !sketch.drawing && !sketch.erasing

  return {
    drawingIntent,
    chainDrawingRequested,
    chainsActive,
    showChainSketches,
    chainMasks,
    missingChainCandidates,
    chainGraph,
    canAnalyzeChains,
    playerHighlightMask,
    startHighlightDigit,
    sketch,
    selectedChainCandidates,
    canApplyChainEdits,
    chainHighlightDigit,
    strongLinkMask,
    strongLinksVisible,
    strongLinks,
    browsingStrongLinks,
  }
}
