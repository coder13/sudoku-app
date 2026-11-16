import type { MouseEvent, RefObject } from 'react'
import { Play } from 'lucide-react'
import { COLORS, DIGITS, marksOf, peer, type Game } from '../sudoku/game'

type Props = {
  game: Game
  values: string
  conflicts: Set<number>
  selected: number[]
  active: number
  boardRef: RefObject<HTMLDivElement | null>
  onCell: (index: number, event: MouseEvent) => void
  onResume: () => void
}

const cornerPositions = [0, 2, 6, 8, 1, 7, 3, 5, 4]

export function Board({ game, values, conflicts, selected, active, boardRef, onCell, onResume }: Props) {
  const focusValue = selected.includes(active) ? values[active] : ''
  const paused = game.source !== 'draft' && game.paused
  return (
    <div className="board-frame">
      <div className="col-labels" aria-hidden="true">{DIGITS.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="row-labels" aria-hidden="true">{DIGITS.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="board-body">
        <div className="sudoku-grid" role="grid" aria-label="Sudoku grid" aria-hidden={paused || undefined} ref={boardRef}>
          {DIGITS.map((row) => (
            <div className="grid-row" role="row" key={row}>
              {DIGITS.map((col) => {
                const index = (row - 1) * 9 + col - 1
                const value = Number(values[index])
                const fixed = game.givens[index] !== '0'
                const center = marksOf(game.position.center[index])
                const corner = marksOf(game.position.corner[index])
                const color = game.position.colors[index]
                const inSelection = selected.includes(index)
                const conflict = conflicts.has(index)
                const label = [
                  `Row ${row}, column ${col}`,
                  value ? (fixed ? `given ${value}` : String(value)) : 'empty',
                  !value && center.length ? `center notes ${center.join(' ')}` : '',
                  !value && corner.length ? `corner notes ${corner.join(' ')}` : '',
                  color ? COLORS[color - 1] : '',
                  conflict ? 'conflict' : '',
                ].filter(Boolean).join(', ')
                const classes = [
                  'cell',
                  fixed ? 'given' : 'entry',
                  selected.some((cell) => peer(index, cell)) ? 'peer' : '',
                  value && String(value) === focusValue ? 'matching' : '',
                  color ? `colored color-${color}` : '',
                  conflict ? 'conflict' : '',
                  inSelection ? 'selected' : '',
                ].join(' ')
                return (
                  <button type="button" role="gridcell" key={col} data-cell={index} className={classes} tabIndex={active === index && !paused ? 0 : -1}
                    aria-label={label} aria-selected={inSelection} onClick={(event) => onCell(index, event)} disabled={paused}>
                    {value ? <span aria-hidden="true">{value}</span> : (
                      <>
                        {corner.length > 0 && (
                          <span className="corner-marks" aria-hidden="true">
                            {corner.map((digit, i) => {
                              const position = cornerPositions[i]
                              return <span key={digit} style={{ gridArea: `${Math.floor(position / 3) + 1} / ${position % 3 + 1}` }}>{digit}</span>
                            })}
                          </span>
                        )}
                        {center.length > 0 && (
                          <span className="center-marks" aria-hidden="true">
                            {center.slice(0, 5).join('')}{center.length > 5 && <><br />{center.slice(5).join('')}</>}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {paused && (
          <div className="paused-board">
            <button className="button primary" onClick={onResume}><Play size={17} /> Resume puzzle</button>
          </div>
        )}
      </div>
    </div>
  )
}
