import { type PointerEvent, useLayoutEffect, useRef } from 'react'

const MIN_GRID_WIDTH = 180
const MIN_GRID_WIDTH_WITH_HINT = 130
const MIN_SCROLLABLE_INPUT_HEIGHT = 44
const KEYBOARD_STEP = 24
const DOUBLE_TAP_MS = 350
const TAP_MOVE_LIMIT = 6
const DOUBLE_TAP_DISTANCE = 24

type Split = { input: number; total: number; chrome: number; minPuzzle: number; min: number; max: number }
type BoardPreview = { viewport: HTMLElement; content: HTMLElement; width: number; height: number; maxWidth: number }
type Tap = { time: number; x: number; y: number; pointerType: string }
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

function measureSplit(layout: HTMLElement, withHint: boolean): Split | null {
  const input = layout.querySelector<HTMLElement>('.mobile-input-tabs')
  const body = input?.querySelector<HTMLElement>('.mobile-input-panels')
  const keypad = input?.querySelector<HTMLElement>('.mobile-input-digits > .workspace-controls')
  const puzzle = layout.querySelector<HTMLElement>('[data-mobile-panel="puzzle"] .puzzle')
  const grid = puzzle?.querySelector<HTMLElement>('.puzzle-zoom') ?? puzzle?.querySelector<HTMLElement>('.puzzle-stage .board-frame')
  if (!input || !body || !keypad || !puzzle || !grid?.offsetWidth) return null

  const height = blockSize(input)
  // The grid is square, so the remaining card height belongs to the surrounding UI.
  const chrome = parseFloat(layout.style.getPropertyValue('--mobile-puzzle-chrome-height')) ||
    blockSize(puzzle) - parseFloat(getComputedStyle(grid).inlineSize)
  const puzzleHeight = parseFloat(layout.style.getPropertyValue('--mobile-resized-puzzle-height')) || blockSize(puzzle)
  const minGrid = withHint ? MIN_GRID_WIDTH_WITH_HINT : MIN_GRID_WIDTH
  const minPuzzle = Math.min(puzzleHeight, chrome + minGrid)
  const keypadHeight = blockSize(keypad)
  const minBody = withHint ? Math.min(MIN_SCROLLABLE_INPUT_HEIGHT, keypadHeight) : keypadHeight
  const inputPanel = input.closest<HTMLElement>('[data-mobile-panel="input"]')
  const minPanel = withHint && inputPanel ? parseFloat(getComputedStyle(inputPanel).minBlockSize) || 0 : 0
  const min = Math.max(minPanel, height - blockSize(body) + minBody)
  return {
    input: height,
    total: height + puzzleHeight,
    chrome,
    minPuzzle,
    min,
    max: Math.max(min, height + puzzleHeight - minPuzzle),
  }
}

function previewBoard(layout: HTMLElement): BoardPreview | null {
  const viewport = layout.querySelector<HTMLElement>('.puzzle-zoom')
  const content = viewport?.querySelector<HTMLElement>('.puzzle-zoom-content')
  if (!viewport || !content || !viewport.parentElement) return null
  const width = viewport.offsetWidth
  const height = viewport.offsetHeight
  if (!width || !height) return null
  const maxWidth = viewport.parentElement.clientWidth
  // Keep the grid's layout fixed while its viewport and both cards follow the pointer.
  viewport.style.height = `${height}px`
  content.style.width = `${width}px`
  content.style.height = `${height}px`
  viewport.setAttribute('data-resize-preview', '')
  return { viewport, content, width, height, maxWidth }
}

function clearBoardPreview(board: BoardPreview | null) {
  if (!board) return
  board.viewport.removeAttribute('data-resize-preview')
  board.viewport.style.removeProperty('height')
  board.content.style.removeProperty('width')
  board.content.style.removeProperty('height')
  board.content.style.removeProperty('scale')
}

function applySplit(layout: HTMLElement, split: Split, height: number, board?: BoardPreview | null) {
  layout.toggleAttribute('data-input-sized', true)
  layout.style.setProperty('--mobile-resized-input-height', `${height}px`)
  const puzzleHeight = Math.max(split.minPuzzle, split.total - height)
  layout.style.setProperty('--mobile-resized-puzzle-height', `${puzzleHeight}px`)
  const chrome = `${split.chrome}px`
  if (layout.style.getPropertyValue('--mobile-puzzle-chrome-height') !== chrome) {
    layout.style.setProperty('--mobile-puzzle-chrome-height', chrome)
  }
  if (board) {
    const width = Math.min(board.maxWidth, puzzleHeight - split.chrome)
    const viewportHeight = board.height + width - board.width
    board.viewport.style.height = `${viewportHeight}px`
    board.content.style.scale = `${width / board.width} ${viewportHeight / board.height}`
  }
}

function clearSplit(layout: HTMLElement) {
  layout.removeAttribute('data-input-sized')
  layout.style.removeProperty('--mobile-resized-input-height')
  layout.style.removeProperty('--mobile-resized-puzzle-height')
  layout.style.removeProperty('--mobile-puzzle-chrome-height')
}

function clampHeight(split: Split, height: number) {
  return Math.min(split.max, Math.max(split.min, height))
}

