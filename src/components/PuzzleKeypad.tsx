import type { ReactNode } from 'react'

/** Use for the digit pad or compact choice keys. The caller owns each key's action. */
export function PuzzleKeypad({ label, variant, children }: {
  label: string
  variant?: 'mini' | 'six' | 'choices'
  children: ReactNode
}) {
  const layout = variant === 'mini' ? ' mini-keypad' : variant === 'six' ? ' six-keypad'
    : variant === 'choices' ? ' choice-keypad' : ''
  return <div className={`keypad${layout}`} role="group" aria-label={label}>{children}</div>
}
