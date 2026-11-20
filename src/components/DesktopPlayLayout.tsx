import { type CSSProperties, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import {
  DEFAULT_DESKTOP_INPUT_WIDTH, DEFAULT_DESKTOP_LAYOUT_WIDTH, DEFAULT_PLAY_PREFERENCES,
  MIN_DESKTOP_INPUT_WIDTH, MIN_DESKTOP_LAYOUT_WIDTH, MIN_DESKTOP_PUZZLE_WIDTH,
} from '../sudoku/play-preferences'
import { usePlayPreference } from './usePlayPreference'

const HANDLE_CARD_GAP = 6
const KEYBOARD_STEP = 24

type WidthDrag = { pointerId: number; startX: number; startWidth: number; multiplier: number }

function clampWidth(width: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(width)))
}

function PlayResizeHandle({ edge, width, min, max, onPreview, onSave, onReset }: {
  edge?: 'left' | 'right'
  width: number
  min: number
  max: number
  onPreview: (width: number | null) => void
  onSave: (width: number) => void
  onReset: () => void
}) {
  const drag = useRef<WidthDrag | null>(null)
  const direction = edge === 'right' ? 1 : -1

  function widthAtPointer(current: WidthDrag, x: number) {
    return clampWidth(current.startWidth + current.multiplier * (x - current.startX), min, max)
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const style = getComputedStyle(event.currentTarget)
    const scale = Number(style.getPropertyValue('--desktop-layout-scale')) || 1
    const contentWidth = parseFloat(style.getPropertyValue('--desktop-layout-content-width')) || DEFAULT_DESKTOP_LAYOUT_WIDTH
    // Outer edges move in pairs. The divider moves within the scaled Play area.
    const multiplier = edge ? 2 * direction * DEFAULT_DESKTOP_LAYOUT_WIDTH / contentWidth : direction / scale
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, multiplier }
    onPreview(width)
  }

  function previewWidth(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId === event.pointerId) onPreview(widthAtPointer(current, event.clientX))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    onPreview(null)
    if (commit) {
      const nextWidth = widthAtPointer(current, event.clientX)
      if (nextWidth !== current.startWidth) onSave(nextWidth)
    }
  }

  return <div className={edge ? 'desktop-layout-edge' : 'desktop-layout-divider'} data-edge={edge}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={edge ? `Resize play layout from the ${edge}` : 'Resize puzzle and digit input panels'}
    aria-controls={edge ? 'sudoku-workspace' : 'standard-digit-input'}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} aria-valuetext={`${width} pixels`}
    onPointerDown={startDrag} onPointerMove={previewWidth} onPointerUp={(event) => finishDrag(event, true)}
    onPointerCancel={(event) => finishDrag(event, false)} onLostPointerCapture={(event) => finishDrag(event, false)}
    onContextMenu={(event) => {
      event.preventDefault()
      drag.current = null
      onPreview(null)
      onReset()
    }}
    onKeyDown={(event) => {
      if (event.key === 'Home') {
        event.preventDefault()
        onReset()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const step = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP
        const nextWidth = clampWidth(width + direction * step, min, max)
        if (nextWidth !== width) onSave(nextWidth)
      }
    }} />
}

