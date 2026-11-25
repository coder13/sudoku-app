import { type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject, useId, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { InputToolsMenu } from './InputToolsMenu'
import { motionDuration } from './Presence'
import { type ToolPanelTab, type PuzzleTool } from '../sudoku/play-session'
import { PLAY_PANEL_LABELS, PLAY_TOOL_TABS } from './PlayToolRegistry'
import { PanelActivityBoundary, type PanelActivity } from './PanelActivity'
import { moveRovingTab, scrollActiveTabIntoView } from './tab-navigation'
import { mergeRefs } from './merge-refs'

const TAB_SWIPE_SLOP = 10
const TAB_SWIPE_DISTANCE = 48
const TAB_SWIPE_AXIS_RATIO = 1.25
type MobileInputTab = ToolPanelTab | 'hint'

type TabSwipe = {
  pointerId: number
  startX: number
  startY: number
  width: number
  track: HTMLElement
  horizontal: boolean
  motion: boolean
  startOffset: number
  offset: number
  renderedOffset: number
  frame: number | null
}

function clearSwipePreview(swipe: TabSwipe) {
  if (swipe.frame !== null) cancelAnimationFrame(swipe.frame)
  swipe.track.style.removeProperty('transform')
}

function trackTransform(offset: number) {
  return `translate3d(${offset}%, 0, 0)`
}

function settleTrack(track: HTMLElement, offset: number, duration = motionDuration('standard')) {
  if (!duration || !offset) return null
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
  return track.animate([{ transform: trackTransform(offset) }, { transform: trackTransform(0) }], { duration, easing })
}

/** Show Digits and any open solving tools in the mobile input card. Worktable owns the saved tab selection. */
export function MobileInputTabs({ active, open, panels, pinnedHint, activeTabRef, layoutRefs, toolsDisabled, toolToggles, onShowTools, onSelect, onClose }: {
  active: ToolPanelTab
  open: PuzzleTool[]
  panels: Record<ToolPanelTab, ReactNode>
  pinnedHint?: ReactNode
  activeTabRef: Ref<HTMLButtonElement>
  layoutRefs?: {
    inputTabs: RefObject<HTMLDivElement | null>
    inputToolbar: RefObject<HTMLDivElement | null>
    inputPanels: RefObject<HTMLDivElement | null>
    digitsPanel: RefObject<HTMLDivElement | null>
    activeInputPanel: RefObject<HTMLDivElement | null>
  }
  toolsDisabled: boolean
  toolToggles?: ReactNode
  onShowTools?: (opener: HTMLButtonElement) => void
  onSelect: (tab: ToolPanelTab) => void
  onClose: (tab: PuzzleTool) => void
}) {
  const id = useId()
  const visibleTools = PLAY_TOOL_TABS.filter(({ id: tool }) => open.includes(tool)).map(({ id }) => id)
  const [closingTools, setClosingTools] = useState<ToolPanelTab[]>([])
  const [closingHint, setClosingHint] = useState(false)
  const [hintTabActive, setHintTabActive] = useState(false)
  const previousPinnedHint = useRef(Boolean(pinnedHint))
  const previousActive = useRef(active)
  const hasPinnedHint = Boolean(pinnedHint)
  const activeTab: MobileInputTab = hasPinnedHint && hintTabActive ? 'hint' : active
  const tabs: MobileInputTab[] = ['digits', ...visibleTools, ...(hasPinnedHint ? ['hint' as const] : [])]
  const toolbarTools = open.length ? visibleTools : closingTools
  const toolbarTabs: MobileInputTab[] = ['digits', ...toolbarTools, ...(hasPinnedHint || closingHint ? ['hint' as const] : [])]
  const toolbarTool = activeTab === 'digits' ? toolbarTools.at(0) : activeTab
  const toolbarToolToClose = toolbarTool === 'digits' || toolbarTool === 'hint' ? undefined : toolbarTool
  const closingToolbar = closingTools.length > 0 || closingHint
  const hasTabBar = Boolean(open.length || closingToolbar || hasPinnedHint)
  const hasInputCard = Boolean(open.length || closingToolbar || toolToggles || hasPinnedHint)
  const tabList = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const tabSwipe = useRef<TabSwipe | null>(null)
  const suppressSwipeClick = useRef(false)
  const swipeEntry = useRef<{ tab: MobileInputTab; offset: number; step: number } | null>(null)
  const tabMotion = useRef<Animation | null>(null)
  const previousTabCount = useRef(open.length + Number(hasPinnedHint))
  const previousVisibleTools = useRef<ToolPanelTab[]>(visibleTools)
  const naturalToolbarHeight = useRef(0)
  const closeAnimation = useRef<Animation | null>(null)
  const closeTimer = useRef<number | null>(null)
  const activeIndex = Math.max(0, tabs.indexOf(activeTab))
  const previousTab = tabs[(activeIndex - 1 + tabs.length) % tabs.length]
  const nextTab = tabs[(activeIndex + 1) % tabs.length]

  useLayoutEffect(() => {
    const wasPinned = previousPinnedHint.current
    previousPinnedHint.current = hasPinnedHint
    const selectionChanged = previousActive.current !== active
    previousActive.current = active
    if (selectionChanged || !hasPinnedHint) setHintTabActive(false)
    else if (!wasPinned && hasPinnedHint) setHintTabActive(true)
    setClosingHint(wasPinned && !hasPinnedHint && open.length === 0)
  }, [active, hasPinnedHint, open.length])

  useLayoutEffect(() => {
    const previous = previousVisibleTools.current
    previousVisibleTools.current = visibleTools
    if (previous.length > 0 && visibleTools.length === 0 && !hasPinnedHint) {
      setClosingTools(previous)
    } else if (visibleTools.length > 0 || hasPinnedHint) {
      setClosingTools(current => current.length ? [] : current)
    }
  }, [open.length, hasPinnedHint])

  useLayoutEffect(() => {
    if (!open.length) return
    const toolbar = layoutRefs?.inputToolbar.current
    if (toolbar) naturalToolbarHeight.current = toolbar.getBoundingClientRect().height
  }, [open.length, layoutRefs])

  useLayoutEffect(() => {
    if (!closingToolbar) return
    const toolbar = layoutRefs?.inputToolbar.current
    const duration = motionDuration('tabs')
    if (!toolbar || !duration) {
      layoutRefs?.inputPanels.current?.style.removeProperty('--mobile-input-tab-body-min-height')
      setClosingTools([])
      return
    }

    const style = getComputedStyle(toolbar)
    const height = Math.max(naturalToolbarHeight.current, toolbar.getBoundingClientRect().height)
    const previousOverflow = toolbar.style.overflow
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
    toolbar.style.overflow = 'clip'
    const animation = toolbar.animate([
      { height: `${height}px`, minHeight: style.minHeight, paddingBlockStart: style.paddingBlockStart,
        paddingBlockEnd: style.paddingBlockEnd, borderBottomWidth: style.borderBottomWidth, opacity: '1', translate: '0 0' },
      { height: '0px', minHeight: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px',
        borderBottomWidth: '0px', opacity: '0', translate: '0 -10px' },
    ], { duration, easing, fill: 'both' })
    closeAnimation.current = animation

    const finish = () => {
      if (closeAnimation.current !== animation) return
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = null
      layoutRefs?.inputPanels.current?.style.removeProperty('--mobile-input-tab-body-min-height')
      setClosingTools([])
      setClosingHint(false)
    }
    animation.addEventListener('finish', finish, { once: true })
    closeTimer.current = window.setTimeout(finish, duration + 32)

    return () => {
      animation.removeEventListener('finish', finish)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = null
      if (closeAnimation.current === animation) {
        closeAnimation.current = null
        // Remove the filled zero-height effect before this toolbar node is
        // reused as the menu slot or opened as a tab bar again.
        animation.cancel()
        toolbar.style.overflow = previousOverflow
      }
    }
  }, [closingToolbar, layoutRefs])

  useLayoutEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeAnimation.current?.cancel()
  }, [])

  useLayoutEffect(() => {
    scrollActiveTabIntoView(tabList.current)
    const tabCount = open.length + Number(hasPinnedHint)
    const firstToolOpened = previousTabCount.current === 0 && tabCount > 0
    previousTabCount.current = tabCount
    const entry = swipeEntry.current
    swipeEntry.current = null
    const element = track.current
    if (entry?.tab === activeTab && element) {
      // The new active slide is now centered in layout. Rebase the transform
      // so both slides stay where the player last saw them before settling.
      element.dataset.twoTabSide = entry.step > 0 ? 'left' : 'right'
      tabMotion.current = settleTrack(element, entry.offset)
    } else if (firstToolOpened && activeTab !== 'digits' && element) {
      // Render the selected tool immediately in its neighboring slot, then
      // slide it into the keypad position as the toolbar grows above it.
      element.dataset.twoTabSide = 'left'
      tabMotion.current = settleTrack(element, 100, motionDuration('tabs'))
    }
    return () => {
      tabMotion.current?.cancel()
      tabMotion.current = null
      if (tabSwipe.current) clearSwipePreview(tabSwipe.current)
      tabSwipe.current = null
    }
  }, [activeTab, open.length, hasPinnedHint, tabs.length])

  function selectTab(tab: MobileInputTab) {
    if (tab === 'hint') {
      setHintTabActive(true)
      return
    }
    setHintTabActive(false)
    onSelect(tab)
  }

  function startTabSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (tabSwipe.current) {
      clearSwipePreview(tabSwipe.current)
      tabSwipe.current = null
    }
    if (!event.isPrimary || event.button !== 0) return
    suppressSwipeClick.current = false
    const element = track.current
    if (toolsDisabled || tabs.length < 2 || !element) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [data-no-tab-swipe]')) return
    for (let element = target; element && element !== event.currentTarget; element = element.parentElement) {
      const style = getComputedStyle(element)
      if (['auto', 'scroll'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) return
    }
    tabSwipe.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, track: element,
      width: event.currentTarget.getBoundingClientRect().width,
      horizontal: false, motion: false, startOffset: 0, offset: 0, renderedOffset: 0, frame: null,
    }
  }

  function moveTabSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = tabSwipe.current
    if (!swipe || swipe.pointerId !== event.pointerId) return
    const deltaX = event.clientX - swipe.startX
    const deltaY = event.clientY - swipe.startY
    if (!swipe.horizontal) {
      if (Math.hypot(deltaX, deltaY) < TAB_SWIPE_SLOP) return
      if (Math.abs(deltaX) <= Math.abs(deltaY) * TAB_SWIPE_AXIS_RATIO) {
        tabSwipe.current = null
        return
      }
      swipe.horizontal = true
      swipe.motion = motionDuration('standard') > 0
      suppressSwipeClick.current = true
      if (tabMotion.current?.playState === 'running') {
        const transform = getComputedStyle(swipe.track).transform
        if (transform !== 'none' && swipe.track.offsetWidth) {
          swipe.startOffset = new DOMMatrixReadOnly(transform).m41 / swipe.track.offsetWidth * 100
        }
        tabMotion.current.cancel()
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (!swipe.motion || !swipe.width) return
    swipe.offset = Math.max(-100, Math.min(100, swipe.startOffset + deltaX / swipe.width * 100))
    swipe.frame ??= requestAnimationFrame(() => {
      swipe.frame = null
      if (tabs.length === 2) swipe.track.dataset.twoTabSide = swipe.offset > 0 ? 'left' : 'right'
      swipe.track.style.transform = trackTransform(swipe.offset)
      swipe.renderedOffset = swipe.offset
    })
  }

  function cancelTabSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = tabSwipe.current
    if (swipe?.pointerId !== event.pointerId) return
    tabSwipe.current = null
    clearSwipePreview(swipe)
    if (swipe.renderedOffset) tabMotion.current = settleTrack(swipe.track, swipe.renderedOffset)
  }

  function finishTabSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = tabSwipe.current
    if (!swipe || swipe.pointerId !== event.pointerId) return
    const deltaX = event.clientX - swipe.startX
    const deltaY = event.clientY - swipe.startY
    if (!swipe.horizontal || toolsDisabled || tabs.length < 2 ||
      Math.abs(deltaX) < TAB_SWIPE_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY) * TAB_SWIPE_AXIS_RATIO) {
      cancelTabSwipe(event)
      return
    }
    tabSwipe.current = null
    clearSwipePreview(swipe)
    const step = deltaX < 0 ? 1 : -1
    const tab = step === 1 ? nextTab : previousTab
    const offset = Math.max(-100, Math.min(100, swipe.renderedOffset + step * 100))
    swipeEntry.current = { tab, offset, step }
    selectTab(tab)
  }

  return <div ref={layoutRefs?.inputTabs} className={hasInputCard ? 'surface mobile-input-tabs' : undefined}
    data-tools-open={open.length > 0 || closingToolbar || hasPinnedHint || undefined}
    data-hint-in-tabs={hasPinnedHint || undefined} data-closing-tools={closingToolbar || undefined}>
    {hasInputCard && <div ref={layoutRefs?.inputToolbar} className={hasTabBar ? 'mobile-input-toolbar' : 'mobile-input-menu-slot'}
      data-closing={closingToolbar || undefined} aria-hidden={closingToolbar || undefined} inert={closingToolbar || undefined}
      data-grid-click-away-exempt data-no-panel-hold>
      {hasTabBar && (
        <div ref={tabList} role="tablist" aria-label="Sudoku input" className="mobile-input-tablist" onKeyDown={(event) => {
          moveRovingTab(event, toolbarTabs, activeTab, selectTab)
        }}>
          {toolbarTabs.map((tab) => <button type="button" key={tab} ref={activeTab === tab && !closingToolbar ? activeTabRef : undefined}
            id={`${id}-tab-${tab}`} role="tab" aria-selected={activeTab === tab} aria-controls={`${id}-panel-${tab}`}
            data-roving-tab={tab} tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => selectTab(tab)}>{tab === 'hint' ? 'Hint' : PLAY_PANEL_LABELS[tab]}</button>)}
        </div>
      )}
      {toolToggles && <InputToolsMenu disabled={toolsDisabled || closingToolbar} onShow={onShowTools}>{toolToggles}</InputToolsMenu>}
      {toolbarToolToClose && <IconButton variant="quiet" className="mobile-input-close"
        aria-label={`Close ${PLAY_PANEL_LABELS[toolbarToolToClose].toLowerCase()} panel`} onClick={() => onClose(toolbarToolToClose)}>
        <X size={20} aria-hidden="true" />
      </IconButton>}
    </div>}
    <div ref={layoutRefs?.inputPanels} className={hasInputCard ? 'mobile-input-panels' : undefined}
      onPointerDown={startTabSwipe} onPointerMove={moveTabSwipe}
      onPointerUp={finishTabSwipe} onPointerCancel={cancelTabSwipe}
      onLostPointerCapture={event => {
        // Touch starts with implicit capture on the child. Its loss bubbles
        // through this panel when we take capture for the horizontal swipe.
        if (event.target === event.currentTarget) cancelTabSwipe(event)
      }}
      onClickCapture={event => {
        if (!suppressSwipeClick.current || event.detail === 0) return
        suppressSwipeClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}>
      <div ref={track} className={hasInputCard ? 'mobile-input-track' : undefined}>
        {tabs.map((tab) => {
          const digits = tab === 'digits'
          const hint = tab === 'hint'
          const selected = tab === activeTab
          const slot = selected ? 'current' : tab === nextTab && tab === previousTab ? 'either'
            : tab === previousTab ? 'left' : tab === nextTab ? 'right' : undefined
          const activity: PanelActivity = selected ? 'active' : slot ? 'preview' : 'inactive'
          const panelRef = digits
            ? selected && layoutRefs ? mergeRefs(layoutRefs.digitsPanel, layoutRefs.activeInputPanel) : layoutRefs?.digitsPanel
            : selected ? layoutRefs?.activeInputPanel : undefined
          const content = hint ? pinnedHint : digits ? panels.digits : panels[tab as ToolPanelTab]
          return <div ref={panelRef} key={tab} id={hasTabBar ? `${id}-panel-${tab}` : undefined}
            role={hasTabBar ? 'tabpanel' : undefined} aria-labelledby={hasTabBar ? `${id}-tab-${tab}` : undefined}
            className={digits ? 'mobile-input-digits' : hint ? 'mobile-input-tool mobile-input-hint' : 'mobile-input-tool'} data-swipe-slot={slot} hidden={!digits && !slot}
            inert={!selected} aria-hidden={!selected || undefined}
            tabIndex={!digits && selected ? 0 : undefined} data-no-panel-hold={!digits || undefined}>
            {(digits || slot) && <PanelActivityBoundary activity={activity}>{content}</PanelActivityBoundary>}
          </div>
        })}
      </div>
    </div>
  </div>
}
