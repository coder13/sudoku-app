import { useCallback, useEffect, useEffectEvent, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { Game } from '../../sudoku/game'
import { useCandidatePaintDrag, type CandidatePaintMode } from './useCandidatePaintDrag'
import { useCellSelectionDrag } from './useCellSelectionDrag'
import type { CandidatePress, PendingDoubleClickSingle } from './play-gesture-types'

type PointerBoard = MutableRefObject<HTMLDivElement | null>
type CellPaint = {
  begin: (cell: number, pointerId: number) => boolean
  move: (cell: number, event: ReactPointerEvent) => boolean
  finish: (pointerId: number, canceled: boolean) => boolean
  cancel: () => number | undefined
}
type TouchHold = {
  start: (event: ReactPointerEvent, action?: () => void) => void
  move: (event: ReactPointerEvent) => void
}

type Options = {
  boardRef: PointerBoard
  puzzle: { game: Game; readWorkingGame: () => Game | null | undefined; values: string; gridSize: number }
  selection: {
    selected: readonly number[]
    multi: boolean
    setActive: (cell: number) => void
    setAnchor: (cell: number) => void
    setSelected: (cells: number[]) => void
  }
  input: {
    brush: number | null
    pencilGroup: number
    pencilPreviewMask: number
    candidateMode: CandidatePaintMode
    selectedDigit: number | null
    temporaryPencil: boolean
  }
  capability: {
    mobile: boolean
    desktop: boolean
    canPreviewCandidates: boolean
    canSelectCellsByDrag: boolean
    canDragCandidates: boolean
  }
  controllers: { cellPaint: CellPaint; cellHold: TouchHold }
  actions: {
    edit: (transform: (current: Game) => Game) => void
    highlightCellCandidates: (mask: number) => void
    cellHighlightMask: (cell: number) => number
    cellAtPoint: (point: { clientX: number; clientY: number }) => number | null
    setPointerFocusedCell: (cell: number | null) => void
  }
}

/** Own Play's board pointer choreography while the host supplies current policy and puzzle actions. */
export function usePlayBoardGestures({ boardRef, puzzle, selection, input, capability, controllers, actions }: Options) {
  const { game, readWorkingGame, values, gridSize } = puzzle
  const { selected, multi, setActive, setAnchor, setSelected } = selection
  const { brush, pencilGroup, pencilPreviewMask, candidateMode, selectedDigit, temporaryPencil } = input
  const { mobile, desktop, canPreviewCandidates, canSelectCellsByDrag, canDragCandidates } = capability
  const { cellPaint, cellHold } = controllers
  const { edit, highlightCellCandidates, cellHighlightMask, cellAtPoint, setPointerFocusedCell } = actions

  const candidatePaint = useCandidatePaintDrag()
  const selectionDrag = useCellSelectionDrag()
  const candidatePress = useRef<CandidatePress | null>(null)
  const hoveredCell = useRef<number | null>(null)
  const suppressCellClick = useRef(false)
  const pendingDoubleClickSingle = useRef<PendingDoubleClickSingle | null>(null)
  const [candidatePreviewCell, setCandidatePreviewCell] = useState<number | null>(null)

  const finishPointer = useEffectEvent((event: PointerEvent) => {
    const press = candidatePress.current
    if (press?.pointerId === event.pointerId) {
      press.cancelled ||= event.type === 'pointercancel' || cellAtPoint(event) !== press.cell
      setCandidatePreviewCell(null)
    }
    let shouldSuppressClick = cellPaint.finish(event.pointerId, event.type === 'pointercancel')
    const selectionMoved = selectionDrag.finish(event.pointerId)
    if (selectionMoved !== null) shouldSuppressClick = selectionMoved
    const candidateSuppressClick = candidatePaint.finish(event.pointerId, event)
    if (candidateSuppressClick !== null) shouldSuppressClick ||= candidateSuppressClick
    if (!shouldSuppressClick) return
    suppressCellClick.current = true
    window.setTimeout(() => {
      suppressCellClick.current = false
    }, 100)
  })

  useEffect(() => {
    const finish = (event: PointerEvent) => finishPointer(event)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [])

  useEffect(() => {
    const press = candidatePress.current
    if (canPreviewCandidates && (!press || (press.mask === pencilPreviewMask && press.mode === candidateMode))) {
      if (temporaryPencil && !press) setCandidatePreviewCell(hoveredCell.current)
      return
    }
    if (press) press.cancelled = true
    setCandidatePreviewCell(null)
  }, [canPreviewCandidates, candidateMode, pencilPreviewMask, temporaryPencil])

  const resetClickState = useCallback(() => {
    selectionDrag.clear()
    candidatePress.current = null
    hoveredCell.current = null
    pendingDoubleClickSingle.current = null
    setCandidatePreviewCell(null)
    suppressCellClick.current = false
  }, [selectionDrag.clear])

  function reset() {
    const activePointerId = candidatePaint.activePointerId() ?? selectionDrag.pointerId()
    candidatePaint.clear()
    resetClickState()
    return activePointerId
  }

  function startCellDrag(index: number, event: ReactPointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    setPointerFocusedCell(index)
    suppressCellClick.current = false
    candidatePress.current = null
    if (desktop && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) return
    if (brush !== null) {
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) cellPaint.begin(index, event.pointerId)
      return
    }
    const maskToHighlight = mobile ? cellHighlightMask(index) : 0
    cellHold.start(event, maskToHighlight ? () => highlightCellCandidates(maskToHighlight) : undefined)
    if (canSelectCellsByDrag) {
      selectionDrag.start(index, event.pointerId, selected, multi || event.metaKey || event.ctrlKey)
      return
    }
    if (event.pointerType === 'touch' || pencilGroup) {
      if (canPreviewCandidates && values[index] === '0' && !event.shiftKey && (!pencilGroup || (!event.metaKey && !event.ctrlKey))) {
        candidatePress.current = {
          pointerId: event.pointerId,
          cell: index,
          mask: pencilPreviewMask,
          mode: candidateMode,
          cancelled: false,
        }
        setCandidatePreviewCell(index)
      }
      return
    }
    if (!canDragCandidates || values[index] !== '0' || selectedDigit === null) return
    candidatePaint.begin({
      cell: index,
      pointerId: event.pointerId,
      game: readWorkingGame() ?? game,
      mode: candidateMode,
      digit: selectedDigit,
      temporary: temporaryPencil,
    })
  }

  function continueCellDrag(index: number | null, event: ReactPointerEvent) {
    cellHold.move(event)
    const press = candidatePress.current
    if (press?.pointerId === event.pointerId && index !== press.cell) {
      press.cancelled = true
      setCandidatePreviewCell(null)
    }
    if (event.pointerType !== 'touch' && event.buttons === 0) {
      hoveredCell.current = event.shiftKey ? null : index
      setCandidatePreviewCell(canPreviewCandidates && !event.shiftKey ? index : null)
    }
    if (index === null) return
    if (cellPaint.move(index, event)) return
    if (candidatePaint.move(index, event, {
      gridSize,
      temporaryPencil,
      clearPreview: () => setCandidatePreviewCell(null),
      clearSelection: () => setSelected([]),
      setActive,
      setAnchor,
      capturePointer: pointerId => boardRef.current?.setPointerCapture(pointerId),
      edit,
    })) return
    selectionDrag.move(index, event, gridSize, { setActive, setAnchor, setSelected })
  }

  function preventControlClickMenu(event: ReactMouseEvent) {
    candidatePaint.preventControlClickMenu(event, cellAtPoint(event), canPreviewCandidates)
  }

  function finishControlClick(event: ReactPointerEvent, onClickCell: (cell: number, event: ReactPointerEvent) => void) {
    if (candidatePaint.finishControlClick(
      event,
      cellAtPoint(event),
      canPreviewCandidates,
      temporaryPencil,
      onClickCell,
    )) suppressCellClick.current = true
  }

  function onGridPointerLeave() {
    hoveredCell.current = null
    setCandidatePreviewCell(null)
  }

  return {
    candidatePress,
    suppressCellClick,
    pendingDoubleClickSingle,
    candidatePreviewCell,
    hoveredCell,
    setCandidatePreviewCell,
    startCellDrag,
    continueCellDrag,
    preventControlClickMenu,
    finishControlClick,
    onGridPointerLeave,
    clearSelectionDrag: selectionDrag.clear,
    clearCandidatePaintDrag: candidatePaint.clear,
    candidatePaintPointerId: candidatePaint.activePointerId,
    selectionPointerId: selectionDrag.pointerId,
    resetClickState,
    reset,
  }
}
