import { Link } from '@tanstack/react-router'
import { ChevronLeft, RotateCcw } from 'lucide-react'
import { useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import {
  DEFAULT_SHORTCUTS, EDITABLE_SHORTCUTS, editableShortcutKey, shortcutConflict, shortcutLabel, shortcutStore,
  type EditableShortcutDefinition, type EditableShortcutId,
} from '../sudoku/shortcuts'

type FixedShortcut = { label: string; description: string; keys: string[] }

const fixedSections: Array<{ title: string; shortcuts: FixedShortcut[] }> = [
  {
    title: 'Digits and candidates', shortcuts: [
      { label: 'Enter a digit', description: 'Use the current input mode in selected cells.', keys: ['1–9'] },
      { label: 'Hold for Pencil mode', description: 'Switch from Pen to Pencil while you hold the key.', keys: ['Ctrl/⌘'] },
      { label: 'Toggle a candidate', description: 'Add or remove a candidate in the current cell or selection.', keys: ['Ctrl/⌘', '1–9'] },
      { label: 'Highlight a digit', description: 'Highlight matching placed digits and candidates without changing modes.', keys: ['Shift', '1–9'] },
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
      { label: 'End the path or stop drawing', description: 'End the current path. If no endpoint is selected, stop drawing.', keys: ['Escape'] },
      { label: 'Undo a link edit', description: 'Undo the last edit to the selected chain.', keys: ['Ctrl/⌘', 'Z'] },
      { label: 'Highlight matching candidates', description: 'Highlight the selected digit while you draw links.', keys: ['1–9'] },
    ],
  },
  {
    title: 'History and interface', shortcuts: [
      { label: 'Undo', description: 'Undo the most recent grid change.', keys: ['Ctrl/⌘', 'Z'] },
      { label: 'Redo', description: 'Redo the most recently undone grid change.', keys: ['Ctrl/⌘', 'Shift', 'Z'] },
      { label: 'Increase app text size', description: 'Enlarge text and digits throughout the app.', keys: ['Ctrl/⌘', '+'] },
      { label: 'Decrease app text size', description: 'Shrink text and digits throughout the app.', keys: ['Ctrl/⌘', '−'] },
      { label: 'Reset app text size', description: 'Restore the default app text scale.', keys: ['Ctrl/⌘', '0'] },
      { label: 'Close or cancel', description: 'Close the current menu or cancel a temporary action.', keys: ['Escape'] },
    ],
  },
]

export function KeyboardShortcutsPage() {
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [editing, setEditing] = useState<EditableShortcutId | null>(null)
  const [message, setMessage] = useState('')

  function edit(definition: EditableShortcutDefinition, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setEditing(null)
      setMessage('Shortcut change canceled.')
      return
    }
    const key = editableShortcutKey(event.nativeEvent)
    if (!key) {
      setMessage('Choose a letter key or question mark without Ctrl, Command, or Alt.')
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

  return <main className="shortcuts-page">
    <div className="shortcuts-page-inner">
      <header className="shortcuts-page-heading">
        <Link to="/" className="icon-button shortcuts-back" aria-label="Back to Play"><ChevronLeft size={21} /></Link>
        <div><h1>Keyboard shortcuts</h1><p>View every shortcut and change the single-key commands that fit your workflow.</p></div>
        <button type="button" className="button secondary shortcuts-reset-all" onClick={() => {
          shortcutStore.resetAll()
          setEditing(null)
          setMessage('Keyboard shortcuts reset to their defaults.')
        }}><RotateCcw size={17} /> Reset all</button>
      </header>

      <p className="shortcuts-save-note" role="status" aria-live="polite">
        {message || 'Changes save automatically on this device.'}
      </p>

      {editableSections.map((category) => {
        const sectionId = `shortcut-${category.toLowerCase().replaceAll(' ', '-')}`
        return <section className="shortcut-section" key={category} aria-labelledby={sectionId}>
        <header><h2 id={sectionId}>{category}</h2><p>{category === 'Input modes'
          ? 'Press an active mode’s shortcut again to return to digit placement.'
          : 'These commands are available while you are solving.'}</p></header>
        <div className="shortcut-list">
          {EDITABLE_SHORTCUTS.filter((definition) => definition.category === category).map((definition) => {
            const changed = shortcuts[definition.id] !== DEFAULT_SHORTCUTS[definition.id]
            const capturing = editing === definition.id
            return <div className="shortcut-row" key={definition.id}>
              <span className="shortcut-copy"><strong>{definition.label}</strong><small>{definition.description}</small></span>
              {changed && <button type="button" className="button borderless shortcut-reset" onClick={() => {
                shortcutStore.reset(definition.id)
                setMessage(`${definition.label} reset to ${shortcutLabel(DEFAULT_SHORTCUTS[definition.id])}.`)
              }}>Reset</button>}
              <button type="button" className={`shortcut-binding${capturing ? ' is-capturing' : ''}`}
                data-shortcut-capture="true" aria-label={`Change shortcut for ${definition.label}. Current shortcut ${shortcutLabel(shortcuts[definition.id])}`}
                onClick={() => { setEditing(definition.id); setMessage(`Press a new key for ${definition.label}.`) }}
                onKeyDown={(event) => capturing && edit(definition, event)}>
                {capturing ? 'Press a key' : <kbd>{shortcutLabel(shortcuts[definition.id])}</kbd>}
              </button>
            </div>
          })}
        </div>
      </section>
      })}

      {fixedSections.map((section) => {
        const sectionId = `shortcut-${section.title.toLowerCase().replaceAll(' ', '-')}`
        return <section className="shortcut-section" key={section.title} aria-labelledby={sectionId}>
        <header><h2 id={sectionId}>{section.title}</h2></header>
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
  </main>
}
