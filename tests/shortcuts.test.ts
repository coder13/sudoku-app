import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appTextZoomShortcut, DEFAULT_SHORTCUTS, EDITABLE_SHORTCUTS, editableShortcutKey, highlightedDigitShortcut,
  parseShortcutPreferences, shortcutConflict, shortcutMatches,
} from '../src/sudoku/shortcuts.ts'

test('default editable shortcuts are unique', () => {
  assert.equal(new Set(Object.values(DEFAULT_SHORTCUTS)).size, EDITABLE_SHORTCUTS.length)
})

test('saved shortcut preferences accept valid partial changes', () => {
  assert.deepEqual(parseShortcutPreferences({ digitMode: 'v' }), { ...DEFAULT_SHORTCUTS, digitMode: 'v' })
})

test('older saved shortcuts gain the Generate all candidates default without creating a conflict', () => {
  const { generateCandidates: _, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.deepEqual(parseShortcutPreferences(olderPreferences), DEFAULT_SHORTCUTS)
  assert.deepEqual(parseShortcutPreferences({ ...olderPreferences, digitMode: 'g' }), DEFAULT_SHORTCUTS)
})

test('the new Chains shortcuts preserve keys already assigned by the user', () => {
  const { chainDrawing: _draw, newChain: _new, ...olderPreferences } = DEFAULT_SHORTCUTS
  const shortcuts = parseShortcutPreferences({ ...olderPreferences, digitMode: 'l', pencilMode: 'b' })
  assert.equal(shortcuts.digitMode, 'l')
  assert.equal(shortcuts.pencilMode, 'b')
  assert.equal(new Set(Object.values(shortcuts)).size, EDITABLE_SHORTCUTS.length)
})

test('the shade shortcut preserves existing X bindings and supports a custom key', () => {
  const { switchColorShade: _, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.deepEqual(parseShortcutPreferences(olderPreferences), DEFAULT_SHORTCUTS)
  const migrated = parseShortcutPreferences({ ...olderPreferences, digitMode: 'x' })
  assert.equal(migrated.digitMode, 'x')
  assert.notEqual(migrated.switchColorShade, 'x')
  assert.equal(new Set(Object.values(migrated)).size, EDITABLE_SHORTCUTS.length)
  const custom = parseShortcutPreferences({ switchColorShade: 'v' })
  const plain = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  assert.equal(shortcutMatches({ ...plain, key: 'v' }, custom, 'switchColorShade'), true)
  assert.equal(shortcutMatches({ ...plain, key: 'x' }, custom, 'switchColorShade'), false)
  assert.equal(shortcutMatches({ ...plain, key: 'v', ctrlKey: true }, custom, 'switchColorShade'), false)
})

test('invalid or conflicting saved shortcuts fall back to defaults', () => {
  assert.equal(parseShortcutPreferences({ digitMode: '1' }), DEFAULT_SHORTCUTS)
  assert.equal(parseShortcutPreferences({ digitMode: DEFAULT_SHORTCUTS.pencilMode }), DEFAULT_SHORTCUTS)
})

test('editable shortcuts accept letters and question mark without command modifiers', () => {
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: 'X', metaKey: false, shiftKey: false }), 'x')
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: '?', metaKey: false, shiftKey: true }), '?')
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: true, key: 'x', metaKey: false, shiftKey: false }), null)
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: '1', metaKey: false, shiftKey: false }), null)
})

test('shortcut matching follows customized bindings and rejects modifiers', () => {
  const shortcuts = { ...DEFAULT_SHORTCUTS, pencilMode: 'x' }
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: false, key: 'X', metaKey: false, shiftKey: false }, shortcuts, 'pencilMode'), true)
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: true, key: 'x', metaKey: false, shiftKey: false }, shortcuts, 'pencilMode'), false)
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: false, key: '?', metaKey: false, shiftKey: true }, shortcuts, 'shortcutHelp'), true)
})

test('highlighted digit shortcuts use Shift plus the digit row', () => {
  assert.equal(highlightedDigitShortcut({ altKey: false, code: 'Digit7', ctrlKey: false, metaKey: false, shiftKey: true }), 7)
  assert.equal(highlightedDigitShortcut({ altKey: false, code: 'Numpad7', ctrlKey: false, metaKey: false, shiftKey: true }), null)
  assert.equal(highlightedDigitShortcut({ altKey: false, code: 'Digit7', ctrlKey: false, metaKey: false, shiftKey: false }), null)
})

test('app text zoom uses Ctrl or Command and ignores unmodified puzzle input', () => {
  const plain = { altKey: false, ctrlKey: false, isComposing: false, metaKey: false }
  const ctrl = { ...plain, ctrlKey: true }
  const command = { ...plain, metaKey: true }
  assert.equal(appTextZoomShortcut({ ...plain, key: '0' }), null)
  assert.equal(appTextZoomShortcut({ ...ctrl, key: '1' }), null)
  assert.equal(appTextZoomShortcut({ ...ctrl, key: '-' }), -1)
  assert.equal(appTextZoomShortcut({ ...command, key: '+' }), 1)
  assert.equal(appTextZoomShortcut({ ...command, key: '=' }), 1)
  assert.equal(appTextZoomShortcut({ ...command, key: '0' }), 0)
  assert.equal(appTextZoomShortcut({ ...ctrl, key: '+', altKey: true }), null)
  assert.equal(appTextZoomShortcut({ ...ctrl, key: '-', isComposing: true }), null)
})

test('shortcut conflicts identify the command that already owns a key', () => {
  assert.equal(shortcutConflict(DEFAULT_SHORTCUTS, 'digitMode', DEFAULT_SHORTCUTS.pencilMode), 'pencilMode')
  assert.equal(shortcutConflict(DEFAULT_SHORTCUTS, 'digitMode', 'v'), null)
  assert.equal(shortcutConflict(DEFAULT_SHORTCUTS, 'digitMode', 'x'), 'switchColorShade')
})
