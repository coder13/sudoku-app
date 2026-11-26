import { type RefObject, useEffect, useRef } from 'react'
import { MOBILE_RESIZE_STEP } from '../sudoku/mobile-input-sizing'

const PUZZLE_DRAG_THRESHOLD = 6
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
export type PuzzleGestureAnchors = {
  layout: RefObject<HTMLDivElement | null>
  page: RefObject<HTMLElement | null>
  panel: RefObject<HTMLDivElement | null>
  gap: RefObject<HTMLDivElement | null>
  puzzle: RefObject<HTMLElement | null>
  boardViewport: RefObject<HTMLDivElement | null>
  boardFrame: RefObject<HTMLDivElement | null>
}

export function MobilePuzzleTopSpaceGesture({ value, shrink, onChange, disabled, edge, fitContent, anchors }: {
  value: number
  shrink: number
  onChange?: (space: number, shrink: number) => void
  disabled: boolean
  edge: 'top' | 'bottom'
  fitContent: boolean
  anchors?: PuzzleGestureAnchors
}) {
  const zone = useRef<HTMLDivElement>(null)
  const drag = useRef<PuzzleGesture | null>(null)
  const pendingPointer = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)
  const preview = useRef<HTMLElement | null>(null)
  const puzzlePreview = useRef<HTMLElement | null>(null)
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
    current.moved ||= Math.abs(position.delta) > PUZZLE_DRAG_THRESHOLD
    current.space = position.space
    current.shrink = position.shrink
    setPreview(current)
  }

  function start(event: PuzzleGesturePointer, fromDrag = false, startY = event.clientY) {
    if (disabled || !event.isPrimary || (!fromDrag && event.button !== 0) || drag.current) return
    lockCancel.current?.()
    lockCancel.current = null
    const eventTarget = event.target instanceof Element ? event.target.closest<HTMLDivElement>('[data-puzzle-resize-gesture]') : null
    const gestureZone = eventTarget ?? zone.current
    const layout = anchors?.layout.current
    const page = anchors?.page.current
    const puzzlePanel = anchors?.panel.current
    const board = anchors?.boardViewport.current ?? anchors?.boardFrame.current
    const puzzleContent = anchors?.puzzle.current
    const gap = anchors?.gap.current
    if (!gestureZone || !layout || !page || !puzzlePanel || !board || !puzzleContent || !gap) return
    event.preventDefault()
    if (!fromDrag) event.stopPropagation?.()
    gestureZone.setPointerCapture(event.pointerId)
    preview.current = puzzlePanel
    puzzlePreview.current = puzzleContent
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
    const minBoard = fitContent ? 130 : 180
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
    const page = anchors?.page.current
    const layout = anchors?.layout.current
    if (!panel || !puzzleContent || !page || !layout) return

    const clearPreview = () => {
      panel.removeAttribute('data-puzzle-gesture-moving')
      panel.removeAttribute('data-puzzle-gesture-locking')
      panel.style.removeProperty('--puzzle-gesture-translate')
      puzzleContent.removeAttribute('data-puzzle-gesture-scaling')
      puzzleContent.removeAttribute('data-puzzle-gesture-locking')
      preview.current = null
      puzzlePreview.current = null
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
      const puzzlePanel = anchors?.panel.current
      const target = event.target instanceof Element ? event.target : null
      if (!event.isPrimary || event.button !== 0 || !gestureZone || !puzzlePanel || !target) return
      const layout = anchors?.layout.current
      const page = anchors?.page.current
      const pageBounds = page?.getBoundingClientRect()
      const isWithinPage = Boolean(pageBounds && event.clientX >= pageBounds.left && event.clientX <= pageBounds.right
        && event.clientY >= pageBounds.top && event.clientY <= pageBounds.bottom)
      const isOutsidePanel = target.closest('[data-mobile-panel]') === null
      const isInteractive = Boolean(target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="gridcell"]'))
      // Empty workspace space belongs to the puzzle resize gesture too. The
      // panel and control checks keep this from intercepting the keypad or
      // other movable panels when they happen to be near the puzzle.
      const isWorkspaceNegativeSpace = isWithinPage && isOutsidePanel && !isInteractive
      // Side hit targets start in React's target phase so board pointer handlers
      // cannot capture the pointer first when a scaled edge overlaps a cell.
      if (target.closest('[data-puzzle-resize-side]')) return
      if (!puzzlePanel.contains(target) && !isWorkspaceNegativeSpace) return
      if (target.closest('[data-puzzle-mode-tab]')) {
        pendingPointer.current = null
        return
      }
      if (getComputedStyle(gestureZone).display === 'none') return
      const isGestureZone = isWorkspaceNegativeSpace
        || Boolean(target.closest('[data-puzzle-resize-gesture][data-edge="top"]'))
      if (!isGestureZone && target.closest('input, textarea, select, [role="checkbox"], [role="gridcell"], [data-cell], [data-candidate-button]')) return
      // Leave taps on the toolbar intact until the pointer moves vertically.
      if (!isGestureZone && target.closest('[data-mobile-puzzle-toolbar], button, a, [role="button"]')) {
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
      if (Math.abs(deltaX) > PUZZLE_DRAG_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        pendingPointer.current = null
        return
      }
      if (Math.abs(deltaY) <= PUZZLE_DRAG_THRESHOLD || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2) return
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
  }, [anchors, edge])

  return <>
    <div ref={zone} className="mobile-puzzle-gesture-zone" data-puzzle-resize-gesture data-edge={edge} data-no-panel-hold aria-hidden="true"
      onPointerDown={edge === 'bottom' ? start : undefined} onPointerMove={edge === 'bottom' ? move : undefined} onPointerUp={edge === 'bottom' ? event => finish(event, true) : undefined}
      onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
    {edge === 'top' && <>
      <div className="mobile-puzzle-gesture-zone mobile-puzzle-gesture-side" data-puzzle-resize-gesture data-puzzle-resize-side data-edge="left" data-no-panel-hold aria-hidden="true"
        onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
      <div className="mobile-puzzle-gesture-zone mobile-puzzle-gesture-side" data-puzzle-resize-gesture data-puzzle-resize-side data-edge="right" data-no-panel-hold aria-hidden="true"
        onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)} />
    </>}
  </>
}

