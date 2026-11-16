import type { MouseEvent, RefObject } from 'react'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Game } from '../sudoku/game'

type Props = {
  game: Game
  values: string
  errors: Set<number>
  candidateLayout: CandidateLayout
  showGuides: boolean
  highlightedDigit: number | null
  highlightCandidateCount?: number | null
  selected: number[]
  active: number
  boardRef: RefObject<HTMLDivElement | null>
  onCell: (index: number, event: MouseEvent) => void
}

export function Board({ game, values, errors, candidateLayout, showGuides, highlightedDigit, highlightCandidateCount, selected, active, boardRef, onCell }: Props) {
  const focusValue = selected.includes(active) ? values[active] : highlightedDigit ? String(highlightedDigit) : ''
  return (
    <div className={`board-frame ${showGuides ? '' : 'guides-hidden'}`}>
      {showGuides && <div className="col-labels" aria-hidden="true">{DIGITS.map((n) => <span key={n}>{n}</span>)}</div>}
      {showGuides && <div className="row-labels" aria-hidden="true">{DIGITS.map((n) => <span key={n}>{n}</span>)}</div>}
      <div className="board-body">
        <div className="sudoku-grid" role="grid" aria-label="Sudoku grid" ref={boardRef}>
          {DIGITS.map((row) => (
            <div className="grid-row" role="row" key={row}>
              {DIGITS.map((col) => {
                const index = (row - 1) * 9 + col - 1
                const value = Number(values[index])
                const fixed = game.givens[index] !== '0'
                const candidateMask = game.position.center[index] | game.position.corner[index]
                const centerCandidates = marksOf(game.position.center[index])
                const cornerCandidates = marksOf(game.position.corner[index])
                const gridCandidates = marksOf(candidateMask)
                const color = game.position.colors[index]
                const inSelection = selected.includes(index)
                const error = errors.has(index)
                const candidateMatches = !value && highlightedDigit != null && hasCandidate(candidateMask, highlightedDigit)
                const candidateCountMatches = !value && highlightCandidateCount != null && candidateCount(candidateMask) === highlightCandidateCount
                const label = [
                  `Row ${row}, column ${col}`,
                  value ? (fixed ? `given ${value}` : String(value)) : 'empty',
                  !value && candidateLayout === 'grid' && gridCandidates.length ? `candidates ${gridCandidates.join(' ')}` : '',
                  !value && candidateLayout === 'center-corner' && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
                  !value && candidateLayout === 'center-corner' && cornerCandidates.length ? `corner candidates ${cornerCandidates.join(' ')}` : '',
                  color ? COLORS[color - 1] : '',
                  candidateMatches ? `candidate ${highlightedDigit} highlighted` : '',
                  candidateCountMatches ? `${highlightCandidateCount}-candidate cell highlighted` : '',
                  error ? 'incorrect' : '',
                ].filter(Boolean).join(', ')
                const classes = [
                  'cell',
                  fixed ? 'given' : 'entry',
                  selected.some((cell) => peer(index, cell)) ? 'peer' : '',
                  (value && String(value) === focusValue) || candidateMatches ? 'matching' : '',
                  candidateCountMatches ? 'candidate-count-match' : '',
                  color ? `colored color-${color}` : '',
                  error ? 'conflict' : '',
                  inSelection ? 'selected' : '',
                ].join(' ')
                return (
                  <button type="button" role="gridcell" key={col} data-cell={index} className={classes} tabIndex={active === index ? 0 : -1}
                    aria-label={label} aria-selected={inSelection} onClick={(event) => onCell(index, event)}>
                    {value ? <span aria-hidden="true">{value}</span> : (
                      <>
                        {candidateLayout === 'grid' && gridCandidates.length > 0 && (
                          <span className="candidate-marks" aria-hidden="true">
                            {gridCandidates.map((digit) => (
                              <span key={digit} className={digit === highlightedDigit ? 'candidate-match' : undefined} style={{ gridArea: `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}` }}>{digit}</span>
                            ))}
                          </span>
                        )}
                        {candidateLayout === 'center-corner' && cornerCandidates.length > 0 && (
                          <span className="candidate-marks" aria-hidden="true">
                            {cornerCandidates.map((digit) => (
                              <span key={digit} className={digit === highlightedDigit ? 'candidate-match' : undefined} style={{ gridArea: `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}` }}>{digit}</span>
                            ))}
                          </span>
                        )}
                        {candidateLayout === 'center-corner' && centerCandidates.length > 0 && (
                          <span className="center-marks" aria-hidden="true">{centerCandidates.map((digit) => <span key={digit} className={digit === highlightedDigit ? 'candidate-match' : undefined}>{digit}</span>)}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
