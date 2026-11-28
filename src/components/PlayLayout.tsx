import { type ComponentProps, type ReactNode, type Ref, type RefObject, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { HintCardResizeContext } from './HintCard'
import { MobilePanelLayout } from './MobilePanelLayout'
import { animatePanelLayout, MotionSurface, motionDuration } from './Presence'
import { RESIZE_STEP } from './ResizeStepControls'
import { PanelActivityBoundary } from './PanelActivity'
import { moveRovingTab, scrollActiveTabIntoView } from './tab-navigation'
import { mergeRefs } from './merge-refs'
import { isPlayLayoutResizing, usePlayLayoutAnchors } from './play-layout-anchors'
import { clampDesktopHintHeight, desktopHintHeight, desktopHintPuzzleScale, measureDesktopHintBounds, type DesktopHintBounds } from './desktop-hint-sizing'
import { usePointerResizePreview } from './usePointerResizePreview'

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
  puzzle: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  heading: RefObject<HTMLDivElement | null>
  toolbar: RefObject<HTMLDivElement | null>
  size: RefObject<number | undefined>
  onSizeChange: (size: number | undefined) => void
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
    <div key={mobile.puzzleId} ref={puzzleStackRef} className="standard-puzzle-stack">
      {puzzle}
      {hintLayout ? <DesktopHintSlot stackRef={puzzleStack} slotRef={hintSlot} forwardedRef={hintSlotRef} layout={hintLayout}>
        {hint}
      </DesktopHintSlot> : <div ref={hintSlotRef} className="standard-hint-slot" id="standard-puzzle-hint" data-open={Boolean(hint)}>
        <div className="standard-hint-content"><MotionSurface speed="tabs">{hint}</MotionSurface></div>
      </div>}
    </div>
    <div ref={inputStackRef} className="standard-input-stack" id="standard-digit-input">
      {input}
      <MotionSurface>{insights && <PlayInsights {...insights} />}</MotionSurface>
    </div>
  </>
}

type HintDrag = {
  bounds: DesktopHintBounds
  startY: number
  height: number
  previewHeight: number
  scale: number
}

function DesktopHintSlot({ stackRef, slotRef, forwardedRef, layout, children }: {
  stackRef: RefObject<HTMLDivElement | null>
  slotRef: RefObject<HTMLDivElement | null>
  forwardedRef: Ref<HTMLDivElement>
  layout: PlayLayoutHintLayout
  children: ComponentProps<typeof MotionSurface>['children']
}) {
  const open = Boolean(children)
  const anchors = usePlayLayoutAnchors()
  const divider = useRef<HTMLDivElement>(null)
  const drag = useRef<HintDrag | null>(null)
  const animations = useRef<Animation[]>([])

  function stopMotion() {
    for (const animation of animations.current) animation.cancel()
    animations.current = []
  }

  function measure() {
    const stack = stackRef.current, slot = slotRef.current
    const { column, puzzle, card, heading, toolbar } = layout
    if (!stack || !slot || !column.current || !puzzle.current || !card.current || !heading.current || !toolbar.current) return
    return measureDesktopHintBounds(stack, slot, column.current, puzzle.current, card.current, heading.current, toolbar.current)
  }

  function applyHeight(height: number, bounds: DesktopHintBounds) {
    slotRef.current?.style.setProperty('--desktop-hint-slot-height', `${height + bounds.chrome}px`)
    const puzzleStyle = layout.puzzle.current?.style
    const scale = desktopHintPuzzleScale(height, bounds)
    if (scale === 1) puzzleStyle?.removeProperty('--desktop-hint-board-scale')
    else puzzleStyle?.setProperty('--desktop-hint-board-scale', String(scale))
    const handle = divider.current
    handle?.setAttribute('aria-valuemin', String(bounds.min))
    handle?.setAttribute('aria-valuemax', String(bounds.max))
    handle?.setAttribute('aria-valuenow', String(height))
    handle?.setAttribute('aria-valuetext', `${height} pixels`)
  }

  function syncHeight(bounds: DesktopHintBounds | undefined, animate = false) {
    const slot = slotRef.current, puzzle = layout.puzzle.current
    if (!slot || !puzzle) return
    const duration = animate ? motionDuration('tabs') : 0
    const previousHeight = duration ? slot.offsetHeight : 0
    const previousScale = duration ? Number(getComputedStyle(puzzle).scale) || 1 : 1
    stopMotion()

    const height = bounds ? desktopHintHeight(bounds, layout.size.current) : 0
    const nextHeight = bounds ? height + bounds.chrome : 0
    const nextScale = bounds ? desktopHintPuzzleScale(height, bounds) : 1
    if (bounds) applyHeight(height, bounds)
    else {
      slot.style.removeProperty('--desktop-hint-slot-height')
      puzzle.style.removeProperty('--desktop-hint-board-scale')
    }

    if (!duration) return
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
    const timing = { duration, easing }
    if (previousHeight !== nextHeight) {
      animations.current.push(slot.animate([{ blockSize: `${previousHeight}px` }, { blockSize: `${nextHeight}px` }], timing))
    }
    if (previousScale !== nextScale) {
      animations.current.push(puzzle.animate([{ scale: previousScale }, { scale: nextScale }], timing))
    }
  }

  function commitHeight(height: number, bounds: DesktopHintBounds, preferred: number | undefined) {
    applyHeight(height, bounds)
    if (layout.size.current === preferred) return
    // The observer can run before React publishes the preference to its ref.
    layout.size.current = preferred
    layout.onSizeChange(preferred)
  }

  const { cancel, ...pointerHandlers } = usePointerResizePreview<HTMLDivElement>({
    handleRef: divider,
    onStart(event) {
      if (isPlayLayoutResizing(anchors)) return false
      const bounds = measure(), slot = slotRef.current, card = layout.card.current
      if (!bounds || !slot || !card || bounds.min === bounds.max || card.offsetHeight < bounds.min) return false
      const height = clampDesktopHintHeight(card.offsetHeight, bounds)
      const scale = Number(getComputedStyle(slot).getPropertyValue('--desktop-layout-scale')) || 1
      drag.current = { bounds, startY: event.clientY, height, previewHeight: height, scale }
      slot.setAttribute('data-hint-resizing', '')
      stopMotion()
      applyHeight(height, bounds)
      return true
    },
    onPreview(point) {
      const current = drag.current
      if (!current) return
      const height = heightAtPointer(current, point.clientY)
      if (height === current.previewHeight) return
      current.previewHeight = height
      applyHeight(height, current.bounds)
    },
    onFinish(point, commit) {
      const current = drag.current
      if (!current) return
      drag.current = null
      const height = heightAtPointer(current, point.clientY)
      if (commit && height !== current.height) commitHeight(height, current.bounds, height)
      else applyHeight(desktopHintHeight(current.bounds, layout.size.current), current.bounds)
      slotRef.current?.removeAttribute('data-hint-resizing')
    },
  })

  useLayoutEffect(() => {
    let bounds = open ? measure() : undefined
    syncHeight(bounds, true)
    if (!open) return
    const observer = new ResizeObserver(() => {
      const next = measure()
      if (!next || (bounds && next.chrome === bounds.chrome && next.room === bounds.room &&
        next.puzzleHeight === bounds.puzzleHeight && next.min === bounds.min && next.max === bounds.max)) return
      bounds = next
      cancel()
      syncHeight(bounds, animations.current.some(animation => animation.playState === 'running'))
    })
    for (const element of [stackRef.current, layout.column.current, layout.heading.current, layout.toolbar.current]) {
      if (element) observer.observe(element, { box: 'border-box' })
    }
    return () => {
      observer.disconnect()
      cancel()
    }
  }, [open, layout, stackRef])

  useLayoutEffect(() => {
    const puzzle = layout.puzzle.current
    return () => {
      stopMotion()
      puzzle?.style.removeProperty('--desktop-hint-board-scale')
    }
  }, [layout.puzzle])

  const handle = open && <div ref={divider} className="desktop-hint-divider" role="separator" aria-orientation="horizontal"
    aria-label="Resize hint panel" aria-controls="standard-puzzle-hint" title="Drag to resize hint panel" tabIndex={0}
    data-grid-click-away-exempt
    {...pointerHandlers}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      const bounds = measure(), card = layout.card.current
      if (!bounds || !card) return
      event.preventDefault()
      event.stopPropagation()
      cancel()
      stopMotion()
      if (event.key === 'Home') {
        commitHeight(desktopHintHeight(bounds), bounds, undefined)
      } else {
        const step = event.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP
        const current = card.offsetHeight
        const height = clampDesktopHintHeight(current + step, bounds)
        if (height !== current) commitHeight(height, bounds, height)
      }
    }} />
  return <div ref={forwardedRef} className="standard-hint-slot" id="standard-puzzle-hint" data-fitted data-open={open}>
    <div className="standard-hint-content">
      <HintCardResizeContext.Provider value={handle}>
        <MotionSurface speed="tabs">{children}</MotionSurface>
      </HintCardResizeContext.Provider>
    </div>
  </div>
}

