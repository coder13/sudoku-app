import { IconButton } from './Button'
import { Component, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { MobileHintSwipe, type HintSwipeActions } from './MobileHintSwipe'
import { MobileInputResizeHandle } from './MobileInputResizeHandle'
import { animatePanelLayout, MotionSurface, motionDuration, usePresentContent } from './Presence'
import { MOBILE_RESIZE_STEP } from '../sudoku/mobile-input-sizing'
import {
  MOBILE_PANEL_HOLD_MS, MOBILE_PANEL_LAYOUT_RESET_EVENT, MOBILE_PANEL_ORDER_KEY, MOBILE_PANEL_IDS, moveMobilePanel, readMobilePanelOrder,
  type MobilePanelId, type PanelDrop,
} from '../sudoku/mobile-panels'
import { notifySettingsEdit } from '../sudoku/settings-events'

type Panel = { title: string; content: ReactNode }
type Props = {
  panels: Partial<Record<MobilePanelId, Panel>>
  rearranging: boolean
  onRearrangingChange: (active: boolean) => void
  blocked: boolean
  puzzleId: string
  withHint: boolean
  fitContent?: boolean
  resizableInput?: boolean
  inputTabCount?: number
  savedInputHeight?: number
  onInputHeightChange?: (height: number | undefined) => void
  puzzleTopSpace?: number
  puzzleShrink?: number
  onPuzzleTopSpaceChange?: (space: number, shrink: number) => void
  hintSwipe?: HintSwipeActions
}
type Hold = { pointerId: number; x: number; y: number; timer: number }
type Drag = {
  id: MobilePanelId
  pointerId: number
  handle: HTMLButtonElement
  startX: number
  startY: number
  x: number
  y: number
  rect: DOMRect
  scrollTop: number
  maxScroll: number
  scroller: HTMLElement
  moved: boolean
  drop: PanelDrop | null
}
type DragView = { id: MobilePanelId; x: number; y: number; drop: PanelDrop | null }
const MOVE_THRESHOLD = 10
const PUZZLE_GESTURE_LOCK_FALLBACK_MS = 450
type PuzzleGesture = {
  pointerId: number
  zone: HTMLDivElement
  startY: number
  latestY: number
  startSpace: number
  startShrink: number
  minSpace: number
  gapFree: number
  maxShrink: number
  boardHeight: number
  panelHeight: number
  panelWidth: number
  boardBaseTop: number
  boardBaseWidth: number
  boardBaseHeight: number
  space: number
  shrink: number
  moved: boolean
  frame: number | null
}
type PuzzleGesturePointer = {
  pointerId: number
  isPrimary: boolean
  button: number
  clientX: number
  clientY: number
  target?: EventTarget | null
  preventDefault: () => void
  stopPropagation?: () => void
}
type PuzzlePosition = { delta: number; space: number; shrink: number; minDelta: number; maxDelta: number }

function MobilePuzzleTopSpaceGesture({ value, shrink, onChange, disabled, edge }: {
  value: number
  shrink: number
  onChange?: (space: number, shrink: number) => void
  disabled: boolean
  edge: 'top' | 'bottom'
}) {
  const zone = useRef<HTMLDivElement>(null)
  const drag = useRef<PuzzleGesture | null>(null)
  const pendingPointer = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)
  const preview = useRef<HTMLElement | null>(null)
  const puzzlePreview = useRef<HTMLElement | null>(null)
  const pageRef = useRef<HTMLElement | null>(null)
  const lockCancel = useRef<(() => void) | null>(null)
  const gestureHandlers = useRef<{ start: (event: PuzzleGesturePointer, fromDrag?: boolean, startY?: number) => void; move: (event: PuzzleGesturePointer, allowBubble?: boolean) => void; finish: (event: PuzzleGesturePointer, commit: boolean) => void } | null>(null)

  function setPreview(current: PuzzleGesture) {
    const panel = preview.current
    if (!panel) return
    const panelHeight = Math.max(1, current.panelHeight)
    const scale = Math.max(0.25, (panelHeight - current.shrink) / panelHeight)
    const sideWidth = Math.max(0, (current.panelWidth - current.boardBaseWidth * scale) / 2)
    const sideTop = panelHeight + (current.boardBaseTop - panelHeight) * scale
    const sideHeight = current.boardBaseHeight * scale
    panel.style.setProperty('--mobile-puzzle-gesture-side-width', `${sideWidth}px`)
    panel.style.setProperty('--mobile-puzzle-gesture-side-top', `${sideTop}px`)
    panel.style.setProperty('--mobile-puzzle-gesture-side-height', `${sideHeight}px`)
    const translate = `${current.space - current.startSpace}px`
    if (panel.style.getPropertyValue('--puzzle-gesture-translate') !== translate) {
      panel.style.setProperty('--puzzle-gesture-translate', translate)
    }
    const puzzleContent = puzzlePreview.current
    if (puzzleContent) {
      const nextScale = String(scale)
      if (puzzleContent.style.getPropertyValue('--mobile-puzzle-gesture-scale') !== nextScale) {
        puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', nextScale)
        // The scale layer is only needed once the pointer has actually changed
        // the puzzle's size. Avoid invalidating the full puzzle subtree on
        // every frame while the gesture is only translating it.
        if (!puzzleContent.hasAttribute('data-puzzle-gesture-scaling')) {
          puzzleContent.setAttribute('data-puzzle-gesture-scaling', '')
        }
      }
    }
    if (!panel.hasAttribute('data-puzzle-gesture-moving')) {
      panel.setAttribute('data-puzzle-gesture-moving', '')
    }
  }

  function positionAtDelta(current: PuzzleGesture, rawDelta: number): PuzzlePosition {
    const maxDelta = current.gapFree + current.maxShrink
    // Pulling up first restores any gesture shrink, then uses the saved top
    // inset until the board reaches the top edge of the page.
    const minDelta = current.minSpace - current.startSpace - current.startShrink
    const delta = Math.max(minDelta, Math.min(maxDelta, rawDelta))
    const shrinkDelta = delta < 0
      ? Math.max(-current.startShrink, delta)
      : Math.max(0, delta - current.gapFree)
    const travelDelta = delta - shrinkDelta
    return {
      delta,
      space: Math.max(current.minSpace, current.startSpace + travelDelta),
      shrink: current.startShrink + shrinkDelta,
      minDelta,
      maxDelta,
    }
  }

  function updatePreview(current: PuzzleGesture, y: number) {
    const position = positionAtDelta(current, y - current.startY)
    current.moved ||= Math.abs(position.delta) > 6
    current.space = position.space
    current.shrink = position.shrink
    setPreview(current)
  }

  function start(event: PuzzleGesturePointer, fromDrag = false, startY = event.clientY) {
    if (disabled || !event.isPrimary || (!fromDrag && event.button !== 0) || drag.current) return
    lockCancel.current?.()
    lockCancel.current = null
    const eventTarget = event.target instanceof Element ? event.target.closest<HTMLDivElement>('.mobile-puzzle-gesture-zone') : null
    const gestureZone = eventTarget ?? zone.current
    const layout = gestureZone?.closest('.mobile-panel-layout')
    const page = layout?.closest<HTMLElement>('.standard-workspace-page')
    const puzzlePanel = layout?.querySelector<HTMLElement>('[data-mobile-panel="puzzle"]')
    const board = puzzlePanel?.querySelector<HTMLElement>('.puzzle-zoom, .puzzle-stage .board-frame')
    const puzzleContent = puzzlePanel?.querySelector<HTMLElement>('.puzzle')
    const gap = layout?.querySelector<HTMLElement>('.mobile-panel-gap')
    if (!gestureZone || !layout || !page || !puzzlePanel || !board || !puzzleContent || !gap) return
    event.preventDefault()
    if (!fromDrag) event.stopPropagation?.()
    gestureZone.setPointerCapture(event.pointerId)
    preview.current = puzzlePanel
    puzzlePreview.current = puzzleContent
    pageRef.current = page
    const gapHeight = Number.parseFloat(getComputedStyle(gap).blockSize) || 0
    const gapMinimum = Number.parseFloat(getComputedStyle(gap).flexBasis) || 0
    const boardHeight = Math.max(1, board.offsetHeight)
    const panelHeight = Math.max(1, puzzleContent.offsetHeight)
    const startScale = Math.max(0.25, (panelHeight - shrink) / panelHeight)
    const boardRect = board.getBoundingClientRect()
    const panelRect = puzzlePanel.getBoundingClientRect()
    const boardBaseWidth = boardRect.width / startScale
    const boardBaseHeight = boardRect.height / startScale
    const boardBaseTop = panelHeight + (boardRect.top - panelRect.top - panelHeight) / startScale
    const minBoard = layout.hasAttribute('data-fit-content') ? 130 : 180
    // Upward movement can remove added space, but keep the workspace's top
    // inset so the puzzle metadata and controls remain visible.
    const minSpace = 0
    const startSpace = Math.max(minSpace, value)
    const current: PuzzleGesture = {
      pointerId: event.pointerId, zone: gestureZone, startY, latestY: event.clientY,
      startSpace, startShrink: shrink, minSpace, gapFree: Math.max(0, gapHeight - gapMinimum),
      maxShrink: Math.max(0, boardHeight - minBoard - shrink), boardHeight,
      panelHeight, panelWidth: panelRect.width, boardBaseTop, boardBaseWidth, boardBaseHeight,
      space: startSpace, shrink, moved: false, frame: null,
    }
    drag.current = current
  }

  function move(event: PuzzleGesturePointer, allowBubble = false) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    if (!allowBubble) event.stopPropagation?.()
    current.latestY = event.clientY
    if (current.frame !== null) return
    current.frame = requestAnimationFrame(() => {
      current.frame = null
      if (drag.current === current) updatePreview(current, current.latestY)
    })
  }

  function finish(event: PuzzleGesturePointer, commit: boolean) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    current.frame = null
    if (commit) updatePreview(current, event.clientY)
    drag.current = null
    const gestureZone = current.zone
    if (gestureZone.hasPointerCapture(event.pointerId)) gestureZone.releasePointerCapture(event.pointerId)
    const panel = preview.current
    const puzzleContent = puzzlePreview.current
    const page = pageRef.current
    const layout = gestureZone.closest<HTMLElement>('.mobile-panel-layout')
    if (!panel || !puzzleContent || !page || !layout) return

    const clearPreview = () => {
      panel.removeAttribute('data-puzzle-gesture-moving')
      panel.removeAttribute('data-puzzle-gesture-locking')
      panel.style.removeProperty('--puzzle-gesture-translate')
      puzzleContent.removeAttribute('data-puzzle-gesture-scaling')
      puzzleContent.removeAttribute('data-puzzle-gesture-locking')
      preview.current = null
      puzzlePreview.current = null
      pageRef.current = null
    }

    if (!commit || !current.moved) {
      const panelHeight = Math.max(1, current.panelHeight)
      puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', String(Math.max(0.25, (panelHeight - shrink) / panelHeight)))
      clearPreview()
      return
    }

    const visualTop = panel.getBoundingClientRect().top
    const rawDelta = (current.space - current.startSpace) + (current.shrink - current.startShrink)
    const rawPosition = positionAtDelta(current, rawDelta)
    // Snap relative to the settled position so page padding does not shift the anchors.
    const anchorDelta = Math.round(rawPosition.delta / MOBILE_RESIZE_STEP) * MOBILE_RESIZE_STEP
    const snappedDelta = rawPosition.delta <= rawPosition.minDelta + 0.001
      ? rawPosition.minDelta
      : rawPosition.delta >= rawPosition.maxDelta - 0.001
        ? rawPosition.maxDelta
        : anchorDelta
    const targetPosition = positionAtDelta(current, snappedDelta)
    const targetSpace = targetPosition.space
    const targetShrink = targetPosition.shrink

    if (targetSpace !== 0) {
      page.style.setProperty('--puzzle-top-space', `${targetSpace}px`)
      page.setAttribute('data-puzzle-top-space', '')
    } else {
      page.style.removeProperty('--puzzle-top-space')
      page.removeAttribute('data-puzzle-top-space')
    }
    if (targetShrink > 0) layout.setAttribute('data-puzzle-shrunk', '')
    else layout.removeAttribute('data-puzzle-shrunk')
    if (targetShrink !== shrink || targetSpace !== value) onChange?.(targetSpace, targetShrink)

    const committedTop = panel.getBoundingClientRect().top
    // `committedTop` still includes the live drag transform. Remove that
    // transform to get the new layout top, then offset from it to the exact
    // position the panel occupied before the snap commit.
    const liveTranslate = current.space - current.startSpace
    const correctedTranslate = liveTranslate + visualTop - committedTop
    panel.style.setProperty('--puzzle-gesture-translate', `${correctedTranslate}px`)

    const panelHeight = Math.max(1, current.panelHeight)
    const startScale = Number.parseFloat(puzzleContent.style.getPropertyValue('--mobile-puzzle-gesture-scale')) || 1
    const targetScale = Math.max(0.25, (panelHeight - targetShrink) / panelHeight)
    const needsPanelLock = Math.abs(correctedTranslate) > 0.5
    const needsPuzzleLock = Math.abs(startScale - targetScale) > 0.001
    const needsLock = needsPanelLock || needsPuzzleLock
    if (!needsLock || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', String(targetScale))
      clearPreview()
      if (targetShrink === 0) puzzleContent.style.removeProperty('--mobile-puzzle-gesture-scale')
      return
    }

    // Commit the corrected start transform with transitions still disabled.
    // Otherwise the browser can coalesce this value with the final zero value
    // and animate from the old drag offset, which can reverse the snap.
    void panel.getBoundingClientRect()
    void getComputedStyle(puzzleContent).transform
    panel.setAttribute('data-puzzle-gesture-locking', '')
    puzzleContent.setAttribute('data-puzzle-gesture-scaling', '')
    puzzleContent.setAttribute('data-puzzle-gesture-locking', '')
    void getComputedStyle(panel).transform
    void getComputedStyle(puzzleContent).transform
    if (needsPanelLock) panel.style.setProperty('--puzzle-gesture-translate', '0px')
    if (needsPuzzleLock) puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', String(targetScale))

    let timeout = 0
    let panelDone = !needsPanelLock
    let puzzleDone = !needsPuzzleLock
    let cancelLock: () => void
    const finishLock = (event?: Event) => {
      if (event instanceof TransitionEvent && event.target === panel && event.propertyName === 'transform') panelDone = true
      if (event instanceof TransitionEvent && event.target === puzzleContent && event.propertyName === 'transform') puzzleDone = true
      if (event && (!panelDone || !puzzleDone)) return
      window.clearTimeout(timeout)
      panel.removeEventListener('transitionend', onTransitionEnd)
      puzzleContent.removeEventListener('transitionend', onTransitionEnd)
      panel.removeAttribute('data-puzzle-gesture-locking')
      puzzleContent.removeAttribute('data-puzzle-gesture-locking')
      panel.removeAttribute('data-puzzle-gesture-moving')
      panel.style.removeProperty('--puzzle-gesture-translate')
      puzzleContent.removeAttribute('data-puzzle-gesture-scaling')
      preview.current = null
      puzzlePreview.current = null
      pageRef.current = null
      if (targetShrink === 0) puzzleContent.style.removeProperty('--mobile-puzzle-gesture-scale')
      if (lockCancel.current === cancelLock) lockCancel.current = null
    }
    const onTransitionEnd = (event: Event) => finishLock(event)
    cancelLock = () => finishLock()
    lockCancel.current = cancelLock
    panel.addEventListener('transitionend', onTransitionEnd)
    puzzleContent.addEventListener('transitionend', onTransitionEnd)
    timeout = window.setTimeout(cancelLock, PUZZLE_GESTURE_LOCK_FALLBACK_MS)
  }

  gestureHandlers.current = { start, move, finish }

  useEffect(() => () => { lockCancel.current?.() }, [])

  useEffect(() => {
    if (edge !== 'top') return
    const pointerDown = (event: PointerEvent) => {
      const gestureZone = zone.current
      const puzzlePanel = gestureZone?.closest<HTMLElement>('[data-mobile-panel="puzzle"]')
      const target = event.target instanceof Element ? event.target : null
      if (!event.isPrimary || !gestureZone || !puzzlePanel || !target) return
      const layout = gestureZone.closest<HTMLElement>('.mobile-panel-layout')
      const page = layout?.closest<HTMLElement>('.standard-workspace-page')
      const pageBounds = page?.getBoundingClientRect()
      const isWithinPage = Boolean(pageBounds && event.clientX >= pageBounds.left && event.clientX <= pageBounds.right
        && event.clientY >= pageBounds.top && event.clientY <= pageBounds.bottom)
      const isOutsidePanel = target.closest('.mobile-panel') === null
      const isInteractive = Boolean(target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="gridcell"]'))
      // Empty workspace space belongs to the puzzle resize gesture too. The
      // panel and control checks keep this from intercepting the keypad or
      // other movable panels when they happen to be near the puzzle.
      const isWorkspaceNegativeSpace = isWithinPage && isOutsidePanel && !isInteractive
      // Side hit targets start in React's target phase so board pointer handlers
      // cannot capture the pointer first when a scaled edge overlaps a cell.
      if (target.closest('.mobile-puzzle-gesture-side')) return
      const isAbovePuzzle = Boolean(page?.contains(target) && !puzzlePanel.contains(target)
        && isOutsidePanel
        && event.clientY < puzzlePanel.getBoundingClientRect().top)
      if (!puzzlePanel.contains(target) && !isWorkspaceNegativeSpace) return
      if (target.closest('.puzzle-mode-tab')) {
        pendingPointer.current = null
        return
      }
      if (getComputedStyle(gestureZone).display === 'none') return
      const isGestureZone = isWorkspaceNegativeSpace || isAbovePuzzle
        || Boolean(target.closest('.mobile-puzzle-gesture-zone[data-edge="top"]'))
      if (!isGestureZone && target.closest('input, textarea, select, [role="checkbox"], [role="gridcell"], [data-cell], .candidate-button')) return
      if (!isGestureZone && target.closest('button, a, [role="button"]')) {
        pendingPointer.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
        return
      }
      gestureHandlers.current?.start(event)
    }
    const pointerMove = (event: PointerEvent) => {
      if (drag.current) {
        gestureHandlers.current?.move(event)
        return
      }
      const pending = pendingPointer.current
      if (!pending || pending.pointerId !== event.pointerId) return
      const deltaX = event.clientX - pending.startX
      const deltaY = event.clientY - pending.startY
      if (Math.abs(deltaX) > MOVE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        pendingPointer.current = null
        return
      }
      if (Math.abs(deltaY) <= MOVE_THRESHOLD || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2) return
      pendingPointer.current = null
      gestureHandlers.current?.start(event, true, pending.startY)
      if (drag.current) gestureHandlers.current?.move(event, true)
    }
    const pointerUp = (event: PointerEvent) => {
      pendingPointer.current = null
      if (drag.current) gestureHandlers.current?.finish(event, true)
    }
    const pointerCancel = (event: PointerEvent) => {
      pendingPointer.current = null
      if (drag.current) gestureHandlers.current?.finish(event, false)
    }
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('pointermove', pointerMove, true)
    document.addEventListener('pointerup', pointerUp, true)
    document.addEventListener('pointercancel', pointerCancel, true)
    return () => {
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('pointermove', pointerMove, true)
      document.removeEventListener('pointerup', pointerUp, true)
      document.removeEventListener('pointercancel', pointerCancel, true)
    }
  }, [edge])

  return <>
    <div ref={zone} className="mobile-puzzle-gesture-zone" data-edge={edge} data-no-panel-hold aria-hidden="true"
      onPointerDown={edge === 'bottom' ? start : undefined} onPointerMove={edge === 'bottom' ? move : undefined} onPointerUp={edge === 'bottom' ? event => finish(event, true) : undefined}
      onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
    {edge === 'top' && <>
      <div className="mobile-puzzle-gesture-zone mobile-puzzle-gesture-side" data-edge="left" data-no-panel-hold aria-hidden="true"
        onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
      <div className="mobile-puzzle-gesture-zone mobile-puzzle-gesture-side" data-edge="right" data-no-panel-hold aria-hidden="true"
        onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
    </>}
  </>
}

