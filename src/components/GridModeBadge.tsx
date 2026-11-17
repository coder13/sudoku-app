import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { Delete, Highlighter, Palette, Pen, Pencil } from 'lucide-react'

const MODES = {
  pen: { label: 'Pen', Icon: Pen },
  pencil: { label: 'Pencil', Icon: Pencil },
  highlight: { label: 'Highlight', Icon: Highlighter },
  color: { label: 'Color', Icon: Palette },
  erase: { label: 'Erase', Icon: Delete },
} as const

const EDGES = ['top', 'right', 'bottom', 'left'] as const

export type GridModeBadgePosition = { edge: typeof EDGES[number]; offset: number }
export const DEFAULT_GRID_MODE_BADGE_POSITION: GridModeBadgePosition = { edge: 'bottom', offset: 0.05 }

export function GridModeBadge({ mode, descriptionId, gridRef, position, onPosition, onCycleMode }: {
  mode: keyof typeof MODES
  descriptionId: string
  gridRef: RefObject<HTMLDivElement | null>
  position: GridModeBadgePosition
  onPosition: (position: GridModeBadgePosition) => void
  onCycleMode: () => void
}) {
  const { label, Icon } = MODES[mode]
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const suppressClick = useRef(false)

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    const badge = event.currentTarget.getBoundingClientRect()
    suppressClick.current = false
    drag.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX - badge.x - badge.width / 2, y: event.clientY - badge.y - badge.height / 2,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const pointer = drag.current
    if (!pointer || pointer.id !== event.pointerId) return
    if (!suppressClick.current && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return
    suppressClick.current = true
    const grid = gridRef.current?.getBoundingClientRect()
    if (!grid?.width || !grid.height) return
    const x = event.clientX - pointer.x
    const y = event.clientY - pointer.y
    const xOutside = Math.max(grid.left - x, 0, x - grid.right)
    const yOutside = Math.max(grid.top - y, 0, y - grid.bottom)
    const distance = {
      top: Math.hypot(xOutside, y - grid.top),
      right: Math.hypot(x - grid.right, yOutside),
      bottom: Math.hypot(xOutside, y - grid.bottom),
      left: Math.hypot(x - grid.left, yOutside),
    }
    // Keep the current edge when two edges meet at the same nearest corner.
    const edge = EDGES.reduce((nearest, edge) => distance[edge] < distance[nearest] ? edge : nearest, position.edge)
    const horizontal = edge === 'top' || edge === 'bottom'
    const badge = event.currentTarget.getBoundingClientRect()
    const along = horizontal ? x - grid.left : y - grid.top
    const length = horizontal ? grid.width : grid.height
    const offset = Math.max(0, Math.min(1, (along - Math.max(badge.width, badge.height) / 2) / length))
    onPosition({ edge, offset })
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return
    if (event.type === 'pointerup') moveDrag(event)
    if (event.type === 'pointercancel') suppressClick.current = true
    drag.current = null
  }

  function clickBadge(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 0 && suppressClick.current) return
    onCycleMode()
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    const index = EDGES.indexOf(position.edge)
    const clockwiseOffset = index < 2 ? position.offset : 1 - position.offset
    const next = (index + clockwiseOffset + step + EDGES.length) % EDGES.length
    const nextIndex = Math.floor(next)
    const offset = next - nextIndex
    onPosition({ edge: EDGES[nextIndex], offset: nextIndex < 2 ? offset : 1 - offset })
  }

  return <>
    <button type="button" className="board-mode-tab" data-edge={position.edge} data-no-panel-hold
      aria-label="Cycle input mode" aria-description="Drag or use the left and right arrow keys to move the icon around the grid."
      style={{ '--mode-offset': `${position.offset * 100}%` } as CSSProperties}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={endDrag} onLostPointerCapture={endDrag} onClick={clickBadge} onKeyDown={moveWithKeyboard}>
      <Icon size={15} aria-hidden="true" />
    </button>
    <span className="sr-only" id={descriptionId} role="status">{label} mode</span>
  </>
}
