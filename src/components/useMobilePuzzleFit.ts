import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { MobilePanelId } from '../sudoku/mobile-panels'
import type { MobileInputResizeRefs } from './MobileInputResizeHandle'

type Options = {
  layoutRef: RefObject<HTMLDivElement | null>
  pageRef: RefObject<HTMLElement | null>
  workspaceRef?: RefObject<HTMLDivElement | null>
  puzzlePanelRef: RefObject<HTMLDivElement | null>
  inputPanelRef: RefObject<HTMLDivElement | null>
  hintPanelRef: RefObject<HTMLDivElement | null>
  gapRef: RefObject<HTMLDivElement | null>
  order: readonly MobilePanelId[]
  puzzleId: string
  puzzleShrink?: number
  inputTabCount?: number
  inputResizeRefs?: MobileInputResizeRefs
  rearranging: boolean
  withHint: boolean
  fitContent?: boolean
}

/** Fit the mobile puzzle and keypad to their available page space. */
export function useMobilePuzzleFit({
  layoutRef, pageRef, workspaceRef, puzzlePanelRef, inputPanelRef, hintPanelRef, gapRef,
  order, puzzleId, puzzleShrink = 0, inputTabCount, inputResizeRefs, rearranging, withHint, fitContent,
}: Options) {
  const [inputResizing, setInputResizing] = useState(false)
  const inputResizingRef = useRef(false)
  const fitBoardNow = useRef<(() => void) | null>(null)
  const puzzleGestureBase = useRef<{ puzzleId: string; height: number } | null>(null)
  const updateInputResizing = useCallback((resizing: boolean) => {
    inputResizingRef.current = resizing
    setInputResizing(resizing)
  }, [])
  const fitAfterResize = useCallback(() => fitBoardNow.current?.(), [])

  useLayoutEffect(() => {
    const layout = layoutRef.current
    const page = pageRef.current ?? layout?.closest<HTMLElement>('main')
    const workspace = workspaceRef?.current ?? layout?.parentElement
    const puzzle = puzzlePanelRef.current
    const input = inputPanelRef.current
    const hintPanel = withHint ? hintPanelRef.current : null
    const gap = gapRef.current
    if (!layout || !page || !workspace || !puzzle || !input || !gap) return
    if (!pageRef.current) pageRef.current = page
    const blockSize = (element: HTMLElement) => element.getBoundingClientRect().height
    const fitBoard = () => {
      // The resize handle drives the card and puzzle preview at pointer cadence.
      // Avoid layout reads and keypad zoom updates here: zoom changes force a
      // layout of every digit control on each frame. The observed panel size
      // triggers this once more after the gesture commits.
      if (inputResizingRef.current) return
      // The footer must remain as wide as the input card even after the grid shrinks.
      const inputWidth = input.clientWidth
      if (inputWidth) {
        const value = `${Math.round(inputWidth)}px`
        if (layout.style.getPropertyValue('--mobile-input-panel-width') !== value) {
          layout.style.setProperty('--mobile-input-panel-width', value)
        }
      }
      const digits = inputResizeRefs?.digitsPanel.current
      const digitControls = inputResizeRefs?.digitControls.current
      if (digits && digitControls) {
        const visibleHeight = digits.getBoundingClientRect().height
        const currentScale = Number.parseFloat(digitControls.style.getPropertyValue('--mobile-digit-fit-scale')) || 1
        const naturalHeight = digitControls.getBoundingClientRect().height / currentScale
        const fitScale = naturalHeight > 0 ? Math.min(1, visibleHeight / naturalHeight) : 1
        const nextScale = String(Math.round(fitScale * 1000) / 1000)
        if (digitControls.style.getPropertyValue('--mobile-digit-fit-scale') !== nextScale) {
          digitControls.style.setProperty('--mobile-digit-fit-scale', nextScale)
        }
      }
      const board = inputResizeRefs?.boardViewport.current ?? inputResizeRefs?.boardFrame.current
      const puzzleColumn = inputResizeRefs?.puzzleColumn.current
      const puzzleContent = inputResizeRefs?.puzzle.current
      if (!board || !puzzleColumn || !puzzleContent) return
      const panelHeight = Math.max(1, puzzleContent.offsetHeight)
      const savedNaturalHeight = parseFloat(layout.style.getPropertyValue('--mobile-natural-puzzle-height'))
      const samePuzzleBase = puzzleGestureBase.current?.puzzleId === puzzleId
      const baseHeight = puzzleShrink === 0
        ? panelHeight
        : samePuzzleBase ? puzzleGestureBase.current!.height : savedNaturalHeight || panelHeight + puzzleShrink
      puzzleGestureBase.current = { puzzleId, height: baseHeight }
      const puzzleScale = Math.max(0.25, (baseHeight - puzzleShrink) / baseHeight)
      if (!puzzleContent.hasAttribute('data-puzzle-gesture-scaling')) {
        puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', String(puzzleScale))
      }
      const panelRect = puzzle.getBoundingClientRect()
      const boardRect = board.getBoundingClientRect()
      const boardBaseWidth = boardRect.width / puzzleScale
      const boardBaseHeight = boardRect.height / puzzleScale
      const boardBaseTop = panelHeight + (boardRect.top - panelRect.top - panelHeight) / puzzleScale
      // Measure the layout edge independently of the snap transform and page scroll.
      const aboveHeight = workspace.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop + puzzle.offsetTop
      const puzzleTop = puzzleColumn.offsetTop + puzzleContent.offsetTop + panelHeight * (1 - puzzleScale)
      const gestureGeometry = {
        '--mobile-puzzle-above-height': `${Math.ceil(Math.max(0, aboveHeight))}px`,
        '--mobile-puzzle-gesture-top': `${puzzleTop}px`,
        '--mobile-puzzle-gesture-side-width': `${Math.max(0, (panelRect.width - boardBaseWidth * puzzleScale) / 2)}px`,
        '--mobile-puzzle-gesture-side-top': `${panelHeight + (boardBaseTop - panelHeight) * puzzleScale}px`,
        '--mobile-puzzle-gesture-side-height': `${boardBaseHeight * puzzleScale}px`,
      }
      for (const [property, nextValue] of Object.entries(gestureGeometry)) {
        if (puzzle.style.getPropertyValue(property) !== nextValue) puzzle.style.setProperty(property, nextValue)
      }
      // Keep the input card at the bottom edge and fit the board into the
      // space above it. Shrinking the card gives the board room to grow back
      // to its gesture-set ceiling; growing it consumes board space first.
      if (getComputedStyle(workspace).display === 'flex') {
        const pageStyle = getComputedStyle(page)
        const workspaceStyle = getComputedStyle(workspace)
        const gapStyle = getComputedStyle(gap)
        const pixels = (value: string) => Number.parseFloat(value) || 0
        const margins = [puzzle, input, hintPanel].reduce((sum, card) => (
          sum + (card ? pixels(getComputedStyle(card).marginBlockStart) + pixels(getComputedStyle(card).marginBlockEnd) : 0)
        ), 0)
        const available = page.clientHeight - pixels(pageStyle.paddingBlockStart) - pixels(pageStyle.paddingBlockEnd)
          - pixels(workspaceStyle.paddingBlockStart) - pixels(workspaceStyle.paddingBlockEnd)
          - pixels(gapStyle.flexBasis) - margins - input.offsetHeight
          - (hintPanel ? blockSize(hintPanel) : 0)
        const puzzleChrome = Math.max(0, puzzle.offsetHeight - board.offsetHeight)
        const boardLimit = `${Math.max(64, Math.floor(available - puzzleChrome))}px`
        if (layout.style.getPropertyValue('--mobile-fit-board-height') !== boardLimit) {
          layout.style.setProperty('--mobile-fit-board-height', boardLimit)
        }
      } else {
        layout.style.removeProperty('--mobile-fit-board-height')
      }
    }

    fitBoardNow.current = fitBoard
    fitBoard()
    const observer = new ResizeObserver(fitBoard)
    for (const element of [page, puzzle, inputResizeRefs?.puzzleColumn.current,
      inputResizeRefs?.boardViewport.current ?? inputResizeRefs?.boardFrame.current, input, hintPanel]) {
      if (element) observer.observe(element)
    }
    return () => {
      observer.disconnect()
      fitBoardNow.current = null
      layout.style.removeProperty('--mobile-input-panel-width')
    }
  }, [layoutRef, pageRef, workspaceRef, puzzlePanelRef, inputPanelRef, hintPanelRef, gapRef,
    order, puzzleId, puzzleShrink, inputTabCount, inputResizeRefs, rearranging, withHint, fitContent])

  return { inputResizing, updateInputResizing, fitAfterResize }
}
