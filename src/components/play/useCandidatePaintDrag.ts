import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { hasCandidate, paintCandidateStroke, type Game } from '../../sudoku/game'
import { cellsOnDragPath } from '../../sudoku/selection'

export type CandidatePaintMode = 'candidate' | 'center' | 'corner'

type CandidateStroke = {
  pointerId: number
  previous: number
  initial: Game
  cells: Set<number>
  mode: CandidatePaintMode
  digit: number
  action: 'add' | 'remove'
  temporary: boolean
  moved: boolean
  controlClick?: boolean
}

type BeginOptions = {
  cell: number
  pointerId: number
  game: Game
  mode: CandidatePaintMode
  digit: number
  temporary: boolean
}

type StrokeEdit = (transform: (current: Game) => Game) => void

type MoveOptions = {
  gridSize: number
  temporaryPencil: boolean
  clearPreview: () => void
  clearSelection: () => void
  setActive: (cell: number) => void
  setAnchor: (cell: number) => void
  capturePointer: (pointerId: number) => void
  edit: StrokeEdit
}

type ControlClickEvent = Pick<MouseEvent, 'ctrlKey' | 'shiftKey' | 'button' | 'preventDefault'>
type FinishStrokeEvent = Pick<PointerEvent, 'ctrlKey' | 'metaKey'>

/** Own candidate painting by drag, including its path and control-click fallback. */
export function useCandidatePaintDrag() {
  const stroke = useRef<CandidateStroke | null>(null)

  const begin = useCallback(({ cell, pointerId, game, mode, digit, temporary }: BeginOptions) => {
    const mask = mode === 'candidate'
      ? game.position.center[cell] | game.position.corner[cell]
      : game.position[mode][cell]
    stroke.current = {
      pointerId,
      previous: cell,
      initial: game,
      cells: new Set(),
      mode,
      digit,
      action: hasCandidate(mask, digit) ? 'remove' : 'add',
      temporary,
      moved: false,
    }
  }, [])

  const move = useCallback((cell: number, event: ReactPointerEvent, options: MoveOptions) => {
    const current = stroke.current
    if (!current) return false
    const pressed = event.pointerType === 'touch' || Boolean(event.buttons & 1)
    if (current.pointerId !== event.pointerId || !pressed || current.previous === cell || (current.temporary && !options.temporaryPencil)) return true

    event.preventDefault()
    if (!current.moved) {
      current.moved = true
      options.clearPreview()
      options.clearSelection()
      options.capturePointer(event.pointerId)
    }
    for (const pathCell of cellsOnDragPath(current.previous, cell, options.gridSize)) {
      if (current.initial.givens[pathCell] === '0' && current.initial.position.entries[pathCell] === '0') current.cells.add(pathCell)
    }
    current.previous = cell
    options.setActive(cell)
    options.setAnchor(cell)
    options.edit(game => paintCandidateStroke(game, current.initial, [...current.cells], current.mode, current.digit, current.action))
    return true
  }, [])

  const preventControlClickMenu = useCallback((event: ControlClickEvent, cellAtPointer: number | null, canPreview: boolean) => {
    const current = stroke.current
    if (!canPreview || !event.ctrlKey || event.shiftKey || event.button !== 0 || !current || current.previous !== cellAtPointer) return false
    event.preventDefault()
    current.controlClick = true
    return true
  }, [])

  const finishControlClick = useCallback((
    event: ReactPointerEvent,
    cellAtPointer: number | null,
    canPreview: boolean,
    temporaryPencil: boolean,
    onClickCell: (cell: number, event: ReactPointerEvent) => void,
  ) => {
    const current = stroke.current
    if (
      !current?.controlClick || current.pointerId !== event.pointerId || current.moved || !canPreview ||
      (current.temporary && !temporaryPencil) || current.previous !== cellAtPointer
    ) return false
    onClickCell(current.previous, event)
    return true
  }, [])

  const finish = useCallback((pointerId: number, event: FinishStrokeEvent) => {
    const current = stroke.current
    if (current?.pointerId !== pointerId) return null
    stroke.current = null
    return current.moved || (current.temporary && !event.ctrlKey && !event.metaKey)
  }, [])

  const clear = useCallback(() => {
    stroke.current = null
  }, [])

  const activePointerId = useCallback(() => stroke.current?.pointerId, [])

  return { begin, move, preventControlClickMenu, finishControlClick, finish, clear, activePointerId }
}
