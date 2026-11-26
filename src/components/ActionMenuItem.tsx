import type { LucideIcon } from 'lucide-react'
import type { UiCommand } from './UiCommand'

/** Present a resolved feature command as a native action-menu button. */
export function ActionMenuItem({ command, Icon, showShortcut = false, ariaLabel }: {
  command: UiCommand
  Icon: LucideIcon
  showShortcut?: boolean
  ariaLabel?: string
}) {
  return <button type="button" disabled={!command.available} aria-pressed={command.pressed} aria-label={ariaLabel}
    aria-keyshortcuts={command.shortcut} onClick={event => command.run(event.currentTarget)}>
    <Icon size={17} aria-hidden="true" /> {command.label}
    {showShortcut && command.shortcut && <kbd className="menu-shortcut" aria-hidden="true">{command.shortcut}</kbd>}
  </button>
}
