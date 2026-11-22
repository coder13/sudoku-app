import { IconButton } from './Button'
import { Component, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Hand, X } from 'lucide-react'
import { MobileHintSwipe, type HintSwipeActions } from './MobileHintSwipe'
import { MobileInputResizeHandle } from './MobileInputResizeHandle'
import { animatePanelLayout, MotionSurface, motionDuration, usePresentContent } from './Presence'
import {
  MOBILE_PANEL_HOLD_MS, MOBILE_PANEL_ORDER_KEY, moveMobilePanel, readMobilePanelOrder,
  type MobilePanelId, type PanelDrop,
} from '../sudoku/mobile-panels'
import { MOBILE_PUZZLE_TOP_SPACES } from '../sudoku/preferences'

type Panel = { title: string; content: ReactNode }
type Props = {
  panels: Partial<Record<MobilePanelId, Panel>>
  rearranging: boolean
  onRearrangingChange: (active: boolean) => void
  blocked: boolean
  puzzleId: string
  withHint: boolean
  resizableInput?: boolean
  inputTabCount?: number
  savedInputHeight?: number
  onInputHeightChange?: (height: number | undefined) => void
  puzzleTopSpace?: number
  onPuzzleTopSpaceChange?: (space: number) => void
  hintSwipe?: HintSwipeActions
}
type Hold = { pointerId: number; x: number; y: number; timer: number }
type Drag = {
  id: MobilePanelId
  pointerId: number
  handle: HTMLButtonElement
  startX: number
  startY: number
  x: number
  y: number
  rect: DOMRect
  scrollTop: number
  maxScroll: number
  scroller: HTMLElement
  moved: boolean
  drop: PanelDrop | null
}
type DragView = { id: MobilePanelId; x: number; y: number; drop: PanelDrop | null }
const MOVE_THRESHOLD = 10
const REACH_PULL_DISTANCE = 120
const ONE_HAND_DRAG_DISTANCE = 160
const ONE_HAND_SIDE_KEY = 'sudoku-app:v1:one-hand-side'
type OneHandSide = 'left' | 'right'
type GridDirection = 'up' | 'right' | 'down' | 'left'

function readOneHandSide(): OneHandSide {
  try { return localStorage.getItem(ONE_HAND_SIDE_KEY) === 'left' ? 'left' : 'right' }
  catch { return 'right' }
}

function snapPuzzleTopSpace(value: number) {
  const maximum = MOBILE_PUZZLE_TOP_SPACES.at(-1) ?? 256
  const bounded = Math.max(0, Math.min(maximum, value))
  return MOBILE_PUZZLE_TOP_SPACES.reduce((closest, space) =>
    Math.abs(space - bounded) < Math.abs(closest - bounded) ? space : closest, MOBILE_PUZZLE_TOP_SPACES[0] ?? 0)
}

function clampPuzzleTopSpace(value: number) {
  const maximum = MOBILE_PUZZLE_TOP_SPACES.at(-1) ?? 256
  return Math.max(0, Math.min(maximum, Math.round(value)))
}

type MotionProps = {
  root: RefObject<HTMLDivElement | null>
  withHint: boolean
  tabCount: number
  rearranging: boolean
  children: ReactNode
}
type LayoutSnapshot = {
  duration: number
  cards: { element: HTMLElement; rect: DOMRect }[]
  hint?: { element: HTMLElement; left: number; top: number; width: number }
}

class MobilePanelMotion extends Component<MotionProps, Record<string, never>, LayoutSnapshot | null> {
  private animations: Animation[] = []

  // Measure the currently visible cards before React changes the grid or flex layout.
  getSnapshotBeforeUpdate(previous: MotionProps): LayoutSnapshot | null {
    const { root, withHint, tabCount, rearranging } = this.props
    const hintChanged = previous.withHint !== withHint
    const tabsChanged = previous.tabCount !== tabCount
    if ((!hintChanged && !tabsChanged) || previous.rearranging || rearranging || !root.current) return null
    const duration = motionDuration(tabsChanged ? 'panel' : 'standard')
    if (!duration) return null

    const cards = Array.from(root.current.querySelectorAll<HTMLElement>(
      '[data-mobile-panel="puzzle"] .puzzle, [data-mobile-panel="input"] > .mobile-panel-content',
    ), (element) => ({ element, rect: element.getBoundingClientRect() }))
    const hint = hintChanged && !withHint && root.current.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
    return { duration, cards, hint: hint ? {
      element: hint, left: hint.offsetLeft, top: hint.offsetTop, width: hint.getBoundingClientRect().width,
    } : undefined }
  }

