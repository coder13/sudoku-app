import { type PointerEvent, type RefObject, useLayoutEffect, useRef, useState } from 'react'

import { animatePanelLayout, motionDuration } from './Presence'
import { MOBILE_RESIZE_STEP } from '../sudoku/mobile-input-sizing'
import { ResizeOptionsDialog } from './ResizeOptionsDialog'

const MIN_INPUT_CONTENT_SCALE = 0.65
const MIN_GRID_WIDTH = 220
const MIN_GRID_WIDTH_WITH_HINT = 130
const DOUBLE_TAP_MS = 350
const TAP_MOVE_LIMIT = 6
const DOUBLE_TAP_DISTANCE = 24

type Split = { input: number; naturalInput: number; naturalPuzzle: number; min: number; max: number }
type Tap = { time: number; x: number; y: number; pointerType: string }
type BoardPreview = { element: HTMLElement; grid: HTMLElement }
export type MobileInputResizeRefs = {
  puzzle: RefObject<HTMLElement | null>
  puzzleColumn: RefObject<HTMLDivElement | null>
  boardViewport: RefObject<HTMLDivElement | null>
  boardFrame: RefObject<HTMLDivElement | null>
  inputTabs: RefObject<HTMLDivElement | null>
  inputToolbar: RefObject<HTMLDivElement | null>
  inputPanels: RefObject<HTMLDivElement | null>
  digitsPanel: RefObject<HTMLDivElement | null>
  digitControls: RefObject<HTMLDivElement | null>
  activeInputPanel: RefObject<HTMLDivElement | null>
  overflowRegions: readonly RefObject<HTMLElement | null>[]
}
type Drag = {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  moved: boolean
  layout: HTMLElement
  split: Split
  height: number
  frame: number | null
  board: BoardPreview | null
}

function blockSize(element: HTMLElement) {
  return parseFloat(getComputedStyle(element).blockSize)
}

function measureBoardPreview(refs: MobileInputResizeRefs): BoardPreview | null {
  const element = refs.puzzle.current
  const board = refs.boardViewport.current ?? refs.boardFrame.current
  if (!element || !board?.offsetWidth) return null
  return { element, grid: board }
}

function animateBoardSnap({ element, grid }: BoardPreview, before: DOMRect, duration: number) {
  if (!duration) return
  const after = grid.getBoundingClientRect()
  if (!after.width || !after.height) return
  const origin = element.getBoundingClientRect()
  const scale = before.width / after.width
  const x = before.left + before.width / 2 - (origin.left + origin.width / 2 +
    (after.left + after.width / 2 - origin.left - origin.width / 2) * scale)
  const y = before.bottom - (origin.bottom + (after.bottom - origin.bottom) * scale)
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(1 - scale) < 0.005) return
  const baseScale = parseFloat(element.style.getPropertyValue('--mobile-puzzle-gesture-scale')) || 1
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
  return element.animate([
    { transformOrigin: 'bottom center', transform: `translate(${x}px, ${y}px) scale(${scale * baseScale})` },
    { transformOrigin: 'bottom center', transform: `scale(${baseScale})` },
  ], { duration, easing })
}

function measureSplit(layout: HTMLElement, refs: MobileInputResizeRefs, withHint: boolean): Split | null {
  const input = refs.inputPanels.current
  const puzzle = refs.puzzle.current
  const grid = refs.boardViewport.current ?? refs.boardFrame.current
  if (!input || !puzzle || !grid?.offsetWidth) return null

  // The snap animation transforms the card visually. Measure its layout
  // height so the observer does not fit or save an intermediate frame.
  const inputStyle = getComputedStyle(input)
  const height = parseFloat(inputStyle.blockSize) * (parseFloat(inputStyle.zoom) || 1)
  const naturalInput = parseFloat(layout.style.getPropertyValue('--mobile-natural-input-height')) || height
  // Retain the unsized grid height so shrinking the input can restore the original board.
  const naturalPuzzle = parseFloat(layout.style.getPropertyValue('--mobile-natural-puzzle-height')) || blockSize(puzzle)
  const minGridHeight = Math.min(grid.offsetHeight, withHint ? MIN_GRID_WIDTH_WITH_HINT : MIN_GRID_WIDTH)
  // A resized card uses its chosen height as its CSS minimum. The natural
  // hint floor is the lower bound for a new gesture in either direction.
  const minPanel = withHint ? Math.min(110, window.innerHeight * .28) : 0
  const fitLimit = parseFloat(layout.style.getPropertyValue('--mobile-fit-board-height'))
  // The board fit already includes unused vertical space. Measuring below the
  // input card would count the puzzle twice when the input card sits first.
  const max = Number.isFinite(fitLimit)
    ? height + Math.max(0, fitLimit - minGridHeight)
    : height + Math.max(0, grid.offsetHeight - minGridHeight)
  const min = Math.max(minPanel, naturalInput * MIN_INPUT_CONTENT_SCALE)
  return {
    input: height, naturalInput,
    naturalPuzzle,
    min,
    max: Math.max(min, max),
  }
}

