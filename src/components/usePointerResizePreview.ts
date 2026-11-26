import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'

export type ResizePointer = { clientX: number; clientY: number; pointerId: number }

type Options<ElementType extends HTMLElement> = {
  handleRef: RefObject<ElementType | null>
  onStart: (event: PointerEvent<ElementType>) => boolean
  onPreview: (point: ResizePointer) => void
  onFinish: (point: ResizePointer, commit: boolean) => void
}

/** Share captured pointer gestures and frame-coalesced previews across resize handles. */
export function usePointerResizePreview<ElementType extends HTMLElement>({
  handleRef, onStart, onPreview, onFinish,
}: Options<ElementType>) {
  const active = useRef<ResizePointer | null>(null)
  const latest = useRef({ onStart, onPreview, onFinish })
  const frame = useRef<number | null>(null)
  latest.current = { onStart, onPreview, onFinish }

  const finish = useCallback((commit: boolean, point?: ResizePointer) => {
    const current = active.current
    if (!current) return
    active.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const finalPoint = point ?? current
    latest.current.onFinish(finalPoint, commit)
    const handle = handleRef.current
    if (handle?.hasPointerCapture(current.pointerId)) handle.releasePointerCapture(current.pointerId)
  }, [handleRef])

  useEffect(() => {
    const cancel = () => finish(false)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      finish(false)
    }
  }, [finish])

  function onPointerDown(event: PointerEvent<ElementType>) {
    if (!event.isPrimary || event.button !== 0 || active.current || !latest.current.onStart(event)) return
    event.preventDefault()
    const point = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId }
    active.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<ElementType>) {
    const current = active.current
    if (!current || current.pointerId !== event.pointerId) return
    active.current = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId }
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const point = active.current
      if (point) latest.current.onPreview(point)
    })
  }

  function onPointerUp(event: PointerEvent<ElementType>) {
    if (active.current?.pointerId !== event.pointerId) return
    finish(true, { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId })
  }

  function onPointerCancel(event: PointerEvent<ElementType>) {
    if (active.current?.pointerId === event.pointerId) finish(false)
  }

  return {
    cancel: () => finish(false),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel,
  }
}
