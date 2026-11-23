import assert from 'node:assert/strict'
import test from 'node:test'
import { nextPenPencilMode } from '../src/sudoku/puzzle-input-mode.ts'
import {
  appTextZoomShortcut, DEFAULT_SHORTCUTS, EDITABLE_SHORTCUTS, editableShortcutKey, highlightedDigitShortcut,
  parseShortcutPreferences, shortcutConflict, shortcutLabel, shortcutMatches, storedShortcutPreferences,
} from '../src/sudoku/shortcuts.ts'

test('default editable shortcuts are unique', () => {
  assert.equal(new Set(Object.values(DEFAULT_SHORTCUTS)).size, EDITABLE_SHORTCUTS.length)
})

test('saved shortcut preferences accept valid partial changes', () => {
  assert.deepEqual(parseShortcutPreferences({ digitMode: 'v' }), { ...DEFAULT_SHORTCUTS, digitMode: 'v' })
})

test('older saved shortcuts gain the Generate candidates default without creating a conflict', () => {
  const { generateCandidates: _, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.deepEqual(parseShortcutPreferences(olderPreferences), DEFAULT_SHORTCUTS)
  assert.deepEqual(parseShortcutPreferences({ ...olderPreferences, digitMode: 'g' }), DEFAULT_SHORTCUTS)
})

test('Toggle draw links preserves custom keys and drops the old New chain binding', () => {
  const { chainDrawing: _draw, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.equal(DEFAULT_SHORTCUTS.chainDrawing, 'x')
  assert.equal(EDITABLE_SHORTCUTS.find(({ id }) => id === 'chainDrawing')?.label, 'Toggle draw links')
  assert.deepEqual(parseShortcutPreferences({ ...DEFAULT_SHORTCUTS, newChain: 'b' }), DEFAULT_SHORTCUTS)
  const shortcuts = parseShortcutPreferences({ ...olderPreferences, digitMode: 'x', pencilMode: 'b' })
  assert.equal(shortcuts.digitMode, 'x')
  assert.equal(shortcuts.pencilMode, 'b')
  assert.equal(new Set(Object.values(shortcuts)).size, EDITABLE_SHORTCUTS.length)
})

test('the Apply edits shortcut preserves an existing F assignment', () => {
  const { applyEdits: _, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.equal(parseShortcutPreferences(olderPreferences).applyEdits, 'f')
  const migrated = parseShortcutPreferences({ ...olderPreferences, digitMode: 'f' })
  assert.equal(migrated.digitMode, 'f')
  assert.notEqual(migrated.applyEdits, 'f')
  assert.equal(new Set(Object.values(migrated)).size, EDITABLE_SHORTCUTS.length)
})

test('the shade shortcut preserves existing Z bindings and supports a custom key', () => {
  const { switchColorShade: _, ...olderPreferences } = DEFAULT_SHORTCUTS
  assert.deepEqual(parseShortcutPreferences(olderPreferences), DEFAULT_SHORTCUTS)
  const migrated = parseShortcutPreferences({ ...olderPreferences, digitMode: 'z' })
  assert.equal(migrated.digitMode, 'z')
  assert.notEqual(migrated.switchColorShade, 'z')
  assert.equal(new Set(Object.values(migrated)).size, EDITABLE_SHORTCUTS.length)
  const custom = parseShortcutPreferences({ switchColorShade: 'v' })
  const plain = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  assert.equal(shortcutMatches({ ...plain, key: 'v' }, custom, 'switchColorShade'), true)
  assert.equal(shortcutMatches({ ...plain, key: 'z' }, custom, 'switchColorShade'), false)
  assert.equal(shortcutMatches({ ...plain, key: 'v', ctrlKey: true }, custom, 'switchColorShade'), false)
})

test('legacy draw and shade defaults update while explicit bindings survive a reload', () => {
  const older = { ...DEFAULT_SHORTCUTS, digitMode: 'v', chainDrawing: 'l', switchColorShade: 'x' }
  assert.deepEqual(parseShortcutPreferences(older), { ...DEFAULT_SHORTCUTS, digitMode: 'v' })
  assert.deepEqual(parseShortcutPreferences(storedShortcutPreferences(older)), older)
})

test('P and Q cycle input modes by default and existing bindings remain valid', () => {
  assert.equal(DEFAULT_SHORTCUTS.pencilMode, 'q')
  const key = (key: string) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })
  for (const shortcut of ['p', 'q']) assert.equal(shortcutMatches(key(shortcut), DEFAULT_SHORTCUTS, 'pencilMode'), true)
  assert.equal(shortcutMatches(key('p'), { ...DEFAULT_SHORTCUTS, digitMode: 'p' }, 'pencilMode'), false)
  assert.equal(parseShortcutPreferences({ pencilMode: 'p' }).pencilMode, 'p')
  const customized = parseShortcutPreferences({ digitMode: 'q' })
  assert.equal(customized.digitMode, 'q')
  assert.equal(customized.pencilMode, 'p')
})

test('invalid or conflicting saved shortcuts fall back to defaults', () => {
  assert.equal(parseShortcutPreferences({ digitMode: '1' }), DEFAULT_SHORTCUTS)
  assert.equal(parseShortcutPreferences({ digitMode: 'v', pencilMode: 'v' }), DEFAULT_SHORTCUTS)
})

test('editable shortcuts accept letters and question mark without command modifiers', () => {
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: 'X', metaKey: false, shiftKey: false }), 'x')
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: '?', metaKey: false, shiftKey: true }), '?')
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: true, key: 'x', metaKey: false, shiftKey: false }), null)
  assert.equal(editableShortcutKey({ altKey: false, ctrlKey: false, key: '1', metaKey: false, shiftKey: false }), null)
})

