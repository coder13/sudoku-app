import { memo, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from '../../../src/components/Board'
import { BoardMarks, type BoardMark } from '../../../src/components/BoardMarks'
import {
  DIGITS, candidateClass, candidateGridArea, cellInputs, describeCell, noopCell,
  type BoardAdapter, type BoardState, type CellInput,
} from './model'

const NO_MARKS: BoardMark[] = []

function CurrentBoard({ state }: { state: BoardState }) {
  return <Board
    givens={state.givens}
    values={state.values}
    position={{ center: state.center, corner: state.corner, colors: state.colors, candidateColors: state.candidateColors }}
    selected={state.selected}
    active={state.active}
    highlightedDigit={state.highlightedDigit}
    showGuides
    onCell={noopCell}
    dragSelect
    label="Sudoku grid"
  />
}

/** Only the classic grid-note branch is copied into this experiment. */
const MemoCell = memo(function MemoCell(cell: CellInput) {
  const { index, value, mask, candidateColors, focusDigit } = cell
  const row = Math.floor(index / 9) + 1
  const column = index % 9 + 1
  const description = describeCell(cell)
  // Keep mark identity stable when only selection, focus, or cell fill changes.
  // BoardMarks is the same fade/exit implementation as the production board.
  const candidateItems = useMemo(() => value ? NO_MARKS : description.digits.map(digit =>
    <span key={digit} className={candidateClass(cell, digit)} style={{ gridArea: candidateGridArea(digit) }}>{digit}</span>),
  [value, mask, candidateColors, focusDigit])
  const valueItems = useMemo(() => value
    ? [<span className="cell-value" key={value} aria-hidden="true">{value}</span>] : NO_MARKS, [value])

  return <button
    role="gridcell"
    data-cell={index}
    className={description.className}
    aria-label={description.label}
    data-box-edge={column % 3 === 0 || undefined}
    data-alternate-box={(Math.floor((row - 1) / 3) + Math.floor((column - 1) / 3)) % 2 === 1 || undefined}
    type="button"
    tabIndex={cell.active ? 0 : -1}
    aria-selected={cell.selected}
    onClick={noopCell}
  >
    <BoardMarks items={candidateItems} group={<span className="candidate-marks" aria-hidden="true" />} />
    <BoardMarks items={valueItems} />
  </button>
})

function MemoBoard({ state }: { state: BoardState }) {
  const cells = cellInputs(state)
  return <div className="board-frame">
    <div className="col-labels" aria-hidden="true">{DIGITS.map(digit => <span key={digit}>{digit}</span>)}</div>
    <div className="row-labels" aria-hidden="true">{DIGITS.map(digit => <span key={digit}>{digit}</span>)}</div>
    <div className="board-body">
      <div className="sudoku-grid drag-select" role="grid" aria-label="Sudoku grid">
        {DIGITS.map(row => <div className="grid-row" role="row" data-box-edge={row % 3 === 0 || undefined} key={row}>
          {DIGITS.map(column => {
            const index = (row - 1) * 9 + column - 1
            return <MemoCell key={index} {...cells[index]} />
          })}
        </div>)}
      </div>
    </div>
  </div>
}

function mountReact(container: HTMLElement, initial: BoardState, view: (state: BoardState) => ReactNode): BoardAdapter {
  const root = createRoot(container)
  let latest = initial
  let setCurrent: ((state: BoardState) => void) | undefined
  let disposed = false

  function Host() {
    const [state, setState] = useState(() => latest)
    setCurrent = setState
    return view(state)
  }

  root.render(<Host />)
  return {
    update(state) {
      if (disposed) return
      latest = state
      // Preserve normal React event scheduling. No synchronous flush is used.
      setCurrent?.(state)
    },
    dispose() {
      if (disposed) return
      disposed = true
      setCurrent = undefined
      root.unmount()
    },
  }
}

export function mountCurrentReact(container: HTMLElement, initial: BoardState): BoardAdapter {
  return mountReact(container, initial, state => <CurrentBoard state={state} />)
}

export function mountMemoReact(container: HTMLElement, initial: BoardState): BoardAdapter {
  return mountReact(container, initial, state => <MemoBoard state={state} />)
}