function heightAtPointer(drag: HintDrag, y: number) {
  return clampDesktopHintHeight(drag.height + (drag.startY - y) / drag.scale, drag.bounds)
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
    const duration = motionDuration('tabs')
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
  mobile: boolean; panelRef?: Ref<HTMLDivElement>; collapseOnExit?: boolean; 'data-presence'?: 'open' | 'exit'
}) {
  const { collapseOnExit = false, ...elementProps } = props
  const anchors = usePlayLayoutAnchors()
  const element = useRef<HTMLDivElement>(null)
  const lastBlockSize = useRef(0)
  const ref = useMemo(() => mergeRefs(panelRef, anchors?.hint, element), [panelRef, anchors])
  const classes = ['hint-dock', mobile && 'mobile-hint-panel', className].filter(Boolean).join(' ')
  const presence = elementProps['data-presence']
  useLayoutEffect(() => {
    const node = element.current
    if (!collapseOnExit || !node || presence === 'exit') return
    const measure = () => { lastBlockSize.current = node.getBoundingClientRect().height }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [collapseOnExit, presence])
  useLayoutEffect(() => {
    const node = element.current
    if (!collapseOnExit || !node) return
    if (presence !== 'exit') {
      if (presence === 'open') {
        node.style.removeProperty('block-size')
        node.style.removeProperty('overflow')
      }
      return
    }

    const duration = motionDuration('tabs')
    const height = lastBlockSize.current || node.getBoundingClientRect().height
    if (!duration || height <= 0) return
    const previousBlockSize = node.style.blockSize
    const previousOverflow = node.style.overflow
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
    node.style.overflow = 'clip'
    const animation = node.animate([
      { blockSize: `${height}px` },
      { blockSize: '0px' },
    ], { duration, easing, fill: 'both' })
    let finished = false
    const finish = () => {
      finished = true
      node.style.blockSize = '0px'
      node.style.overflow = 'clip'
      animation.cancel()
    }
    animation.addEventListener('finish', finish, { once: true })
    return () => {
      animation.removeEventListener('finish', finish)
      animation.cancel()
      if (!finished) {
        node.style.blockSize = previousBlockSize
        node.style.overflow = previousOverflow
      }
    }
  }, [collapseOnExit, presence])
  return <div {...elementProps} className={classes} ref={ref} aria-live="polite" data-grid-click-away-controls />
}

/** Use for the standard keypad action menu trigger. */
