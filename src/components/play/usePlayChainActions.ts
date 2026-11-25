import type { Dispatch, SetStateAction } from 'react'
import type { Candidate } from '../../sudoku/engine'
import type { InputToolOverride } from '../../sudoku/input-tool-mode'
import type { useChainSketch } from '../useChainSketch'
import type { useStrongLinkOverlay } from '../useStrongLinkOverlay'

type Options = {
  model: {
    sketch: ReturnType<typeof useChainSketch>
    strongLinks: ReturnType<typeof useStrongLinkOverlay>
  }
  state: {
    showStrongLinks: boolean
    strongLinkMask: number
    strongLinksVisible: boolean
    chainHighlightDigit: number | null
  }
  actions: {
    setSelected: Dispatch<SetStateAction<number[]>>
    setColorBrush: Dispatch<SetStateAction<number | null>>
    setColorMode: Dispatch<SetStateAction<boolean>>
    setInputToolOverride: (override: InputToolOverride) => void
    setShowStrongLinks: Dispatch<SetStateAction<boolean>>
    setStartDrawingOnOpen: Dispatch<SetStateAction<boolean>>
    showDigitHighlights: (mask: number, match: 'any') => void
    changeHintVisuals: (visuals: 'hint' | 'player') => void
  }
}

/** Own Play's chain and strong-link actions while the host supplies tool transitions. */
export function usePlayChainActions({ model, state, actions }: Options) {
  const { sketch, strongLinks } = model
  const { showStrongLinks, strongLinkMask, strongLinksVisible, chainHighlightDigit } = state
  const {
    setSelected, setColorBrush, setColorMode, setInputToolOverride, setShowStrongLinks,
    setStartDrawingOnOpen, showDigitHighlights, changeHintVisuals,
  } = actions

  function setStrongLinkHighlights(mask: number) {
    setSelected([])
    setColorBrush(null)
    setColorMode(false)
    showDigitHighlights(mask, 'any')
  }

  function toggleStrongLinks() {
    if (!showStrongLinks) {
      setColorBrush(null)
      setInputToolOverride(null)
      changeHintVisuals('player')
    }
    setStartDrawingOnOpen(false)
    if (sketch.drawing) sketch.suspend()
    setShowStrongLinks(current => !current)
  }

  function toggleStrongLinkDigit(digit: number) {
    setStrongLinkHighlights(strongLinkMask ^ (1 << (digit - 1)))
  }

  function startStrongLinkChain(candidate: Candidate) {
    sketch.beginAt(candidate, strongLinks.component(candidate))
  }

  function selectStrongLinkCandidate(candidate: Candidate) {
    if (sketch.drawing && !sketch.active.hidden && (sketch.grouping || sketch.pending !== null || sketch.contains(candidate))) {
      sketch.select(candidate)
    } else {
      startStrongLinkChain(candidate)
    }
  }

  function toggleChainHighlight(digit: number) {
    if (strongLinksVisible) {
      const mask = digit === 0 ? 0 : 1 << (digit - 1)
      setStrongLinkHighlights(strongLinkMask === mask ? 0 : mask)
      return
    }
    sketch.setHighlightedDigit(digit === 0 || chainHighlightDigit === digit ? null : digit)
  }

  return { setStrongLinkHighlights, toggleStrongLinks, toggleStrongLinkDigit, selectStrongLinkCandidate, startStrongLinkChain, toggleChainHighlight }
}