test('shortcut matching follows customized bindings and rejects modifiers', () => {
  const shortcuts = { ...DEFAULT_SHORTCUTS, pencilMode: 'v' }
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: false, key: 'V', metaKey: false, shiftKey: false }, shortcuts, 'pencilMode'), true)
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: true, key: 'v', metaKey: false, shiftKey: false }, shortcuts, 'pencilMode'), false)
  assert.equal(shortcutMatches({ altKey: false, ctrlKey: false, key: '?', metaKey: false, shiftKey: true }, shortcuts, 'shortcutHelp'), true)
})

test('Space is the default for pausing or switching views and can be reassigned', () => {
  const { pauseOrSwitchView: _, ...olderPreferences } = { ...DEFAULT_SHORTCUTS, digitMode: 'v' }
  const migrated = parseShortcutPreferences(olderPreferences)
  const space = { altKey: false, ctrlKey: false, key: ' ', metaKey: false, shiftKey: false }
  assert.equal(migrated.digitMode, 'v')
  assert.equal(shortcutLabel(migrated.pauseOrSwitchView), 'Space')
  assert.equal(editableShortcutKey(space, 'pauseOrSwitchView'), ' ')
  assert.equal(editableShortcutKey(space, 'digitMode'), null)
  assert.equal(shortcutMatches(space, migrated, 'pauseOrSwitchView'), true)
  assert.equal(shortcutMatches({ ...space, shiftKey: true }, migrated, 'pauseOrSwitchView'), false)
  const custom = parseShortcutPreferences({ ...migrated, pauseOrSwitchView: 'o' })
  assert.equal(shortcutMatches(space, custom, 'pauseOrSwitchView'), false)
  assert.equal(shortcutMatches({ ...space, key: 'o' }, custom, 'pauseOrSwitchView'), true)
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
  assert.equal(shortcutConflict(DEFAULT_SHORTCUTS, 'digitMode', 'x'), 'chainDrawing')
})

test('the Pen/Pencil shortcut never switches into Highlight mode', () => {
  assert.equal(nextPenPencilMode(false, false), true, 'Pen switches to Pencil')
  assert.equal(nextPenPencilMode(true, false), false, 'Pencil switches to Pen')
  assert.equal(nextPenPencilMode(false, true), false, 'Highlight returns to Pen')
  assert.equal(nextPenPencilMode(true, true), false, 'Highlight returns to Pen regardless of the previous mode')
})
