import { Eye } from 'lucide-react'
import { branchLetter, requiredBranchFacts, sameBranchOrigin,
  type BranchAnalysis, type BranchConflict, type BranchFact, type BranchMove, type SavedBranch } from '../sudoku/branches'
import type { HintTrace } from '../sudoku/engine'
import { cellName } from '../sudoku/lesson-diagram'
import { Button } from './Button'
import { CellReferenceText } from './CellReferenceHighlight'
import { ProofTrace } from './ProofTrace'
import { SketchActionsMenu } from './SketchActionsMenu'
import { ToolItemCard } from './ToolItemCard'
import { branchColor, type usePlayBranches } from './play/usePlayBranches'

const condition = ({ cell, digit, truth }: BranchMove) => `If ${cellName(cell)} is ${truth ? '' : 'not '}${digit}`
const action = ({ cell, digit, truth }: BranchMove) => truth ? `Place ${digit} in ${cellName(cell)}` : `Remove ${digit} from ${cellName(cell)}`

function conflictText(conflict: BranchConflict, facts: readonly BranchFact[]) {
  if (conflict.type === 'cell') return `${cellName(conflict.cell)} has no candidates.`
  if (conflict.type === 'house') return `There is no place for ${conflict.digit} in ${conflict.house.name}.`
  for (const index of conflict.causes) {
    const loss = facts[index]
    if (loss.reason?.type === 'house') {
      const source = facts[loss.causes[0]]
      return `Placing ${source.digit} in ${cellName(source.cell)} rules out ${loss.digit} in ${cellName(loss.cell)} because the cells share ${loss.reason.house.name}.`
    }
  }
  return `This branch both places and rules out ${conflict.move.digit} in ${cellName(conflict.move.cell)}.`
}

function factText(fact: BranchFact, facts: readonly BranchFact[]) {
  if (fact.kind === 'trial') return `${action(fact)} as a trial edit.`
  if (fact.kind === 'single') return `${action(fact)}. ${fact.reason?.type === 'house' ?
    `It is the only place for ${fact.digit} in ${fact.reason.house.name}.` : `It is the only candidate left in ${cellName(fact.cell)}.`}`
  const placed = facts[fact.causes[0]]
  const where = fact.reason?.type === 'house' ? ` because the cells share ${fact.reason.house.name}`
    : fact.reason?.type === 'cell' ? ' because the cell already has a digit' : ' under the puzzle rules'
  return `If ${cellName(placed.cell)} is ${placed.digit}, it rules out ${fact.digit} in ${cellName(fact.cell)}${where}.`
}

function traceCase(branch: SavedBranch, analysis: BranchAnalysis, roots: readonly number[], conclusion: string): HintTrace[number] {
  const facts = requiredBranchFacts(analysis.facts, roots).map(index => analysis.facts[index])
  return { assumption: `Branch ${branchLetter(branch.number)} · ${condition(analysis.moves[0])}`,
    steps: facts.filter(fact => fact.kind !== 'assumption').map(fact => factText(fact, analysis.facts)),
    conclusion: analysis.conflict ? conflictText(analysis.conflict, analysis.facts) : conclusion }
}

