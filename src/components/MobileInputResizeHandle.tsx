import { type PointerEvent, useLayoutEffect, useRef, useState } from 'react'
import { mobileInputResizeBudget, mobilePreviewGridWidth, mobileResizedPuzzleHeight } from '../sudoku/mobile-input-sizing'

import { Button } from './Button'
import { Modal } from './Modal'
import { RESIZE_STEP, ResizeStepControls } from './ResizeStepControls'

const MIN_GRID_WIDTH = 180
const MIN_GRID_WIDTH_WITH_HINT = 130
const MIN_SCROLLABLE_INPUT_HEIGHT = 44
const DOUBLE_TAP_MS = 350
const TAP_MOVE_LIMIT = 6
const DOUBLE_TAP_DISTANCE = 24

type Split = { input: number; total: number; chrome: number; naturalPuzzle: number; minPuzzle: number; min: number; max: number }
type StyleSnapshot = { element: HTMLElement; properties: { name: string; value: string; priority: string }[] }
type BoardPreview = {
  viewport: HTMLElement
  content: HTMLElement
  width: number
  height: number
  maxWidth: number
  styles: StyleSnapshot[]
}
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
  // Retain the unsized grid height so shrinking the input can restore the original board.
  const naturalPuzzle = parseFloat(layout.style.getPropertyValue('--mobile-natural-puzzle-height')) || blockSize(puzzle)
  const minGrid = withHint ? MIN_GRID_WIDTH_WITH_HINT : MIN_GRID_WIDTH
  const minPuzzle = Math.min(naturalPuzzle, chrome + minGrid)
  const workspace = layout.parentElement
  const stacked = workspace && getComputedStyle(workspace).display === 'flex'
  const gap = layout.querySelector<HTMLElement>('.mobile-panel-gap')
  const gapStyle = gap && getComputedStyle(gap)
  const unusedSpace = !withHint && stacked && gapStyle && gap
    ? Math.max(0, blockSize(gap) - (parseFloat(gapStyle.flexBasis) || 0)) : 0
  let total = mobileInputResizeBudget(height, puzzleHeight, unusedSpace)
  const page = layout.closest<HTMLElement>('.standard-workspace-page')
  if (stacked && page && !withHint) {
    // The default cards may exceed the available height at any stacked size.
    // Only budget visible space when fitting a saved or dragged keypad height.
    total -= Math.max(0, page.scrollHeight - page.clientHeight)
  }
  const keypadHeight = blockSize(keypad)
  const minBody = withHint ? Math.min(MIN_SCROLLABLE_INPUT_HEIGHT, keypadHeight) : keypadHeight
  const inputPanel = input.closest<HTMLElement>('[data-mobile-panel="input"]')
  const minPanel = withHint && inputPanel ? parseFloat(getComputedStyle(inputPanel).minBlockSize) || 0 : 0
  const min = Math.max(minPanel, height - blockSize(body) + minBody)
  return {
    input: height,
    total,
    chrome,
    naturalPuzzle,
    minPuzzle,
    min,
    max: Math.max(min, total - minPuzzle),
  }
}

function previewBoard(layout: HTMLElement): BoardPreview | null {
  const viewport = layout.querySelector<HTMLElement>('.puzzle-zoom')
  const content = viewport?.querySelector<HTMLElement>('.puzzle-zoom-content')
  if (!viewport || !content || !viewport.parentElement) return null
  const width = viewport.offsetWidth
  const height = viewport.offsetHeight
  if (!width || !height) return null
  // The stage is already narrow after a previous resize. Measure the full puzzle
  // column instead, or a collapsing input panel can never grow the board again.
  const column = viewport.closest<HTMLElement>('.puzzle-column')
  const inputPanel = layout.querySelector<HTMLElement>('[data-mobile-panel="input"]')
  const columnStyle = column && getComputedStyle(column)
  const columnWidth = column && columnStyle
    ? column.clientWidth - parseFloat(columnStyle.paddingInlineStart) - parseFloat(columnStyle.paddingInlineEnd)
    : viewport.parentElement.clientWidth
  const maxWidth = Math.max(width, Math.min(columnWidth, inputPanel?.clientWidth ?? columnWidth))
  const remember = (element: HTMLElement, names: string[]): StyleSnapshot => ({
    element, properties: names.map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) })),
  })
  const styles = [
    remember(viewport, ['height']), remember(content, ['width', 'height', 'scale']),
  ]
  // Keep the grid's layout fixed while its viewport and both cards follow the pointer.
  viewport.style.height = `${height}px`
  content.style.width = `${width}px`
  content.style.height = `${height}px`
  viewport.setAttribute('data-resize-preview', '')
  return { viewport, content, width, height, maxWidth, styles }
}