function applySplit(layout: HTMLElement, split: Split, height: number) {
  // Keep the outer cards current throughout the gesture. The content's CSS
  // boundary stops these sizing values from invalidating every grid mark.
  if (!layout.hasAttribute('data-input-sized')) layout.setAttribute('data-input-sized', '')
  const setStyle = (property: string, value: string) => {
    if (layout.style.getPropertyValue(property) !== value) layout.style.setProperty(property, value)
  }
  setStyle('--mobile-resized-input-height', `${height}px`)
  const contentScale = Math.min(1, height / Math.max(1, split.naturalInput))
  setStyle('--mobile-natural-input-height', `${split.naturalInput}px`)
  setStyle('--mobile-input-content-scale', String(contentScale))
  setStyle('--mobile-resized-input-layout-height', `${height / contentScale}px`)
  setStyle('--mobile-natural-puzzle-height', `${split.naturalPuzzle}px`)
}

function clearSplit(layout: HTMLElement) {
  layout.removeAttribute('data-input-sized')
  layout.style.removeProperty('--mobile-resized-input-height')
  layout.style.removeProperty('--mobile-natural-input-height')
  layout.style.removeProperty('--mobile-input-content-scale')
  layout.style.removeProperty('--mobile-resized-input-layout-height')
  layout.style.removeProperty('--mobile-natural-puzzle-height')
}

function clampHeight(split: Split, height: number) {
  return Math.min(split.max, Math.max(split.min, height))
}

function inputOverflow(refs: MobileInputResizeRefs) {
  const panel = refs.activeInputPanel.current ?? refs.digitsPanel.current
  if (!panel) return 0
  // Nested scroll regions opt in through host-provided refs. Only the active
  // panel contributes so mounted swipe neighbors cannot change the fit height.
  const nested = refs.overflowRegions.map(ref => ref.current)
    .filter((element): element is HTMLElement => Boolean(element && panel.contains(element)
      && !element.hidden && !element.closest('[hidden]')))
  return [panel, ...nested].reduce((pixels, element) => pixels + Math.max(0, element.scrollHeight - element.clientHeight), 0)
}

