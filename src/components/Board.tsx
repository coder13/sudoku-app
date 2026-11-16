import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import type { Candidate } from '../sudoku/engine'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Position } from '../sudoku/game'
import { activeHighlightDigit } from '../sudoku/highlighting'
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from '../sudoku/preferences'
import { BoardLinks, type BoardAnnotations, type BoardRegion } from './BoardAnnotations'

type Props = {
  givens: string
  values: string
  position?: Pick<Position, 'center' | 'corner' | 'colors'>
  errors?: ReadonlySet<number>
  candidateLayout?: CandidateLayout
  candidates?: readonly number[]
  annotations?: BoardAnnotations
  region?: BoardRegion
  label?: string
  showGuides: boolean
  highlightedDigit?: number | null
  highlightCandidateCount?: number | null
  highlighting?: HighlightPreferences
  selected?: readonly number[]
  active?: number
  boardRef?: RefObject<HTMLDivElement | null>
  onCell?: (index: number, event: MouseEvent) => void
  onCandidate?: (candidate: Candidate) => void
  onCandidateHover?: (candidate: Candidate | null) => void
  isLinkTarget?: (candidate: Candidate) => boolean
  selectedCandidate?: Candidate
  dragSelect?: boolean
  onCellPointerDown?: (index: number, event: PointerEvent) => void
  onCellPointerMove?: (index: number, event: PointerEvent) => void
}

