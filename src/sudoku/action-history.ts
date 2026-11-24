import { CLASSIC_GRID, isGridText, type PlayGrid } from './grid.ts'
import type { DeductionAction } from './engine.ts'
import { completeCandidateMasks, createGameId, hintEliminations, valuesOf, visibleGivensOf, type Game } from './game.ts'
import { techniqueActionKey } from './technique-progress.ts'

export const ACTION_GROUP_DELAY = 2000

export type ActionChange =
  | { kind: 'entry'; cell: number; before: number; after: number }
  | { kind: 'candidate'; cell: number; digit: number; added: boolean }

export type ActionKind = 'edit' | 'undo' | 'redo' | 'candidates' | 'singles' | 'hint' | 'recovery' | 'bookmark'
export type ActionHistoryEntry = {
  id: string
  at: number
  lastAt: number
  elapsed: number
  kind: ActionKind
  changes: ActionChange[]
  // Undefined means no attribution is needed. Null means no proof matched.
  technique?: string | null
  matchFailed?: true
  // Save unclassified positions so a refresh cannot lose a pending match.
  pending?: { values: string; entries?: string; eliminations?: readonly number[] }
}

export function deductionActions(changes: readonly ActionChange[]): DeductionAction[] {
  return changes.flatMap((change): DeductionAction[] => change.kind === 'candidate'
    ? change.added ? [] : [{ eliminate: { cell: change.cell, digit: change.digit } }]
    : change.before === 0 && change.after > 0 ? [{ place: { cell: change.cell, digit: change.after } }] : [])
}

export function practiceTechniqueResult(technique: string, entries: readonly ActionHistoryEntry[] = []) {
  for (const entry of entries) {
    // Resolve earlier moves before attributing the first matching move to the player or a hint.
    if (entry.pending) return { status: 'checking' } as const
    if (entry.technique !== technique || (entry.kind !== 'edit' && entry.kind !== 'hint')) continue
    const action = deductionActions(entry.changes)[0]
    if (action) return { status: entry.kind === 'hint' ? 'hint' : 'found', action } as const
  }
  return { status: 'unconfirmed' } as const
}

export function recordAction(before: Game, after: Game, kind: ActionKind = 'edit',
  options: { at?: number; technique?: string; actions?: readonly DeductionAction[] } = {}): Game {
  if (before === after || before.source === 'draft' ||
    (before.position === after.position && (kind !== 'bookmark' || before.chainSketch === after.chainSketch))) return after
  const size = (before.grid ?? CLASSIC_GRID).size
  const visibleGivens = visibleGivensOf(before)
  const changes: ActionChange[] = []
  for (let cell = 0; cell < before.givens.length; cell++) {
    if (visibleGivens[cell] !== '0') continue
    const previous = Number(before.position.entries[cell])
    const next = Number(after.position.entries[cell])
    if (previous !== next) changes.push({ kind: 'entry', cell, before: previous, after: next })
  }
  // Placing a digit also clears notes in peer cells. Those are not separate user actions.
  if (changes.length === 0) {
    if (options.actions) {
      for (const action of options.actions) {
        if ('eliminate' in action) changes.push({ kind: 'candidate', ...action.eliminate, added: false })
      }
    } else {
      for (let cell = 0; cell < before.givens.length; cell++) {
        if (visibleGivens[cell] !== '0' || before.position.entries[cell] !== '0' || after.position.entries[cell] !== '0') continue
        const previous = before.position.center[cell] | before.position.corner[cell]
        const next = after.position.center[cell] | after.position.corner[cell]
        for (let digit = 1; digit <= size; digit++) {
          const bit = 1 << (digit - 1)
          if ((previous & bit) !== (next & bit)) changes.push({ kind: 'candidate', cell, digit, added: Boolean(next & bit) })
        }
      }
    }
  }
  if (changes.length === 0 && kind !== 'undo' && kind !== 'redo' && kind !== 'bookmark') return after
  const at = options.at ?? Date.now()
  const actions = deductionActions(changes)
  const pending = kind === 'edit' && actions.length > 0 && actions.length === changes.length
    ? { values: valuesOf(before), ...(before.variant?.fog && { entries: before.position.entries }),
      eliminations: hintEliminations(valuesOf(before), completeCandidateMasks(before), before.position.eliminations, size) }
    : undefined
  const entry: ActionHistoryEntry = {
    id: createGameId(), at, lastAt: at, elapsed: before.elapsed, kind, changes,
    ...(options.technique ? { technique: options.technique } : pending ? { pending } : {}),
  }
  return { ...after, actionHistory: [...(before.actionHistory ?? []), entry] }
}

function onlyRemovals(entry: ActionHistoryEntry) {
  return entry.kind === 'edit' && entry.changes.length > 0 && entry.changes.every((change) => change.kind === 'candidate' && !change.added)
}