/** Start a trial using Play's Digits panel, or review saved branches and compare their outcomes. */
export function BranchesPanel({ model, disabled, applyKey, onApply, retryCandidates }: {
  model: ReturnType<typeof usePlayBranches>; disabled: boolean; applyKey: string; onApply: () => void; retryCandidates?: () => void;
}) {
  const { view, editing, selected, entries, differences, checked, shown } = model
  const compare = view.kind === 'compare' && view.all
  const traceBranch = !compare && selected?.analysis.moves.length ? selected.branch : undefined
  const eliminations = model.marks.filter(mark => mark.removed.length > 0)
  const finding = view.kind === 'compare' && !sameBranchOrigin(model.origin, selected?.branch.origin ?? model.origin)
    ? 'Proved at this earlier position' : 'Proved from the starting candidates'

  return <section className="branches-panel" aria-label="Branches" data-grid-click-away-exempt>
    <div className="tool-toolbar branch-toolbar">
      <Button variant="primary" aria-pressed={editing && !selected} disabled={disabled || !model.canCreate} onClick={model.begin}>New branch</Button>
      <Button variant="quiet" aria-pressed={compare} disabled={disabled || !compare && !model.sameOrigin.some(({ branch }) => !branch.hidden)}
        onClick={model.compare}>Compare branches</Button>
      <Button variant="primary" className="apply-branch-edits" disabled={disabled || !model.applyEdits}
        title={`Apply proved branch deductions (${applyKey})`} aria-keyshortcuts={applyKey} onClick={onApply}>Apply edits</Button>
      <div className="branch-panel-display-actions">
        <SketchActionsMenu label="Branch display options" actions={[
          { label: 'Show eliminations', icon: Eye, disabled, toggle: true, checked: shown, run: model.toggleEliminations },
        ]} />
      </div>
    </div>
    {!editing && model.unavailable && <div><p role="status">{model.unavailable}</p>
      {retryCandidates && <Button variant="quiet" onClick={retryCandidates}>Retry candidates</Button>}
    </div>}
    {traceBranch && <div className="tool-toolbar branch-toolbar">
      <Button variant="quiet" aria-pressed={Boolean(traceBranch.trace)}
        onClick={() => model.toggleTrace(traceBranch)}>Trace consequences</Button>
    </div>}
    {entries.length > 0 && <ul className="tool-item-list" aria-label="Saved branches">
      {entries.map(({ branch, analysis }) => {
        const name = `Branch ${branchLetter(branch.number)}`
        const changes = analysis.moves
        const placements = changes.filter(move => move.truth).length
        const removals = changes.length - placements
        const summary = changes.length === 1 ? action(changes[0]) : changes.length ? [
          placements ? `${placements} placement${placements === 1 ? '' : 's'}` : '',
          removals ? `${removals} removal${removals === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' · ') : undefined
        const typeLabel = analysis.conflict ? 'Contradiction' : !sameBranchOrigin(model.origin, branch.origin) ? 'Earlier position' : undefined
        const selected = model.selected?.branch.id === branch.id
        const editingThis = editing && selected
        const failure = analysis.conflict
        const usesTrial = failure && requiredBranchFacts(analysis.facts, failure.causes).some(index => analysis.facts[index].kind === 'trial')
        return <ToolItemCard key={branch.id} name={name} typeLabel={typeLabel} colors={[branchColor(branch.number)]}
          selected={selected} hidden={branch.hidden} onSelect={() => changes.length ? model.selectBranch(branch) : model.toggleEdit(branch)}
          subtitle={summary ? { text: summary, description: summary } : undefined}
          edit={{ label: `Edit ${name.toLowerCase()}`, disabled, pressed: editingThis, onClick: () => model.toggleEdit(branch) }}
          visibility={{ label: `${branch.hidden ? 'Show' : 'Hide'} ${name.toLowerCase()} in comparison`, disabled,
            onClick: () => model.toggleVisibility(branch) }}
          remove={{ label: `Delete ${name.toLowerCase()}`, disabled, onClick: () => model.remove(branch) }}
          editor={changes.length > 1 || failure ? { label: `Moves in ${name.toLowerCase()}`, content: <>
            {changes.length > 1 && <ul className="branch-move-list" aria-label="Branch moves">
              {changes.map(move => <li key={`${move.cell}-${move.digit}-${move.truth}`}><CellReferenceText text={action(move)} /></li>)}
            </ul>}
            {failure && <>
              <p><CellReferenceText text={conflictText(failure, analysis.facts)} />{usesTrial && ' This depends on trial edits.'}</p>
              <ProofTrace summary="View contradiction" trace={[traceCase(branch, analysis, failure.causes, '')]} />
            </>}
          </> } : undefined}
        />
      })}
    </ul>}
    {compare && <small>Letters identify the branches that place each digit.{shown && ' A strike marks a removal in one or more shown branches.'}</small>}
    {differences.length > 0 && <details className="branch-results">
      <summary>Different outcomes ({differences.length})</summary>
      <ul>{differences.map(({ message }) => <li key={message}><CellReferenceText text={message} /></li>)}</ul>
    </details>}
    {shown && eliminations.length > 0 && <details className="branch-results">
      <summary>Eliminations ({eliminations.length})</summary>
      <ul>{eliminations.map(({ cell, digit }) => <li key={`${cell}-${digit}`}><CellReferenceText text={`${digit} in ${cellName(cell)}`} /></li>)}</ul>
    </details>}
    {checked.length > 0 && <section className="branch-proven-results" aria-label={finding}>
      <h3>{finding}</h3>
      <ul>{checked.map(({ move, kind, proof }) => <li key={`${move.cell}-${move.digit}-${move.truth}`}>
        <CellReferenceText text={action(move)} />
        <ProofTrace summary="View proof" trace={proof.map(({ branch, analysis, roots }) => traceCase(branch, analysis, roots,
          kind === 'shared' ? `This case supports the same result. ${action(move)}.` : ''))} />
      </li>)}</ul>
    </section>}
  </section>
}
