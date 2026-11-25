import { useCallback, useLayoutEffect, useRef } from 'react'
import type { PuzzleTool, ToolPanelTab, ToolPanels } from '../../sudoku/play-session'
import { closePlayToolPanel, selectPlayToolPanel } from '../../sudoku/play-session'

type InsightTab = { id: PuzzleTool }

type Options = {
  host: {
    mobile: boolean
    disabled: boolean
    previewing: boolean
    advancedWorkspace: boolean
    showRightPanel: boolean
  }
  panels: {
    toolPanels: ToolPanels
    openPuzzlePanels: PuzzleTool[]
    openInsightTabs: InsightTab[]
    activeDesktopTab: InsightTab | undefined
    isAvailable: (tool: PuzzleTool) => boolean
    setOpenPanels: (update: (current: ToolPanels) => ToolPanels) => void
  }
  controls: { puzzleMenuButtonRef: { current: HTMLButtonElement | null } }
  actions: {
    closePuzzleMenu: () => void
    closeActions: () => void
    changeHintVisuals: () => void
    revealHintDetails: (revealed: boolean) => void
    hideSolutionPath: () => void
    openRightPanel: () => void
  }
}

/** Own Play's host-specific panel transitions and focus handoffs; persistence remains in play-session. */
export function usePlayPanelNavigation({ host, panels, controls, actions }: Options) {
  const { mobile, disabled, previewing, advancedWorkspace, showRightPanel } = host
  const { toolPanels, openPuzzlePanels, openInsightTabs, activeDesktopTab, isAvailable, setOpenPanels } = panels
  const { puzzleMenuButtonRef } = controls
  const { closePuzzleMenu, closeActions, changeHintVisuals, revealHintDetails, hideSolutionPath, openRightPanel } = actions
  const rulesButtonRef = useRef<HTMLButtonElement>(null)
  const rulesPanelRef = useRef<HTMLElement>(null)
  const focusRulesAfterDialog = useRef(false)
  const insightTabsRef = useRef<HTMLDivElement>(null)
  const activeMobileInputTabRef = useRef<HTMLButtonElement>(null)
  const focusMobileInput = useRef(false)
  const mobileToolsOpener = useRef<HTMLButtonElement | null>(null)
  const desktopToolsOpener = useRef<HTMLButtonElement | null>(null)

  const selectToolPanel = useCallback((tab: ToolPanelTab, alsoOpen?: PuzzleTool) => {
    if (tab !== 'digits') {
      if (!openPuzzlePanels.includes(tab) && !isAvailable(tab)) return
      if (tab !== 'rules') changeHintVisuals()
      if (advancedWorkspace && !showRightPanel) openRightPanel()
    }
    if (tab === 'solution' || tab === 'techniques') revealHintDetails(false)
    setOpenPanels(current => selectPlayToolPanel(current, tab, alsoOpen))
  }, [openPuzzlePanels, isAvailable, changeHintVisuals, advancedWorkspace, showRightPanel, openRightPanel, revealHintDetails, setOpenPanels])

  const closeToolPanel = useCallback((tool: PuzzleTool, fromMenu = false) => {
    if (tool === 'solution') hideSolutionPath()
    if (mobile && !fromMenu) focusMobileInput.current = openPuzzlePanels.length === 1 || tool === 'rules'
    setOpenPanels(current => closePlayToolPanel(current, tool))
    if (mobile || fromMenu) return
    const remaining = openInsightTabs.filter(({ id }) => id !== tool)
    const next = remaining.find(({ id }) => id === activeDesktopTab?.id) ?? remaining.find(({ id }) => id === 'techniques') ?? remaining[0]
    const opener = tool === 'rules' ? rulesButtonRef.current : desktopToolsOpener.current
    const focus = next
      ? insightTabsRef.current?.querySelector<HTMLButtonElement>(`[data-insight-tab="${next.id}"]`)
      : opener?.isConnected ? opener : puzzleMenuButtonRef.current
    focus?.focus({ preventScroll: true })
  }, [hideSolutionPath, mobile, openPuzzlePanels.length, setOpenPanels, openInsightTabs, activeDesktopTab, puzzleMenuButtonRef])

  const showRulesTab = useCallback(() => {
    if (mobile) {
      mobileToolsOpener.current = rulesButtonRef.current
      focusMobileInput.current = true
    }
    selectToolPanel('rules')
  }, [mobile, selectToolPanel])

  const focusPinnedRules = useCallback(() => {
    if (!focusRulesAfterDialog.current) return null
    focusRulesAfterDialog.current = false
    if (mobile) return activeMobileInputTabRef.current
    if (advancedWorkspace) return rulesPanelRef.current
    return insightTabsRef.current?.querySelector<HTMLButtonElement>('[data-insight-tab="rules"]') ?? null
  }, [mobile, advancedWorkspace])

  const showPuzzleTool = useCallback((tool: PuzzleTool, alsoOpen?: PuzzleTool) => {
    if (!isAvailable(tool) || (mobile && disabled && !(tool === 'chains' && previewing))) return
    closePuzzleMenu()
    closeActions()
    if (mobile) {
      mobileToolsOpener.current = puzzleMenuButtonRef.current
      focusMobileInput.current = true
    }
    selectToolPanel(tool, alsoOpen)
  }, [isAvailable, mobile, disabled, previewing, closePuzzleMenu, closeActions, puzzleMenuButtonRef, selectToolPanel])

  const togglePuzzlePanel = useCallback((tool: PuzzleTool) => {
    if (openPuzzlePanels.includes(tool)) closeToolPanel(tool, true)
    else showPuzzleTool(tool)
  }, [openPuzzlePanels, closeToolPanel, showPuzzleTool])

  useLayoutEffect(() => {
    if (!focusMobileInput.current) return
    focusMobileInput.current = false
    const opener = mobileToolsOpener.current
    const target = activeMobileInputTabRef.current ?? (opener?.isConnected ? opener : puzzleMenuButtonRef.current)
    target?.focus({ preventScroll: true })
  }, [toolPanels, puzzleMenuButtonRef])

  return {
    rulesButtonRef,
    rulesPanelRef,
    focusRulesAfterDialog,
    insightTabsRef,
    activeMobileInputTabRef,
    focusMobileInput,
    mobileToolsOpener,
    desktopToolsOpener,
    selectToolPanel,
    closeToolPanel,
    showRulesTab,
    focusPinnedRules,
    showPuzzleTool,
    togglePuzzlePanel,
  }
}
