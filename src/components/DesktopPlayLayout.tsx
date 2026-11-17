import { type CSSProperties, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_DESKTOP_LAYOUT_WIDTH, MIN_DESKTOP_LAYOUT_WIDTH } from '../sudoku/play-preferences'
import { usePlayPreference } from './usePlayPreference'

const EDGE_GUTTER = 12
const KEYBOARD_STEP = 24

type WidthDrag = { pointerId: number; startX: number; startWidth: number; direction: -1 | 1 }

export function DesktopPlayLayout({ enabled, className, children }: { enabled: boolean; className: string; children: ReactNode }) {
  const [savedWidth, saveWidth] = usePlayPreference('desktopLayoutWidth')
  const [viewportWidth, setViewportWidth] = useState(DEFAULT_DESKTOP_LAYOUT_WIDTH + 2 * EDGE_GUTTER)
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null)
  const drag = useRef<WidthDrag | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      drag.current = null
      setDraggedWidth(null)
      return
    }
    function measureViewport() { setViewportWidth(window.innerWidth) }
    measureViewport()
    window.addEventListener('resize', measureViewport)
    return () => window.removeEventListener('resize', measureViewport)
  }, [enabled])

  const maxWidth = Math.max(MIN_DESKTOP_LAYOUT_WIDTH, viewportWidth - 2 * EDGE_GUTTER)
  const clampWidth = (width: number) => Math.min(maxWidth, Math.max(MIN_DESKTOP_LAYOUT_WIDTH, Math.round(width)))
  const width = clampWidth(draggedWidth ?? savedWidth)

  function widthAtPointer(current: WidthDrag, x: number) {
    // The opposite edge moves by the same distance to keep the page centered.
    return clampWidth(current.startWidth + 2 * current.direction * (x - current.startX))
  }

  function previewWidth(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId === event.pointerId) setDraggedWidth(widthAtPointer(current, event.clientX))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setDraggedWidth(null)
    if (commit) {
      const nextWidth = widthAtPointer(current, event.clientX)
      if (nextWidth !== current.startWidth) saveWidth(nextWidth)
    }
  }

  const layoutStyle = enabled ? {
    '--desktop-layout-base-width': `${DEFAULT_DESKTOP_LAYOUT_WIDTH}px`,
    '--desktop-layout-width': `${width}px`,
    '--desktop-layout-scale': width / DEFAULT_DESKTOP_LAYOUT_WIDTH,
  } as CSSProperties : undefined

  return <div className={`${className}${enabled ? ' desktop-play-resizable' : ''}`} style={layoutStyle}
    data-layout-resizing={enabled && draggedWidth !== null ? '' : undefined}>
    {children}
    {enabled && <div className="desktop-layout-edges">
      {(['left', 'right'] as const).map((edge) => {
        const direction = edge === 'left' ? -1 : 1
        return <div key={edge} className="desktop-layout-edge" data-edge={edge}
          role="separator" tabIndex={0} aria-label={`Resize play layout from the ${edge}`} aria-orientation="vertical"
          aria-controls="sudoku-workspace" aria-valuemin={MIN_DESKTOP_LAYOUT_WIDTH} aria-valuemax={maxWidth}
          aria-valuenow={width} aria-valuetext={`${width} pixels`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || drag.current) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, direction }
            setDraggedWidth(width)
          }}
          onPointerMove={previewWidth} onPointerUp={(event) => finishDrag(event, true)}
          onPointerCancel={(event) => finishDrag(event, false)} onLostPointerCapture={(event) => finishDrag(event, false)}
          onContextMenu={(event) => {
            event.preventDefault()
            drag.current = null
            setDraggedWidth(null)
            saveWidth(DEFAULT_DESKTOP_LAYOUT_WIDTH)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Home') {
              event.preventDefault()
              saveWidth(DEFAULT_DESKTOP_LAYOUT_WIDTH)
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              const step = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP
              const nextWidth = clampWidth(width + direction * step)
              if (nextWidth !== width) saveWidth(nextWidth)
            }
          }} />
      })}
    </div>}
  </div>
}
