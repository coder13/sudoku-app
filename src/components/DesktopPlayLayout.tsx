import { type CSSProperties, type PointerEvent, type ReactNode, type Ref, type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  DEFAULT_DESKTOP_INPUT_WIDTH, DEFAULT_DESKTOP_LAYOUT_WIDTH, DEFAULT_PLAY_PREFERENCES,
  MIN_DESKTOP_INPUT_WIDTH, MIN_DESKTOP_LAYOUT_WIDTH, MIN_DESKTOP_PUZZLE_WIDTH,
} from '../sudoku/play-preferences'
import { RESIZE_STEP } from './ResizeStepControls'
import { ResizeOptionsDialog } from './ResizeOptionsDialog'
import { usePlayPreference } from './usePlayPreference'
import { previewDesktopBoards, rememberInlineStyles } from './desktop-resize-preview'
import { mergeRefs } from './merge-refs'
import { isPlayLayoutResizing, PlayLayoutAnchorsContext, usePlayLayoutAnchors, type PlayLayoutAnchors } from './play-layout-anchors'

const HANDLE_CARD_GAP = 6
const DRAG_SLOP = 4

type WidthPreview = { update: (width: number) => void; clear: (width: number) => void }
type WidthDrag = {
  pointerId: number
  startX: number
  startWidth: number
  multiplier: number
  min: number
  max: number
  moved: boolean
  width: number
  paintedWidth: number
  frame: number | null
  preview: WidthPreview | null
}

function clampWidth(width: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(width)))
}

function describeWidth(element: HTMLElement | null, width: number) {
  element?.setAttribute('aria-valuenow', String(width))
  element?.setAttribute('aria-valuetext', `${width} pixels`)
}

function PlayResizeHandle({ edge, width, min, max, beginPreview, onSave, onReset, handleRef }: {
  edge?: 'left' | 'right'
  width: number
  min: number
  max: number
  beginPreview: () => WidthPreview | null
  onSave: (width: number) => void
  onReset: () => void
  handleRef?: Ref<HTMLDivElement>
}) {
  const handle = useRef<HTMLDivElement>(null)
  const anchors = usePlayLayoutAnchors()
  const combinedHandleRef = useMemo(() => mergeRefs(handle, handleRef), [handleRef])
  const drag = useRef<WidthDrag | null>(null)
  const suppressClick = useRef(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const latest = useRef({ width, beginPreview, onSave })
  const direction = edge === 'right' ? 1 : -1

  useLayoutEffect(() => { latest.current = { width, beginPreview, onSave } })

  function stepWidth(delta: number) {
    const nextWidth = clampWidth(width + delta, min, max)
    if (nextWidth !== width) onSave(nextWidth)
  }

  function widthAtPointer(current: WidthDrag, x: number) {
    return clampWidth(current.startWidth + current.multiplier * (x - current.startX), current.min, current.max)
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return
    if (isPlayLayoutResizing(anchors)) return
    suppressClick.current = false
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const style = getComputedStyle(event.currentTarget)
    const scale = Number(style.getPropertyValue('--desktop-layout-scale')) || 1
    const contentWidth = parseFloat(style.getPropertyValue('--desktop-layout-content-width')) || DEFAULT_DESKTOP_LAYOUT_WIDTH
    // Outer edges move in pairs. The divider moves within the scaled Play area.
    const multiplier = edge ? 2 * direction * DEFAULT_DESKTOP_LAYOUT_WIDTH / contentWidth : direction / scale
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startWidth: width, multiplier, min, max,
      moved: false, width, paintedWidth: width, frame: null, preview: null,
    }
  }

  function previewWidth(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_SLOP) return
    current.moved = true
    current.width = widthAtPointer(current, event.clientX)
    if (current.frame !== null || current.width === current.paintedWidth) return
    // A busy pointer can send several moves before the next paint. Apply only
    // its latest position, without rendering the React layout for each move.
    current.frame = requestAnimationFrame(() => {
      current.frame = null
      if (drag.current !== current || current.width === current.paintedWidth) return
      current.preview ??= latest.current.beginPreview()
      current.preview?.update(current.width)
      current.paintedWidth = current.width
      describeWidth(handle.current, current.width)
    })
  }

  function finishDrag(commit: boolean, x?: number, pointerId?: number) {
    const current = drag.current
    if (!current || pointerId !== undefined && current.pointerId !== pointerId) return
    drag.current = null
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    const moved = current.moved || x !== undefined && Math.abs(x - current.startX) >= DRAG_SLOP
    suppressClick.current = moved || !commit
    try {
      if (commit && moved) {
        // Pointerup can arrive before the queued preview frame.
        const nextWidth = widthAtPointer(current, x ?? current.startX)
        if (nextWidth !== current.startWidth) {
          // Replace the preview with the saved layout before the next paint.
          flushSync(() => latest.current.onSave(nextWidth))
        }
      }
    } finally {
      current.preview?.clear(latest.current.width)
      describeWidth(handle.current, latest.current.width)
      if (handle.current?.hasPointerCapture(current.pointerId)) handle.current.releasePointerCapture(current.pointerId)
    }
  }

  // Bounds or saved preferences can change independently of this gesture.
  useLayoutEffect(() => { finishDrag(false) }, [width, min, max])
  useLayoutEffect(() => {
    const cancel = () => finishDrag(false)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      cancel()
    }
  }, [])

  return <><div ref={combinedHandleRef} className={edge ? 'desktop-layout-edge' : 'desktop-layout-divider'} data-grid-click-away-exempt data-edge={edge}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={edge ? `Resize play layout from the ${edge}` : 'Resize puzzle and digit input panels'}
    aria-haspopup={edge ? undefined : 'dialog'} title={edge ? 'Drag to resize play layout' : 'Drag to resize or click for size options'}
    aria-controls={edge ? 'sudoku-workspace' : 'standard-digit-input'}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} aria-valuetext={`${width} pixels`}
    onPointerDown={startDrag} onPointerMove={previewWidth}
    onPointerUp={(event) => finishDrag(true, event.clientX, event.pointerId)}
    onPointerCancel={(event) => finishDrag(false, undefined, event.pointerId)}
    onLostPointerCapture={(event) => finishDrag(false, undefined, event.pointerId)}
    onClick={(event) => {
      if (!edge && (!suppressClick.current || event.detail === 0)) setOptionsOpen(true)
    }}
    onContextMenu={(event) => {
      event.preventDefault()
      finishDrag(false)
      onReset()
    }}
    onKeyDown={(event) => {
      if (event.key === 'Home') {
        event.preventDefault()
        finishDrag(false)
        onReset()
      } else if (!edge && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        finishDrag(false)
        setOptionsOpen(true)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        finishDrag(false)
        stepWidth(direction * (event.key === 'ArrowLeft' ? -RESIZE_STEP : RESIZE_STEP))
      }
    }} />
    {!edge && <ResizeOptionsDialog title="Resize input panel" axis="width" value={width} min={min} max={max}
      onStep={stepWidth} onReset={onReset} open={optionsOpen} onClose={() => setOptionsOpen(false)}
      returnFocus={() => handle.current} />}
  </>
}

