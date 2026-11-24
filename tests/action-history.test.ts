import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTION_GROUP_DELAY, applyActionMatches, deductionActions, matchActionBatch, matchingTechnique,
  pendingActionBatch, practiceTechniqueResult, recordAction, validActionHistory, type ActionHistoryEntry,
} from '../src/sudoku/action-history.ts'
import { enter, makeGame, paintCandidateStroke, redo, replaceCandidates, restartGame, undo } from '../src/sudoku/game.ts'

const notes = () => replaceCandidates(makeGame('test', 'Test', '0'.repeat(81), 'custom'), Array(81).fill(511))
function remove(game = notes(), cell = 0, digit = 3, at = 1000) {
  return recordAction(game, enter(game, [cell], 'candidate', digit), 'edit', { at })
}
const entry = (cell: number, at: number) => remove(notes(), cell, 3, at).actionHistory![0]

test('practice results use the first verified move and distinguish an applied hint', () => {
  const pending = entry(38, 1000)
  const found = { ...pending, pending: undefined, technique: 'wxyz-wing' }
  const hint = { ...found, kind: 'hint' as const }
  const action = { eliminate: { cell: 38, digit: 3 } }
  assert.deepEqual(practiceTechniqueResult('wxyz-wing', [pending, hint]), { status: 'checking' })
  assert.deepEqual(practiceTechniqueResult('wxyz-wing', [found, pending, hint]), { status: 'found', action })
  assert.deepEqual(practiceTechniqueResult('wxyz-wing', [hint, found]), { status: 'hint', action })
  assert.deepEqual(practiceTechniqueResult('wxyz-wing', [{ ...found, technique: 'x-wing' },
    { ...found, kind: 'singles' }, { ...found, changes: [] }]), { status: 'unconfirmed' })
})

test('placements do not count automatic peer cleanup as user removals', () => {
  const before = notes()
  const next = recordAction(before, enter(before, [0], 'value', 3))
  assert.deepEqual(next.actionHistory![0].changes, [{ kind: 'entry', cell: 0, before: 0, after: 3 }])
  assert.equal(next.position.corner[1] & 4, 0)
  assert.equal(recordAction(before, before), before)
  const draft = { ...before, source: 'draft' as const }
  assert.equal(recordAction(draft, enter(draft, [0], 'value', 3)).actionHistory, undefined)
})

test('candidate additions, replacements and erases are recorded without technique credit', () => {
  const first = remove()
  const restored = recordAction(first, enter(first, [0], 'candidate', 3))
  assert.deepEqual(restored.actionHistory![1].changes, [{ kind: 'candidate', cell: 0, digit: 3, added: true }])
  assert.equal(restored.actionHistory![1].pending, undefined)
  const placed = recordAction(restored, enter(restored, [0], 'value', 3))
  const replaced = recordAction(placed, enter(placed, [0], 'value', 4))
  assert.deepEqual(replaced.actionHistory!.at(-1)?.changes, [{ kind: 'entry', cell: 0, before: 3, after: 4 }])
  assert.equal(replaced.actionHistory!.at(-1)?.pending, undefined)
  const cleared = recordAction(replaced, enter(replaced, [0], 'value', 0))
  assert.deepEqual(cleared.actionHistory!.at(-1)?.changes, [{ kind: 'entry', cell: 0, before: 4, after: 0 }])
})

test('a removal only counts after it disappears from both note layouts', () => {
  const base = notes()
  const both = enter(base, [0], 'center', 3)
  const oneLayout = enter(both, [0], 'corner', 3)
  assert.equal(recordAction(both, oneLayout).actionHistory, undefined)
  assert.deepEqual(recordAction(oneLayout, enter(oneLayout, [0], 'center', 3)).actionHistory![0].changes,
    [{ kind: 'candidate', cell: 0, digit: 3, added: false }])
})

test('the debounce window extends with each removal and closes at another action', () => {
  const first = entry(0, 1000)
  const second = entry(1, 2500)
  const third = entry(2, 4000)
  assert.deepEqual(pendingActionBatch([first, second, third], 4100), { entries: [first, second, third], delay: 1900 })
  const later = entry(3, third.at + ACTION_GROUP_DELAY + 1)
  assert.deepEqual(pendingActionBatch([first, second, third, later], later.at), { entries: [first, second, third], delay: 0 })
  const addition = { ...entry(3, 2600), pending: undefined, changes: [{ kind: 'candidate' as const, cell: 3, digit: 3, added: true }] }
  assert.deepEqual(pendingActionBatch([first, second, addition, third], 4100), { entries: [first, second], delay: 0 })
  assert.equal(pendingActionBatch([], 0), null)
})

