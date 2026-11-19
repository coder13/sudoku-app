import { Check, X } from 'lucide-react'
import { type CSSProperties, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

export type HintSwipeActions = {
  dismiss: () => void
  apply?: { label: string; onClick: () => void }
}

type Touch = { id: number; x: number; y: number; width: number; horizontal: boolean }
type Swipe = { offset: number; label: string; direction: 'apply' | 'dismiss'; ready: boolean; dragging: boolean }

const SWIPE_SLOP = 10
const commitDistance = (width: number) => Math.min(88, width * .27)

function swipeAction(actions: HintSwipeActions, offset: number) {
  return offset < 0 ? { label: 'Dismiss', onClick: actions.dismiss } : actions.apply
}

export function MobileHintSwipe({ actions, exiting, children }: {
  actions?: HintSwipeActions; exiting: boolean; children: ReactNode
}) {
  const touch = useRef<Touch | null>(null)
  const suppressClick = useRef(false)
  const [swipe, setSwipe] = useState<Swipe | null>(null)
  const enabled = Boolean(actions)

  useLayoutEffect(() => {
    touch.current = null
    suppressClick.current = false
    if (!exiting) setSwipe(null)
  }, [enabled, exiting])

  function cancelSwipe() {
    touch.current = null
    setSwipe(current => current && { ...current, offset: 0, ready: false, dragging: false })
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (!actions) return
    if (!event.isPrimary) {
      cancelSwipe()
      return
    }
    suppressClick.current = false
    if (event.pointerType !== 'touch') return
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      width: event.currentTarget.clientWidth, horizontal: false }
  }

  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const current = touch.current
    if (!actions || current?.id !== event.pointerId) return
    const x = event.clientX - current.x
    const y = event.clientY - current.y
    if (!current.horizontal) {
      if (Math.hypot(x, y) < SWIPE_SLOP) return
      if (Math.abs(x) < Math.abs(y) * 1.25) {
        touch.current = null
        return
      }
      current.horizontal = true
      suppressClick.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const action = swipeAction(actions, x)
    setSwipe(action ? { direction: x < 0 ? 'dismiss' : 'apply', label: action.label,
      dragging: true, offset: Math.max(-current.width, Math.min(current.width, x)),
      ready: Math.abs(x) >= commitDistance(current.width) } : null)
  }

  function finishSwipe(event: PointerEvent<HTMLDivElement>) {
    const current = touch.current
    if (!actions || current?.id !== event.pointerId) return
    touch.current = null
    if (!current.horizontal) return

    const x = event.clientX - current.x
    const action = swipeAction(actions, x)
    if (!action || Math.abs(x) < commitDistance(current.width)) {
      cancelSwipe()
      return
    }
    setSwipe({ direction: x < 0 ? 'dismiss' : 'apply', label: action.label,
      offset: Math.sign(x) * current.width, ready: true, dragging: false })
    action.onClick()
  }

  return <div className="hint-swipe" data-enabled={enabled || undefined} data-direction={swipe?.direction}
    data-ready={swipe?.ready || undefined} data-dragging={swipe?.dragging || undefined}
    style={{ '--hint-swipe-offset': `${swipe?.offset ?? 0}px` } as CSSProperties}
    onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={finishSwipe}
    onPointerCancel={(event) => { if (touch.current?.id === event.pointerId) cancelSwipe() }}
    onLostPointerCapture={(event) => {
      if (event.target === event.currentTarget && touch.current?.id === event.pointerId) cancelSwipe()
    }}
    onClickCapture={(event) => {
      if (!suppressClick.current || event.detail === 0) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    }}>
    {swipe && <div className="hint-swipe-feedback" aria-hidden="true">
      <span>{swipe.direction === 'apply' ? <Check size={24} /> : <X size={24} />}{swipe.label}</span>
    </div>}
    <div className="hint-swipe-card">{children}</div>
  </div>
}
