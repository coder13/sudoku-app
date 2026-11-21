import type { ReactNode } from 'react'

/** Use for the digit pad, cell choices, or color palette. The caller owns each key's action. */
export function PuzzleKeypad({ label, variant, children }: {
  label: string
  variant?: 'mini' | 'six' | 'palette' | 'choices'
  children: ReactNode
}) {
  const layout = variant === 'mini' ? ' mini-keypad' : variant === 'six' ? ' six-keypad'
    : variant === 'palette' ? ' palette' : variant === 'choices' ? ' choice-keypad' : ''
  return <div className={`keypad${layout}`} role="group" aria-label={label}>{children}</div>
}

/** Use in pencil mode when a grid supports distinct center and corner candidates. */
export function CandidatePositionSwitch({ position, disabled, onChange }: {
  position: 'center' | 'corner'
  disabled?: boolean
  onChange: (position: 'center' | 'corner') => void
}) {
  return <div className="input-switch" role="group" aria-label="Candidate position">
    <button type="button" aria-pressed={position === 'center'} disabled={disabled} onClick={() => onChange('center')}>Center</button>
    <button type="button" aria-pressed={position === 'corner'} disabled={disabled} onClick={() => onChange('corner')}>Corner</button>
  </div>
}
