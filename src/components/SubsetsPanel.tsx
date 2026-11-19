import { ChevronLeft, ChevronRight, Columns3, Eye, Grid2X2, Rows3 } from 'lucide-react'
import { houseName } from '../sudoku/lesson-diagram'
import { SUBSET_SCOPES } from '../sudoku/subsets'
import { Button, IconButton } from './Button'
import type { useSubsets } from './useSubsets'

const subsetNames = ['', '', 'pair', 'triple', 'quadruple']
const scopeIcons = { row: Rows3, column: Columns3, box: Grid2X2 }

/** Inspect the grid selection and reveal a subset clue on request. */
export function SubsetsPanel({ tool, size, unavailable, regionLabel = 'Box' }: {
  tool: ReturnType<typeof useSubsets>; size: number; unavailable?: string; regionLabel?: string
}) {
  const { kind, house, houses, scope, locations, emptyCells, picks, digits, clue } = tool
  const labels = { row: 'Row', column: 'Column', box: regionLabel }
  const activeHouse = house && houseName(house).replace('box', regionLabel.toLowerCase())
  return <section className="subsets-panel" aria-label="Subsets">
    <div className="subset-kind" role="group" aria-label="Subset type">
      <Button aria-pressed={kind === 'hidden'} onClick={() => tool.chooseKind('hidden')}>Hidden</Button>
      <Button aria-pressed={kind === 'naked'} onClick={() => tool.chooseKind('naked')}>Naked</Button>
    </div>
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <p>{kind === 'naked' ? `Select cells that share a row, column, or ${regionLabel.toLowerCase()}.`
        : house ? 'Select digits to compare where they can go.'
        : `Tap a cell to select its ${labels[scope].toLowerCase()}. Drag along a row or column to select it.`}</p>
      <div className="subset-scope" role="group" aria-label="Grid area">
        {SUBSET_SCOPES.map((choice) => {
          const Icon = scopeIcons[choice]
          const target = houses[choice]
          const label = target ? houseName(target).split(' ').at(-1) : undefined
          return <Button key={choice} variant="quiet" aria-pressed={scope === choice}
            disabled={kind === 'naked' && !!house && !target}
            onClick={() => tool.chooseScope(choice)}>
            <Icon size={16} aria-hidden="true" /> {labels[choice]}{label && ` ${label}`}
          </Button>
        })}
      </div>
      {kind === 'hidden' && house && emptyCells.length > 0 && <div className={`subset-items${size === 9 ? ' subset-digits' : ''}`}
        role="group" aria-label={`Digits in ${activeHouse}`}>
        {locations.map((cells, i) => <Button key={i} disabled={!cells.length}
          aria-pressed={picks.includes(i + 1)} aria-label={`Digit ${i + 1}, ${cells.length} ${cells.length === 1 ? 'cell' : 'cells'}`}
          onClick={() => tool.toggleDigit(i + 1)}>{i + 1}<small>{cells.length}</small></Button>)}
      </div>}
      {house && emptyCells.length === 0 && <p>This {labels[scope].toLowerCase()} is complete.</p>}
      {picks.length > 0 && <p role="status" className="subset-selection">
        {kind === 'hidden' ? `${picks.length} selected · ${new Set(picks.flatMap((digit) => locations[digit - 1])).size} possible cells`
          : `${picks.length} ${picks.length === 1 ? 'cell' : 'cells'} · ${digits.length} ${digits.length === 1 ? 'digit' : 'digits'} (${digits.join(', ')})`}
      </p>}
      {house && <div className="subset-clue">
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
      </div>}
    </>}
  </section>
}