function inputOverflow(layout: HTMLElement) {
  const panel = layout.querySelector<HTMLElement>('.mobile-input-panels > :not([inert], [hidden])')
  if (!panel) return 0
  // The solution steps and next-puzzle actions scroll inside the active tab.
  const nested = panel.querySelectorAll<HTMLElement>(
    '.solution-path, .solution-path-steps, .mobile-completion-actions:not([hidden])',
  )
  return [panel, ...nested].reduce((pixels, element) => pixels + Math.max(0, element.scrollHeight - element.clientHeight), 0)
}

export function MobileInputResizeHandle({ inputId, edge, disabled, withHint, hasOpenTabs = false, savedHeight, onHeightChange }: {
  inputId: string
  edge: 'top' | 'bottom'
  disabled: boolean
  withHint: boolean
  hasOpenTabs?: boolean
  savedHeight?: number
  onHeightChange?: (height: number | undefined) => void
}) {
  const handle = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const lastTap = useRef<Tap | null>(null)
  const preferredHeight = useRef(savedHeight)

  function getLayout() { return handle.current?.closest<HTMLElement>('.mobile-panel-layout') }

  function describe(split: Split, height = split.input) {
    handle.current?.setAttribute('aria-valuemin', String(Math.round(split.min)))
    handle.current?.setAttribute('aria-valuemax', String(Math.round(split.max)))
    handle.current?.setAttribute('aria-valuenow', String(Math.round(height)))
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

  function fitInput(layout: HTMLElement) {
    const split = measureSplit(layout, withHint)
    if (!split) return
    const overflow = inputOverflow(layout)
    if (overflow > 0) commitHeight(layout, split, clampHeight(split, Math.ceil(split.input) + overflow))
  }

  function stopResize() {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    clearBoardPreview(current.board)
    const element = handle.current
    current.layout.removeAttribute('data-input-resizing')
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
      stopResize()
      lastTap.current = null
      clearSplit(layout)
      const split = measureSplit(layout, withHint)
      if (!split) return
      const preferred = preferredHeight.current
      if (preferred === undefined) describe(split)
      else updateHeight(layout, split, clampHeight(split, preferred))
    }
    fitToLayout()
    const observer = new ResizeObserver(() => {
      if (drag.current) return
      const split = measureSplit(layout, withHint)
      if (!split) return
      if (preferredHeight.current !== undefined && split.input < split.min) updateHeight(layout, split, split.min)
      else describe(split)
    })
    const input = layout.querySelector('.mobile-input-tabs')
    const keypad = input?.querySelector('.mobile-input-digits > .workspace-controls')
    if (input) observer.observe(input)
    if (keypad) observer.observe(keypad)
    window.addEventListener('resize', fitToLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fitToLayout)
      stopResize()
      clearSplit(layout)
    }
  }, [withHint, edge, hasOpenTabs, savedHeight])

  useLayoutEffect(() => {
    if (disabled) lastTap.current = null
    const current = drag.current
    const layout = getLayout()
    if (!disabled || !current || !layout) return
    stopResize()
    restoreHeight(layout, current.split)
  }, [disabled])

  const direction = edge === 'top' ? -1 : 1
  function heightAtPointer(current: Drag, y: number) {
    return clampHeight(current.split, current.split.input + direction * (y - current.startY))
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || drag.current) return
    const layout = getLayout()
    const split = layout && measureSplit(layout, withHint)
    if (!layout || !split || split.min === split.max) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const board = previewBoard(layout)
    layout.setAttribute('data-input-resizing', '')
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
      applySplit(current.layout, current.split, current.height, current.board)
    })
  }

  function finishResize(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    const { layout } = current
    const moved = current.moved || movedFromStart(current, event)
    const height = commit && moved ? heightAtPointer(current, event.clientY) : current.split.input
    stopResize()
    if (height !== current.split.input) commitHeight(layout, current.split, height)
    else restoreHeight(layout, current.split)

    const previous = lastTap.current
    lastTap.current = null
    if (!commit || moved || event.timeStamp - current.startedAt > DOUBLE_TAP_MS) return
    const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY, pointerType: event.pointerType }
    if (previous && tap.pointerType === previous.pointerType && tap.time - previous.time <= DOUBLE_TAP_MS &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_DISTANCE) fitInput(layout)
    else lastTap.current = tap
  }

  return <div ref={handle} className="mobile-input-resize" role="separator" aria-orientation="horizontal"
    aria-label="Resize puzzle and input panels" aria-controls={inputId}
    aria-keyshortcuts="Enter Space" title="Double-tap or press Enter to fit the input panel"
    aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} data-no-panel-hold
    onPointerDown={startResize} onPointerMove={moveResize}
    onPointerUp={(event) => finishResize(event, true)}
    onPointerCancel={(event) => finishResize(event, false)}
    onLostPointerCapture={(event) => finishResize(event, false)}
    onKeyDown={(event) => {
      const layout = getLayout()
      if (disabled || !layout || drag.current || !['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      lastTap.current = null
      if (event.key === 'Enter' || event.key === ' ') {
        if (!event.repeat) fitInput(layout)
        return
      }
      if (event.key === 'Home') {
        preferredHeight.current = undefined
        clearSplit(layout)
        onHeightChange?.(undefined)
      }
      const split = measureSplit(layout, withHint)
      if (!split) return
      if (event.key === 'Home') {
        describe(split)
        return
      }
      const height = event.key === 'End' ? split.max
        : clampHeight(split, split.input + (event.key === 'ArrowUp' ? -1 : 1) * direction * KEYBOARD_STEP)
      commitHeight(layout, split, height)
    }} />
}