test('matching requires one proof for every removal, not just the same technique name', async () => {
  const first = entry(0, 1000)
  const second = entry(1, 2500)
  const proofs = [first, second].map((entry) => ({ technique: 'naked-pair', actions: deductionActions(entry.changes) }))
  const match = async (_: unknown, actions: Parameters<typeof matchingTechnique>[0]) => matchingTechnique(actions, proofs)
  assert.equal(matchingTechnique(deductionActions([...first.changes, ...second.changes]), proofs), null)
  const split = await matchActionBatch([first, second], match)
  assert.equal(split.length, 2)
  assert.ok(split.every((item) => item.technique === 'naked-pair' && !item.pending))
  const together = await matchActionBatch([first, second], async (_, actions) => matchingTechnique(actions, [
    { technique: 'naked-pair', actions: deductionActions([...first.changes, ...second.changes]) },
  ]))
  assert.equal(together.length, 1)
  assert.equal(together[0].id, first.id)
  assert.equal(together[0].lastAt, second.at)
  assert.deepEqual(together[0].changes, [...first.changes, ...second.changes])
})

test('a matching run stays grouped when an unrelated removal follows it', async () => {
  const entries = [entry(0, 1000), entry(1, 2000), entry(2, 3000)]
  const actions = deductionActions([...entries[0].changes, ...entries[1].changes])
  const result = await matchActionBatch(entries, async (_, wanted) => matchingTechnique(wanted, [{ technique: 'pointing', actions }]))
  assert.equal(result.length, 2)
  assert.equal(result[0].changes.length, 2)
  assert.equal(result[0].technique, 'pointing')
  assert.equal(result[1].technique, null)
})

test('a dependent later removal is checked against its own original board', async () => {
  const first = remove()
  const second = remove(first, 1, 3, 2000)
  const entries = second.actionHistory!
  const snapshots: unknown[] = []
  const matched = await matchActionBatch(entries, async (snapshot, actions) => {
    snapshots.push(snapshot)
    return actions.length === 1 ? 'pointing' : null
  })
  assert.equal(matched.length, 2)
  assert.equal(snapshots.at(-1), entries[1].pending)
  assert.notDeepEqual(entries[0].pending, entries[1].pending)
})

test('failed classification retains every action without claiming there was no match', async () => {
  const entries = [entry(0, 1000), entry(1, 2000)]
  const result = await matchActionBatch(entries, async () => { throw new Error('engine unavailable') })
  assert.equal(result.length, 2)
  assert.deepEqual(result.map((item) => item.changes), entries.map((item) => item.changes))
  assert.ok(result.every((item) => item.matchFailed && item.technique === undefined && !item.pending))
})

test('drag removals record only new changes and keep the original undo stroke', () => {
  const initial = notes()
  const first = recordAction(initial, paintCandidateStroke(initial, initial, [0, 1], 'candidate', 3, 'remove'))
  const second = recordAction(first, paintCandidateStroke(first, initial, [0, 1, 2], 'candidate', 3, 'remove'))
  assert.equal(second.actionHistory?.length, 2)
  assert.deepEqual(second.actionHistory![1].changes, [{ kind: 'candidate', cell: 2, digit: 3, added: false }])
  assert.equal(second.past.length, initial.past.length + 1)
})

test('undo and redo are separate history entries, and restart clears the attempt', () => {
  const removed = remove()
  const undone = recordAction(removed, undo(removed), 'undo', { at: 1500 })
  const redone = recordAction(undone, redo(undone), 'redo', { at: 1700 })
  assert.deepEqual(redone.actionHistory!.map((entry) => entry.kind), ['edit', 'undo', 'redo'])
  assert.equal(pendingActionBatch(redone.actionHistory!, 1800)?.entries.length, 1)
  assert.equal(restartGame(redone).actionHistory, undefined)
})

test('late classification cannot overwrite a restarted or replaced history', async () => {
  const game = remove()
  const entries = game.actionHistory!
  const matched = await matchActionBatch(entries, async () => 'pointing')
  const updated = applyActionMatches(game, entries, matched)
  assert.equal(updated.actionHistory![0].technique, 'pointing')
  assert.equal(applyActionMatches(updated, entries, matched), updated)
  const restarted = restartGame(game)
  assert.equal(applyActionMatches(restarted, entries, matched), restarted)
})

test('pending and completed history can be saved, and corrupt history is rejected', () => {
  const pending = entry(0, 1000)
  const completed: ActionHistoryEntry = { ...entry(1, 2000), pending: undefined, technique: null }
  assert.equal(validActionHistory(JSON.parse(JSON.stringify([pending, completed]))), true)
  for (const corrupt of [null, {}, [null], [{ ...pending, pending: { values: 'bad' } }],
    [{ ...pending, changes: [{ kind: 'candidate', cell: 81, digit: 3, added: false }] }]]) {
    assert.equal(validActionHistory(corrupt), false)
  }
})
