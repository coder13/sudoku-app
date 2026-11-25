import { shortcutMatches, type EditableShortcutId, type ShortcutPreferences } from '../sudoku/shortcuts'

/** A host-neutral action model shared by buttons, menus, and keyboard routes. */
export type UiCommand<Id extends string = string> = {
  id: Id
  label: string
  available: boolean
  run: (source?: HTMLElement) => void
  shortcut?: string
  shortcutId?: EditableShortcutId
  pressed?: boolean
}

/** Run the first available command bound to this key, if it has a UI shortcut. */
export function dispatchCommandShortcut(
  event: KeyboardEvent,
  shortcuts: ShortcutPreferences,
  commands: readonly UiCommand[],
  source?: HTMLElement,
) {
  if (event.isComposing) return false
  const command = commands.find(({ available, shortcutId }) => available && shortcutId && shortcutMatches(event, shortcuts, shortcutId))
  if (!command) return false
  event.preventDefault()
  if (!event.repeat) command.run(source)
  return true
}