function clearBoardPreview(board: BoardPreview | null) {
  if (!board) return
  board.viewport.removeAttribute('data-resize-preview')
  for (const { element, properties } of board.styles) for (const { name, value, priority } of properties) {
    if (value) element.style.setProperty(name, value, priority)
    else element.style.removeProperty(name)
  }
}

function applySplit(layout: HTMLElement, split: Split, height: number, board?: BoardPreview | null) {
  // Keep the outer cards current throughout the gesture. The content's CSS
  // boundary stops these sizing values from invalidating every grid mark.
  layout.toggleAttribute('data-input-sized', true)
  layout.style.setProperty('--mobile-resized-input-height', `${height}px`)
  const puzzleHeight = mobileResizedPuzzleHeight(split.total, height, split.naturalPuzzle, split.minPuzzle)
  layout.style.setProperty('--mobile-natural-puzzle-height', `${split.naturalPuzzle}px`)
  layout.style.setProperty('--mobile-resized-puzzle-height', `${puzzleHeight}px`)
  const chrome = `${split.chrome}px`
  if (layout.style.getPropertyValue('--mobile-puzzle-chrome-height') !== chrome) {
    layout.style.setProperty('--mobile-puzzle-chrome-height', chrome)
  }
  if (board) {
    const width = mobilePreviewGridWidth(board.maxWidth, puzzleHeight, split.chrome)
    const viewportHeight = board.height + width - board.width
    board.viewport.style.height = `${viewportHeight}px`
    board.content.style.scale = `${width / board.width} ${viewportHeight / board.height}`
  }
}

function clearSplit(layout: HTMLElement) {
  layout.removeAttribute('data-input-sized')
  layout.style.removeProperty('--mobile-resized-input-height')
  layout.style.removeProperty('--mobile-resized-puzzle-height')
  layout.style.removeProperty('--mobile-natural-puzzle-height')
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
  const optionsTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [options, setOptions] = useState<Pick<Split, 'input' | 'min' | 'max'> | null>(null)

  function cancelSizeOptions() {
    if (optionsTimer.current === null) return
    window.clearTimeout(optionsTimer.current)
    optionsTimer.current = null
  }


  function getLayout() { return handle.current?.closest<HTMLElement>('.mobile-panel-layout') }

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
    const split = layout && measureSplit(layout, withHint)
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
    const split = measureSplit(layout, withHint)
    if (!split) return
    if (change === 'reset') { describe(split); return }
    commitHeight(layout, split, change === 'maximum' ? split.max : clampHeight(split, split.input + change))
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
      cancelSizeOptions()
      lastTap.current = null
      clearSplit(layout)
      const split = measureSplit(layout, withHint)
      if (!split) return
      const preferred = preferredHeight.current
      if (preferred === undefined) describe(split)
      else updateHeight(layout, split, clampHeight(split, preferred))
    }
    fitToLayout()
    const page = layout.closest<HTMLElement>('.standard-workspace-page')
    const observer = new ResizeObserver(entries => {
      if (drag.current) return
      if (entries.some(entry => entry.target === page)) {
        fitToLayout()
        return
      }
      const split = measureSplit(layout, withHint)
      if (!split) return
      if (preferredHeight.current !== undefined && split.input < split.min) updateHeight(layout, split, split.min)
      else describe(split)
    })
    const input = layout.querySelector('.mobile-input-tabs')
    const keypad = input?.querySelector('.mobile-input-digits > .workspace-controls')
    if (input) observer.observe(input)
    if (keypad) observer.observe(keypad)
    if (page) observer.observe(page)
    window.addEventListener('resize', fitToLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fitToLayout)
      cancelSizeOptions()
      stopResize()
      clearSplit(layout)
    }
  }, [withHint, edge, hasOpenTabs])

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
      const split = measureSplit(layout, withHint)
      if (split) describe(split)
    } else if (!Number.isFinite(appliedHeight) || Math.abs(appliedHeight - savedHeight) > 1) {
      const split = measureSplit(layout, withHint)
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
    suppressClick.current = false
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
    suppressClick.current = moved || !commit
    const height = commit && moved ? heightAtPointer(current, event.clientY) : current.split.input
    stopResize()
    if (height !== current.split.input) commitHeight(layout, current.split, height)
    else restoreHeight(layout, current.split)

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

  return <><div ref={handle} className="mobile-input-resize" role="separator" aria-orientation="horizontal"
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
      else adjustSize(direction * (event.key === 'ArrowUp' ? -RESIZE_STEP : RESIZE_STEP))
    }} />
    <Modal title="Resize input panel" className="resize-options-dialog" open={options !== null}
      onClose={() => setOptions(null)} returnFocus={() => handle.current}>
      <ResizeStepControls axis="height" onStep={adjustSize} atMin={Boolean(options && options.input <= options.min)}
        atMax={Boolean(options && options.input >= options.max)} />
      <Button className="resize-options-reset" onClick={() => adjustSize('reset')}>Reset size</Button>
    </Modal>
  </>
}
