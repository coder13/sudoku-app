import { type PointerEvent, useLayoutEffect, useRef } from 'react'

const MIN_GRID_WIDTH = 180
const MIN_GRID_WIDTH_WITH_HINT = 130
const KEYBOARD_STEP = 24

type Split = { input: number; puzzle: number; chrome: number; minPuzzle: number; min: number; max: number }
type BoardPreview = { viewport: HTMLElement; content: HTMLElement; width: number; height: number; maxWidth: number }
type Drag = {
  pointerId: number
  startY: number
  layout: HTMLElement
  split: Split
  height: number
  frame: number | null
  board: BoardPreview | null
}

function measureSplit(layout: HTMLElement, withHint: boolean): Split | null {
  const input = layout.querySelector<HTMLElement>('.mobile-input-tabs')
  const body = input?.querySelector<HTMLElement>('.mobile-input-panels')
  const keypad = input?.querySelector<HTMLElement>('.mobile-input-digits > .workspace-controls')
  const puzzle = layout.querySelector<HTMLElement>('[data-mobile-panel="puzzle"] .puzzle')
  const grid = puzzle?.querySelector<HTMLElement>('.puzzle-zoom')
  if (!input || !body || !keypad || !puzzle || !grid?.offsetWidth) return null

  const height = input.offsetHeight
  // The grid is square, so the remaining card height belongs to the surrounding UI.
  const chrome = parseFloat(layout.style.getPropertyValue('--mobile-puzzle-chrome-height')) || puzzle.offsetHeight - grid.offsetWidth
  const puzzleHeight = parseFloat(layout.style.getPropertyValue('--mobile-resized-puzzle-height')) || puzzle.offsetHeight
  const minGrid = withHint ? MIN_GRID_WIDTH_WITH_HINT : MIN_GRID_WIDTH
  const minPuzzle = Math.min(puzzleHeight, chrome + minGrid)
  const min = height - body.offsetHeight + keypad.offsetHeight
  return {
    input: height,
    puzzle: puzzleHeight,
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
  const puzzleHeight = Math.max(split.minPuzzle, split.puzzle + split.input - height)
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

export function MobileInputResizeHandle({ inputId, edge, disabled, withHint }: {
  inputId: string
  edge: 'top' | 'bottom'
  disabled: boolean
  withHint: boolean
}) {
  const handle = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const preferredHeight = useRef<number | null>(null)

  function getLayout() { return handle.current?.closest<HTMLElement>('.mobile-panel-layout') }

  function describe(split: Split, height = split.input) {
    handle.current?.setAttribute('aria-valuemin', String(split.min))
    handle.current?.setAttribute('aria-valuemax', String(split.max))
    handle.current?.setAttribute('aria-valuenow', String(Math.round(height)))
  }

  function updateHeight(layout: HTMLElement, split: Split, height: number) {
    applySplit(layout, split, height)
    describe(split, height)
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
    if (preferredHeight.current === null) {
      clearSplit(layout)
      describe(split)
    } else updateHeight(layout, split, split.input)
  }

  useLayoutEffect(() => {
    const layout = getLayout()
    if (!layout) return
    const fitToLayout = () => {
      stopResize()
      clearSplit(layout)
      const split = measureSplit(layout, withHint)
      if (!split) return
      const preferred = preferredHeight.current
      if (preferred === null) describe(split)
      else updateHeight(layout, split, clampHeight(split, preferred))
    }
    fitToLayout()
    const observer = new ResizeObserver(() => {
      if (drag.current) return
      const split = measureSplit(layout, withHint)
      if (!split) return
      if (preferredHeight.current !== null && split.input < split.min) updateHeight(layout, split, split.min)
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
  }, [withHint, edge])

  useLayoutEffect(() => {
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
    drag.current = { pointerId: event.pointerId, startY: event.clientY, layout, split, height: split.input, frame: null, board }
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
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
    const height = commit ? heightAtPointer(current, event.clientY) : current.split.input
    stopResize()
    if (commit && height !== current.split.input) {
      preferredHeight.current = height
      updateHeight(layout, current.split, height)
    } else restoreHeight(layout, current.split)
  }

  return <div ref={handle} className="mobile-input-resize" role="separator" aria-orientation="horizontal"
    aria-label="Resize puzzle and input panels" aria-controls={inputId}
    aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} data-no-panel-hold
    onPointerDown={startResize} onPointerMove={moveResize}
    onPointerUp={(event) => finishResize(event, true)}
    onPointerCancel={(event) => finishResize(event, false)}
    onLostPointerCapture={(event) => finishResize(event, false)}
    onKeyDown={(event) => {
      const layout = getLayout()
      if (disabled || !layout || drag.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Home') {
        preferredHeight.current = null
        clearSplit(layout)
      }
      const split = measureSplit(layout, withHint)
      if (!split) return
      if (event.key === 'Home') { describe(split); return }
      const height = event.key === 'End' ? split.max
        : clampHeight(split, split.input + (event.key === 'ArrowUp' ? -1 : 1) * direction * KEYBOARD_STEP)
      if (height === split.input) return
      preferredHeight.current = height
      updateHeight(layout, split, height)
    }} />
}