export function DesktopPlayLayout({ enabled, className, pageRef, children }: {
  enabled: boolean
  className: string
  pageRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const resizeBounds = useRef<HTMLDivElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const divider = useRef<HTMLDivElement>(null)
  const puzzleStack = useRef<HTMLDivElement>(null)
  const puzzleCard = useRef<HTMLElement>(null)
  const inputStack = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLElement>(null)
  const hintSlot = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLElement>(null)
  const outerEdgeHandles = useRef<Array<HTMLDivElement | null>>([])
  const anchors = useMemo<PlayLayoutAnchors>(() => ({ layoutRoot: root, page: pageRef, edges: resizeBounds,
    workspace, divider, puzzleStack, puzzleCard, inputStack, controls, hintSlot, hint }), [pageRef])
  const [savedWidth, saveWidth] = usePlayPreference('desktopLayoutWidth')
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_DESKTOP_LAYOUT_WIDTH)
  const [contentWidth, setContentWidth] = useState(DEFAULT_DESKTOP_LAYOUT_WIDTH)

  useLayoutEffect(() => {
    if (!enabled) return
    const page = pageRef.current
    const bounds = resizeBounds.current
    if (!bounds) return
    const measure = () => {
      if (root.current?.hasAttribute('data-layout-resizing')) return
      setAvailableWidth(bounds.getBoundingClientRect().width)
      if (page?.offsetWidth) setContentWidth(page.offsetWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bounds, { box: 'border-box' })
    if (page) observer.observe(page, { box: 'border-box' })
    return () => observer.disconnect()
  }, [enabled, pageRef])

  const maxScale = availableWidth / contentWidth
  const maxWidth = Math.max(MIN_DESKTOP_LAYOUT_WIDTH, Math.floor(maxScale * DEFAULT_DESKTOP_LAYOUT_WIDTH))
  const width = clampWidth(savedWidth, MIN_DESKTOP_LAYOUT_WIDTH, maxWidth)
  const scaleAtWidth = (width: number) => width === maxWidth ? maxScale : width / DEFAULT_DESKTOP_LAYOUT_WIDTH
  const layoutStyle = enabled ? {
    '--desktop-layout-base-width': `${DEFAULT_DESKTOP_LAYOUT_WIDTH}px`,
    '--desktop-layout-content-width': `${contentWidth}px`,
    '--desktop-layout-scale': scaleAtWidth(width),
  } as CSSProperties : undefined

  function beginPreview(): WidthPreview | null {
    const layout = root.current
    const edges = resizeBounds.current
    const page = pageRef.current
    if (!layout || !edges || !page) return null
    const scale = scaleAtWidth(width)
    const height = page.getBoundingClientRect().height / scale
    if (!(scale > 0 && height > 0)) return null
    const restorePage = rememberInlineStyles(page, ['scale', 'transform-origin', 'will-change', 'height', 'flex'])
    const restoreEdges = rememberInlineStyles(edges, ['--desktop-layout-scale'])
    const handles = outerEdgeHandles.current.filter((handle): handle is HTMLDivElement => handle !== null)
    layout.setAttribute('data-layout-resizing', '')
    page.style.transformOrigin = 'center top'
    page.style.willChange = 'scale'
    page.style.flex = 'none'
    return {
      update(nextWidth) {
        const nextScale = scaleAtWidth(nextWidth)
        const ratio = nextScale / scale
        // Keep zoom and all board widths fixed. Only the containing surface
        // scales, so the grid does not lay out every candidate during the drag.
        page.style.scale = String(ratio)
        // The scrollable panels still end at the bottom of the viewport.
        page.style.height = `${height / ratio}px`
        edges.style.setProperty('--desktop-layout-scale', String(nextScale))
        for (const handle of handles) describeWidth(handle, nextWidth)
      },
      clear(nextWidth) {
        restorePage()
        restoreEdges()
        layout.removeAttribute('data-layout-resizing')
        for (const handle of handles) describeWidth(handle, nextWidth)
      },
    }
  }

  return <PlayLayoutAnchorsContext.Provider value={anchors}>
    <div ref={root} className={`${className}${enabled ? ' desktop-play-resizable' : ''}`} style={layoutStyle}>
      {children}
      {enabled && <div ref={resizeBounds} className="desktop-layout-edges">
        {(['left', 'right'] as const).map((edge, index) => <PlayResizeHandle key={edge} edge={edge} width={width}
          min={MIN_DESKTOP_LAYOUT_WIDTH} max={maxWidth} beginPreview={beginPreview} onSave={saveWidth}
          onReset={() => saveWidth(DEFAULT_DESKTOP_LAYOUT_WIDTH)} handleRef={handle => { outerEdgeHandles.current[index] = handle }} />)}
      </div>}
    </div>
  </PlayLayoutAnchorsContext.Provider>
}

export function PlayWorkspace({ resizable, children }: { resizable: boolean; children: ReactNode }) {
  const anchors = usePlayLayoutAnchors()
  const localWorkspace = useRef<HTMLDivElement>(null)
  const workspaceRef = anchors?.workspace ?? localWorkspace
  const [savedWidths, saveWidths] = usePlayPreference('desktopPanelWidths')
  const [maxWidth, setMaxWidth] = useState(DEFAULT_DESKTOP_INPUT_WIDTH)

  useLayoutEffect(() => {
    const workspace = workspaceRef.current
    if (!resizable || !workspace) return
    const gap = parseFloat(getComputedStyle(workspace).columnGap)
    const puzzle = anchors?.puzzleCard.current
    const inputStack = anchors?.inputStack.current
    const input = anchors?.controls.current
    const divider = anchors?.divider.current
    const page = anchors?.page.current
    const edges = anchors?.edges.current
    const measure = () => {
      // Outer resizing previews a transformed surface, not new layout bounds.
      if (isPlayLayoutResizing(anchors)) return
      setMaxWidth(Math.max(MIN_DESKTOP_INPUT_WIDTH, workspace.clientWidth - gap - MIN_DESKTOP_PUZZLE_WIDTH))
      if (puzzle && input && inputStack && divider) {
        const scale = Number(getComputedStyle(workspace).getPropertyValue('--desktop-layout-scale')) || 1
        const puzzleBounds = puzzle.getBoundingClientRect()
        const inputBounds = input.getBoundingClientRect()
        const pageBounds = page?.getBoundingClientRect()
        // The hint uses the puzzle card's width even while the grid shrinks.
        const dividerGap = inputBounds.left - puzzleBounds.right
        const midpoint = puzzleBounds.right + dividerGap / 2
        const offset = (midpoint - inputStack.getBoundingClientRect().left) / scale
        // Measure all bounds first, then update the handles without restyling the grid.
        divider.style.setProperty('--play-divider-gap', `${Math.max(0, dividerGap) / scale}px`)
        divider.style.setProperty('--play-divider-offset', `${offset}px`)
        if (edges && pageBounds) {
          edges.style.setProperty('--play-left-edge-offset', `${(puzzleBounds.left - pageBounds.left) / scale - HANDLE_CARD_GAP}px`)
          edges.style.setProperty('--play-right-edge-offset', `${(pageBounds.right - inputBounds.right) / scale - HANDLE_CARD_GAP}px`)
        }
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    if (puzzle) observer.observe(puzzle, { box: 'border-box' })
    if (input) observer.observe(input, { box: 'border-box' })
    return () => {
      observer.disconnect()
      edges?.style.removeProperty('--play-left-edge-offset')
      edges?.style.removeProperty('--play-right-edge-offset')
    }
  }, [resizable, anchors])

  const width = clampWidth(savedWidths.input, MIN_DESKTOP_INPUT_WIDTH, maxWidth)
  const savedColumnsWidth = savedWidths.puzzle === null ? null : savedWidths.puzzle + savedWidths.input
  const style = resizable ? {
    '--play-input-default-width': `${DEFAULT_DESKTOP_INPUT_WIDTH}px`,
    '--play-input-width': `${width}px`,
    '--play-input-scale': width / DEFAULT_DESKTOP_INPUT_WIDTH,
    '--saved-play-columns-width': savedColumnsWidth === null ? undefined : `${savedColumnsWidth}px`,
  } as CSSProperties : undefined

  function saveSplit(input: number) {
    saveWidths({ input, puzzle: maxWidth + MIN_DESKTOP_PUZZLE_WIDTH - input })
  }

  function beginPreview(): WidthPreview | null {
    const workspace = workspaceRef.current
    const inputStack = anchors?.inputStack.current
    if (!workspace || !inputStack) return null
    const restoreWorkspace = rememberInlineStyles(workspace, ['grid-template-columns'])
    const restoreInput = rememberInlineStyles(inputStack, ['--play-input-scale'])
    const puzzle = anchors?.puzzleCard.current
    const hint = anchors?.hint.current
    const widthPreviews = puzzle?.matches('[data-resize-preview-content]') ? [puzzle].flatMap(element => {
      const parent = element.parentElement
      if (!parent) return []
      const parentStyle = getComputedStyle(parent), elementStyle = getComputedStyle(element)
      const horizontalSpace = (style: CSSStyleDeclaration) =>
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const available = parseFloat(parentStyle.width) - (parentStyle.boxSizing === 'border-box' ? horizontalSpace(parentStyle) : 0)
      const actual = parseFloat(elementStyle.width) + (elementStyle.boxSizing === 'content-box' ? horizontalSpace(elementStyle) : 0)
      if (!(available > 0 && actual > 0)) return []
      return [{ element, hint, inset: Math.max(0, available - actual),
        restore: rememberInlineStyles(element, ['max-inline-size']),
        restoreHint: hint && rememberInlineStyles(hint, ['max-inline-size']),
      }]
    }) : []
    const clearBoards = puzzle ? previewDesktopBoards(puzzle) : () => {}
    // Both surfaces follow the live column with the same gutters.
    for (const { element, hint, inset } of widthPreviews) {
      element.style.maxInlineSize = `calc(100% - ${inset}px)`
      if (hint) hint.style.maxInlineSize = `calc(100% - 2 * var(--puzzle-badge-gutter-inline) - ${inset}px)`
    }
    workspace.setAttribute('data-layout-resizing', '')
    const update = (input: number) => {
      // Native track sizing does not change inherited variables on every cell.
      workspace.style.gridTemplateColumns = `minmax(0, 1fr) ${input}px`
      inputStack.style.setProperty('--play-input-scale', String(input / DEFAULT_DESKTOP_INPUT_WIDTH))
    }
    return {
      update,
      clear() {
        clearBoards()
        for (const { restore, restoreHint } of widthPreviews) {
          restore()
          restoreHint?.()
        }
        restoreWorkspace()
        restoreInput()
        workspace.removeAttribute('data-layout-resizing')
      },
    }
  }

  return <div className="workspace" ref={workspaceRef} style={style}>
    {children}
    {resizable && <PlayResizeHandle width={width} min={MIN_DESKTOP_INPUT_WIDTH} max={maxWidth}
      beginPreview={beginPreview} onSave={saveSplit}
      onReset={() => saveWidths(DEFAULT_PLAY_PREFERENCES.desktopPanelWidths)} handleRef={anchors?.divider} />}
  </div>
}
