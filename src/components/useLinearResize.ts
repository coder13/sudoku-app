import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

type ResizeKeys = {
  increase: string
  decrease: string
  home?: 'min' | 'max'
  end?: 'min' | 'max'
  step: number
  shiftStep?: number
}

type Options = {
  value: number
  min: number
  max: number
  axis: 'x' | 'y'
  direction: 1 | -1
  keys: ResizeKeys
  onResize: (value: number) => void
  onBegin?: () => void
}

type Drag<ElementType extends HTMLElement> = {
  element: ElementType
  pointerId: number
  coordinate: number
  value: number
}

/** Share pointer capture, bounds, and keyboard behavior across linear resize handles. */
export function useLinearResize<ElementType extends HTMLElement>({
  value, min, max, axis, direction, keys, onResize, onBegin,
}: Options) {
  const drag = useRef<Drag<ElementType> | null>(null)
  const latest = useRef({ value, min, max, axis, direction, keys, onResize, onBegin })
  latest.current = { value, min, max, axis, direction, keys, onResize, onBegin }

  const cancel = useCallback(() => {
    const current = drag.current
    drag.current = null
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
  }, [])

  useEffect(() => () => cancel(), [cancel])

  function clamp(next: number) {
    return Math.min(latest.current.max, Math.max(latest.current.min, Math.round(next)))
  }

  function coordinate(event: PointerEvent<ElementType>) {
    return latest.current.axis === 'x' ? event.clientX : event.clientY
  }

  function onPointerDown(event: PointerEvent<ElementType>) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return
    event.preventDefault()
    latest.current.onBegin?.()
    drag.current = {
      element: event.currentTarget,
      pointerId: event.pointerId,
      coordinate: coordinate(event),
      value: latest.current.value,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<ElementType>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const change = (coordinate(event) - current.coordinate) * latest.current.direction
    latest.current.onResize(clamp(current.value + change))
  }

  function onPointerEnd(event: PointerEvent<ElementType>) {
    if (drag.current?.pointerId === event.pointerId) cancel()
  }

  function onKeyDown(event: KeyboardEvent<ElementType>) {
    const current = latest.current
    const step = event.shiftKey ? current.keys.shiftStep ?? current.keys.step : current.keys.step
    let next: number | undefined
    if (event.key === current.keys.increase) next = current.value + step
    else if (event.key === current.keys.decrease) next = current.value - step
    else if (event.key === 'Home' && current.keys.home) next = current.keys.home === 'min' ? current.min : current.max
    else if (event.key === 'End' && current.keys.end) next = current.keys.end === 'min' ? current.min : current.max
    if (next === undefined) return
    event.preventDefault()
    event.stopPropagation()
    current.onBegin?.()
    current.onResize(clamp(next))
  }

  return {
    cancel,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onLostPointerCapture: onPointerEnd,
    onKeyDown,
  }
}
