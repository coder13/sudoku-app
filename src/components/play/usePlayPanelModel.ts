import { useCallback, useMemo } from 'react'
import type { Game } from '../../sudoku/game'
import type { PuzzleTool } from '../../sudoku/play-session'
import type { WorkspaceMode } from '../../sudoku/preferences'
import type { SolutionPathState } from '../SolutionPath'
import { PLAY_TOOL_TABS, playToolAvailable, resolvePlayPanels, type PlayPanelState, type PlayToolContext } from '../PlayToolRegistry'

type Options = {
  game: Game
  toolPanels: PlayPanelState
  placeholder: boolean
  draft: boolean
  mixedVariant: boolean
  solved: boolean
  showResults: boolean
  showSolvedGrid: boolean
  mobile: boolean
  desktop: boolean
  workspaceMode: WorkspaceMode
  showRightPanel: boolean
  desktopColorsVisible: boolean
  desktopChainsVisible: boolean
  desktopSolutionVisible: boolean
  solutionPathRevealed: boolean
  solutionPath: SolutionPathState | null
  savedHighlightMode: boolean
  rearranging: boolean
}

/** Resolve panel availability and the play surface state for each responsive host. */
export function usePlayPanelModel({
  game, toolPanels, placeholder, draft, mixedVariant, solved, showResults, showSolvedGrid,
  mobile, desktop, workspaceMode, showRightPanel, desktopColorsVisible, desktopChainsVisible,
  desktopSolutionVisible, solutionPathRevealed, solutionPath, savedHighlightMode, rearranging,
}: Options) {
  const gridPuzzle = Boolean(game.grid)
  const advancedWorkspace = desktop && workspaceMode === 'advanced'
  const toolContext = useMemo<PlayToolContext>(() => ({ placeholder, draft, gridPuzzle, mixedVariant, solved }),
    [placeholder, draft, gridPuzzle, mixedVariant, solved])
  const panelAvailable = useCallback((panel: PuzzleTool) => playToolAvailable(panel, toolContext), [toolContext])
  const { open: openPuzzlePanels, active: activeToolPanel } = resolvePlayPanels(toolPanels, toolContext, desktop)
  const advancedPanelOpen = useCallback((panel: PuzzleTool) => openPuzzlePanels.includes(panel), [openPuzzlePanels])
  const openInsightTabs = useMemo(() => desktop && !advancedWorkspace
    ? PLAY_TOOL_TABS.filter(({ id }) => openPuzzlePanels.includes(id)) : [], [desktop, advancedWorkspace, openPuzzlePanels])
  const activeDesktopTab = openInsightTabs.find(({ id }) => id === activeToolPanel) ??
    openInsightTabs.find(({ id }) => id === 'techniques') ?? openInsightTabs[0]
  const puzzleToolsAvailable = !placeholder && !draft && !solved
  const mobileToolsAvailable = mobile && puzzleToolsAvailable
  const previewing = !game.paused && !draft && !savedHighlightMode && solutionPathRevealed && solutionPath !== null &&
    (mobile ? activeToolPanel === 'solution' : advancedWorkspace ? desktopSolutionVisible : activeDesktopTab?.id === 'solution')
  const showMobileResults = mobile && showResults && !previewing
  const historyDisabled = placeholder || previewing || rearranging || (!showResults && game.paused)
  const disabled = historyDisabled || game.paused
  const cellColorsDisabled = draft || disabled || (solved && !showSolvedGrid)
  const chainsVisible = !gridPuzzle && (mobile ? activeToolPanel === 'chains'
    : advancedWorkspace ? showRightPanel && desktopChainsVisible : activeDesktopTab?.id === 'chains')
  const colorsPanelOpen = openPuzzlePanels.includes('colors')
  const colorsVisible = mobile ? activeToolPanel === 'colors'
    : advancedWorkspace ? showRightPanel && desktopColorsVisible : activeDesktopTab?.id === 'colors'

  return {
    toolContext, panelAvailable, openPuzzlePanels, activeToolPanel, advancedPanelOpen, openInsightTabs,
    activeDesktopTab, advancedWorkspace, puzzleToolsAvailable, mobileToolsAvailable, previewing,
    showMobileResults, historyDisabled, disabled, cellColorsDisabled, chainsVisible,
    colorsPanelOpen, colorsVisible,
  }
}
