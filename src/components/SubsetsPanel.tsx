import { Button } from './Button'

/** Summarize the candidate comparison for the cells selected on the grid. */
export function SubsetsPanel({ count, digits, onClear, unavailable }: {
  count: number
  digits: readonly number[]
  onClear: () => void
  unavailable?: string
}) {
  return <section className="subsets-panel" aria-label="Subsets">
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <p>Select an empty cell. Select more cells to compare their candidates.</p>
      {count > 0 && <div className="subset-summary">
        <p role="status">
          {digits.length ? `${count === 1 ? 'Candidates' : 'Common candidates'} ${digits.join(', ')}`
            : count === 1 ? 'This cell has no candidates.' : 'These cells have no candidates in common.'}
        </p>
        <Button variant="quiet" aria-label="Clear subset selection" onClick={onClear}>Clear selection</Button>
      </div>}
    </>}
  </section>
}
