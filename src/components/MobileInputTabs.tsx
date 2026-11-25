import { type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject, useId, useLayoutEffect, useRef } from 'react'
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

function settleTrack(track: HTMLElement, offset: number) {
  const duration = motionDuration('standard')
  if (!duration || !offset) return null
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
  return track.animate([{ transform: trackTransform(offset) }, { transform: trackTransform(0) }], { duration, easing })
}

/** Show Digits and any open solving tools in the mobile input card. Worktable owns the saved tab selection. */
export function MobileInputTabs({ active, open, panels, activeTabRef, layoutRefs, toolsDisabled, toolToggles, onShowTools, onSelect, onClose }: {
  active: ToolPanelTab
  open: PuzzleTool[]
  panels: Record<ToolPanelTab, ReactNode>
  activeTabRef: Ref<HTMLButtonElement>
  layoutRefs?: {
    inputTabs: RefObject<HTMLDivElement | null>
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
  const tabs = ['digits', ...visibleTools] as const
  const toolToClose = active === 'digits' ? visibleTools.at(0) : active
  const hasInputCard = Boolean(open.length || toolToggles)
  const tabList = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const tabSwipe = useRef<TabSwipe | null>(null)
  const suppressSwipeClick = useRef(false)
  const swipeEntry = useRef<{ tab: ToolPanelTab; offset: number; step: number } | null>(null)
  const tabMotion = useRef<Animation | null>(null)
  const activeIndex = Math.max(0, tabs.indexOf(active))
  const previousTab = tabs[(activeIndex - 1 + tabs.length) % tabs.length]
  const nextTab = tabs[(activeIndex + 1) % tabs.length]

  useLayoutEffect(() => {
    scrollActiveTabIntoView(tabList.current)
    const entry = swipeEntry.current
    swipeEntry.current = null
    const element = track.current
    if (entry?.tab === active && element) {
      // The new active slide is now centered in layout. Rebase the transform
      // so both slides stay where the player last saw them before settling.
      element.dataset.twoTabSide = entry.step > 0 ? 'left' : 'right'
      tabMotion.current = settleTrack(element, entry.offset)
    }
    return () => {
      tabMotion.current?.cancel()
      tabMotion.current = null
      if (tabSwipe.current) clearSwipePreview(tabSwipe.current)
      tabSwipe.current = null
    }
  }, [active, tabs.length])

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
    onSelect(tab)
  }

  return <div ref={layoutRefs?.inputTabs} className={hasInputCard ? 'surface mobile-input-tabs' : undefined} data-tools-open={open.length > 0 || undefined}>
    {hasInputCard && <div className={open.length ? 'mobile-input-toolbar' : 'mobile-input-menu-slot'} data-grid-click-away-exempt data-no-panel-hold>
      {open.length > 0 && (
        <div ref={tabList} role="tablist" aria-label="Sudoku input" className="mobile-input-tablist" onKeyDown={(event) => {
          moveRovingTab(event, tabs, active, onSelect)
        }}>
          {tabs.map((tab) => <button type="button" key={tab} ref={active === tab ? activeTabRef : undefined}
            id={`${id}-tab-${tab}`} role="tab" aria-selected={active === tab} aria-controls={`${id}-panel-${tab}`}
            data-roving-tab={tab} tabIndex={active === tab ? 0 : -1}
            onClick={() => onSelect(tab)}>{PLAY_PANEL_LABELS[tab]}</button>)}
        </div>
      )}
      {toolToggles && <InputToolsMenu disabled={toolsDisabled} onShow={onShowTools}>{toolToggles}</InputToolsMenu>}
      {toolToClose && <IconButton variant="quiet" className="mobile-input-close"
        aria-label={`Close ${PLAY_PANEL_LABELS[toolToClose].toLowerCase()} panel`} onClick={() => onClose(toolToClose)}>
        <X size={20} aria-hidden="true" />
      </IconButton>}
    </div>}
    <div className={hasInputCard ? 'mobile-input-panels' : undefined}
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
          const selected = tab === active
          const slot = selected ? 'current' : tab === nextTab && tab === previousTab ? 'either'
            : tab === previousTab ? 'left' : tab === nextTab ? 'right' : undefined
          const activity: PanelActivity = selected ? 'active' : slot ? 'preview' : 'inactive'
          const panelRef = digits
            ? selected && layoutRefs ? mergeRefs(layoutRefs.digitsPanel, layoutRefs.activeInputPanel) : layoutRefs?.digitsPanel
            : selected ? layoutRefs?.activeInputPanel : undefined
          return <div ref={panelRef} key={tab} id={open.length ? `${id}-panel-${tab}` : undefined}
            role={open.length ? 'tabpanel' : undefined} aria-labelledby={open.length ? `${id}-tab-${tab}` : undefined}
            className={digits ? 'mobile-input-digits' : 'mobile-input-tool'} data-swipe-slot={slot} hidden={!digits && !slot}
            inert={!selected} aria-hidden={!selected || undefined}
            tabIndex={!digits && selected ? 0 : undefined} data-no-panel-hold={!digits || undefined}>
            {(digits || slot) && <PanelActivityBoundary activity={activity}>{panels[tab]}</PanelActivityBoundary>}
          </div>
        })}
      </div>
    </div>
  </div>
}
