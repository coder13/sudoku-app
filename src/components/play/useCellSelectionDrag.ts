import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { extendCellSelectionPath } from '../../sudoku/selection'

type SelectionDrag = {
  pointerId: number
  start: number
  previous: number
  cells: Set<number>
  base: number[]
  additive: boolean
  moved: boolean
}

type SelectionActions = {
  setActive: (cell: number) => void
  setAnchor: (cell: number) => void
  setSelected: (cells: number[]) => void
}

/** Own the pointer gesture that extends a cell selection across the grid. */
export function useCellSelectionDrag() {
  const drag = useRef<SelectionDrag | null>(null)

  const start = useCallback((cell: number, pointerId: number, selected: readonly number[], additive: boolean) => {
    drag.current = {
      pointerId,
      start: cell,
      previous: cell,
      cells: new Set([cell]),
      base: [...selected],
      additive,
      moved: false,
    }
  }, [])

  const move = useCallback((cell: number, event: ReactPointerEvent, gridSize: number, actions: SelectionActions) => {
    const current = drag.current
    const pressed = event.pointerType === 'touch' || Boolean(event.buttons & 1)
    if (!current || current.pointerId !== event.pointerId || !pressed || cell === current.previous) return false

    event.preventDefault()
    current.moved = true
    current.cells = extendCellSelectionPath(current.cells, current.previous, cell, gridSize)
    current.previous = cell
    actions.setActive(cell)
    actions.setAnchor(current.start)
    actions.setSelected(current.additive ? [...new Set([...current.base, ...current.cells])] : [...current.cells])
    return true
  }, [])

  const finish = useCallback((pointerId: number) => {
    const current = drag.current
    if (current?.pointerId !== pointerId) return null
    drag.current = null
    return current.moved
  }, [])

  const clear = useCallback(() => {
    drag.current = null
  }, [])

  const pointerId = useCallback(() => drag.current?.pointerId, [])

  return { start, move, finish, clear, pointerId }
}
