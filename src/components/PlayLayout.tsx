import { type ComponentProps, type PointerEvent, type ReactNode, type Ref, type RefObject, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { MobilePanelLayout } from './MobilePanelLayout'
import { animatePanelLayout, MotionSurface, motionDuration } from './Presence'
import { RESIZE_STEP } from './ResizeStepControls'
import { PanelActivityBoundary } from './PanelActivity'
import { moveRovingTab, scrollActiveTabIntoView } from './tab-navigation'
import { mergeRefs } from './merge-refs'
import { isPlayLayoutResizing, usePlayLayoutAnchors } from './play-layout-anchors'
import { availableDesktopHintHeight, measureDesktopHintSpacing } from './desktop-hint-sizing'

type InsightTab<Id extends string> = { id: Id; label: string }
type Insights<Id extends string> = {
  tabs: readonly InsightTab<Id>[]
  active: Id
  content: ReactNode
  onSelect: (id: Id) => void
  onClose: () => void
  tabListRef?: Ref<HTMLDivElement>
}

type MobilePlay = Omit<ComponentProps<typeof MobilePanelLayout>, 'panels'> & {
  inputTitle: string
  hintPlaceholder?: ReactNode
}
/** Host-owned refs for fixed-height desktop hint fitting and resizing. */
export type PlayLayoutHintLayout = {
  column: RefObject<HTMLDivElement | null>
  frame: RefObject<HTMLDivElement | null>
  card: RefObject<HTMLElement | null>
  body: RefObject<HTMLDivElement | null>
  toolbar: RefObject<HTMLDivElement | null>
}

/** Use the same grid, input, hint, and insight slots for every playable puzzle. */
export function PlayLayout<Id extends string>({ desktop, puzzle, input, hintLayout, hint, insights, mobile, advanced }: {
  desktop: boolean
  puzzle: ReactNode
  input: ReactNode
  hintLayout?: PlayLayoutHintLayout
  hint?: ComponentProps<typeof MotionSurface>['children']
  insights?: Insights<Id>
  mobile: MobilePlay
  advanced?: ReactNode
}) {
  const anchors = usePlayLayoutAnchors()
  const puzzleStack = useRef<HTMLDivElement>(null)
  const hintSlot = useRef<HTMLDivElement>(null)
  const inputStack = useRef<HTMLDivElement>(null)
  const puzzleStackRef = useMemo(() => mergeRefs(puzzleStack, anchors?.puzzleStack), [anchors])
  const hintSlotRef = useMemo(() => mergeRefs(hintSlot, anchors?.hintSlot), [anchors])
  const inputStackRef = useMemo(() => mergeRefs(inputStack, anchors?.inputStack), [anchors])
  const standardDesktop = desktop && !advanced
  const hintOpen = Boolean(hint)
  useLayoutEffect(() => {
    if (!standardDesktop) return
    const stack = puzzleStack.current
    const slot = hintSlot.current
    if (!stack || !slot) return
    if (!hintOpen) {
      slot.style.removeProperty('--desktop-hint-size')
      slot.style.removeProperty('--desktop-hint-height')
      slot.style.removeProperty('--desktop-hint-toolbar-height')
      stack.style.removeProperty('--desktop-hint-board-width')
      return
    }

    const column = hintLayout?.column.current
    const frame = hintLayout?.frame.current
    const card = hintLayout?.card.current
    const toolbar = hintLayout?.toolbar.current
    if (!column || !frame || !card) return

    stack.style.removeProperty('--desktop-hint-board-width')
    const baseFrameWidth = frame.getBoundingClientRect().width
    const baseColumnHeight = column.getBoundingClientRect().height

    slot.style.removeProperty('--desktop-hint-height')
    slot.style.removeProperty('--desktop-hint-size')
    const spacing = measureDesktopHintSpacing(slot, toolbar)
    const { gap, bottomGap, toolbarHeight } = spacing
    slot.style.setProperty('--desktop-hint-toolbar-height', `${toolbarHeight}px`)
    const cardHeight = card.offsetHeight
    const maxInitialHeight = availableDesktopHintHeight(stack.clientHeight, spacing)
    const initialHeight = Math.min(Math.ceil(cardHeight), maxInitialHeight)
    slot.style.setProperty('--desktop-hint-height', `${initialHeight}px`)

    const fitBoard = () => {
      if (isPlayLayoutResizing(anchors)) return
      const savedHintSize = Number.parseFloat(slot.style.getPropertyValue('--desktop-hint-size'))
      const initialHintSize = Number.parseFloat(slot.style.getPropertyValue('--desktop-hint-height'))
      const hintCardHeight = Number.isFinite(savedHintSize) ? savedHintSize : initialHintSize
      const hintToolbar = hintLayout?.toolbar.current
      const currentSpacing = measureDesktopHintSpacing(slot, hintToolbar)
      slot.style.setProperty('--desktop-hint-toolbar-height', `${currentSpacing.toolbarHeight}px`)
      const hintHeight = (Number.isFinite(hintCardHeight) ? hintCardHeight : 0) + currentSpacing.toolbarHeight + currentSpacing.gap + currentSpacing.bottomGap
      if (!hintHeight) {
        stack.style.removeProperty('--desktop-hint-board-width')
        return
      }
      const scale = Number(getComputedStyle(stack).getPropertyValue('--desktop-layout-scale')) || 1
      const style = getComputedStyle(frame)
      const dimension = (name: string) => Number(style.getPropertyValue(name))
      const rows = (dimension('--board-rows') || 9) + dimension('--outside-top') + dimension('--outside-bottom')
      const columns = (dimension('--board-columns') || 9) + dimension('--outside-left') + dimension('--outside-right')
      const aspect = columns / rows
      const room = stack.getBoundingClientRect().height - baseColumnHeight
      const spareHeight = room - hintHeight
      const width = Math.min(baseFrameWidth / scale,
        Math.max(0, Math.floor((baseFrameWidth + spareHeight * aspect) / scale)))
      const limit = `${width}px`
      if (stack.style.getPropertyValue('--desktop-hint-board-width') !== limit) {
        stack.style.setProperty('--desktop-hint-board-width', limit)
      }
    }

    fitBoard()
    const layoutObserver = new ResizeObserver(fitBoard)
    for (const element of [stack, slot, column]) layoutObserver.observe(element, { box: 'border-box' })
    return () => {
      layoutObserver.disconnect()
    }
  }, [standardDesktop, hintOpen, hintLayout?.column, hintLayout?.frame, hintLayout?.card, hintLayout?.toolbar, anchors])

  if (advanced) return advanced
  if (!desktop) {
    const { inputTitle, hintPlaceholder, ...layout } = mobile
    return <MobilePanelLayout {...layout} pageRef={anchors?.page} workspaceRef={anchors?.workspace} panels={{
      puzzle: { title: 'Puzzle', content: puzzle },
      hint: mobile.withHint ? { title: 'Hint', content: hint || hintPlaceholder } : undefined,
      input: { title: inputTitle, content: input },
    }} />
  }
  return <>
    <div ref={puzzleStackRef} className="standard-puzzle-stack">
      {puzzle}
      <div ref={hintSlotRef} className="standard-hint-slot" id="standard-puzzle-hint" data-open={hintOpen}>
        <div className="standard-hint-content"><MotionSurface>{hint}</MotionSurface></div>
        {hint && hintLayout && <DesktopHintDivider stackRef={puzzleStack} slotRef={hintSlot} layout={hintLayout} />}
      </div>
    </div>
    <div ref={inputStackRef} className="standard-input-stack" id="standard-digit-input">
      {input}
      <MotionSurface>{insights && <PlayInsights {...insights} />}</MotionSurface>
    </div>
  </>
}

type HintDrag = {
  divider: HTMLDivElement
  slot: HTMLElement
  pointerId: number
  startY: number
  y: number
  height: number
  min: number
  max: number
  scale: number
  savedSize: string
  frame: number | null
}

function DesktopHintDivider({ stackRef, slotRef, layout }: {
  stackRef: RefObject<HTMLDivElement | null>
  slotRef: RefObject<HTMLDivElement | null>
  layout: PlayLayoutHintLayout
}) {
  const anchors = usePlayLayoutAnchors()
  const divider = useRef<HTMLDivElement>(null)
  const drag = useRef<HintDrag | null>(null)

  function measure() {
    const slot = slotRef.current
    const stack = stackRef.current
    const card = layout.card.current
    if (!slot || !stack || !card) return
    const height = card.offsetHeight
    const body = layout.body.current
    const toolbar = layout.toolbar.current
    const spacing = measureDesktopHintSpacing(slot, toolbar)
    const max = Math.max(height, availableDesktopHintHeight(stack.clientHeight, spacing))
    const min = Math.min(max, Math.max(96, height - (body?.offsetHeight ?? height) + 24))
    return { slot, height, min, max }
  }

  function reportHeight() {
    const range = measure()
    if (!range) return
    const { height, min, max } = range
    divider.current?.setAttribute('aria-valuemin', String(Math.min(min, height)))
    divider.current?.setAttribute('aria-valuemax', String(Math.max(max, height)))
    divider.current?.setAttribute('aria-valuenow', String(height))
    divider.current?.setAttribute('aria-valuetext', `${height} pixels`)
  }

  function finish(pointerId?: number, y?: number) {
    const current = drag.current
    if (!current || (pointerId !== undefined && current.pointerId !== pointerId)) return
    const { slot, divider } = current
    drag.current = null
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    if (y !== undefined && y !== current.startY) {
      slot.style.setProperty('--desktop-hint-size', `${heightAtPointer(current, y)}px`)
    } else if (current.savedSize) {
      slot.style.setProperty('--desktop-hint-size', current.savedSize)
    } else {
      slot.style.removeProperty('--desktop-hint-size')
    }
    slot.removeAttribute('data-hint-resizing')
    if (divider.hasPointerCapture(current.pointerId)) divider.releasePointerCapture(current.pointerId)
  }

  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    reportHeight()
    const observer = new ResizeObserver(reportHeight)
    const card = layout.card.current
    const stack = stackRef.current
    const toolbar = layout.toolbar.current
    if (card) observer.observe(card)
    if (toolbar) observer.observe(toolbar)
    if (stack) observer.observe(stack)
    const cancel = () => finish()
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      cancel()
      observer.disconnect()
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [layout, slotRef, stackRef])

  function heightAtPointer(current: HintDrag, y: number) {
    const height = current.height + (current.startY - y) / current.scale
    return Math.min(current.max, Math.max(current.min, Math.round(height)))
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current || isPlayLayoutResizing(anchors)) return
    const range = measure()
    if (!range) return
    const { slot, height, min, max } = range
    const scale = Number(getComputedStyle(slot).getPropertyValue('--desktop-layout-scale')) || 1
    drag.current = {
      divider: event.currentTarget, slot, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
      height, min, max, scale,
      savedSize: slot.style.getPropertyValue('--desktop-hint-size'), frame: null,
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    current.y = event.clientY
    if (current.frame !== null) return
    current.frame = requestAnimationFrame(() => {
      current.frame = null
      current.slot.setAttribute('data-hint-resizing', '')
      current.slot.style.setProperty('--desktop-hint-size', `${heightAtPointer(current, current.y)}px`)
    })
  }

  return <div ref={divider} className="desktop-hint-divider" role="separator" aria-orientation="horizontal"
    aria-label="Resize hint panel" aria-controls="standard-puzzle-hint" title="Drag to resize hint panel" tabIndex={0}
    onPointerDown={start} onPointerMove={move}
    onPointerUp={event => finish(event.pointerId, event.clientY)}
    onPointerCancel={event => finish(event.pointerId)}
    onLostPointerCapture={event => finish(event.pointerId)}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      const range = measure()
      if (!range) return
      event.preventDefault()
      event.stopPropagation()
      finish()
      const { slot, height, min, max } = range
      if (event.key === 'Home') {
        slot.style.removeProperty('--desktop-hint-size')
      } else {
        const step = event.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP
        slot.style.setProperty('--desktop-hint-size', `${Math.min(max, Math.max(min, height + step))}px`)
      }
    }} />
}

