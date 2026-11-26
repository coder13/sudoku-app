import { Button } from './Button'
import { RotateCcw } from 'lucide-react'
import { useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import {
  DEFAULT_SHORTCUTS, EDITABLE_SHORTCUTS, editableShortcutKey, penPencilShortcutKeys, shortcutConflict, shortcutLabel, shortcutStore,
  type EditableShortcutDefinition, type EditableShortcutId,
} from '../sudoku/shortcuts'

type FixedShortcut = { label: string; description: string; keys: string[] }

const fixedSections: Array<{ title: string; shortcuts: FixedShortcut[] }> = [
  {
    title: 'Digits and candidates', shortcuts: [
      { label: 'Enter a digit', description: 'Place the digit in selected cells in Pen, Pencil, or Highlight mode.', keys: ['1–9'] },
      { label: 'Hold for Pencil mode', description: 'Switch from Pen to Pencil while you hold the key.', keys: ['Ctrl/⌘'] },
      { label: 'Toggle a candidate or highlight a digit', description: 'Toggle a candidate in selected cells. With no cells selected, match all highlighted digits.', keys: ['Ctrl/⌘', '1–9'] },
      { label: 'Highlight any selected digit', description: 'Toggle a digit and highlight cells that contain any selected digit.', keys: ['Shift', '1–9'] },
      { label: 'Cycle the highlighted digit', description: 'Highlight the next digit in order. Skip digits that are fully placed.', keys: ['`'] },
      { label: 'Erase selected cells', description: 'Remove placed digits or candidates from selected cells.', keys: ['0', 'Delete', 'Backspace'] },
    ],
  },
  {
    title: 'Navigation and selection', shortcuts: [
      { label: 'Move between cells', description: 'Move the active cell through the grid.', keys: ['Arrow keys'] },
      { label: 'Extend the selection', description: 'Select a rectangular range of cells.', keys: ['Shift', 'Arrow keys'] },
    ],
  },
  {
    title: 'Chain drawing', shortcuts: [
      { label: 'Undo a link edit', description: 'Undo the last edit to the selected chain.', keys: ['Ctrl/⌘', 'Z'] },
      { label: 'Redo a link edit', description: 'Restore the last undone chain edit. Ctrl/⌘+Y also works.', keys: ['Ctrl/⌘', 'Shift', 'Z'] },
      { label: 'Highlight matching candidates', description: 'Highlight the selected digit while you draw links.', keys: ['1–9'] },
      { label: 'Toggle a strong-link digit', description: 'With Show strong links on, toggle one digit without clearing the others.', keys: ['Shift', '1–9'] },
    ],
  },
  {
    title: 'History and interface', shortcuts: [
      { label: 'Undo', description: 'Undo the most recent grid change.', keys: ['Ctrl/⌘', 'Z'] },
      { label: 'Redo', description: 'Redo the most recently undone grid change.', keys: ['Ctrl/⌘', 'Shift', 'Z'] },
      { label: 'Increase app text size', description: 'Enlarge text and digits throughout the app.', keys: ['Ctrl/⌘', '+'] },
      { label: 'Decrease app text size', description: 'Shrink text and digits throughout the app.', keys: ['Ctrl/⌘', '−'] },
      { label: 'Reset app text size', description: 'Restore the default app text scale.', keys: ['Ctrl/⌘', '0'] },
      { label: 'Close or cancel', description: 'Close the current menu. In Colors or Chains, return to Pen/Pencil and keep edits already made.', keys: ['Escape'] },
    ],
  },
]

/** Display and edit keyboard bindings inside Settings. */
export function KeyboardShortcutSettings() {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [editing, setEditing] = useState<EditableShortcutId | null>(null)
  const [message, setMessage] = useState('')

  function cancelEdit() {
    setEditing(null)
    setMessage('Shortcut change canceled.')
  }

  function edit(definition: EditableShortcutDefinition, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.defaultPrevented || event.key === 'Tab') return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      cancelEdit()
      return
    }
    const key = editableShortcutKey(event.nativeEvent, definition.id)
    if (!key) {
      setMessage(definition.id === 'pauseOrSwitchView'
        ? 'Choose Space, a letter key, or question mark without Ctrl, Command, or Alt.'
        : 'Choose a letter key or question mark without Ctrl, Command, or Alt.')
      return
    }
    const conflict = shortcutConflict(shortcuts, definition.id, key)
    if (conflict) {
      const label = EDITABLE_SHORTCUTS.find(({ id }) => id === conflict)?.label ?? 'another action'
      setMessage(`${shortcutLabel(key)} is already used by ${label}.`)
      return
    }
    shortcutStore.set(definition.id, key)
    setEditing(null)
    setMessage(`${definition.label} now uses ${shortcutLabel(key)}.`)
  }

  const editableSections = ['Input modes', 'Puzzle actions'] as const

  return <div className="shortcut-settings">
    <div className="shortcut-settings-intro">
      <p>Select a key binding to change it.</p>
      <Button type="button" className="shortcuts-reset-all" onClick={() => {
        shortcutStore.resetAll()
        setEditing(null)
        setMessage('Keyboard shortcuts reset to their defaults.')
      }}><RotateCcw size={17} /> Reset all</Button>
    </div>
    <p className="shortcuts-save-note" role="status">
      {message || 'Changes save automatically.'}
    </p>

    {editableSections.map((category) => {
      const sectionId = `shortcut-${category.toLowerCase().replaceAll(' ', '-')}`
      return <section className="shortcut-section" key={category} aria-labelledby={sectionId}>
        <header><h3 id={sectionId}>{category}</h3><p>{category === 'Input modes'
          ? 'Press the Highlight mode shortcut again to return to Pen or Pencil.'
          : 'These commands are available while you are solving.'}</p></header>
        <div className="shortcut-list">
          {EDITABLE_SHORTCUTS.filter((definition) => definition.category === category).map((definition) => {
            const changed = shortcuts[definition.id] !== DEFAULT_SHORTCUTS[definition.id]
            const capturing = editing === definition.id
            const keys = definition.id === 'pencilMode' ? penPencilShortcutKeys(shortcuts) : [shortcuts[definition.id]]
            const labels = keys.map(shortcutLabel).join(' / ')
            return <div className="shortcut-row" key={definition.id}>
              <span className="shortcut-copy"><strong>{definition.label}</strong><small>{definition.description}</small></span>
              {changed && <Button type="button" variant="quiet" className="shortcut-reset" onClick={() => {
                shortcutStore.reset(definition.id)
                setMessage(`${definition.label} reset to ${shortcutLabel(DEFAULT_SHORTCUTS[definition.id])}.`)
              }}>Reset</Button>}
              <button type="button" className={`shortcut-binding${capturing ? ' is-capturing' : ''}`}
                data-shortcut-capture="true" aria-label={`Change shortcut for ${definition.label}. Current shortcut ${labels}`}
                onClick={event => {
                  event.currentTarget.focus({ preventScroll: true })
                  setEditing(definition.id)
                  setMessage(`Press a new key for ${definition.label}.`)
                }}
                onBlur={() => { if (capturing) cancelEdit() }}
                onKeyDown={(event) => capturing && edit(definition, event)}>
                {capturing ? 'Press a key' : <kbd>{labels}</kbd>}
              </button>
            </div>
          })}
        </div>
      </section>
    })}

    {fixedSections.map((section) => {
      const sectionId = `shortcut-${section.title.toLowerCase().replaceAll(' ', '-')}`
      return <section className="shortcut-section" key={section.title} aria-labelledby={sectionId}>
        <header><h3 id={sectionId}>{section.title}</h3></header>
        <div className="shortcut-list">
          {section.shortcuts.map((shortcut) => <div className="shortcut-row fixed-shortcut" key={shortcut.label}>
            <span className="shortcut-copy"><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span>
            <span className="shortcut-keys" aria-label={shortcut.keys.join(' plus ')}>
              {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
            </span>
          </div>)}
        </div>
      </section>
    })}
  </div>
}