export function DesktopPlayLayout({ enabled, className, children }: { enabled: boolean; className: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const resizeBounds = useRef<HTMLDivElement>(null)
  const [savedWidth, saveWidth] = usePlayPreference('desktopLayoutWidth')
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_DESKTOP_LAYOUT_WIDTH)
  const [contentWidth, setContentWidth] = useState(DEFAULT_DESKTOP_LAYOUT_WIDTH)
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setDraggedWidth(null)
      return
    }
    const page = root.current?.querySelector<HTMLElement>('.standard-workspace-page')
    const bounds = resizeBounds.current
    if (!bounds) return
    const measure = () => {
      setAvailableWidth(bounds.getBoundingClientRect().width)
      if (page?.offsetWidth) setContentWidth(page.offsetWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bounds, { box: 'border-box' })
    if (page) observer.observe(page, { box: 'border-box' })
    return () => observer.disconnect()
  }, [enabled])

  const maxScale = availableWidth / contentWidth
  const maxWidth = Math.max(MIN_DESKTOP_LAYOUT_WIDTH, Math.floor(maxScale * DEFAULT_DESKTOP_LAYOUT_WIDTH))
  const width = clampWidth(draggedWidth ?? savedWidth, MIN_DESKTOP_LAYOUT_WIDTH, maxWidth)
  const layoutStyle = enabled ? {
    '--desktop-layout-base-width': `${DEFAULT_DESKTOP_LAYOUT_WIDTH}px`,
    '--desktop-layout-content-width': `${contentWidth}px`,
    '--desktop-layout-scale': width === maxWidth ? maxScale : width / DEFAULT_DESKTOP_LAYOUT_WIDTH,
  } as CSSProperties : undefined

  return <div ref={root} className={`${className}${enabled ? ' desktop-play-resizable' : ''}`} style={layoutStyle}
    data-layout-resizing={enabled && draggedWidth !== null ? '' : undefined}>
    {children}
    {enabled && <div ref={resizeBounds} className="desktop-layout-edges">
      {(['left', 'right'] as const).map((edge) => <PlayResizeHandle key={edge} edge={edge} width={width}
        min={MIN_DESKTOP_LAYOUT_WIDTH} max={maxWidth} onPreview={setDraggedWidth} onSave={saveWidth}
        onReset={() => saveWidth(DEFAULT_DESKTOP_LAYOUT_WIDTH)} />)}
    </div>}
  </div>
}

export function PlayWorkspace({ resizable, children }: { resizable: boolean; children: ReactNode }) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [savedWidths, saveWidths] = usePlayPreference('desktopPanelWidths')
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null)
  const [maxWidth, setMaxWidth] = useState(DEFAULT_DESKTOP_INPUT_WIDTH)

  useLayoutEffect(() => {
    const workspace = workspaceRef.current
    if (!resizable || !workspace) {
      setDraggedWidth(null)
      return
    }
    const gap = parseFloat(getComputedStyle(workspace).columnGap)
    const puzzle = workspace.querySelector('.standard-puzzle-stack .puzzle')
    const inputStack = workspace.querySelector('.standard-input-stack')
    const input = inputStack?.querySelector('.controls')
    const page = workspace.closest<HTMLElement>('.standard-workspace-page')
    const layout = page?.closest<HTMLElement>('.desktop-play-resizable')
    const measure = () => {
      setMaxWidth(Math.max(MIN_DESKTOP_INPUT_WIDTH, workspace.clientWidth - gap - MIN_DESKTOP_PUZZLE_WIDTH))
      if (puzzle && input && inputStack) {
        const scale = Number(getComputedStyle(workspace).getPropertyValue('--desktop-layout-scale')) || 1
        const puzzleBounds = puzzle.getBoundingClientRect()
        const inputBounds = input.getBoundingClientRect()
        const offset = (inputBounds.left - inputStack.getBoundingClientRect().left) / scale - HANDLE_CARD_GAP
        workspace.style.setProperty('--play-divider-offset', `${offset}px`)
        if (layout && page) {
          const pageBounds = page.getBoundingClientRect()
          layout.style.setProperty('--play-left-edge-offset', `${(puzzleBounds.left - pageBounds.left) / scale - HANDLE_CARD_GAP}px`)
          layout.style.setProperty('--play-right-edge-offset', `${(pageBounds.right - inputBounds.right) / scale - HANDLE_CARD_GAP}px`)
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
      layout?.style.removeProperty('--play-left-edge-offset')
      layout?.style.removeProperty('--play-right-edge-offset')
    }
  }, [resizable])

  const width = clampWidth(draggedWidth ?? savedWidths.input, MIN_DESKTOP_INPUT_WIDTH, maxWidth)
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

  return <div className="workspace" ref={workspaceRef} style={style}
    data-layout-resizing={resizable && draggedWidth !== null ? '' : undefined}>
    {children}
    {resizable && <PlayResizeHandle width={width} min={MIN_DESKTOP_INPUT_WIDTH} max={maxWidth}
      onPreview={setDraggedWidth} onSave={saveSplit}
      onReset={() => saveWidths(DEFAULT_PLAY_PREFERENCES.desktopPanelWidths)} />}
  </div>
}
