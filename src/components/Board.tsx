import { useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import type { Candidate, VariantPuzzle } from '../sudoku/engine'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Position } from '../sudoku/game'
import { activeHighlightDigit } from '../sudoku/highlighting'
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from '../sudoku/preferences'
import { regionMembership } from '../sudoku/variants'
import { VariantClues, variantCellLabels } from './VariantClues'
import { BoardLinks, type BoardAnnotations, type BoardRegion } from './BoardAnnotations'

type Props = {
  descriptionId?: string
  variantPuzzle?: VariantPuzzle
  givens: string
  values: string
  position?: Pick<Position, 'center' | 'corner' | 'colors' | 'candidateColors'>
  errors?: ReadonlySet<number>
  candidateLayout?: CandidateLayout
  candidates?: readonly number[]
  candidatePreview?: Candidate & { mode: 'candidate' | 'center' | 'corner' }
  annotations?: BoardAnnotations
  region?: BoardRegion
  label?: string
  showGuides: boolean
  highlightedDigit?: number | null
  highlightCandidateCount?: number | null
  highlighting?: HighlightPreferences
  selected?: readonly number[]
  active?: number
  pointerFocusedCell?: number | null
  boardRef?: RefObject<HTMLDivElement | null>
  onCell?: (index: number, event: MouseEvent) => void
  onCellDoubleClick?: (index: number, event: MouseEvent) => void
  onCandidate?: (candidate: Candidate) => void
  onPaintCandidate?: (candidate: Candidate) => void
  onCandidateHover?: (candidate: Candidate | null) => void
  isLinkTarget?: (candidate: Candidate) => boolean
  selectedCandidate?: Candidate
  dragSelect?: boolean
  onCellPointerDown?: (index: number, event: PointerEvent) => void
  onCellPointerMove?: (index: number | null, event: PointerEvent) => void
  onGridPointerLeave?: () => void
}

type CandidateSlot = Candidate & { slotted: boolean }

export function gridCellAtPoint(grid: HTMLDivElement | null, { clientX, clientY }: { clientX: number; clientY: number }) {
  const cell = grid?.ownerDocument.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-cell]')
  return cell && grid?.contains(cell) ? Number(cell.dataset.cell) : null
}

