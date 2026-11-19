import { ChevronDown, History } from 'lucide-react'
import type { ActionChange, ActionHistoryEntry } from '../sudoku/action-history'
import { formatTime, type Game } from '../sudoku/game'
import { cellReference, techniqueLabel, type CellReferenceStyle } from '../sudoku/hints'

function actionTitle(entry: ActionHistoryEntry) {
  if (entry.kind === 'singles') {
    const count = entry.changes.filter((change) => change.kind === 'entry' && change.after > 0).length
    return `Filled ${count} single${count === 1 ? '' : 's'}`
  }
  if (entry.technique) return techniqueLabel(entry.technique)
  const labels = { undo: 'Undo', redo: 'Redo', candidates: 'Filled candidates', hint: 'Applied hint', recovery: 'Restored candidate' }
  if (entry.kind !== 'edit') return labels[entry.kind]
  const placements = entry.changes.filter((change) => change.kind === 'entry')
  if (placements.length) {
    const cleared = placements.every((change) => change.after === 0)
    const replaced = placements.some((change) => change.before > 0 && change.after > 0)
    return `${cleared ? 'Cleared' : replaced ? 'Changed' : 'Placed'} ${placements.length} digit${placements.length === 1 ? '' : 's'}`
  }
  const added = entry.changes.every((change) => change.kind === 'candidate' && change.added)
  const removed = entry.changes.every((change) => change.kind === 'candidate' && !change.added)
  return `${added ? 'Added' : removed ? 'Removed' : 'Changed'} ${entry.changes.length} candidate${entry.changes.length === 1 ? '' : 's'}`
}

function changeDetails(changes: readonly ActionChange[], style: CellReferenceStyle, difficulty: Game['difficulty'], gridSize: number) {
  const cells = new Map<number, string[]>()
  for (const change of changes) {
    const text = change.kind === 'candidate' ? `${change.added ? '+' : '−'}${change.digit}`
      : change.after === 0 ? `cleared ${change.before}` : change.before === 0 ? String(change.after) : `${change.before} → ${change.after}`
    cells.set(change.cell, [...(cells.get(change.cell) ?? []), text])
  }
  return [...cells].map(([cell, edits]) => `${cellReference(cell, style, difficulty ?? undefined, gridSize)}: ${edits.join(', ')}`).join(' · ')
}

function actionDetails(entry: ActionHistoryEntry, style: CellReferenceStyle, difficulty: Game['difficulty'], gridSize: number) {
  if (entry.kind === 'candidates') return null
  if (entry.kind !== 'singles') return changeDetails(entry.changes, style, difficulty, gridSize)
  const singles = entry.changes.filter((change) => change.kind === 'entry' && change.after > 0)
  const details = changeDetails(singles.slice(0, 3), style, difficulty, gridSize)
  return singles.length > 3 ? `${details} · and ${singles.length - 3} more` : details
}

export function ActionHistoryPanel({ entries = [], cellReferenceStyle = 'concise', difficulty, gridSize = 9 }: {
  entries?: readonly ActionHistoryEntry[]
  cellReferenceStyle?: CellReferenceStyle
  difficulty?: Game['difficulty']
  gridSize?: number
}) {
  return <details className="completion-techniques action-history">
    <summary>
      <span className="completion-techniques-title"><History size={16} aria-hidden="true" /><strong>Action history</strong></span>
      <small>{entries.length} {entries.length === 1 ? 'step' : 'steps'}</small>
      <ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="completion-techniques-panel">
      {entries.length === 0 ? <p>No actions were recorded for this solve.</p>
        : <ol aria-label="Solve actions">{entries.map((entry, index) => {
          const details = actionDetails(entry, cellReferenceStyle, difficulty, gridSize)
          return <li key={entry.id}>
            <div className="action-history-heading">
              <strong className={entry.technique ? 'action-history-technique' : undefined}><span className="action-history-number">{index + 1}.</span> {actionTitle(entry)}</strong>
              <span className="action-history-time" aria-label={`Solve time ${formatTime(entry.elapsed)}`}>{formatTime(entry.elapsed)}</span>
            </div>
            {entry.pending ? <small>Matching technique…</small>
              : entry.matchFailed ? <small>Technique check unavailable</small>
              : entry.technique === null ? <small>No matching technique</small> : null}
            {details && <small className="action-history-changes">{details}</small>}
          </li>
        })}</ol>}
    </div>
  </details>
}
