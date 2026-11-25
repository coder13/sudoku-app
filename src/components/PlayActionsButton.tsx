import type { ComponentProps } from 'react'
import { ListChecks } from 'lucide-react'
import { IconButton } from './Button'

/** Present the keypad's actions menu trigger for compact or standard layouts. */
export function PlayActionsButton({ mobile, open, ...props }: Omit<ComponentProps<typeof IconButton>, 'aria-label'> & {
  mobile: boolean
  open: boolean
}) {
  return <IconButton {...props} className="actions-key" aria-label="Actions" aria-expanded={open}
    aria-controls={open ? (mobile ? 'mobile-actions-menu' : 'input-actions-menu') : undefined}
    aria-haspopup={mobile ? 'dialog' : undefined}>
    <ListChecks size={20} aria-hidden="true" />
  </IconButton>
}
