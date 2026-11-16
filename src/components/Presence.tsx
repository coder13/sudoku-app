import { type ReactNode, useEffect, useState } from 'react'

export function usePresence(open: boolean, exitDuration = 150) {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false)
      return
    }
    const timeout = window.setTimeout(() => setMounted(false), exitDuration)
    return () => window.clearTimeout(timeout)
  }, [exitDuration, mounted, open])

  return { mounted, exiting: mounted && !open }
}

export function Presence({ open, exitDuration = 150, children }: {
  open: boolean
  exitDuration?: number
  children: (presence: 'open' | 'exit') => ReactNode
}) {
  const { mounted, exiting } = usePresence(open, exitDuration)
  return mounted ? children(exiting ? 'exit' : 'open') : null
}
