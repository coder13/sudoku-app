import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { runEngine } from '../sudoku/engine'
import { completeCandidateMasks, onlyCandidate, type Game } from '../sudoku/game'
import type { BoardAnnotations } from './BoardAnnotations'
import { useChainCapability } from './useChainCapability'

type Options = {
  game: Game
  puzzle: { givens: string; candidates: readonly number[] }
  values: string
  interactive: boolean
  chainsOpen: boolean
  highlightMask: number
  drawingIntent: boolean
  setDrawingIntent: Dispatch<SetStateAction<boolean>>
  showStrongLinks: boolean
  updateGame: (change: (current: Game) => Game) => void
}

/** Own the lesson's candidate-derived chain capability and its temporary sketch. */
export function useLessonChainModel({
  game, puzzle, values, interactive, chainsOpen, highlightMask, drawingIntent, setDrawingIntent, showStrongLinks, updateGame,
}: Options) {
  const [legalCandidates, setLegalCandidates] = useState<{ values: string; masks: number[] | null }>()

  useEffect(() => {
    if (!chainsOpen || !interactive || values === puzzle.givens) return
    const controller = new AbortController()
    void runEngine({ type: 'notes', values }, { signal: controller.signal }).then(
      masks => {
        if (!controller.signal.aborted) setLegalCandidates({ values, masks })
      },
      () => {
        if (!controller.signal.aborted) setLegalCandidates({ values, masks: null })
      }
    )
    return () => controller.abort()
  }, [chainsOpen, interactive, puzzle.givens, values])

  const baseMasks = values === puzzle.givens
    ? puzzle.candidates
    : legalCandidates?.values === values ? legalCandidates.masks : undefined
  const chainMasks = useMemo(() => {
    if (!chainsOpen || !interactive || !baseMasks) return null
    const shown = completeCandidateMasks(game)
    const masks = shown?.map((mask, cell) => values[cell] === '0' ? mask & baseMasks[cell] : 0)
    return masks && !masks.some((mask, cell) => !mask && values[cell] === '0') ? masks : null
  }, [baseMasks, chainsOpen, game, interactive, values])
  const strongLinksVisible = showStrongLinks && Boolean(chainMasks)
  const chainCapability = useChainCapability({
    game,
    masks: chainMasks,
    sketch: {
      canDraw: chainsOpen && interactive,
      canErase: chainsOpen && interactive,
      graphCurrent: Boolean(chainMasks),
      canAnalyze: Boolean(chainMasks),
      startHighlightDigit: onlyCandidate(highlightMask),
      drawingIntent,
      setDrawingIntent,
      updateGame: change => updateGame(change),
    },
    strongLinks: { visible: strongLinksVisible, digitMask: highlightMask },
  })
  const { graph: chainGraph, sketch, selectedCandidates: selectedChainCandidates, strongLinkOverlay: strongLinks } = chainCapability
  const usingChains = sketch.drawing || sketch.erasing || strongLinksVisible
  const sketchAnnotations: BoardAnnotations | undefined = chainsOpen && sketch.annotations.links?.length ? sketch.annotations : undefined

  return { baseMasks, chainMasks, chainGraph, sketch, strongLinksVisible, strongLinks, usingChains, sketchAnnotations, selectedChainCandidates }
}
