import { Eye, Layers, Link2, Plus } from 'lucide-react'
import { almostLockedSetColor } from '../sudoku/als-highlighting'
import { subsetDigits, type SubsetDescription, type SubsetMembershipProblem } from '../sudoku/subsets'
import { cellReference } from '../sudoku/hints'
import { Button, IconButton } from './Button'
import { CellReferenceText } from './CellReferenceHighlight'
import { SketchActionsMenu } from './SketchActionsMenu'
import { ToolItemCard } from './ToolItemCard'

export function subsetMembershipMessage(problem: SubsetMembershipProblem | undefined, size: number) {
  if (problem?.type === 'not-peers') return `${problem.cells.map(cell => cellReference(cell, 'concise', undefined, size)).join(' and ')} do not see each other.`
  if (problem?.type === 'unavailable') return 'Select empty, visible cells.'
  return undefined
}

function classification(set: SubsetDescription) {
  if (set.kind === 'locked') return 'Locked set'
  if (set.kind === 'als') return 'ALS'
  if (set.kind === 'surplus') return `ALS+${set.extra}`
  if (set.kind === 'peer') return (set.extra ?? 0) > 1 ? `Peer set (+${set.extra})` : 'Peer set'
  if (set.kind === 'invalid') return 'Invalid set'
  return 'Candidates unavailable'
}

type Props = {
  sets: readonly SubsetDescription[]
  gridSize: number
  selectedId: number | null
  highlightedIds: ReadonlySet<number>
  drawing: boolean
  disabled?: boolean
  applyEdits: { available: boolean; shortcut: string; run: () => void }
  eliminations: { shown: boolean; toggle: () => void }
  strongLinks: { shown: boolean; toggle: () => void }
  onStart: (id?: number) => void
  onFinish: () => void
  onSelect: (id: number) => void
  onToggleVisibility: (id: number) => void
  onRemove: (id: number) => void
}

/** Show saved subsets and the subset currently being edited on the grid. */
export function SubsetsPanel({
  sets, gridSize, selectedId, highlightedIds, drawing, disabled, applyEdits, eliminations, strongLinks,
  onStart, onFinish, onSelect, onToggleVisibility, onRemove,
}: Props) {
  const nameCell = (cell: number) => cellReference(cell, 'concise', undefined, gridSize)
  const drawLabel = drawing ? 'Done editing subsets' : 'Draw subsets'
  return <section className="subsets-panel" aria-label="Subsets" data-grid-click-away-exempt>
    <div className="subset-panel-tools">
      <div className="subset-panel-primary-actions">
        <Button disabled={disabled || (drawing && selectedId === null)} onClick={() => onStart()}>
          <Plus size={15} aria-hidden="true" /> New subset
        </Button>
        <Button variant="primary" className="apply-subset-edits" disabled={!applyEdits.available}
          title={`Apply deductions from the shown subsets (${applyEdits.shortcut})`} aria-keyshortcuts={applyEdits.shortcut} onClick={applyEdits.run}>
          Apply edits
        </Button>
      </div>
      <div className="subset-panel-display-actions">
        <IconButton variant="quiet" aria-label={drawLabel} title={drawing ? `${drawLabel} (Esc)` : drawLabel}
          disabled={disabled} aria-pressed={drawing} aria-keyshortcuts={drawing ? 'Escape' : undefined}
          onClick={drawing ? onFinish : () => onStart()}>
          <Layers size={16} aria-hidden="true" />
        </IconButton>
        <SketchActionsMenu label="Subset display options" actions={[
          { label: 'Show eliminations', icon: Eye, disabled: false, toggle: true, checked: eliminations.shown, run: eliminations.toggle },
          { label: 'Show strong links', icon: Link2, disabled: false, toggle: true, checked: strongLinks.shown, run: strongLinks.toggle },
        ]} />
      </div>
    </div>
    <ul className="tool-item-list" aria-label="Subsets">
      {sets.map(set => {
        const name = `Set ${set.number}`
        const hidden = !highlightedIds.has(set.id)
        const editing = drawing && selectedId === set.id
        const digits = subsetDigits(set.digitMask, gridSize)
        return <ToolItemCard key={set.id} name={name} typeLabel={set.cells.length ? classification(set) : undefined}
          colors={[almostLockedSetColor(set.id - 1)]}
          subtitle={digits.length ? { text: digits.join(''), description: `Candidates ${digits.join(', ')}` } : undefined}
          selected={set.id === selectedId} hidden={hidden} onSelect={() => onSelect(set.id)}
          edit={{
            label: editing ? `Finish editing ${name}` : `Edit ${name}`,
            pressed: editing, disabled, onClick: editing ? onFinish : () => onStart(set.id),
          }}
          visibility={{ label: `${hidden ? 'Show' : 'Hide'} ${name}`, onClick: () => onToggleVisibility(set.id) }}
          remove={{ label: `Delete ${name}`, disabled, onClick: () => onRemove(set.id) }}
          editor={set.cells.length ? { label: `${name} details`, content: <>
            <span className="subset-details"><CellReferenceText text={set.cells.map(nameCell).join(', ')} gridSize={gridSize} /></span>
            {set.kind === 'invalid' && <p>{set.extra !== null && set.extra < 0
              ? 'This set has fewer candidates than cells.'
              : 'Every member must be an empty cell with candidates and see every other member.'}</p>}
          </> } : undefined}
        />
      })}
    </ul>
  </section>
}