  componentDidUpdate(previous: MotionProps, _state: unknown, snapshot?: LayoutSnapshot | null) {
    const { root, withHint, rearranging } = this.props
    if (snapshot || previous.rearranging !== rearranging) this.cancelAnimations()

    const hint = previous.withHint !== withHint && root.current?.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
    if (withHint && hint) {
      for (const property of ['--hint-exit-left', '--hint-exit-top', '--hint-exit-width', '--hint-exit-visibility']) {
        hint.style.removeProperty(property)
      }
    }
    if (!snapshot) return

    // Let the other cards move immediately while the outgoing hint fades in its old slot.
    if (snapshot.hint) {
      const { element, left, top, width } = snapshot.hint
      element.style.setProperty('--hint-exit-left', `${left}px`)
      element.style.setProperty('--hint-exit-top', `${top}px`)
      element.style.setProperty('--hint-exit-width', `${width}px`)
      element.style.setProperty('--hint-exit-visibility', 'visible')
    }

    for (const { element, rect } of snapshot.cards) {
      if (!element.isConnected) continue
      const animation = animatePanelLayout(element, rect, snapshot.duration)
      if (animation) this.animations.push(animation)
    }
  }

  private cancelAnimations() {
    this.animations.forEach((animation) => animation.cancel())
    this.animations = []
  }

  componentWillUnmount() { this.cancelAnimations() }

  render() { return this.props.children }
}