/** Only consecutive removal actions can share a proof, with a two-second idle window. */
export function pendingActionBatch(history: readonly ActionHistoryEntry[], now: number) {
  const start = history.findIndex((entry) => entry.pending)
  if (start === -1) return null
  const entries = [history[start]]
  if (onlyRemovals(entries[0])) {
    for (let index = start + 1; index < history.length; index++) {
      const next = history[index]
      const previous = entries[entries.length - 1]
      const gap = next.at - previous.lastAt
      if (!next.pending || !onlyRemovals(next) || gap < 0 || gap > ACTION_GROUP_DELAY ||
        next.pending.values !== entries[0].pending!.values || next.pending.entries !== entries[0].pending!.entries) break
      entries.push(next)
    }
  }
  const last = entries[entries.length - 1]
  const delay = onlyRemovals(last) && start + entries.length === history.length
    ? Math.max(0, last.lastAt + ACTION_GROUP_DELAY - now) : 0
  return { entries, delay }
}

export function matchingTechnique(actions: readonly DeductionAction[], proofs: readonly { technique: string; actions: readonly DeductionAction[] }[]): string | null {
  if (actions.length === 0) return null
  const keys = actions.map(techniqueActionKey)
  return proofs.find((proof) => {
    const covered = new Set(proof.actions.map(techniqueActionKey))
    return keys.every((key) => covered.has(key))
  })?.technique ?? null
}

export type ActionMatcher = (position: NonNullable<ActionHistoryEntry['pending']>, actions: readonly DeductionAction[]) => Promise<string | null>

export async function matchActionBatch(entries: readonly ActionHistoryEntry[], match: ActionMatcher): Promise<ActionHistoryEntry[]> {
  const first = entries[0]
  if (!first?.pending) return [...entries]
  const changes = entries.flatMap((entry) => entry.changes)
  let failed = false
  const technique = await match(first.pending, deductionActions(changes)).catch(() => { failed = true; return null })
  if (failed) return entries.map(({ pending: _, ...entry }) => ({ ...entry, matchFailed: true }))
  if (technique || entries.length === 1) {
    const { pending: _, ...entry } = first
    return [{ ...entry, changes, lastAt: entries[entries.length - 1].lastAt, technique }]
  }
  // Keep a matching prefix together even when an unrelated removal follows it.
  for (let count = entries.length - 1; count > 1; count--) {
    const prefix = entries.slice(0, count)
    const prefixChanges = prefix.flatMap((entry) => entry.changes)
    const prefixTechnique = await match(first.pending, deductionActions(prefixChanges)).catch(() => null)
    if (prefixTechnique) {
      const { pending: _, ...entry } = first
      return [{ ...entry, changes: prefixChanges, lastAt: prefix[count - 1].lastAt, technique: prefixTechnique },
        ...await matchActionBatch(entries.slice(count), match)]
    }
  }
  // A later removal can depend on an earlier one. Use its own starting position.
  return [...await matchActionBatch([first], match), ...await matchActionBatch(entries.slice(1), match)]
}

export function applyActionMatches(game: Game, entries: readonly ActionHistoryEntry[], matches: readonly ActionHistoryEntry[]): Game {
  const history = game.actionHistory
  const start = history?.findIndex((entry) => entry.id === entries[0]?.id) ?? -1
  if (!history || start < 0 || !entries.every((entry, index) => history[start + index] === entry)) return game
  return { ...game, actionHistory: [...history.slice(0, start), ...matches, ...history.slice(start + entries.length)] }
}

export function validActionHistory(value: unknown, grid: PlayGrid = CLASSIC_GRID): value is ActionHistoryEntry[] {
  const cellCount = grid.size ** 2
  const fullMask = (1 << grid.size) - 1
  const integer = (number: unknown, max = Number.MAX_SAFE_INTEGER): number is number =>
    typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= max
  const kinds: ActionKind[] = ['edit', 'undo', 'redo', 'candidates', 'singles', 'hint', 'recovery', 'bookmark']
  return Array.isArray(value) && value.every((entry: ActionHistoryEntry) => entry &&
    typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 100 &&
    integer(entry.at) && integer(entry.lastAt) && entry.lastAt >= entry.at && integer(entry.elapsed) && kinds.includes(entry.kind) &&
    (entry.technique === undefined || entry.technique === null || typeof entry.technique === 'string') &&
    (entry.matchFailed === undefined || entry.matchFailed === true) &&
    Array.isArray(entry.changes) && entry.changes.every((change) => change && integer(change.cell, cellCount - 1) &&
      (change.kind === 'entry' ? integer(change.before, grid.size) && integer(change.after, grid.size)
        : change.kind === 'candidate' && integer(change.digit, grid.size) && change.digit > 0 && typeof change.added === 'boolean')) &&
    (entry.pending === undefined || entry.pending && isGridText(entry.pending.values, grid) &&
      (entry.pending.entries === undefined || isGridText(entry.pending.entries, grid)) &&
      (entry.pending.eliminations === undefined || Array.isArray(entry.pending.eliminations) && entry.pending.eliminations.length === cellCount &&
        entry.pending.eliminations.every((mask) => integer(mask, fullMask)))))
}
