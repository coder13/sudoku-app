import { IconButton } from './Button'
import { Component, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { MobileHintSwipe, type HintSwipeActions } from './MobileHintSwipe'
import { MobileInputResizeHandle } from './MobileInputResizeHandle'
import { MotionSurface, motionDuration, usePresentContent } from './Presence'
import {
  MOBILE_PANEL_HOLD_MS, MOBILE_PANEL_ORDER_KEY, moveMobilePanel, readMobilePanelOrder,
  type MobilePanelId, type PanelDrop,
} from '../sudoku/mobile-panels'

type Panel = { title: string; content: ReactNode }
type Props = {
  panels: Partial<Record<MobilePanelId, Panel>>
  rearranging: boolean
  onRearrangingChange: (active: boolean) => void
  blocked: boolean
  puzzleId: string
  withHint: boolean
  resizableInput?: boolean
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

type MotionProps = {
  root: RefObject<HTMLDivElement | null>
  withHint: boolean
  rearranging: boolean
  children: ReactNode
}
type LayoutSnapshot = {
  duration: number
  cards: { element: HTMLElement; rect: DOMRect }[]
  hint?: { element: HTMLElement; left: number; top: number; width: number }
}

class MobileHintMotion extends Component<MotionProps, Record<string, never>, LayoutSnapshot | null> {
  private animations: Animation[] = []

  // Measure the currently visible cards before React changes the grid or flex layout.
  getSnapshotBeforeUpdate(previous: MotionProps): LayoutSnapshot | null {
    const { root, withHint, rearranging } = this.props
    if (previous.withHint === withHint || previous.rearranging || rearranging || !root.current) return null
    const duration = motionDuration('standard')
    if (!duration) return null

    const cards = Array.from(root.current.querySelectorAll<HTMLElement>(
      '[data-mobile-panel="puzzle"] .puzzle, [data-mobile-panel="input"] > .mobile-panel-content',
    ), (element) => ({ element, rect: element.getBoundingClientRect() }))
    const hint = root.current.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
    return { duration, cards, hint: !withHint && hint ? {
      element: hint, left: hint.offsetLeft, top: hint.offsetTop, width: hint.getBoundingClientRect().width,
    } : undefined }
  }

  componentDidUpdate(previous: MotionProps, _state: unknown, snapshot?: LayoutSnapshot | null) {
    const { root, withHint, rearranging } = this.props
    if (previous.withHint === withHint && previous.rearranging === rearranging) return
    this.cancelAnimations()

    const hint = root.current?.querySelector<HTMLElement>('[data-mobile-panel="hint"]')
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

    const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
    for (const { element, rect } of snapshot.cards) {
      if (!element.isConnected) continue
      const next = element.getBoundingClientRect()
      if (!next.width || !next.height) continue
      const x = rect.left - next.left
      const y = rect.top - next.top
      const scaleX = rect.width / next.width
      const scaleY = rect.height / next.height
      if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1) continue
      this.animations.push(element.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, transformOrigin: 'top left' },
        { transform: 'none', transformOrigin: 'top left' },
      ], { duration: snapshot.duration, easing }))
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
  const [announcement, setAnnouncement] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const hold = useRef<Hold | null>(null)
  const drag = useRef<Drag | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const orderRef = useRef(order)
  const latest = useRef(props)
  latest.current = props
  const { content: hint, exiting: hintExiting } = usePresentContent(props.panels.hint)
  const panels = { ...props.panels, hint: hint || undefined }
  const visible = order.filter((id) => props.panels[id])

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
      event.target.closest('[data-no-panel-hold]')) return
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
    data-rearranging={props.rearranging || undefined} style={{ '--mobile-secondary-count': visible.length - 1 } as CSSProperties}
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
    <div className="mobile-panel-space" aria-hidden="true" />
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
          <div className="mobile-panel-content" inert={props.rearranging} aria-hidden={props.rearranging || undefined}>
            {resizeEdge && <MobileInputResizeHandle inputId={inputId} edge={resizeEdge}
              disabled={props.blocked || props.rearranging} withHint={props.withHint} />}
            {id === 'hint' ? <MobileHintSwipe exiting={exiting}
              actions={exiting || props.rearranging || props.blocked ? undefined : props.hintSwipe}>
              {panel.content}
            </MobileHintSwipe> : panel.content}
          </div>
          {props.rearranging && <div className="mobile-panel-editor" data-panel-editor>
            <button type="button" className="mobile-panel-drag" aria-label={`Move ${panel.title.toLowerCase()} card`}
              aria-describedby="mobile-panel-instructions" onPointerDown={(event) => startDrag(id, event)}
              onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false) }}>
              <span><GripVertical size={18} aria-hidden="true" />{panel.title}</span>
            </button>
          </div>}
        </div>
        {index === 0 && visible.length > 1 && <div className="mobile-panel-space mobile-panel-gap" aria-hidden="true" />}
      </Fragment>
    })}
    <div className="mobile-panel-space" aria-hidden="true" />
    <span className="sr-only" role="status">{announcement}</span>
  </div>

  return <MobileHintMotion root={root} withHint={props.withHint} rearranging={props.rearranging}>{layout}</MobileHintMotion>
}
