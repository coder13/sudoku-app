import { Check, X } from 'lucide-react'
import { type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

export type HintSwipeActions = {
  dismiss: () => void
  apply?: { label: string; onClick: () => void }
}

type Touch = { id: number; x: number; y: number; width: number; startOffset: number; horizontal: boolean }
type SwipeFeedback = { label: string; direction: 'apply' | 'dismiss'; ready: boolean }

const TAP_SLOP = 8
const commitDistance = (width: number) => Math.min(88, width * .27)

function crossedCommitDistance(touch: Touch, delta: number, offset: number) {
  return Math.abs(offset) >= commitDistance(touch.width) && Math.abs(delta) >= TAP_SLOP && Math.sign(delta) === Math.sign(offset)
}

function swipeAction(actions: HintSwipeActions, offset: number) {
  return offset < 0 ? { label: 'Dismiss', onClick: actions.dismiss } : actions.apply
}

function moveCard(card: HTMLDivElement, offset: number) {
  card.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : ''
}

function settleCard(card: HTMLDivElement | null, offset: number) {
  if (!card) return
  card.removeAttribute('data-dragging')
  moveCard(card, offset)
}

export function MobileHintSwipe({ actions, exiting, children }: {
  actions?: HintSwipeActions; exiting: boolean; children: ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)
  const touch = useRef<Touch | null>(null)
  const suppressClick = useRef(false)
  const latestFeedback = useRef<SwipeFeedback | null>(null)
  const [feedback, setFeedback] = useState<SwipeFeedback | null>(null)
  const enabled = Boolean(actions)

  useLayoutEffect(() => {
    touch.current = null
    suppressClick.current = false
    if (exiting) return
    settleCard(card.current, 0)
    latestFeedback.current = null
    setFeedback(null)
  }, [enabled, exiting])

  function updateFeedback(next: SwipeFeedback | null) {
    const previous = latestFeedback.current
    if (previous?.direction === next?.direction && previous?.label === next?.label && previous?.ready === next?.ready) return
    latestFeedback.current = next
    setFeedback(next)
  }

  function cancelSwipe() {
    touch.current = null
    settleCard(card.current, 0)
    if (latestFeedback.current?.ready) updateFeedback({ ...latestFeedback.current, ready: false })
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    const element = card.current
    if (!actions || !element) return
    if (!event.isPrimary) {
      cancelSwipe()
      return
    }
    suppressClick.current = false
    if (event.pointerType !== 'touch') return
    const width = event.currentTarget.clientWidth
    // If the card is returning, start the new drag where the previous one left it on screen.
    const transform = getComputedStyle(element).transform
    const startOffset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
    element.setAttribute('data-dragging', '')
    moveCard(element, startOffset)
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      width, startOffset, horizontal: false }
  }

  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const current = touch.current
    const element = card.current
    if (!actions || !element || current?.id !== event.pointerId) return
    const delta = event.clientX - current.x
    const y = event.clientY - current.y
    if (!current.horizontal && Math.abs(delta) <= Math.abs(y)) return
    current.horizontal = true
    if (!suppressClick.current && Math.abs(delta) >= TAP_SLOP) {
      suppressClick.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const offset = current.startOffset + delta
    moveCard(element, offset)
    const action = offset ? swipeAction(actions, offset) : undefined
    updateFeedback(action ? { direction: offset < 0 ? 'dismiss' : 'apply', label: action.label,
      ready: crossedCommitDistance(current, delta, offset) } : null)
  }

  function finishSwipe(event: PointerEvent<HTMLDivElement>) {
    const current = touch.current
    if (!actions || current?.id !== event.pointerId) return
    const delta = event.clientX - current.x
    const offset = current.startOffset + delta
    const action = swipeAction(actions, offset)
    if (!current.horizontal || !action || !crossedCommitDistance(current, delta, offset)) {
      cancelSwipe()
      return
    }
    touch.current = null
    settleCard(card.current, Math.sign(offset) * Math.max(current.width, Math.abs(offset)))
    updateFeedback({ direction: offset < 0 ? 'dismiss' : 'apply', label: action.label, ready: true })
    action.onClick()
  }

  return <div className="hint-swipe" data-enabled={enabled || undefined} data-direction={feedback?.direction}
    data-ready={feedback?.ready || undefined}
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
    {feedback && <div className="hint-swipe-feedback" aria-hidden="true">
      <span>{feedback.direction === 'apply' ? <Check size={24} /> : <X size={24} />}{feedback.label}</span>
    </div>}
    <div className="hint-swipe-card" ref={card}>{children}</div>
  </div>
}