export function Board({
  variantPuzzle, givens, values, position, errors, candidateLayout = 'grid', candidates, candidatePreview, annotations, region, label = 'Sudoku grid', showGuides,
  highlightedDigit, highlightCandidateCount, highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
  selected = [], active = 0, pointerFocusedCell, boardRef, onCell, onCellDoubleClick, onCandidate, onCandidateHover, isLinkTarget, selectedCandidate, dragSelect = false,
  onCellPointerDown, onCellPointerMove, onGridPointerLeave, onPaintCandidate, descriptionId,
}: Props) {
  const variantRules = variantPuzzle?.rules
  const regions = variantPuzzle?.regions
  const regionsAt = useMemo(() => regions?.type === 'jigsaw' ? regionMembership(regions.regions) : undefined, [regions])
  const cellClues = useMemo(() => variantRules ? variantCellLabels(variantRules) : undefined, [variantRules])
  const cageTotals = useMemo(() => new Map(variantRules?.flatMap((rule) => rule.type === 'killer-cages'
    ? rule.cages.map(({ cells, sum }) => [Math.min(...cells), sum] as const) : [])), [variantRules])
  const [candidateFocus, setCandidateFocus] = useState<CandidateSlot>()
  const focusDigit = activeHighlightDigit(values, selected, active, highlightedDigit)
  const candidateAction = onPaintCandidate ?? onCandidate
  const Cell = onCell && !candidateAction ? 'button' : 'div'
  const layout = candidates ? 'grid' : candidateLayout
  const rows = region ? DIGITS.slice(region.row, region.row + region.rows) : DIGITS
  const columns = region ? DIGITS.slice(region.column, region.column + region.columns) : DIGITS
  const size = region && { '--board-rows': rows.length, '--board-columns': columns.length } as CSSProperties
  const playableCell = (cell: number) => values[cell] === '0' &&
    rows.includes(Math.floor(cell / 9) + 1) && columns.includes(cell % 9 + 1)
  const gridMask = (cell: number) => candidates?.[cell] ??
    ((position?.corner[cell] ?? 0) | (layout === 'grid' ? position?.center[cell] ?? 0 : 0))
  const centerMask = (cell: number) => layout === 'center-corner' ? position?.center[cell] ?? 0 : 0
  let tabCandidate: CandidateSlot | undefined
  if (candidateAction) {
    if (candidateFocus && playableCell(candidateFocus.cell) &&
      hasCandidate((candidateFocus.slotted ? gridMask : centerMask)(candidateFocus.cell), candidateFocus.digit)) {
      tabCandidate = candidateFocus
    } else {
      const hasCandidates = (cell: number) => playableCell(cell) && (gridMask(cell) || centerMask(cell))
      const cell = onPaintCandidate && hasCandidates(active) ? active : Array.from(values).findIndex((_, index) => hasCandidates(index))
      if (cell !== -1) {
        const slotted = Boolean(gridMask(cell))
        tabCandidate = { cell, digit: marksOf((slotted ? gridMask : centerMask)(cell))[0], slotted }
      }
    }
  }

  function navigateCandidates(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches('.candidate-button')) return
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key) || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.candidate-button')]
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
      <div className={`board-body${variantPuzzle ? ' variant-board' : ''}${regionsAt ? ' jigsaw-board' : ''}`}>
        <div className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`} role="grid" aria-label={label}
          aria-describedby={descriptionId} aria-readonly={(!onCell && !candidateAction) || undefined} ref={boardRef}
          onKeyDown={candidateAction && navigateCandidates}
          onPointerLeave={onGridPointerLeave}
          onPointerMove={onCellPointerMove && ((event) => onCellPointerMove(gridCellAtPoint(event.currentTarget, event), event))}>
          {rows.map((row) => (
            <div className="grid-row" role="row" data-box-edge={!regionsAt && row % 3 === 0 || undefined} key={row}>
              {columns.map((col) => {
                const index = (row - 1) * 9 + col - 1
                const regionAtCell = regionsAt?.[index]
                const cageTotal = cageTotals.get(index)
                const alternateBox = (Math.floor((row - 1) / 3) + Math.floor((col - 1) / 3)) % 2 === 1
                const value = Number(values[index])
                const fixed = givens[index] !== '0'
                const center = position?.center[index] ?? 0
                const corner = position?.corner[index] ?? 0
                const centerMarks = centerMask(index)
                const gridMarks = gridMask(index)
                const centerCandidates = marksOf(centerMarks)
                const gridCandidates = marksOf(gridMarks)
                const candidateMask = candidates?.[index] ?? (center | corner)
                const preview = !value && candidatePreview?.cell === index ? candidatePreview : undefined
                const previewSlotted = preview?.mode !== 'center'
                const previewMask = previewSlotted ? gridMarks : centerMarks
                const previewAction = preview && (hasCandidate(previewMask, preview.digit) ? 'remove' : 'add')
                const withPreview = preview && previewAction === 'add' ? marksOf(previewMask | (1 << (preview.digit - 1))) : undefined
                const visibleGridCandidates = (previewSlotted && withPreview) || gridCandidates
                const visibleCenterCandidates = (!previewSlotted && withPreview) || centerCandidates
                const candidateColors = candidates ? undefined : position?.candidateColors?.[index]
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
                const candidateLabel = (candidateAnnotations || candidateColors) && [...new Set([...gridCandidates, ...centerCandidates])]
                  .map((digit) => {
                    const color = candidateColors?.[digit]
                    const note = candidateAnnotations?.get(digit)?.label ?? (color ? COLORS[color - 1].toLowerCase() : undefined)
                    return note && `${digit} ${note}`
                  }).filter(Boolean).join(', ')
                const label = [
                  `Row ${row}, column ${col}`,
                  value ? (fixed ? `given ${value}` : `digit ${value}`) : 'empty',
                  !value && gridCandidates.length ? `${layout === 'grid' ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
                  !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
                  color ? COLORS[color - 1] : '',
                  regionAtCell !== undefined && `region ${regionAtCell + 1}`,
                  cellAnnotation?.label,
                  cellClues?.[index]?.join(', '),
                  !value && candidateLabel,
                  candidateHighlightStyle === 'cell' ? `cell highlighted for candidate ${focusDigit}` :
                    candidateHighlightStyle ? `candidate ${focusDigit} highlighted` : '',
                  candidateCountMatches ? `${highlightCandidateCount}-candidate cell highlighted` : '',
                  error ? 'incorrect' : '',
                ].filter(Boolean).join(', ')
                const classes = [
                  'cell',
                  fixed ? 'given' : 'entry',
                  highlighting.relatedCells && selected.some((cell) => peer(index, cell, variantPuzzle)) ? 'peer' : '',
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
                  const color = candidateColors?.[digit]
                  const colorClass = color ? `candidate-color color-${color}` : ''
                  const previewEdit = digit === preview?.digit && slotted === previewSlotted ? previewAction : undefined
                  const style = {
                    gridArea: slotted ? `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}` : undefined,
                    '--annotation-color': annotation?.color,
                  } as CSSProperties
                  const highlightClass = !previewEdit && digit === focusDigit && candidateHighlightStyle && candidateHighlightStyle !== 'cell'
                    ? `candidate-match candidate-match-${candidateHighlightStyle}` : undefined
                  if (candidateAction) {
                    const candidate = { cell: index, digit }
                    const pending = selectedCandidate?.cell === index && selectedCandidate.digit === digit
                    const linkTarget = isLinkTarget?.(candidate)
                    const candidateLabel = [`${digit} in row ${row}, column ${col}`, annotation?.label, color && COLORS[color - 1],
                      digit === focusDigit && candidateHighlightStyle && 'highlighted',
                      linkTarget && 'can link to the selected candidate'].filter(Boolean).join(', ')
                    return <button type="button" key={digit} className={`candidate-button ${onPaintCandidate ? 'paint-candidate' : 'chain-candidate'}`} style={style}
                      aria-label={candidateLabel} data-link-target={linkTarget || undefined}
                      aria-pressed={onCandidate ? pending : undefined} data-mark={annotation && (annotation.mark ?? 'ring')}
                      tabIndex={tabCandidate?.cell === index && tabCandidate.digit === digit && tabCandidate.slotted === slotted ? 0 : -1}
                      onPointerEnter={onCandidateHover && ((event) => {
                        if (event.pointerType !== 'touch') onCandidateHover(candidate)
                      })}
                      onPointerLeave={onCandidateHover && (() => onCandidateHover(null))}
                      onFocus={() => setCandidateFocus({ ...candidate, slotted })} onClick={() => candidateAction(candidate)}>
                      <span className={[colorClass, highlightClass].filter(Boolean).join(' ') || undefined}>{digit}</span>
                    </button>
                  }
                  return <span key={digit} className={color ? `${colorClass}${highlightClass ? ` ${highlightClass}` : ''}` : highlightClass}
                    style={style} data-mark={annotation && (annotation.mark ?? 'ring')} data-candidate-preview={previewEdit}>{digit}</span>
                }

                return (
                  <Cell role="gridcell" key={col} data-cell={index} className={classes} style={cellStyle} aria-label={label}
                    data-pointer-focused={pointerFocusedCell === index || undefined}
                    aria-description={preview ? `${previewAction === 'add' ? 'Add' : 'Remove'} candidate ${preview.digit}` : undefined}
                    data-highlight={Boolean(cellAnnotation?.outline) || undefined} data-box-edge={!regionsAt && col % 3 === 0 || undefined}
                    data-region-right={regionsAt && col < 9 && regionAtCell !== regionsAt[index + 1] || undefined}
                    data-region-bottom={regionsAt && row < 9 && regionAtCell !== regionsAt[index + 9] || undefined}
                    data-alternate-box={!regionsAt && alternateBox || undefined} data-cage-total={cageTotal !== undefined || undefined}
                    type={onCell && 'button'} tabIndex={onCell ? (active === index ? 0 : -1) : undefined}
                    aria-selected={onCell ? inSelection : undefined}
                    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
                    onClick={onCell && ((event) => onCell(index, event))}
                    onDoubleClick={onCellDoubleClick && ((event) => onCellDoubleClick(index, event))}>
                    {cageTotal !== undefined && <span className="variant-cage-total" aria-hidden="true">{cageTotal}</span>}
                    {value ? <span aria-hidden="true">{value}</span> : (
                      <>
                        {visibleGridCandidates.length > 0 && (
                          <span className="candidate-marks" aria-hidden={candidateAction ? undefined : true}>{visibleGridCandidates.map((digit) => renderCandidate(digit, true))}</span>
                        )}
                        {visibleCenterCandidates.length > 0 && (
                          <span className="center-marks" aria-hidden={candidateAction ? undefined : true}>{visibleCenterCandidates.map((digit) => renderCandidate(digit, false))}</span>
                        )}
                      </>
                    )}
                  </Cell>
                )
              })}
            </div>
          ))}
        </div>
        {variantRules && <VariantClues rules={variantRules} />}
        {!!annotations?.links?.length && <BoardLinks links={annotations.links} region={region} />}
      </div>
    </div>
  )
}