type MotionProps = {
  root: RefObject<HTMLDivElement | null>
  withHint: boolean
  tabCount: number
  rearranging: boolean
  children: ReactNode
}
type LayoutSnapshot = {
  duration: number
  cards: { element: HTMLElement; rect: DOMRect }[]
  hint?: { element: HTMLElement; left: number; top: number; width: number }
}

class MobilePanelMotion extends Component<MotionProps, Record<string, never>, LayoutSnapshot | null> {
  private animations: Animation[] = []

  // Measure the currently visible cards before React changes the grid or flex layout.
  getSnapshotBeforeUpdate(previous: MotionProps): LayoutSnapshot | null {
    const { root, withHint, tabCount, rearranging } = this.props
    const hintChanged = previous.withHint !== withHint
    const tabsChanged = previous.tabCount !== tabCount
    if ((!hintChanged && !tabsChanged) || previous.rearranging || rearranging || !root.current) return null
    const duration = motionDuration(tabsChanged ? 'panel' : 'standard')
    if (!duration) return null

    const cards = Array.from(root.current.querySelectorAll<HTMLElement>(
      '[data-mobile-panel="puzzle"] .puzzle, [data-mobile-panel="input"] > .mobile-panel-content',
    ), (element) => ({ element, rect: element.getBoundingClientRect() }))
    const hint = hintChanged && !withHint && root.current.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
    return { duration, cards, hint: hint ? {
      element: hint, left: hint.offsetLeft, top: hint.offsetTop, width: hint.getBoundingClientRect().width,
    } : undefined }
  }

