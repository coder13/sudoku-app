import { ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { cellReference } from '../sudoku/hints'
import { houseName } from '../sudoku/lesson-diagram'
import { Button, IconButton } from './Button'
import { SelectControl } from './SelectControl'
import type { useSubsets } from './useSubsets'

const houses = ['Row', 'Column', 'Box']
const subsetNames = ['', '', 'pair', 'triple', 'quadruple']

/** Inspect candidate locations or selected cells in one row, column, or box during play. */
export function SubsetsPanel({ tool, size, unavailable, regionLabel = 'Box' }: {
  tool: ReturnType<typeof useSubsets>; size: number; unavailable?: string; regionLabel?: string
}) {
  const { kind, house, houseIndex, locations, emptyCells, picks, digits, clue } = tool
  const nameCell = (cell: number) => cellReference(cell, 'concise', undefined, size)
  const activeHouse = houseName(house).replace('box', regionLabel.toLowerCase())
  return <section className="subsets-panel" aria-label="Subsets">
    <div className="subset-controls">
      <div className="subset-kind" role="group" aria-label="Subset type">
        <Button aria-pressed={kind === 'hidden'} onClick={() => tool.chooseKind('hidden')}>Hidden</Button>
        <Button aria-pressed={kind === 'naked'} onClick={() => tool.chooseKind('naked')}>Naked</Button>
      </div>
      <label>House
        <SelectControl aria-label="House" value={houseIndex} onChange={(event) => tool.chooseHouse(Number(event.target.value))}>
          {houses.map((label, group) => <optgroup key={label} label={group === 2 ? regionLabel : label}>
            {Array.from({ length: size }, (_, offset) => <option key={offset} value={group * size + offset}>
              {group === 2 ? regionLabel : label} {offset + 1}
            </option>)}
          </optgroup>)}
        </SelectControl>
      </label>
    </div>
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <p>{kind === 'hidden' ? 'Select digits to compare where they can go.' : 'Select cells to see which digits they contain.'}</p>
      <div className={`subset-items${kind === 'hidden' && size === 9 ? ' subset-digits' : ''}`} role="group" aria-label={kind === 'hidden' ? 'Digits in this house' : 'Empty cells in this house'}>
        {kind === 'hidden' ? locations.map((cells, i) => <Button key={i} disabled={!cells.length}
          aria-pressed={picks.includes(i + 1)} aria-label={`Digit ${i + 1}, ${cells.length} ${cells.length === 1 ? 'cell' : 'cells'}`}
          onClick={() => tool.toggle(i + 1)}>{i + 1}<small>{cells.length}</small></Button>)
          : emptyCells.map((cell) => <Button key={cell} aria-pressed={picks.includes(cell)} onClick={() => tool.toggle(cell)}>{nameCell(cell)}</Button>)}
      </div>
      {emptyCells.length === 0 && <p>This house is complete.</p>}
      {picks.length > 0 && <p role="status" className="subset-selection">
        {kind === 'hidden' ? `${picks.length} selected · ${new Set(picks.flatMap((digit) => locations[digit - 1])).size} possible cells`
          : `${picks.length} ${picks.length === 1 ? 'cell' : 'cells'} · ${digits.length} ${digits.length === 1 ? 'digit' : 'digits'} (${digits.join(', ')})`}
      </p>}
      <div className="subset-clue">
        {clue.total === undefined ? <Button disabled={emptyCells.length < 3} onClick={clue.find}><Eye size={15} aria-hidden="true" /> Find a subset</Button>
          : <>
            <div className="subset-clue-header" role="status">
              <strong>{clue.match ? `${kind === 'hidden' ? 'Hidden' : 'Naked'} ${subsetNames[clue.match.digits.length]} in ${activeHouse}`
                : `No ${kind} subset with removals in ${activeHouse}.`}</strong>
              {clue.total > 1 && <span className="subset-match-nav">
                <IconButton variant="quiet" aria-label="Previous subset" onClick={() => clue.selectMatch(-1)}><ChevronLeft size={16} /></IconButton>
                {clue.index + 1} / {clue.total}
                <IconButton variant="quiet" aria-label="Next subset" onClick={() => clue.selectMatch(1)}><ChevronRight size={16} /></IconButton>
              </span>}
            </div>
            {clue.stage === 'removals' && <p>{kind === 'hidden' ? 'Remove the crossed-out candidates inside the subset.'
              : 'Remove the crossed-out candidates elsewhere in the house.'}</p>}
            <div className="subset-clue-actions">
              {clue.match && clue.stage !== 'removals' && <Button onClick={clue.advance}>{clue.stage === 'location' ? 'Show pattern' : 'Show removals'}</Button>}
              <Button variant="quiet" onClick={clue.clear}>Clear clue</Button>
            </div>
          </>}
      </div>
    </>}
  </section>
}