export function MobileInputResizeHandle({ inputId, layoutElement, inputPanelRef, refs, edge, disabled, withHint, fitContent = false, savedHeight, onHeightChange, onResizingChange, onResizePreview, onResizeSettled }: {
  inputId: string
  layoutElement: HTMLDivElement | null
  inputPanelRef: RefObject<HTMLDivElement | null>
  refs: MobileInputResizeRefs
  edge: 'top' | 'bottom'
  disabled: boolean
  withHint: boolean
  fitContent?: boolean
  savedHeight?: number
  onHeightChange?: (height: number | undefined) => void
  onResizingChange?: (resizing: boolean) => void
  onResizePreview?: () => void
  onResizeSettled?: () => void
}) {
  const handle = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const snapAnimations = useRef<Animation[]>([])
  const lastTap = useRef<Tap | null>(null)
  const preferredHeight = useRef(savedHeight)
  // A hint changes the board's space. Keep the applied input size through the transition.
  const hintOpen = useRef(withHint)
  hintOpen.current = withHint
  const optionsTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [options, setOptions] = useState<Pick<Split, 'input' | 'min' | 'max'> | null>(null)

  function cancelSizeOptions() {
    if (optionsTimer.current === null) return
    window.clearTimeout(optionsTimer.current)
    optionsTimer.current = null
  }

  function getLayout() { return layoutElement ?? undefined }

  function cancelSnapAnimation() {
    snapAnimations.current.forEach(animation => animation.cancel())
    snapAnimations.current = []
  }

  function describe(split: Split, height = split.input) {
    handle.current?.setAttribute('aria-valuemin', String(Math.round(split.min)))
    handle.current?.setAttribute('aria-valuemax', String(Math.round(split.max)))
    handle.current?.setAttribute('aria-valuenow', String(Math.round(height)))
    setOptions(current => current && (current.input !== height || current.min !== split.min || current.max !== split.max
      ? { input: height, min: split.min, max: split.max } : current))
  }

  function updateHeight(layout: HTMLElement, split: Split, height: number) {
    applySplit(layout, split, height)
    describe(split, height)
  }

  function commitHeight(layout: HTMLElement, split: Split, height: number) {
    if (height === split.input) return
    preferredHeight.current = height
    updateHeight(layout, split, height)
    onHeightChange?.(height)
  }

  function openSizeOptions() {
    const layout = getLayout()
    const split = layout && measureSplit(layout, refs, withHint)
    if (split) setOptions({ input: split.input, min: split.min, max: split.max })
  }

  function adjustSize(change: number | 'reset' | 'maximum') {
    const layout = getLayout()
    if (disabled || !layout || drag.current) return
    if (change === 'reset') {
      preferredHeight.current = undefined
      clearSplit(layout)
      onHeightChange?.(undefined)
    }
    const split = measureSplit(layout, refs, withHint)
    if (!split) return
    if (change === 'reset') { describe(split); return }
    commitHeight(layout, split, change === 'maximum' ? split.max : clampHeight(split, split.input + change))
  }

  function fitInput(layout: HTMLElement) {
    const split = measureSplit(layout, refs, withHint)
    if (!split) return
    const overflow = inputOverflow(refs)
    if (overflow > 0) commitHeight(layout, split, clampHeight(split, Math.ceil(split.input) + overflow))
  }

  function stopResize() {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    const element = handle.current
    onResizingChange?.(false)
    if (element?.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId)
  }

  function restoreHeight(layout: HTMLElement, split: Split) {
    if (preferredHeight.current === undefined) {
      clearSplit(layout)
      describe(split)
    } else updateHeight(layout, split, split.input)
  }

  useLayoutEffect(() => {
    const layout = getLayout()
    if (!layout) return
    preferredHeight.current = savedHeight
    const fitToLayout = () => {
      cancelSnapAnimation()
      stopResize()
      cancelSizeOptions()
      lastTap.current = null
      clearSplit(layout)
      // Measure the available board space with the input card at its natural height.
      onResizeSettled?.()
      const split = measureSplit(layout, refs, hintOpen.current)
      if (!split) return
      const preferred = preferredHeight.current
      if (preferred === undefined) describe(split)
      // An open hint can make the page scroll when the board reaches its minimum.
      else updateHeight(layout, split, hintOpen.current ? Math.max(split.min, preferred) : clampHeight(split, preferred))
      onResizeSettled?.()
    }
    fitToLayout()
    const observer = new ResizeObserver(entries => {
      if (drag.current) return
      if (entries.some(entry => entry.target === layout)) {
        fitToLayout()
        return
      }
      const split = measureSplit(layout, refs, hintOpen.current)
      if (!split) return
      // Layout constraints can temporarily change the visible size. Only an
      // explicit resize should overwrite the player's saved height.
      if (preferredHeight.current !== undefined && split.input < split.min - 1) updateHeight(layout, split, split.min)
      else describe(split)
    })
    const input = refs.inputTabs.current
    const keypad = refs.digitControls.current
    if (input) observer.observe(input)
    if (keypad) observer.observe(keypad)
    const board = refs.boardViewport.current ?? refs.boardFrame.current
    if (board) observer.observe(board)
    observer.observe(layout)
    window.addEventListener('resize', fitToLayout)
    return () => {
      cancelSnapAnimation()
      observer.disconnect()
      window.removeEventListener('resize', fitToLayout)
      cancelSizeOptions()
      stopResize()
      clearSplit(layout)
    }
  }, [fitContent, edge, layoutElement, refs, onResizeSettled])

  useLayoutEffect(() => {
    const current = drag.current
    if (!current) return
    stopResize()
    restoreHeight(current.layout, current.split)
  }, [withHint])

  // Saving a completed drag must not clear the sizing styles and briefly snap
  // the board back to its initial position. Apply only independent height changes.
  useLayoutEffect(() => {
    preferredHeight.current = savedHeight
    const layout = getLayout()
    if (!layout || drag.current) return
    const appliedHeight = parseFloat(layout.style.getPropertyValue('--mobile-resized-input-height'))
    if (savedHeight === undefined) {
      if (!layout.hasAttribute('data-input-sized')) return
      clearSplit(layout)
      const split = measureSplit(layout, refs, withHint)
      if (split) describe(split)
    } else if (!Number.isFinite(appliedHeight) || Math.abs(appliedHeight - savedHeight) > 1) {
      const split = measureSplit(layout, refs, withHint)
      if (split) updateHeight(layout, split, clampHeight(split, savedHeight))
    }
  }, [savedHeight])

  useLayoutEffect(() => {
    if (!disabled) return
    lastTap.current = null
    cancelSizeOptions()
    setOptions(null)
    const current = drag.current
    const layout = getLayout()
    if (!current || !layout) return
    stopResize()
    restoreHeight(layout, current.split)
  }, [disabled])

  const direction = edge === 'top' ? -1 : 1
  function heightAtPointer(current: Drag, y: number) {
    return clampHeight(current.split, current.split.input + direction * (y - current.startY))
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || drag.current) return
    cancelSizeOptions()
    cancelSnapAnimation()
    suppressClick.current = false
    const layout = getLayout()
    const split = layout && measureSplit(layout, refs, withHint)
    if (!layout || !split || split.min === split.max) return
    const board = measureBoardPreview(refs)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onResizingChange?.(true)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startedAt: event.timeStamp,
      moved: false, layout, split, height: split.input, frame: null, board }
  }

  function movedFromStart(current: Drag, event: PointerEvent<HTMLDivElement>) {
    return Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > TAP_MOVE_LIMIT
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    current.moved ||= movedFromStart(current, event)
    if (!current.moved) return
    const height = heightAtPointer(current, event.clientY)
    if (height === current.height) return
    current.height = height
    current.frame ??= requestAnimationFrame(() => {
      current.frame = null
      applySplit(current.layout, current.split, current.height)
      onResizePreview?.()
    })
  }

  function finishResize(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    const { layout } = current
    const moved = current.moved || movedFromStart(current, event)
    suppressClick.current = moved || !commit
    const rawHeight = commit && moved ? heightAtPointer(current, event.clientY) : current.split.input
    const height = commit && moved
      ? rawHeight <= current.split.min + 0.001
        ? current.split.min
        : rawHeight >= current.split.max - 0.001
          ? current.split.max
          : clampHeight(current.split, current.split.input + Math.round((rawHeight - current.split.input) / MOBILE_RESIZE_STEP) * MOBILE_RESIZE_STEP)
      : current.split.input
    const inputPanel = inputPanelRef.current
    const before = inputPanel?.getBoundingClientRect()
    const boardBefore = current.board?.grid.getBoundingClientRect()
    stopResize()
    if (height !== current.split.input) {
      commitHeight(layout, current.split, height)
    } else restoreHeight(layout, current.split)
    // An exact snap may leave the input's layout height unchanged on release,
    // so ResizeObserver would otherwise miss the handoff from preview to layout.
    if (moved) onResizeSettled?.()
    if (commit && height !== current.split.input) {
      const duration = motionDuration('snap')
      const inputSnap = before && inputPanel && animatePanelLayout(inputPanel, before, duration)
      const boardSnap = boardBefore && current.board && animateBoardSnap(current.board, boardBefore, duration)
      snapAnimations.current = [inputSnap, boardSnap].filter((animation): animation is Animation => Boolean(animation))
    }

    const previous = lastTap.current
    lastTap.current = null
    if (!commit || moved || event.timeStamp - current.startedAt > DOUBLE_TAP_MS) return
    const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY, pointerType: event.pointerType }
    if (previous && tap.pointerType === previous.pointerType && tap.time - previous.time <= DOUBLE_TAP_MS &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_DISTANCE) {
      suppressClick.current = true
      fitInput(layout)
    }
    else lastTap.current = tap
  }

  return <><div ref={handle} className="mobile-input-resize" data-grid-click-away-exempt role="separator" aria-orientation="horizontal"
    aria-label="Resize puzzle and input panels" aria-controls={inputId}
    aria-haspopup="dialog" aria-keyshortcuts="Enter Space Shift+Enter" title="Tap for size options. Double-tap to fit."
    aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} data-no-panel-hold
    onPointerDown={startResize} onPointerMove={moveResize}
    onPointerUp={(event) => finishResize(event, true)}
    onPointerCancel={(event) => finishResize(event, false)}
    onLostPointerCapture={(event) => finishResize(event, false)}
    onClick={event => {
      if (disabled || suppressClick.current) return
      cancelSizeOptions()
      if (event.detail === 0) openSizeOptions()
      else optionsTimer.current = window.setTimeout(() => {
        optionsTimer.current = null
        openSizeOptions()
      }, DOUBLE_TAP_MS)
    }}
    onKeyDown={(event) => {
      const layout = getLayout()
      if (disabled || !layout || drag.current || !['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      lastTap.current = null
      cancelSizeOptions()
      if (event.key === 'Enter' && event.shiftKey) { openSizeOptions(); return }
      if (event.key === 'Enter' || event.key === ' ') {
        if (!event.repeat) fitInput(layout)
        return
      }
      if (event.key === 'Home') adjustSize('reset')
      else if (event.key === 'End') adjustSize('maximum')
      else adjustSize(direction * (event.key === 'ArrowUp' ? -MOBILE_RESIZE_STEP : MOBILE_RESIZE_STEP))
    }} />
    <ResizeOptionsDialog title="Resize input panel" axis="height" step={MOBILE_RESIZE_STEP}
      value={options?.input ?? 0} min={options?.min ?? 0} max={options?.max ?? 0}
      onStep={(delta) => adjustSize(delta)} onReset={() => adjustSize('reset')}
      open={options !== null} onClose={() => setOptions(null)} returnFocus={() => handle.current} />
  </>
}