  componentDidUpdate(previous: MotionProps, _state: unknown, snapshot?: LayoutSnapshot | null) {
    const { root, withHint, rearranging } = this.props
    if (snapshot || previous.rearranging !== rearranging) this.cancelAnimations()

    const hint = previous.withHint !== withHint && root.current?.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
    if (withHint && hint) {
      for (const property of ['--hint-exit-left', '--hint-exit-top', '--hint-exit-width', '--hint-exit-visibility']) {
        hint.style.removeProperty(property)
      }
    }
    if (!snapshot) return

    // Let the other cards move immediately while the outgoing hint fades in its old slot.
    if (snapshot.hint) {
      const { element, left, top, width } = snapshot.hint
      element.style.setProperty('--hint-exit-left', `${left}px`)
      element.style.setProperty('--hint-exit-top', `${top}px`)
      element.style.setProperty('--hint-exit-width', `${width}px`)
      element.style.setProperty('--hint-exit-visibility', 'visible')
    }

    for (const { element, rect } of snapshot.cards) {
      if (!element.isConnected) continue
      const anchorX = element.closest('[data-mobile-panel="puzzle"]') ? 'center' : 'left'
      const animation = animatePanelLayout(element, rect, snapshot.duration, anchorX)
      if (animation) this.animations.push(animation)
    }
  }

