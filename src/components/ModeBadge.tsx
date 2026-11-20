import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { Delete, Highlighter, Link2, Pen, Pencil } from 'lucide-react'
import { MODE_BADGE_EDGES, type ModeBadgePosition } from '../sudoku/play-preferences'

const MODES = {
  pen: { label: 'Pen', Icon: Pen },
  pencil: { label: 'Pencil', Icon: Pencil },
  highlight: { label: 'Highlight', Icon: Highlighter },
  erase: { label: 'Erase', Icon: Delete },
  chain: { label: 'Chain drawing', Icon: Link2 },
} as const

type BadgeDrag = {
  id: number
  startX: number
  startY: number
  grabX: number
  grabY: number
  length: number
  initialEdge: ModeBadgePosition['edge']
  lastPosition?: ModeBadgePosition
}

export function ModeBadge({ mode, descriptionId, cardRef, position, onPosition, onActivate, boundaryLabel = 'puzzle card' }: {
  mode: keyof typeof MODES
  descriptionId: string
  cardRef: RefObject<HTMLElement | null>
  position: ModeBadgePosition
  onPosition: (position: ModeBadgePosition) => void
  onActivate: () => void
  boundaryLabel?: string
}) {
  const { label, Icon } = MODES[mode]
  const drag = useRef<BadgeDrag | null>(null)
  const suppressClick = useRef(false)
  const [dragPosition, setDragPosition] = useState<ModeBadgePosition | null>(null)
  const displayedPosition = dragPosition ?? position

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    const badge = event.currentTarget.getBoundingClientRect()
    suppressClick.current = false
    drag.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      grabX: event.clientX - badge.x - badge.width / 2,
      grabY: event.clientY - badge.y - badge.height / 2,
      length: Math.max(badge.width, badge.height),
      initialEdge: position.edge,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    function positionAtPointer(event: PointerEvent, pointer: BadgeDrag) {
      if (!suppressClick.current && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return
      suppressClick.current = true
      const card = cardRef.current?.getBoundingClientRect()
      if (!card?.width || !card.height) return
      const x = event.clientX - pointer.grabX
      const y = event.clientY - pointer.grabY
      const xOutside = Math.max(card.left - x, 0, x - card.right)
      const yOutside = Math.max(card.top - y, 0, y - card.bottom)
      const distance = {
        top: Math.hypot(xOutside, y - card.top),
        right: Math.hypot(x - card.right, yOutside),
        bottom: Math.hypot(xOutside, y - card.bottom),
        left: Math.hypot(x - card.left, yOutside),
      }
      // Keep the current edge when two edges meet at the same nearest corner.
      const edge = MODE_BADGE_EDGES.reduce((nearest, edge) => distance[edge] < distance[nearest] ? edge : nearest,
        pointer.lastPosition?.edge ?? pointer.initialEdge)
      const horizontal = edge === 'top' || edge === 'bottom'
      const along = horizontal ? x - card.left : y - card.top
      const length = horizontal ? card.width : card.height
      const offset = Math.max(0, Math.min(1, (along - pointer.length / 2) / length))
      return { edge, offset }
    }

    function finishDrag(position?: ModeBadgePosition) {
      drag.current = null
      if (position) onPosition(position)
      setDragPosition(null)
    }

    function finishInterruptedDrag() {
      const pointer = drag.current
      if (!pointer) return
      suppressClick.current = true
      finishDrag(pointer.lastPosition)
    }

    function moveDrag(event: PointerEvent) {
      const pointer = drag.current
      if (!pointer || pointer.id !== event.pointerId) return
      if (event.pointerType !== 'touch' && !(event.buttons & 1)) {
        finishInterruptedDrag()
        return
      }
      const next = positionAtPointer(event, pointer)
      if (!next) return
      pointer.lastPosition = next
      setDragPosition(next)
    }

    function endDrag(event: PointerEvent) {
      const pointer = drag.current
      if (!pointer || pointer.id !== event.pointerId) return
      if (event.type === 'pointercancel') finishInterruptedDrag()
      else finishDrag(positionAtPointer(event, pointer) ?? pointer.lastPosition)
    }

    // Continue tracking the pointer even if the browser releases the badge's capture.
    window.addEventListener('pointermove', moveDrag, true)
    window.addEventListener('pointerup', endDrag, true)
    window.addEventListener('pointercancel', endDrag, true)
    window.addEventListener('blur', finishInterruptedDrag)
    return () => {
      window.removeEventListener('pointermove', moveDrag, true)
      window.removeEventListener('pointerup', endDrag, true)
      window.removeEventListener('pointercancel', endDrag, true)
      window.removeEventListener('blur', finishInterruptedDrag)
    }
  }, [cardRef, onPosition])

  function clickBadge(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 0 && suppressClick.current) return
    onActivate()
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    const index = MODE_BADGE_EDGES.indexOf(position.edge)
    const clockwiseOffset = index < 2 ? position.offset : 1 - position.offset
    const next = (index + clockwiseOffset + step + MODE_BADGE_EDGES.length) % MODE_BADGE_EDGES.length
    const nextIndex = Math.floor(next)
    const offset = next - nextIndex
    onPosition({ edge: MODE_BADGE_EDGES[nextIndex], offset: nextIndex < 2 ? offset : 1 - offset })
  }

  return <>
    <button type="button" className="puzzle-mode-tab" data-edge={displayedPosition.edge} data-no-panel-hold
      aria-label={mode === 'chain' ? 'Stop drawing links' : 'Cycle input mode'}
      aria-description={`Drag or use the left and right arrow keys to move the icon around the ${boundaryLabel}.`}
      style={{ '--mode-offset': `${displayedPosition.offset * 100}%` } as CSSProperties}
      onPointerDown={startDrag} onDragStart={(event) => event.preventDefault()}
      onClick={clickBadge} onKeyDown={moveWithKeyboard}>
      <Icon size={15} aria-hidden="true" />
    </button>
    <span className="sr-only" id={descriptionId} role="status">{label} mode</span>
  </>
}
