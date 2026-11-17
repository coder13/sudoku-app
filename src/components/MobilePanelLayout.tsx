import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'
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

export function MobilePanelLayout(props: Props) {
  const [order, setOrder] = useState(readMobilePanelOrder)
  const [dragView, setDragView] = useState<DragView | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const hold = useRef<Hold | null>(null)
  const drag = useRef<Drag | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const orderRef = useRef(order)
  const latest = useRef(props)
  latest.current = props
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
    for (const panel of root.current.querySelectorAll<HTMLElement>('[data-mobile-panel]')) {
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

  function moveBy(id: MobilePanelId, direction: -1 | 1) {
    const index = visible.indexOf(id)
    const target = visible[index + direction]
    if (target) saveMove(id, { id: target, edge: direction < 0 ? 'before' : 'after' })
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

  return <div ref={root} className={`mobile-panel-layout${props.withHint ? ' with-hint' : ''}`}
    data-rearranging={props.rearranging || undefined} style={{ '--mobile-secondary-count': visible.length - 1 } as CSSProperties}
    onPointerDownCapture={startHold}
    onContextMenuCapture={(event) => { if (hold.current || props.rearranging) event.preventDefault() }}
    onClickCapture={(event) => {
      if (props.rearranging && !(event.target instanceof Element && event.target.closest('[data-panel-editor]'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }}>
    {props.rearranging && <div className="mobile-panel-toolbar surface" role="region" aria-label="Rearrange cards" data-panel-editor>
      <div><strong>Rearrange cards</strong><small id="mobile-panel-instructions">
        {saveFailed ? 'Order saved for this session only.' : 'Drag cards to move them. Changes save automatically.'}
      </small></div>
      <button ref={closeButton} type="button" className="icon-button borderless" aria-label="Finish rearranging cards" onClick={exit}>
        <X size={22} aria-hidden="true" />
      </button>
    </div>}
    <div className="mobile-panel-space" aria-hidden="true" />
    {visible.map((id, index) => {
      const panel = props.panels[id]!
      const moving = dragView?.id === id
      const drop = dragView?.drop?.id === id ? dragView.drop.edge : undefined
      return <Fragment key={id}>
        <div className="mobile-panel" data-mobile-panel={id} data-first={index === 0 || undefined}
          data-dragging={moving || undefined} data-drop={drop} role="group" aria-label={`${panel.title} card`}
          style={{
            '--mobile-panel-row': index,
            ...(moving ? { transform: `translate(${dragView.x}px, ${dragView.y}px)` } : {}),
          } as CSSProperties}>
          <div className="mobile-panel-content" inert={props.rearranging} aria-hidden={props.rearranging || undefined}>
            {panel.content}
          </div>
          {props.rearranging && <div className="mobile-panel-editor" data-panel-editor>
            <button type="button" className="mobile-panel-drag" aria-label={`Move ${panel.title.toLowerCase()} card`}
              aria-describedby="mobile-panel-instructions" onPointerDown={(event) => startDrag(id, event)}
              onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false) }}
              onKeyDown={(event) => {
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
                event.preventDefault()
                moveBy(id, event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1)
              }}>
              <span><GripVertical size={18} aria-hidden="true" />{panel.title}</span>
            </button>
            <div className="mobile-panel-move-buttons">
              <button type="button" className="icon-button" aria-label={`Move ${panel.title.toLowerCase()} card earlier`}
                disabled={index === 0} onClick={() => moveBy(id, -1)}><ArrowUp size={20} aria-hidden="true" /></button>
              <button type="button" className="icon-button" aria-label={`Move ${panel.title.toLowerCase()} card later`}
                disabled={index === visible.length - 1} onClick={() => moveBy(id, 1)}><ArrowDown size={20} aria-hidden="true" /></button>
            </div>
          </div>}
        </div>
        {index === 0 && visible.length > 1 && <div className="mobile-panel-space mobile-panel-gap" aria-hidden="true" />}
      </Fragment>
    })}
    <div className="mobile-panel-space" aria-hidden="true" />
    <span className="sr-only" role="status">{announcement}</span>
  </div>
}