export function Board({
  givens, values, position, errors, candidateLayout = 'grid', candidates, annotations, region, label = 'Sudoku grid', showGuides,
  highlightedDigit, highlightCandidateCount, highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
  selected = [], active = 0, boardRef, onCell, onCandidate, onCandidateHover, isLinkTarget, selectedCandidate, dragSelect = false,
  onCellPointerDown, onCellPointerMove,
}: Props) {
  const [candidateFocus, setCandidateFocus] = useState<Candidate>()
  const focusDigit = activeHighlightDigit(values, selected, active, highlightedDigit)
  const Cell = onCell && !onCandidate ? 'button' : 'div'
  const layout = candidates ? 'grid' : candidateLayout
  const rows = region ? DIGITS.slice(region.row, region.row + region.rows) : DIGITS
  const columns = region ? DIGITS.slice(region.column, region.column + region.columns) : DIGITS
  const size = region && { '--board-rows': rows.length, '--board-columns': columns.length } as CSSProperties
  const firstCandidateCell = onCandidate ? candidates?.findIndex((mask, cell) =>
    mask && values[cell] === '0' && rows.includes(Math.floor(cell / 9) + 1) && columns.includes(cell % 9 + 1)) ?? -1 : -1
  const tabCandidate = candidateFocus && values[candidateFocus.cell] === '0' &&
    hasCandidate(candidates?.[candidateFocus.cell] ?? 0, candidateFocus.digit) &&
    rows.includes(Math.floor(candidateFocus.cell / 9) + 1) && columns.includes(candidateFocus.cell % 9 + 1) ? candidateFocus
    : firstCandidateCell === -1 ? undefined : { cell: firstCandidateCell, digit: marksOf(candidates![firstCandidateCell])[0] }

  function navigateCandidates(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches('.chain-candidate')) return
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key) || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.chain-candidate')]
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      buttons.at(event.key === 'Home' ? 0 : -1)?.focus()
      return
    }
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
    const origin = event.target.getBoundingClientRect()
    let nearest: HTMLButtonElement | undefined
    let distance = Infinity
    for (const button of buttons) {
      const rect = button.getBoundingClientRect()
      const main = direction * (vertical ? rect.y - origin.y : rect.x - origin.x)
      const cross = Math.abs(vertical ? rect.x - origin.x : rect.y - origin.y)
      if (main > 0 && main + cross * 3 < distance) {
        nearest = button
        distance = main + cross * 3
      }
    }
    event.preventDefault()
    nearest?.focus()
  }

  return (
    <div className={`board-frame ${showGuides ? '' : 'guides-hidden'}`} style={size}>
      {showGuides && <div className="col-labels" aria-hidden="true">{columns.map((n) => <span key={n}>{n}</span>)}</div>}
      {showGuides && <div className="row-labels" aria-hidden="true">{rows.map((n) => <span key={n}>{n}</span>)}</div>}
      <div className="board-body">
        <div className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`} role="grid" aria-label={label}
          aria-readonly={(!onCell && !onCandidate) || undefined} ref={boardRef}
          onKeyDown={onCandidate && navigateCandidates}
          onPointerMove={onCellPointerMove && ((event) => {
            const target = document.elementFromPoint(event.clientX, event.clientY)
            const cell = target?.closest<HTMLElement>('[data-cell]')
            if (cell && event.currentTarget.contains(cell)) onCellPointerMove(Number(cell.dataset.cell), event)
          })}>
          {rows.map((row) => (
            <div className="grid-row" role="row" data-box-edge={row % 3 === 0 || undefined} key={row}>
              {columns.map((col) => {
                const index = (row - 1) * 9 + col - 1
                const alternateBox = (Math.floor((row - 1) / 3) + Math.floor((col - 1) / 3)) % 2 === 1
                const value = Number(values[index])
                const fixed = givens[index] !== '0'
                const center = position?.center[index] ?? 0
                const corner = position?.corner[index] ?? 0
                const centerCandidates = layout === 'center-corner' ? marksOf(center) : []
                const candidateMask = candidates?.[index] ?? (center | corner)
                const gridCandidates = marksOf(candidates?.[index] ?? (layout === 'grid' ? candidateMask : corner))
                const color = position?.colors[index]
                const inSelection = selected.includes(index)
                const error = errors?.has(index)
                const cellAnnotation = annotations?.cells?.get(index)
                const candidateAnnotations = annotations?.candidates?.get(index)
                const candidateMatches = !value && focusDigit != null && hasCandidate(candidateMask, focusDigit)
                const candidateHighlightStyle = candidateMatches && highlighting.matchingCandidates ? highlighting.candidateStyle : undefined
                const candidateCountMatches = !value && highlightCandidateCount != null && candidateCount(candidateMask) === highlightCandidateCount
                const cellStyle = cellAnnotation && {
                  backgroundColor: error ? undefined : cellAnnotation.fill,
                  color: error ? undefined : cellAnnotation.ink,
                  '--annotation-outline': cellAnnotation.outline,
                } as CSSProperties
                const candidateLabel = candidateAnnotations && [...new Set([...gridCandidates, ...centerCandidates])]
                  .map((digit) => {
                    const note = candidateAnnotations.get(digit)?.label
                    return note && `${digit} ${note}`
                  }).filter(Boolean).join(', ')
                const label = [
                  `Row ${row}, column ${col}`,
                  value ? (fixed ? `given ${value}` : `digit ${value}`) : 'empty',
                  !value && gridCandidates.length ? `${layout === 'grid' ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
                  !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
                  color ? COLORS[color - 1] : '',
                  cellAnnotation?.label,
                  !value && candidateLabel,
                  candidateHighlightStyle === 'cell' ? `cell highlighted for candidate ${focusDigit}` :
                    candidateHighlightStyle ? `candidate ${focusDigit} highlighted` : '',
                  candidateCountMatches ? `${highlightCandidateCount}-candidate cell highlighted` : '',
                  error ? 'incorrect' : '',
                ].filter(Boolean).join(', ')
                const classes = [
                  'cell',
                  fixed ? 'given' : 'entry',
                  highlighting.relatedCells && selected.some((cell) => peer(index, cell)) ? 'peer' : '',
                  highlighting.matchingDigits && value === focusDigit ? 'matching' : '',
                  candidateHighlightStyle === 'cell' ? 'candidate-highlight-cell' : '',
                  candidateHighlightStyle === 'outline' ? 'candidate-highlight-outline' : '',
                  candidateCountMatches ? 'candidate-count-match' : '',
                  color ? `colored color-${color}` : '',
                  error ? 'conflict' : '',
                  inSelection ? 'selected' : '',
                ].join(' ')

                function renderCandidate(digit: number, slotted: boolean) {
                  const annotation = candidateAnnotations?.get(digit)
                  const style = {
                    gridArea: slotted ? `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}` : undefined,
                    '--annotation-color': annotation?.color,
                  } as CSSProperties
                  const highlightClass = digit === focusDigit && candidateHighlightStyle && candidateHighlightStyle !== 'cell'
                    ? `candidate-match candidate-match-${candidateHighlightStyle}` : undefined
                  if (onCandidate && slotted) {
                    const candidate = { cell: index, digit }
                    const pending = selectedCandidate?.cell === index && selectedCandidate.digit === digit
                    const linkTarget = isLinkTarget?.(candidate)
                    const candidateLabel = [`${digit} in row ${row}, column ${col}`, annotation?.label,
                      linkTarget && 'can link to the selected candidate'].filter(Boolean).join(', ')
                    return <button type="button" key={digit} className="chain-candidate" style={style}
                      aria-label={candidateLabel} data-link-target={linkTarget || undefined}
                      aria-pressed={pending} data-mark={annotation && (annotation.mark ?? 'ring')}
                      tabIndex={tabCandidate?.cell === index && tabCandidate.digit === digit ? 0 : -1}
                      onPointerEnter={onCandidateHover && ((event) => {
                        if (event.pointerType !== 'touch') onCandidateHover(candidate)
                      })}
                      onPointerLeave={onCandidateHover && (() => onCandidateHover(null))}
                      onFocus={() => setCandidateFocus(candidate)} onClick={() => onCandidate(candidate)}>{digit}</button>
                  }
                  return <span key={digit} className={highlightClass}
                    style={style} data-mark={annotation && (annotation.mark ?? 'ring')}>{digit}</span>
                }

                return (
                  <Cell role="gridcell" key={col} data-cell={index} className={classes} style={cellStyle} aria-label={label}
                    data-highlight={Boolean(cellAnnotation?.outline) || undefined} data-box-edge={col % 3 === 0 || undefined}
                    data-alternate-box={alternateBox || undefined}
                    type={onCell && 'button'} tabIndex={onCell ? (active === index ? 0 : -1) : undefined}
                    aria-selected={onCell ? inSelection : undefined}
                    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
                    onClick={onCell && ((event) => onCell(index, event))}>
                    {value ? <span aria-hidden="true">{value}</span> : (
                      <>
                        {gridCandidates.length > 0 && (
                          <span className="candidate-marks" aria-hidden={onCandidate ? undefined : true}>{gridCandidates.map((digit) => renderCandidate(digit, true))}</span>
                        )}
                        {centerCandidates.length > 0 && (
                          <span className="center-marks" aria-hidden="true">{centerCandidates.map((digit) => renderCandidate(digit, false))}</span>
                        )}
                      </>
                    )}
                  </Cell>
                )
              })}
            </div>
          ))}
        </div>
        {!!annotations?.links?.length && <BoardLinks links={annotations.links} region={region} />}
      </div>
    </div>
  )
}
