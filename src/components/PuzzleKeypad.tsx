import type { ReactNode } from 'react'

/** Use for the square digit pad or color palette. The caller owns each key's action. */
export function PuzzleKeypad({ label, variant, children }: {
  label: string
  variant?: 'mini' | 'palette'
  children: ReactNode
}) {
  const layout = variant === 'mini' ? ' mini-keypad' : variant === 'palette' ? ' palette' : ''
  return <div className={`keypad${layout}`} role="group" aria-label={label}>{children}</div>
}
