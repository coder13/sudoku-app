import { type FocusEvent, type MouseEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type View = Point & { scale: number }
type Gesture =
  | { kind: 'pinch'; distance: number; scale: number; anchor: Point }
  | { kind: 'pan'; start: Point; view: View }

const FULL_GRID: View = { x: 0, y: 0, scale: 1 }
const PAN_SLOP = 8
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export function usePuzzleZoom(enabled: boolean, puzzleId: string, cancelGridPress: () => void) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const view = useRef<View>(FULL_GRID)
  const touches = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const consumed = useRef(false)
  const [zoomed, setZoomed] = useState(false)

  function apply(next: View) {
    const frame = viewport.current
    const board = content.current
    if (!frame || !board || !Number.isFinite(next.scale)) return
    const previous = view.current
    const nextZoomed = next.scale > 1
    const width = frame.clientWidth
    const height = frame.clientHeight
    const x = Math.min(0, Math.max(width * (1 - next.scale), next.x))
    const y = Math.min(0, Math.max(height * (1 - next.scale), next.y))
    view.current = nextZoomed ? { scale: next.scale, x, y } : FULL_GRID
    // Percentage offsets also work while the resize preview scales a fixed-size board.
    board.style.transform = nextZoomed && width && height
      ? `translate3d(${100 * x / width}%, ${100 * y / height}%, 0) scale(${next.scale})` : ''
    if (nextZoomed !== (previous.scale > 1)) setZoomed(nextZoomed)
  }

  function reset() {
    for (const id of touches.current.keys()) {
      if (viewport.current?.hasPointerCapture(id)) viewport.current.releasePointerCapture(id)
    }
    touches.current.clear()
    gesture.current = null
    consumed.current = false
    apply(FULL_GRID)
  }

  useLayoutEffect(() => {
    reset()
    const frame = viewport.current
    if (!enabled || !frame) return
    const observer = new ResizeObserver(() => {
      if (view.current.scale > 1) apply(view.current)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [enabled, puzzleId])

  function localCenter(frame: HTMLElement, a: Point, b: Point) {
    const { left, top } = frame.getBoundingClientRect()
    const center = midpoint(a, b)
    return { x: center.x - left, y: center.y - top }
  }

  function start(frame: HTMLElement) {
    const [first, second] = touches.current.values()
    if (second) {
      const current = view.current
      const center = localCenter(frame, first, second)
      gesture.current = {
        kind: 'pinch', distance: Math.max(1, distance(first, second)), scale: current.scale,
        anchor: { x: (center.x - current.x) / current.scale, y: (center.y - current.y) / current.scale },
      }
    } else {
      gesture.current = first ? { kind: 'pan', start: first, view: view.current } : null
    }
  }

  function consume(frame: HTMLElement) {
    if (!consumed.current) {
      consumed.current = true
      cancelGridPress()
    }
    for (const id of touches.current.keys()) {
      if (!frame.hasPointerCapture(id)) frame.setPointerCapture(id)
    }
  }

  function onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    // The floating mode button has its own drag gesture, even over a zoomed grid.
    if (!enabled || (event.target instanceof Element && event.target.closest('[data-puzzle-mode-tab]'))) return
    const points = touches.current
    if (!points.size) consumed.current = false
    if (event.pointerType !== 'touch') return
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    start(event.currentTarget)
    if (points.size >= 2) {
      consume(event.currentTarget)
      event.stopPropagation()
    }
  }

  function onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    const points = touches.current
    const current = gesture.current
    if (!current || !points.has(event.pointerId)) return
    const point = { x: event.clientX, y: event.clientY }
    points.set(event.pointerId, point)
    const frame = event.currentTarget
    if (current.kind === 'pinch') {
      const [first, second] = points.values()
      const center = localCenter(frame, first, second)
      const scale = Math.max(1, current.scale * distance(first, second) / current.distance)
      apply({ scale, x: center.x - current.anchor.x * scale, y: center.y - current.anchor.y * scale })
    } else {
      if (!consumed.current && current.view.scale === 1) return
      event.stopPropagation()
      if (!consumed.current && distance(point, current.start) < PAN_SLOP) return
      consume(frame)
      apply({
        scale: current.view.scale,
        x: current.view.x + point.x - current.start.x,
        y: current.view.y + point.y - current.start.y,
      })
    }
    event.stopPropagation()
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!touches.current.delete(event.pointerId)) return
    start(event.currentTarget)
    if (consumed.current) event.stopPropagation()
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!consumed.current || !event.detail) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onFocusCapture(event: FocusEvent<HTMLDivElement>) {
    if (view.current.scale === 1 || !event.target.matches('[role="gridcell"]:focus-visible, [data-candidate-button]:focus-visible') ||
      event.target.closest('[data-pointer-input]')) return
    const visible = event.currentTarget.getBoundingClientRect()
    const target = event.target.getBoundingClientRect()
    const x = Math.max(0, visible.left - target.left) + Math.min(0, visible.right - target.right)
    const y = Math.max(0, visible.top - target.top) + Math.min(0, visible.bottom - target.bottom)
    if (x || y) apply({ ...view.current, x: view.current.x + x, y: view.current.y + y })
  }

  return {
    zoomed, reset, content, viewport,
    viewportProps: {
      ref: viewport, onPointerDownCapture, onPointerMoveCapture, onClickCapture, onDoubleClickCapture: onClickCapture, onFocusCapture,
      onPointerUpCapture: finish, onPointerCancelCapture: finish,
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) finish(event)
      },
    },
  }
}
