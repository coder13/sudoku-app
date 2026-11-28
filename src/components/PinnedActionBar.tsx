import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'
import type { UiCommand } from './UiCommand'

export type PinnedActionControl = {
  Icon: LucideIcon
  shortLabel: string
  command: UiCommand
}

/** Present feature-owned commands as compact, pinnable puzzle actions. */
export function PinnedActionBar({ actions, disabled = false, visible = true }: {
  actions: readonly PinnedActionControl[]
  disabled?: boolean
  visible?: boolean
}) {
  if (!actions.length) return null
  return <nav className="puzzle-quick-actions" aria-label="Pinned puzzle actions" inert={!visible}
    data-grid-click-away-controls data-no-panel-hold>
    {actions.map(({ Icon, shortLabel, command }) => <Button key={command.id} variant="quiet"
      disabled={disabled || !command.available} aria-pressed={command.pressed}
      title={command.label} aria-keyshortcuts={command.shortcut}
      onClick={event => command.run(event.currentTarget)}>
      <Icon size={16} aria-hidden="true" /><span>{shortLabel}</span>
    </Button>)}
  </nav>
}