export function MobilePanelLayout(props: Props) {
  const [order, setOrder] = useState(readMobilePanelOrder)
  const [dragView, setDragView] = useState<DragView | null>(null)
  const [oneHanded, setOneHanded] = useState(false)
  const [oneHandSide, setOneHandSide] = useState<OneHandSide>(readOneHandSide)
  const [announcement, setAnnouncement] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const hold = useRef<Hold | null>(null)
  const drag = useRef<Drag | null>(null)
  const oneHandDrag = useRef<{ pointerId: number; startY: number; startSpace: number } | null>(null)
  const suppressOneHandClick = useRef(false)
  const scrollFrame = useRef<number | null>(null)
  const orderRef = useRef(order)
  const latest = useRef(props)
  latest.current = props
  const { content: hint, exiting: hintExiting } = usePresentContent(props.panels.hint)
  const panels = { ...props.panels, hint: hint || undefined }
  const visible = order.filter((id) => props.panels[id])

  useLayoutEffect(() => {
    const layout = root.current
    const page = layout?.closest<HTMLElement>('.standard-workspace-page')
    const workspace = layout?.parentElement
    const puzzle = layout?.querySelector<HTMLElement>('[data-mobile-panel="puzzle"]')
    const input = layout?.querySelector<HTMLElement>('[data-mobile-panel="input"]')
    const hintPanel = props.withHint ? layout?.querySelector<HTMLElement>('[data-mobile-panel="hint"]') : null
    const gap = layout?.querySelector<HTMLElement>('.mobile-panel-gap')
    if (!layout || !page || !workspace || !puzzle || !input || !gap) return

    const blockSize = (element: HTMLElement) => parseFloat(getComputedStyle(element).blockSize)
    const fitBoard = () => {
      // The resize preview owns the measured split until release. Avoid geometry
      // reads from this observer while the pointer updates its wrapper sizes.
      if (layout.hasAttribute('data-input-resizing')) return
      // The footer must remain as wide as the input card even after the grid shrinks.
      const inputWidth = input.getBoundingClientRect().width
      if (inputWidth) {
        const value = `${Math.round(inputWidth)}px`
        if (layout.style.getPropertyValue('--mobile-input-panel-width') !== value) {
          layout.style.setProperty('--mobile-input-panel-width', value)
        }
      }
      const fitHint = layout.hasAttribute('data-fit-hint')
      const sideBySide = fitHint && getComputedStyle(workspace).display === 'grid'
      if (layout.hasAttribute('data-input-sized') && !sideBySide) return
      const board = puzzle.querySelector<HTMLElement>('.puzzle-zoom, .puzzle-stage .board-frame')
      const puzzleColumn = board?.closest<HTMLElement>('.puzzle-column')
      if (!board || !puzzleColumn) return
      const pageStyle = getComputedStyle(page)
      const margins = [puzzle, input, hintPanel].reduce((sum, card) => (
        sum + (card ? parseFloat(getComputedStyle(card).marginBlockStart) : 0)
      ), 0)
      const available = parseFloat(pageStyle.blockSize) - parseFloat(pageStyle.paddingBlockStart) - parseFloat(pageStyle.paddingBlockEnd)
        - parseFloat(getComputedStyle(workspace).paddingBlockStart) - parseFloat(getComputedStyle(gap).flexBasis) - margins
      // With a hint open the keypad can scroll, so budget only its minimum usable height.
      const inputSpace = fitHint ? parseFloat(getComputedStyle(input).minBlockSize) : blockSize(input)
      const puzzleSpace = sideBySide ? blockSize(puzzle) : available - inputSpace - (hintPanel ? blockSize(hintPanel) : 0)
      const boardSpace = puzzleSpace - (blockSize(sideBySide ? puzzleColumn : puzzle) - blockSize(board))
      const limit = `${Math.floor(boardSpace)}px`
      if (layout.style.getPropertyValue('--mobile-fit-board-height') !== limit) {
        layout.style.setProperty('--mobile-fit-board-height', limit)
      }
    }

    fitBoard()
    const observer = new ResizeObserver(fitBoard)
    for (const element of [page, puzzle, puzzle.querySelector('.puzzle-column'), input, hintPanel]) {
      if (element) observer.observe(element)
    }
    return () => {
      observer.disconnect()
      layout.style.removeProperty('--mobile-input-panel-width')
    }
  }, [order, props.inputTabCount, props.rearranging, props.withHint])

  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }

  function saveMove(id: MobilePanelId, drop: PanelDrop) {
    const panel = latest.current.panels[id]
    if (!panel || !latest.current.panels[drop.id]) return
    const next = moveMobilePanel(orderRef.current, id, drop)
    if (next.every((panel, index) => panel === orderRef.current[index])) return
    orderRef.current = next
    setOrder(next)
    try {
      localStorage.setItem(MOBILE_PANEL_ORDER_KEY, JSON.stringify(next))
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
    const shown = next.filter((panel) => latest.current.panels[panel])
    setAnnouncement(`${panel.title} moved to position ${shown.indexOf(id) + 1} of ${shown.length}.`)
  }

  function finishDrag(commit: boolean) {
    const current = drag.current
    drag.current = null
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = null
    setDragView(null)
    if (!current) return
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId)
    if (commit && current.moved && current.drop) saveMove(current.id, current.drop)
  }

  function updateDrag() {
    const current = drag.current
    if (!current?.moved || !root.current) return
    let nearest: { id: MobilePanelId; rect: DOMRect; distance: number } | undefined
    for (const panel of root.current.querySelectorAll<HTMLElement>('[data-mobile-panel]:not([inert])')) {
      const id = panel.dataset.mobilePanel as MobilePanelId
      if (id === current.id) continue
      const rect = panel.getBoundingClientRect()
      const dx = Math.max(rect.left - current.x, 0, current.x - rect.right)
      const dy = Math.max(rect.top - current.y, 0, current.y - rect.bottom)
      const distance = dx * dx + dy * dy
      if (!nearest || distance < nearest.distance) nearest = { id, rect, distance }
    }
    if (nearest) {
      const differentColumn = Math.abs(nearest.rect.x - current.rect.x) > Math.min(nearest.rect.width, current.rect.width) / 2
      const before = differentColumn
        ? current.x < nearest.rect.x + nearest.rect.width / 2
        : current.y < nearest.rect.y + nearest.rect.height / 2
      current.drop = { id: nearest.id, edge: before ? 'before' : 'after' }
    }
    const next = {
      id: current.id, x: current.x - current.startX,
      y: current.y - current.startY + current.scroller.scrollTop - current.scrollTop,
      drop: current.drop,
    }
    setDragView((previous) => previous?.id === next.id && previous.x === next.x && previous.y === next.y &&
      previous.drop?.id === next.drop?.id && previous.drop?.edge === next.drop?.edge ? previous : next)
  }

  function scrollWhileDragging() {
    const current = drag.current
    if (!current) return
    if (current.moved) {
      const bounds = current.scroller.getBoundingClientRect()
      const top = Math.max(bounds.top, closeButton.current?.getBoundingClientRect().bottom ?? 0) + 36
      const bottom = Math.min(bounds.bottom, window.innerHeight) - 36
      const speed = current.y < top ? -Math.min(12, (top - current.y) / 4)
        : current.y > bottom ? Math.min(12, (current.y - bottom) / 4) : 0
      if (speed) current.scroller.scrollTop = Math.min(current.maxScroll, Math.max(0, current.scroller.scrollTop + speed))
      updateDrag()
    }
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function startHold(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) { cancelHold(); return }
    if (props.rearranging || props.blocked || event.button !== 0 ||
      !(event.target instanceof Element) || !event.target.closest('[data-mobile-panel]') ||
      event.target.closest('[data-no-panel-hold], dialog')) return
    cancelHold()
    hold.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      timer: window.setTimeout(() => {
        hold.current = null
        if (latest.current.blocked) return
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        latest.current.onRearrangingChange(true)
      }, MOBILE_PANEL_HOLD_MS),
    }
  }

  function startDrag(id: MobilePanelId, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const panel = event.currentTarget.closest<HTMLElement>('[data-mobile-panel]')
    const scroller = root.current?.closest<HTMLElement>('.page')
    if (!panel || !scroller) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      id, pointerId: event.pointerId, handle: event.currentTarget,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      rect: panel.getBoundingClientRect(), scrollTop: scroller.scrollTop,
      maxScroll: scroller.scrollHeight - scroller.clientHeight, scroller, moved: false, drop: null,
    }
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function exit() {
    finishDrag(false)
    latest.current.onRearrangingChange(false)
    requestAnimationFrame(() => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    })
  }

  function toggleOneHanded() {
    if (suppressOneHandClick.current) {
      suppressOneHandClick.current = false
      return
    }
    const next = !oneHanded
    setOneHanded(next)
    setAnnouncement(next ? `One-handed controls moved to the ${oneHandSide} side.` : 'One-handed mode closed.')
  }

  function startOneHandDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || props.blocked || props.rearranging) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const page = root.current?.closest<HTMLElement>('.standard-workspace-page')
    const inlineSpace = Number.parseFloat(page ? getComputedStyle(page).getPropertyValue('--puzzle-top-space') : '')
    const currentSpace = Number.isFinite(inlineSpace) ? inlineSpace : props.puzzleTopSpace ?? 0
    oneHandDrag.current = { pointerId: event.pointerId, startY: event.clientY, startSpace: currentSpace }
    event.currentTarget.dataset.pulling = 'true'
    event.currentTarget.style.setProperty('--one-hand-pull-progress', '0')
  }

  function applyPuzzleTopSpace(space: number) {
    const page = root.current?.closest<HTMLElement>('.standard-workspace-page')
    if (!page) return
    if (space > 0) {
      page.setAttribute('data-puzzle-top-space', '')
      page.style.setProperty('--puzzle-top-space', `${space}px`)
    } else {
      page.removeAttribute('data-puzzle-top-space')
      page.style.removeProperty('--puzzle-top-space')
    }
  }

  function updateOneHandDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = oneHandDrag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    const distance = Math.max(0, event.clientY - current.startY)
    const progress = Math.min(1, distance / ONE_HAND_DRAG_DISTANCE)
    const spaceDelta = Math.max(-REACH_PULL_DISTANCE, Math.min(REACH_PULL_DISTANCE, event.clientY - current.startY))
    applyPuzzleTopSpace(clampPuzzleTopSpace(current.startSpace + spaceDelta))
    event.currentTarget.style.setProperty('--one-hand-pull-progress', String(progress))
    if (distance >= REACH_PULL_DISTANCE) event.currentTarget.dataset.pullStage = 'one-handed'
    else if (Math.abs(event.clientY - current.startY) > MOVE_THRESHOLD) event.currentTarget.dataset.pullStage = 'space'
    else {
      delete event.currentTarget.dataset.pulling
      delete event.currentTarget.dataset.pullStage
    }
    if (Math.abs(event.clientY - current.startY) > MOVE_THRESHOLD) event.currentTarget.dataset.pulling = 'true'
  }

  function finishOneHandDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = oneHandDrag.current
    if (!current || current.pointerId !== event.pointerId) return
    const distance = event.clientY - current.startY
    oneHandDrag.current = null
    delete event.currentTarget.dataset.pulling
    delete event.currentTarget.dataset.pullStage
    event.currentTarget.style.removeProperty('--one-hand-pull-progress')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const spaceDelta = Math.max(-REACH_PULL_DISTANCE, Math.min(REACH_PULL_DISTANCE, distance))
    const nextSpace = snapPuzzleTopSpace(current.startSpace + spaceDelta)
    applyPuzzleTopSpace(nextSpace)
    if (nextSpace !== current.startSpace) latest.current.onPuzzleTopSpaceChange?.(nextSpace)
    if (distance >= ONE_HAND_DRAG_DISTANCE) {
      setOneHanded(true)
      setAnnouncement(`One-handed controls moved to the ${oneHandSide} side.`)
      suppressOneHandClick.current = true
      requestAnimationFrame(() => { suppressOneHandClick.current = false })
    } else if (Math.abs(distance) > MOVE_THRESHOLD) {
      suppressOneHandClick.current = true
      requestAnimationFrame(() => { suppressOneHandClick.current = false })
    }
  }

  function cancelOneHandDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = oneHandDrag.current
    if (current?.pointerId !== event.pointerId) return
    oneHandDrag.current = null
    delete event.currentTarget.dataset.pulling
    delete event.currentTarget.dataset.pullStage
    event.currentTarget.style.removeProperty('--one-hand-pull-progress')
    applyPuzzleTopSpace(current.startSpace)
  }

  function switchOneHandSide() {
    const next = oneHandSide === 'right' ? 'left' : 'right'
    setOneHandSide(next)
    setAnnouncement(`One-handed controls moved to the ${next} side.`)
    try { localStorage.setItem(ONE_HAND_SIDE_KEY, next) } catch { /* The side stays active for this session. */ }
  }

  function moveGridSelection(direction: GridDirection) {
    const grid = root.current?.querySelector<HTMLElement>('.sudoku-grid')
    const cells = [...(grid?.querySelectorAll<HTMLElement>('[data-cell][tabindex]') ?? [])]
      .filter((cell) => !cell.closest('[inert]'))
    const active = cells.find((cell) => cell.tabIndex === 0) ?? cells.find((cell) => cell.getAttribute('aria-selected') === 'true')
    if (!active) return
    const origin = active.getBoundingClientRect()
    const originX = origin.left + origin.width / 2
    const originY = origin.top + origin.height / 2
    const vector = {
      up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0],
    }[direction]
    let nearest: HTMLElement | undefined
    let nearestScore = Infinity
    for (const cell of cells) {
      if (cell === active) continue
      const rect = cell.getBoundingClientRect()
      const dx = rect.left + rect.width / 2 - originX
      const dy = rect.top + rect.height / 2 - originY
      const main = dx * vector[0] + dy * vector[1]
      const cross = Math.abs(dx * vector[1] - dy * vector[0])
      const score = main + cross * 3
      if (main > 0 && score < nearestScore) {
        nearest = cell
        nearestScore = score
      }
    }
    nearest?.click()
  }

  useEffect(() => {
    function pointerDown(event: PointerEvent) {
      if (hold.current && event.pointerId !== hold.current.pointerId) cancelHold()
      if (drag.current && event.pointerId !== drag.current.pointerId) finishDrag(false)
    }
    function pointerMove(event: PointerEvent) {
      if (hold.current?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > MOVE_THRESHOLD) cancelHold()
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      event.preventDefault()
      current.x = event.clientX
      current.y = event.clientY
      current.moved ||= Math.hypot(current.x - current.startX, current.y - current.startY) > MOVE_THRESHOLD
      updateDrag()
    }
    function pointerEnd(event: PointerEvent) {
      if (hold.current?.pointerId === event.pointerId) cancelHold()
      if (drag.current?.pointerId === event.pointerId) finishDrag(event.type === 'pointerup')
    }
    function cancel() { cancelHold(); finishDrag(false) }
    function keyDown(event: KeyboardEvent) {
      if (latest.current.rearranging && event.key === 'Escape') {
        event.preventDefault()
        exit()
      }
    }
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointermove', pointerMove, { passive: false })
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    window.addEventListener('scroll', cancelHold, true)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keyDown)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      cancel()
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      window.removeEventListener('scroll', cancelHold, true)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keyDown)
      document.removeEventListener('visibilitychange', cancel)
      latest.current.onRearrangingChange(false)
    }
  }, [])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
    if (props.rearranging) closeButton.current?.focus({ preventScroll: true })
  }, [props.rearranging])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
    latest.current.onRearrangingChange(false)
  }, [props.puzzleId, props.blocked])

  useEffect(() => {
    cancelHold()
    finishDrag(false)
  }, [visible.join(',')])

  const layout = <div ref={root} className={`mobile-panel-layout${props.withHint ? ' with-hint' : ''}`}
    data-fit-hint={props.withHint && props.resizableInput && !props.rearranging || undefined}
    data-rearranging={props.rearranging || undefined} data-one-handed={oneHanded || undefined} data-one-hand-side={oneHandSide}
    style={{ '--mobile-secondary-count': visible.length - 1 } as CSSProperties}
    onPointerDownCapture={startHold}
    onContextMenuCapture={(event) => { if (hold.current || props.rearranging) event.preventDefault() }}
    onClickCapture={(event) => {
      if (props.rearranging && !(event.target instanceof Element && event.target.closest('[data-panel-editor]'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }}>
    <MotionSurface>{props.rearranging && <div className="mobile-panel-toolbar surface" role="region" aria-label="Rearrange cards" data-panel-editor>
      <div><strong>Rearrange cards</strong><small id="mobile-panel-instructions">
        {saveFailed ? 'Order saved for this session only.' : 'Drag cards to move them. Changes save automatically.'}
      </small></div>
      <IconButton ref={closeButton} variant="quiet" aria-label="Finish rearranging cards" onClick={exit}>
        <X size={22} aria-hidden="true" />
      </IconButton>
    </div>}</MotionSurface>
    {order.filter((id) => panels[id]).map((id) => {
      const panel = panels[id]!
      const exiting = id === 'hint' && hintExiting
      const index = visible.indexOf(id)
      const moving = dragView?.id === id
      const drop = dragView?.drop?.id === id ? dragView.drop.edge : undefined
      const resizeEdge = id === 'input' && props.resizableInput && panels.puzzle
        ? order.indexOf('puzzle') < order.indexOf('input') ? 'top' : 'bottom'
        : undefined
      return <Fragment key={id}>
        <div className={`mobile-panel${id === 'hint' ? ' motion-surface' : ''}`} data-mobile-panel={id} data-first={index === 0 || undefined}
          data-after-gap={index > 1 || undefined}
          id={id === 'input' ? inputId : undefined} data-resize-edge={resizeEdge}
          data-presence={id === 'hint' ? exiting ? 'exit' : 'open' : undefined} inert={exiting || undefined} aria-hidden={exiting || undefined}
          data-dragging={moving || undefined} data-drop={drop} role="group" aria-label={`${panel.title} card`}
          style={{
            '--mobile-panel-row': index,
            ...(moving ? { transform: `translate(${dragView.x}px, ${dragView.y}px)` } : {}),
          } as CSSProperties}>
          {id === 'puzzle' && <div className="one-hand-entry" data-no-panel-hold>
            <button type="button" className="one-hand-pull-handle" disabled={props.blocked || props.rearranging}
              aria-label={oneHanded ? 'Exit one-handed mode' : 'Pull down to lower the puzzle. Pull farther to enter one-handed mode, or tap to enter.'}
              aria-pressed={oneHanded} title={oneHanded ? 'One-handed mode is on' : 'Drag down to add space above the puzzle. Pull farther for one-handed controls.'}
              onClick={toggleOneHanded} onPointerDown={startOneHandDrag} onPointerMove={updateOneHandDrag}
              onPointerUp={finishOneHandDrag} onPointerCancel={cancelOneHandDrag}
              onLostPointerCapture={cancelOneHandDrag}>
              <span className="one-hand-grip" aria-hidden="true"><ArrowDown size={14} /></span>
              <span>{oneHanded ? 'One-handed mode on' : 'Pull to lower puzzle · farther for one hand'}</span>
              <span className="one-hand-pull-track" aria-hidden="true"><span /></span>
            </button>
          </div>}
          {id === 'input' && oneHanded && <div className="one-hand-toolbar" data-no-panel-hold>
            <span className="one-hand-label"><Hand size={16} aria-hidden="true" /> {oneHandSide === 'right' ? 'Right hand' : 'Left hand'}</span>
            <button type="button" className="one-hand-switch" onClick={switchOneHandSide}
              aria-label={`Move one-handed controls to the ${oneHandSide === 'right' ? 'left' : 'right'} side`}>
              Switch side
            </button>
            <IconButton variant="quiet" aria-label="Exit one-handed mode" onClick={toggleOneHanded}><X size={18} aria-hidden="true" /></IconButton>
          </div>}
          <div className="mobile-panel-content" inert={props.rearranging} aria-hidden={props.rearranging || undefined}>
            {resizeEdge && <MobileInputResizeHandle inputId={inputId} edge={resizeEdge}
              disabled={props.blocked || props.rearranging} withHint={props.withHint}
              hasOpenTabs={Boolean(props.inputTabCount)} savedHeight={props.savedInputHeight}
              onHeightChange={props.onInputHeightChange} />}
            {id === 'hint' ? <MobileHintSwipe exiting={exiting}
              actions={exiting || props.rearranging || props.blocked ? undefined : props.hintSwipe}>
              {panel.content}
            </MobileHintSwipe> : panel.content}
          </div>
          {id === 'input' && oneHanded && root.current?.querySelector('.sudoku-grid') && <div className="one-hand-navigation" role="group" aria-label="Move selected cell">
            <IconButton variant="quiet" aria-label="Move selected cell left" onClick={() => moveGridSelection('left')}><ArrowLeft size={19} aria-hidden="true" /></IconButton>
            <IconButton variant="quiet" aria-label="Move selected cell up" onClick={() => moveGridSelection('up')}><ArrowUp size={19} aria-hidden="true" /></IconButton>
            <IconButton variant="quiet" aria-label="Move selected cell down" onClick={() => moveGridSelection('down')}><ArrowDown size={19} aria-hidden="true" /></IconButton>
            <IconButton variant="quiet" aria-label="Move selected cell right" onClick={() => moveGridSelection('right')}><ArrowRight size={19} aria-hidden="true" /></IconButton>
          </div>}
          {props.rearranging && <div className="mobile-panel-editor" data-panel-editor>
            <button type="button" className="mobile-panel-drag" aria-label={`Move ${panel.title.toLowerCase()} card`}
              aria-describedby="mobile-panel-instructions" onPointerDown={(event) => startDrag(id, event)}
              onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false) }}>
              <span><GripVertical size={18} aria-hidden="true" />{panel.title}</span>
            </button>
          </div>}
        </div>
        {index === 0 && visible.length > 1 && <div className="mobile-panel-gap" aria-hidden="true" />}
      </Fragment>
    })}
    <span className="sr-only" role="status">{announcement}</span>
  </div>

  return <MobilePanelMotion root={root} withHint={props.withHint} tabCount={props.inputTabCount ?? 0}
    rearranging={props.rearranging}>{layout}</MobilePanelMotion>
}
