import { cloneElement, type ReactElement, type ReactNode, useEffect, useState } from 'react'

type MotionSpeed = 'standard' | 'overlay' | 'panel' | 'snap'
type PresenceState = 'open' | 'exit'
const EXIT_PAINT_BUFFER_MS = 34

export function motionDuration(speed: MotionSpeed) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--motion-${speed}-duration`).trim()
  const duration = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
  return duration > 0 ? duration : 0
}

export function animatePanelLayout(element: HTMLElement, before: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, duration: number, anchorX: 'left' | 'center' = 'left') {
  if (duration <= 0) return
  const after = element.getBoundingClientRect()
  if (!after.width || !after.height) return
  const x = anchorX === 'center'
    ? before.left + before.width / 2 - (after.left + after.width / 2)
    : before.left - after.left
  const y = before.top - after.top
  const scaleX = before.width / after.width
  const scaleY = before.height / after.height
  if (Math.abs(x) < .5 && Math.abs(y) < .5 &&
    Math.abs(before.width - after.width) < .5 && Math.abs(before.height - after.height) < .5) return
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
  const transformOrigin = anchorX === 'center' ? 'center top' : 'top left'
  return element.animate([
    { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, transformOrigin },
    { transform: 'none', transformOrigin },
  ], { duration, easing })
}

export function exitDelay(speed: MotionSpeed) {
  const duration = motionDuration(speed)
  return duration > 0 ? duration + EXIT_PAINT_BUFFER_MS : 0
}

export function usePresence(open: boolean, speed: MotionSpeed = 'standard') {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const delay = exitDelay(speed)
    if (!delay) {
      setMounted(false)
      return
    }
    const timeout = window.setTimeout(() => setMounted(false), delay)
    return () => window.clearTimeout(timeout)
  }, [mounted, open, speed])

  return { mounted: open || mounted, exiting: mounted && !open }
}

export function Presence({ open, children }: {
  open: boolean
  children: (presence: PresenceState) => ReactNode
}) {
  const { mounted, exiting } = usePresence(open)
  return mounted ? children(exiting ? 'exit' : 'open') : null
}

type Surface = ReactElement<{
  className?: string
  'data-presence'?: PresenceState
  'aria-hidden'?: boolean
  inert?: boolean
}>

export function usePresentContent<T>(content: T | false | null | undefined) {
  const { mounted, exiting } = usePresence(Boolean(content))
  const [previous, setPrevious] = useState(content)
  if (content !== previous && (content || !mounted)) setPrevious(content)
  return { content: mounted ? content || previous : null, exiting }
}

export function MotionSurface({ children }: { children: Surface | false | null | undefined }) {
  const { content: surface, exiting } = usePresentContent(children)
  if (!surface) return null
  return cloneElement(surface, {
    className: `${surface.props.className ?? ''} motion-surface`,
    'data-presence': exiting ? 'exit' : 'open',
    'aria-hidden': exiting || surface.props['aria-hidden'],
    inert: exiting || surface.props.inert,
  })
}