function PlayInsights<Id extends string>({ tabs, active, content, onSelect, onClose, tabListRef, className, ...props }:
  Insights<Id> & Omit<ComponentProps<'section'>, keyof Insights<Id>>) {
  const selected = tabs.find(tab => tab.id === active)
  const instanceId = useId()
  const classes = ['desktop-insight-panel', className].filter(Boolean).join(' ')
  const panel = useRef<HTMLElement>(null)
  const previousSize = useRef<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const size = () => ({ width: element.offsetWidth, height: element.offsetHeight })
    const before = previousSize.current
    const after = size()
    const duration = motionDuration('panel')
    let animation: Animation | undefined
    if (before && duration && before.width && before.height && after.width && after.height &&
      (before.width !== after.width || before.height !== after.height)) {
      const bounds = element.getBoundingClientRect()
      animation = animatePanelLayout(element, {
        left: bounds.left, top: bounds.top,
        width: bounds.width * before.width / after.width,
        height: bounds.height * before.height / after.height,
      }, duration)
    }
    previousSize.current = after
    const observer = new ResizeObserver(() => { previousSize.current = size() })
    observer.observe(element)
    return () => {
      observer.disconnect()
      animation?.cancel()
    }
  }, [tabs.length])
  useLayoutEffect(() => {
    scrollActiveTabIntoView(panel.current?.querySelector<HTMLElement>('[role="tablist"]') ?? null)
  }, [active, tabs.length])
  return <section {...props} ref={panel} className={classes} aria-label="Puzzle insights" data-grid-click-away-exempt>
    <div className="desktop-insight-toolbar">
      <div ref={tabListRef} className="desktop-insight-tabs" role="tablist" aria-label="Puzzle insight tabs"
        onKeyDown={event => moveRovingTab(event, tabs.map(tab => tab.id), active, onSelect)}>
        {tabs.map(({ id, label }) => <button type="button" key={id} role="tab" data-insight-tab={id}
          data-roving-tab={id} id={`${instanceId}-tab-${id}`} aria-controls={`${instanceId}-content`}
          aria-selected={active === id} tabIndex={active === id ? 0 : -1}
          onClick={() => onSelect(id)}>{label}</button>)}
      </div>
      <IconButton type="button" variant="quiet" className="desktop-insight-close"
        aria-label={`Close ${selected?.label.toLowerCase() ?? 'insight'} tab`} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </IconButton>
    </div>
    <div className="desktop-insight-body" id={`${instanceId}-content`} role="tabpanel"
      aria-labelledby={`${instanceId}-tab-${active}`}>
      <PanelActivityBoundary activity="active">{content}</PanelActivityBoundary>
    </div>
  </section>
}

/** Put a hint card in the standard desktop or mobile hint slot. */
export function PlayHint({ mobile, panelRef, className, ...props }: ComponentProps<'div'> & {
  mobile: boolean; panelRef?: Ref<HTMLDivElement>
}) {
  const anchors = usePlayLayoutAnchors()
  const ref = useMemo(() => mergeRefs(panelRef, anchors?.hint), [panelRef, anchors])
  const classes = ['hint-dock', mobile && 'workspace-controls mobile-hint-panel', className].filter(Boolean).join(' ')
  return <div {...props} className={classes} ref={ref} aria-live="polite" data-grid-click-away-controls />
}

/** Use for the standard keypad action menu trigger. */
