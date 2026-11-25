import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cellsOnDragPath } from '../../sudoku/selection'
import type { CellPaintStroke } from './usePlayInputModel'

type ActiveStroke = Omit<CellPaintStroke, 'cells'> & { cells: Set<number>; pointerId: number; previous: number; moved: boolean }
type PointerMove = Pick<ReactPointerEvent, 'pointerId' | 'pointerType' | 'buttons' | 'preventDefault'>

type Options = {
  gameId: string
  brush: number | null
  gridSize: number
  onPaint: (stroke: CellPaintStroke) => void
  onStrokeStart: (pointerId: number) => void
  onStrokeCell: (cell: number) => void
  capturePointer: (pointerId: number) => void
}

/** Owns the transient pointer stroke used to paint a run of cells. */
export function useCellPaintStroke({ gameId, brush, gridSize, onPaint, onStrokeStart, onStrokeCell, capturePointer }: Options) {
  const active = useRef<ActiveStroke | null>(null)
  const [preview, setPreview] = useState<CellPaintStroke | null>(null)
  const commit = useEffectEvent((stroke: ActiveStroke, canceled: boolean) => {
    setPreview(null)
    if (canceled || !stroke.moved || stroke.gameId !== gameId || stroke.brush !== brush) return
    onPaint({ ...stroke, cells: new Set(stroke.cells) })
  })

  useEffect(() => {
    active.current = null
    setPreview(null)
  }, [gameId])

  function begin(cell: number, pointerId: number) {
    if (brush === null) return false
    active.current = { gameId, pointerId, previous: cell, cells: new Set([cell]), brush, color: brush, moved: false }
    return true
  }

  function move(cell: number, event: PointerMove) {
    const stroke = active.current
    if (!stroke) return false
    const pressed = event.pointerType === 'touch' || Boolean(event.buttons & 1)
    if (stroke.pointerId !== event.pointerId || !pressed || stroke.previous === cell || stroke.brush !== brush) return true

    event.preventDefault()
    if (!stroke.moved) {
      stroke.moved = true
      onStrokeStart(event.pointerId)
      capturePointer(event.pointerId)
    }
    stroke.cells = new Set([...stroke.cells, ...cellsOnDragPath(stroke.previous, cell, gridSize)])
    stroke.previous = cell
    onStrokeCell(cell)
    setPreview({ gameId: stroke.gameId, brush: stroke.brush, color: stroke.color, cells: stroke.cells })
    return true
  }

  function finish(pointerId: number, canceled: boolean) {
    const stroke = active.current
    if (!stroke || stroke.pointerId !== pointerId) return false
    active.current = null
    commit(stroke, canceled)
    return stroke.moved
  }

  function cancel() {
    const pointerId = active.current?.pointerId
    active.current = null
    setPreview(null)
    return pointerId
  }

  return { preview, begin, move, finish, cancel }
}