  private cancelAnimations() {
    this.animations.forEach((animation) => animation.cancel())
    this.animations = []
  }

  componentWillUnmount() { this.cancelAnimations() }

  render() { return this.props.children }
}

export function MobilePanelLayout(props: Props) {
  const [order, setOrder] = useState(readMobilePanelOrder)
  const [dragView, setDragView] = useState<DragView | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const fitBoardNow = useRef<(() => void) | null>(null)
  const inputId = useId()
  const puzzleGestureBase = useRef<{ puzzleId: string; height: number } | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const hold = useRef<Hold | null>(null)
  const drag = useRef<Drag | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const orderRef = useRef(order)
  useEffect(() => {
    function refreshOrder(event: StorageEvent) {
      if (event.storageArea !== localStorage || (event.key !== null && event.key !== MOBILE_PANEL_ORDER_KEY)) return
      const next = readMobilePanelOrder()
      orderRef.current = next
      setOrder(next)
    }
    window.addEventListener('storage', refreshOrder)
    return () => window.removeEventListener('storage', refreshOrder)
  }, [])
  const latest = useRef(props)
  latest.current = props
  const { content: hint, exiting: hintExiting } = usePresentContent(props.panels.hint)
  const panels = { ...props.panels, hint: hint || undefined }
  const visible = order.filter((id) => props.panels[id])

  useEffect(() => {
    const resetOrder = () => {
      const next = [...MOBILE_PANEL_IDS]
      orderRef.current = next
      setOrder(next)
    }
    window.addEventListener(MOBILE_PANEL_LAYOUT_RESET_EVENT, resetOrder)
    return () => window.removeEventListener(MOBILE_PANEL_LAYOUT_RESET_EVENT, resetOrder)
  }, [])

  useLayoutEffect(() => {
    const layout = root.current
    const page = layout?.closest<HTMLElement>('.standard-workspace-page')
    const workspace = layout?.parentElement
    const puzzle = layout?.querySelector<HTMLElement>('[data-mobile-panel="puzzle"]')
    const input = layout?.querySelector<HTMLElement>('[data-mobile-panel="input"]')
    const hintPanel = props.withHint ? layout?.querySelector<HTMLElement>('[data-mobile-panel="hint"]') : null
    const gap = layout?.querySelector<HTMLElement>('.mobile-panel-gap')
    if (!layout || !page || !workspace || !puzzle || !input || !gap) return
    const blockSize = (element: HTMLElement) => element.getBoundingClientRect().height
    const fitBoard = () => {
      // The resize handle drives the card and puzzle preview at pointer cadence.
      // Avoid layout reads and keypad zoom updates here: zoom changes force a
      // layout of every digit control on each frame. The observed panel size
      // triggers this once more after the gesture commits.
      if (layout.hasAttribute('data-input-resizing')) return
      // The footer must remain as wide as the input card even after the grid shrinks.
      const inputWidth = input.clientWidth
      if (inputWidth) {
        const value = `${Math.round(inputWidth)}px`
        if (layout.style.getPropertyValue('--mobile-input-panel-width') !== value) {
          layout.style.setProperty('--mobile-input-panel-width', value)
        }
      }
      const digits = input.querySelector<HTMLElement>('.mobile-input-digits')
      const digitControls = digits?.querySelector<HTMLElement>(':scope > .workspace-controls')
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
      const aboveHeight = Math.max(0, puzzle.getBoundingClientRect().top - page.getBoundingClientRect().top)
      const gestureHeight = `${Math.ceil(aboveHeight)}px`
      if (layout.style.getPropertyValue('--mobile-puzzle-above-height') !== gestureHeight) {
        layout.style.setProperty('--mobile-puzzle-above-height', gestureHeight)
      }
      const board = puzzle.querySelector<HTMLElement>('.puzzle-zoom, .puzzle-stage .board-frame')
      const puzzleColumn = board?.closest<HTMLElement>('.puzzle-column')
      const puzzleContent = puzzle.querySelector<HTMLElement>('.puzzle')
      if (!board || !puzzleColumn || !puzzleContent) return
      const panelHeight = Math.max(1, puzzleContent.offsetHeight)
      const puzzleShrink = props.puzzleShrink ?? 0
      const savedNaturalHeight = parseFloat(layout.style.getPropertyValue('--mobile-natural-puzzle-height'))
      const samePuzzleBase = puzzleGestureBase.current?.puzzleId === props.puzzleId
      const baseHeight = puzzleShrink === 0
        ? panelHeight
        : samePuzzleBase ? puzzleGestureBase.current!.height : savedNaturalHeight || panelHeight + puzzleShrink
      puzzleGestureBase.current = { puzzleId: props.puzzleId, height: baseHeight }
      const puzzleScale = Math.max(0.25, (baseHeight - puzzleShrink) / baseHeight)
      if (!puzzleContent.hasAttribute('data-puzzle-gesture-scaling')) {
        puzzleContent.style.setProperty('--mobile-puzzle-gesture-scale', String(puzzleScale))
      }
      const panelRect = puzzle.getBoundingClientRect()
      const boardRect = board.getBoundingClientRect()
      const boardBaseWidth = boardRect.width / puzzleScale
      const boardBaseHeight = boardRect.height / puzzleScale
      const boardBaseTop = panelHeight + (boardRect.top - panelRect.top - panelHeight) / puzzleScale
      const sideGeometry = {
        '--mobile-puzzle-gesture-side-width': `${Math.max(0, (panelRect.width - boardBaseWidth * puzzleScale) / 2)}px`,
        '--mobile-puzzle-gesture-side-top': `${panelHeight + (boardBaseTop - panelHeight) * puzzleScale}px`,
        '--mobile-puzzle-gesture-side-height': `${boardBaseHeight * puzzleScale}px`,
      }
      for (const [property, nextValue] of Object.entries(sideGeometry)) {
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
        const puzzleChrome = Math.max(0, puzzleContent.offsetHeight - board.offsetHeight)
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
    for (const element of [page, puzzle, puzzle.querySelector('.puzzle-column'), puzzle.querySelector('.puzzle-zoom, .puzzle-stage .board-frame'), input, hintPanel]) {
      if (element) observer.observe(element)
    }
    return () => {
      observer.disconnect()
      fitBoardNow.current = null
      layout.style.removeProperty('--mobile-input-panel-width')
    }
  }, [order, props.inputTabCount, props.puzzleId, props.puzzleShrink, props.rearranging, props.withHint, props.fitContent])

  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }

  function saveMove(id: MobilePanelId, drop: PanelDrop) {
    const panel = latest.current.panels[id]
    if (!panel || !latest.current.panels[drop.id]) return
    const next = moveMobilePanel(orderRef.current, id, drop)
    if (next.every((panel, index) => panel === orderRef.current[index])) return
    orderRef.current = next
    setOrder(next)
    try {
      localStorage.setItem(MOBILE_PANEL_ORDER_KEY, JSON.stringify(next))
      notifySettingsEdit()
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
    const shown = next.filter((panel) => latest.current.panels[panel])
    setAnnouncement(`${panel.title} moved to position ${shown.indexOf(id) + 1} of ${shown.length}.`)
  }

  function finishDrag(commit: boolean) {
    const current = drag.current
    drag.current = null
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = null
    setDragView(null)
    if (!current) return
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId)
    if (commit && current.moved && current.drop) saveMove(current.id, current.drop)
  }

  function updateDrag() {
    const current = drag.current
    if (!current?.moved || !root.current) return
    let nearest: { id: MobilePanelId; rect: DOMRect; distance: number } | undefined
    for (const panel of root.current.querySelectorAll<HTMLElement>('[data-mobile-panel]:not([inert])')) {
      const id = panel.dataset.mobilePanel as MobilePanelId
      if (id === current.id) continue
      const rect = panel.getBoundingClientRect()
      const dx = Math.max(rect.left - current.x, 0, current.x - rect.right)
      const dy = Math.max(rect.top - current.y, 0, current.y - rect.bottom)
      const distance = dx * dx + dy * dy
      if (!nearest || distance < nearest.distance) nearest = { id, rect, distance }
    }
    if (nearest) {
      const differentColumn = Math.abs(nearest.rect.x - current.rect.x) > Math.min(nearest.rect.width, current.rect.width) / 2
      const before = differentColumn
        ? current.x < nearest.rect.x + nearest.rect.width / 2
        : current.y < nearest.rect.y + nearest.rect.height / 2
      current.drop = { id: nearest.id, edge: before ? 'before' : 'after' }
    }
    const next = {
      id: current.id, x: current.x - current.startX,
      y: current.y - current.startY + current.scroller.scrollTop - current.scrollTop,
      drop: current.drop,
    }
    setDragView((previous) => previous?.id === next.id && previous.x === next.x && previous.y === next.y &&
      previous.drop?.id === next.drop?.id && previous.drop?.edge === next.drop?.edge ? previous : next)
  }

  function scrollWhileDragging() {
    const current = drag.current
    if (!current) return
    if (current.moved) {
      const bounds = current.scroller.getBoundingClientRect()
      const top = Math.max(bounds.top, closeButton.current?.getBoundingClientRect().bottom ?? 0) + 36
      const bottom = Math.min(bounds.bottom, window.innerHeight) - 36
      const speed = current.y < top ? -Math.min(12, (top - current.y) / 4)
        : current.y > bottom ? Math.min(12, (current.y - bottom) / 4) : 0
      if (speed) current.scroller.scrollTop = Math.min(current.maxScroll, Math.max(0, current.scroller.scrollTop + speed))
      updateDrag()
    }
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function startHold(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) { cancelHold(); return }
    if (props.rearranging || props.blocked || event.button !== 0 ||
      !(event.target instanceof Element) || !event.target.closest('[data-mobile-panel]') ||
      event.target.closest('[data-no-panel-hold], dialog')) return
    cancelHold()
    hold.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      timer: window.setTimeout(() => {
        hold.current = null
        if (latest.current.blocked) return
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        latest.current.onRearrangingChange(true)
      }, MOBILE_PANEL_HOLD_MS),
    }
  }

  function startDrag(id: MobilePanelId, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const panel = event.currentTarget.closest<HTMLElement>('[data-mobile-panel]')
    const scroller = root.current?.closest<HTMLElement>('.page')
    if (!panel || !scroller) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      id, pointerId: event.pointerId, handle: event.currentTarget,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      rect: panel.getBoundingClientRect(), scrollTop: scroller.scrollTop,
      maxScroll: scroller.scrollHeight - scroller.clientHeight, scroller, moved: false, drop: null,
    }
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function exit() {
    finishDrag(false)
    latest.current.onRearrangingChange(false)
    requestAnimationFrame(() => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    function pointerDown(event: PointerEvent) {
      if (hold.current && event.pointerId !== hold.current.pointerId) cancelHold()
      if (drag.current && event.pointerId !== drag.current.pointerId) finishDrag(false)
    }
    function pointerMove(event: PointerEvent) {
      if (hold.current?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > MOVE_THRESHOLD) cancelHold()
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      event.preventDefault()
      current.x = event.clientX
      current.y = event.clientY
      current.moved ||= Math.hypot(current.x - current.startX, current.y - current.startY) > MOVE_THRESHOLD
      updateDrag()
    }
    function pointerEnd(event: PointerEvent) {
      if (hold.current?.pointerId === event.pointerId) cancelHold()
      if (drag.current?.pointerId === event.pointerId) finishDrag(event.type === 'pointerup')
    }
    function cancel() { cancelHold(); finishDrag(false) }
    function keyDown(event: KeyboardEvent) {
      if (latest.current.rearranging && event.key === 'Escape') {
        event.preventDefault()
        exit()
      }
    }
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointermove', pointerMove, { passive: false })
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    window.addEventListener('scroll', cancelHold, true)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keyDown)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      cancel()
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      window.removeEventListener('scroll', cancelHold, true)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keyDown)
      document.removeEventListener('visibilitychange', cancel)
      latest.current.onRearrangingChange(false)
    }
  }, [])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
    if (props.rearranging) closeButton.current?.focus({ preventScroll: true })
  }, [props.rearranging])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
    latest.current.onRearrangingChange(false)
  }, [props.puzzleId, props.blocked])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
  }, [visible.join(',')])

  const layout = <div ref={root} className={`mobile-panel-layout${props.withHint ? ' with-hint' : ''}`}
    data-fit-content={(props.withHint || props.fitContent) && !props.rearranging || undefined}
    data-puzzle-shrunk={Boolean(props.puzzleShrink) || undefined}
    data-rearranging={props.rearranging || undefined} style={{ '--mobile-secondary-count': visible.length - 1 } as CSSProperties}
    onPointerDownCapture={startHold}
    onContextMenuCapture={(event) => { if (hold.current || props.rearranging) event.preventDefault() }}
    onClickCapture={(event) => {
      if (props.rearranging && !(event.target instanceof Element && event.target.closest('[data-panel-editor]'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }}>
    <MotionSurface>{props.rearranging && <div className="mobile-panel-toolbar surface" role="region" aria-label="Rearrange cards" data-panel-editor>
      <div><strong>Rearrange cards</strong><small id="mobile-panel-instructions">
        {saveFailed ? 'Order saved for this session only.' : 'Drag cards to move them. Changes save automatically.'}
      </small></div>
      <IconButton ref={closeButton} variant="quiet" aria-label="Finish rearranging cards" onClick={exit}>
        <X size={22} aria-hidden="true" />
      </IconButton>
    </div>}</MotionSurface>
    {order.filter((id) => panels[id]).map((id) => {
      const panel = panels[id]!
      const exiting = id === 'hint' && hintExiting
      const index = visible.indexOf(id)
      const moving = dragView?.id === id
      const drop = dragView?.drop?.id === id ? dragView.drop.edge : undefined
      const resizeEdge = id === 'input' && props.resizableInput && panels.puzzle
        ? order.indexOf('puzzle') < order.indexOf('input') ? 'top' : 'bottom'
        : undefined
      return <Fragment key={id}>
        <div className={`mobile-panel${id === 'hint' ? ' motion-surface' : ''}`} data-mobile-panel={id} data-first={index === 0 || undefined}
          data-after-gap={index > 1 || undefined}
          id={id === 'input' ? inputId : undefined} data-resize-edge={resizeEdge}
          data-presence={id === 'hint' ? exiting ? 'exit' : 'open' : undefined} inert={exiting || undefined} aria-hidden={exiting || undefined}
          data-dragging={moving || undefined} data-drop={drop} role="group" aria-label={`${panel.title} card`}
          style={{
            '--mobile-panel-row': index,
            ...(moving ? { transform: `translate(${dragView.x}px, ${dragView.y}px)` } : {}),
          } as CSSProperties}>
          <div className="mobile-panel-content" inert={props.rearranging} aria-hidden={props.rearranging || undefined}>
            {id === 'puzzle' && <MobilePuzzleTopSpaceGesture edge="top" value={props.puzzleTopSpace ?? 0} shrink={props.puzzleShrink ?? 0}
              onChange={props.onPuzzleTopSpaceChange} disabled={props.blocked || props.rearranging} />}
            {resizeEdge && <MobileInputResizeHandle inputId={inputId} edge={resizeEdge}
              disabled={props.blocked || props.rearranging} withHint={props.withHint}
              fitContent={Boolean(props.fitContent)}
              hasOpenTabs={Boolean(props.inputTabCount)} savedHeight={props.savedInputHeight}
              onHeightChange={props.onInputHeightChange} onResizeSettled={() => fitBoardNow.current?.()} />}
            {id === 'hint' ? <MobileHintSwipe exiting={exiting}
              actions={exiting || props.rearranging || props.blocked ? undefined : props.hintSwipe}>
              {panel.content}
            </MobileHintSwipe> : panel.content}
          </div>
          {props.rearranging && <div className="mobile-panel-editor" data-panel-editor>
            <button type="button" className="mobile-panel-drag" aria-label={`Move ${panel.title.toLowerCase()} card`}
              aria-describedby="mobile-panel-instructions" onPointerDown={(event) => startDrag(id, event)}
              onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false) }}>
              <span><GripVertical size={18} aria-hidden="true" />{panel.title}</span>
            </button>
          </div>}
        </div>
        {index === 0 && visible.length > 1 && <div className="mobile-panel-gap" aria-hidden="true">
          {id === 'puzzle' && <MobilePuzzleTopSpaceGesture edge="bottom" value={props.puzzleTopSpace ?? 0} shrink={props.puzzleShrink ?? 0}
            onChange={props.onPuzzleTopSpaceChange} disabled={props.blocked || props.rearranging} />}
        </div>}
      </Fragment>
    })}
    <span className="sr-only" role="status">{announcement}</span>
  </div>

  return <MobilePanelMotion root={root} withHint={props.withHint} tabCount={props.inputTabCount ?? 0}
    rearranging={props.rearranging}>{layout}</MobilePanelMotion>
}
