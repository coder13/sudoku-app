import { type MouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'

const HOLD_MS = 420
const HOLD_SLOP = 10
const HOLD_VIBRATION_MS = 20

type Hold = {
  id: number
  target: Element
  x: number
  y: number
  timer: number
  completed: boolean
  nativeFeedback: boolean
}

export function useTouchHold(enabled: boolean) {
  const hold = useRef<Hold | null>(null)
  const consumedClick = useRef<Element | null>(null)

  const cancel = useCallback(() => {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    function cancelOtherPress(event: PointerEvent) {
      if (hold.current && hold.current.id !== event.pointerId) cancel()
    }
    function finish(event: PointerEvent) {
      const current = hold.current
      if (current?.id !== event.pointerId) return
      cancel()
      if (event.type === 'pointerup' && current.completed && !current.nativeFeedback) navigator.vibrate?.(HOLD_VIBRATION_MS)
    }
    window.addEventListener('pointerdown', cancelOtherPress, true)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('lostpointercapture', finish)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointerdown', cancelOtherPress, true)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('lostpointercapture', finish)
      window.removeEventListener('blur', cancel)
      cancel()
    }
  }, [cancel, enabled])

  function start(event: ReactPointerEvent, action?: () => void) {
    if (!event.isPrimary) return
    consumedClick.current = null
    if (!enabled || !action || event.pointerType !== 'touch' || event.button !== 0) return
    cancel()
    const target = event.currentTarget
    const timer = window.setTimeout(() => {
      const current = hold.current
      if (!current) return
      current.completed = true
      consumedClick.current = target
      action()
    }, HOLD_MS)
    hold.current = { id: event.pointerId, target, x: event.clientX, y: event.clientY, timer, completed: false, nativeFeedback: false }
  }

  function move(event: ReactPointerEvent) {
    const current = hold.current
    if (current?.id === event.pointerId && !current.completed &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) > HOLD_SLOP) cancel()
  }

  function rememberClick(target: Element) { consumedClick.current = target }

  function suppressClick(event: MouseEvent) {
    return event.detail > 0 && consumedClick.current === event.currentTarget
  }

  function suppressContextMenu(event: MouseEvent) {
    const current = hold.current
    const target = current?.target ?? consumedClick.current
    if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return false
    // Chromium can supply a native tick when the page handles its touch long press.
    if (current && event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') current.nativeFeedback = true
    event.preventDefault()
    return true
  }

  return { start, move, cancel, rememberClick, suppressClick, suppressContextMenu }
}
