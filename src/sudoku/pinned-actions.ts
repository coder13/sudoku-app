/** Actions available in the optional footer below a playable Sudoku grid. */
export const PINNABLE_ACTIONS = [
  { id: 'candidates', label: 'Generate candidates', shortLabel: 'Candidates', description: 'Fill empty cells with valid candidates.' },
  { id: 'singles', label: 'Solve all singles', shortLabel: 'Singles', description: 'Place any available naked and hidden singles.' },
  { id: 'chain', label: 'Start a chain', shortLabel: 'Chain', description: 'Open Chains and begin drawing a new chain.' },
  { id: 'colors', label: 'Open colors', shortLabel: 'Colors', description: 'Open the Colors panel.' },
  { id: 'strong-links', label: 'Show strong links', shortLabel: 'Strong links', description: 'Open Chains and toggle strong links.' },
  { id: 'techniques', label: 'Open techniques', shortLabel: 'Techniques', description: 'Open the technique finder.' },
  { id: 'hint', label: 'View hint', shortLabel: 'Hint', description: 'Show help for the next step.' },
  { id: 'check', label: 'Check puzzle', shortLabel: 'Check', description: 'Check the current grid for errors.' },
  { id: 'undo', label: 'Undo', shortLabel: 'Undo', description: 'Undo the last move.' },
  { id: 'redo', label: 'Redo', shortLabel: 'Redo', description: 'Redo the last undone move.' },
] as const

export type PinnedAction = typeof PINNABLE_ACTIONS[number]['id']

/** Ignore unknown, duplicate, and malformed entries from saved settings. */
export function parsePinnedActions(value: unknown): readonly PinnedAction[] {
  if (!Array.isArray(value)) return []
  const result: PinnedAction[] = []
  for (const id of value) {
    if (PINNABLE_ACTIONS.some(action => action.id === id) && !result.includes(id as PinnedAction)) {
      result.push(id as PinnedAction)
    }
  }
  return result
}
