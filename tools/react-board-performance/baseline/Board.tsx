import { useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref, type RefObject } from 'react'
import type { Candidate, SizedConstraintRule, SizedVariantPosition, VariantPuzzle } from '../../../src/sudoku/engine'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Position } from '../../../src/sudoku/game'
import { CLASSIC_GRID, type SizedGrid } from '../../../src/sudoku/grid'
import { activeHighlightDigit, type DigitHighlightMatch } from '../../../src/sudoku/highlighting'
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from '../../../src/sudoku/preferences'
import type { PuzzleInputMode } from '../../../src/sudoku/puzzle-input-mode'
import { DISJOINT_GROUPS_RULE, disjointGroupRuleIndices, regionMembership } from '../../../src/sudoku/variants'
import { outsideClueLayout } from '../../../src/sudoku/outside-clues'
import { OutsideClues } from '../../../src/components/OutsideClues'
import { cloneLayout } from '../../../src/sudoku/clone'
import { AlgebraicCages, SizedRuleClues, VariantClues, cageLabelInset, sizedRuleClueLabels, variantCellLabels } from '../../../src/components/VariantClues'
import { BoardLinks, type BoardAnnotations, type BoardRegion } from './BoardAnnotations'
import { BoardMarks, type BoardMark } from './BoardMarks'

type Props = {
  descriptionId?: string
  variantPuzzle?: VariantPuzzle
  grid?: SizedGrid
  algebraicCages?: SizedVariantPosition['rules']
  sizedRules?: readonly SizedConstraintRule[]
  givens: string
  values: string
  position?: Pick<Position, 'center' | 'corner'> & Partial<Pick<Position, 'colors' | 'candidateColors'>>
  errors?: ReadonlySet<number>
  candidateLayout?: CandidateLayout
  candidates?: readonly number[]
  candidatePreview?: Candidate & { mode: 'candidate' | 'center' | 'corner' }
  annotations?: BoardAnnotations
  showAnnotatedCandidates?: boolean
  showPlayerColors?: boolean
  region?: BoardRegion
  label?: string
  showGuides: boolean
  overlay?: { content: ReactNode; visible: boolean }
  highlightedDigit?: number | null
  highlightedDigitMask?: number
  highlightedDigitMatch?: DigitHighlightMatch
  highlightCandidateCells?: boolean
  highlightCandidateCount?: number | null
  highlighting?: HighlightPreferences
  selected?: readonly number[]
  active?: number
  pointerFocusedCell?: number | null
  boardRef?: RefObject<HTMLDivElement | null>
  /** The mobile mode border and badge belong to the grid, not to the puzzle toolbar. */
  modeBorder?: PuzzleInputMode
  modeBoundaryRef?: Ref<HTMLDivElement>
  modeBadge?: ReactNode
  onCell?: (index: number, event: MouseEvent) => void
  onGridKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  onCellDoubleClick?: (index: number, event: MouseEvent) => void
  onCandidate?: (candidate: Candidate) => void
  onLinkSelect?: (candidate: Candidate) => void
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
const NO_MARKS: BoardMark[] = []

export function gridCellAtPoint(grid: HTMLDivElement | null, { clientX, clientY }: { clientX: number; clientY: number }) {
  const cell = grid?.ownerDocument.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-cell]')
  return cell && grid?.contains(cell) ? Number(cell.dataset.cell) : null
}

export function Board({
  variantPuzzle, grid: sizedGrid, algebraicCages, sizedRules, givens, values, position, errors, candidateLayout = 'grid', candidates, candidatePreview, annotations, region, label = 'Sudoku grid', showGuides, overlay,
  highlightedDigit, highlightedDigitMask = 0, highlightedDigitMatch = 'all', highlightCandidateCells = false, highlightCandidateCount, highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
  selected = [], active = 0, pointerFocusedCell, boardRef, onCell, onGridKeyDown, onCellDoubleClick, onCandidate, onLinkSelect, onCandidateHover, isLinkTarget, selectedCandidate, dragSelect = false,
  onCellPointerDown, onCellPointerMove, onGridPointerLeave, onPaintCandidate, descriptionId, showAnnotatedCandidates, showPlayerColors = true,
  modeBorder, modeBoundaryRef, modeBadge,
}: Props) {
  const grid = sizedGrid ?? CLASSIC_GRID
  const { size: gridSize, boxRows, boxColumns } = grid
  const variantRules = variantPuzzle?.rules
  const outside = useMemo(() => outsideClueLayout(variantRules), [variantRules])
  const hasOutside = Object.values(outside.depths).some(Boolean)
  const clones = cloneLayout(variantRules)
  const disjoint = useMemo(() => disjointGroupRuleIndices(variantRules ?? []), [variantRules])
  const gridLabel = [sizedGrid ? `${gridSize} × ${gridSize} ${label.toLowerCase()}` : label, variantRules?.some(rule => rule.type === 'global-entropy')
    && 'Global Entropy: every 2 × 2 area needs a low digit 1–3, a medium digit 4–6 and a high digit 7–9, including across box or region borders.',
    disjoint.size && DISJOINT_GROUPS_RULE].filter(Boolean).join(' ')
  const regions = variantPuzzle?.regions
  const regionsAt = useMemo(() => regions?.type === 'jigsaw' ? regionMembership(regions.regions) : undefined, [regions])
  const cellClues = useMemo(() => variantRules ? variantCellLabels(variantRules, variantPuzzle?.regions) : undefined, [variantRules, variantPuzzle?.regions])
  const sizedLabels = useMemo(() => sizedGrid && sizedRules ? sizedRuleClueLabels(sizedRules, sizedGrid) : undefined, [sizedRules, sizedGrid])
  const cageTotals = useMemo(() => new Map(variantRules?.flatMap((rule) => rule.type === 'killer-cages'
    ? rule.cages.map(({ cells, sum }) => [Math.min(...cells), sum] as const) : [])), [variantRules])
  const algebraicLabels = useMemo(() => {
    const captions = new Map<number, string>()
    const descriptions = new Map<number, string[]>()
    for (const { cells, label, total } of algebraicCages ?? []) {
      captions.set(Math.min(...cells), label)
      for (const cell of cells) {
        const clues = descriptions.get(cell) ?? []
        clues.push(total.type === 'fixed' ? `cage total ${label}` : `algebraic cage total ${label}`)
        descriptions.set(cell, clues)
      }
    }
    return { captions, descriptions }
  }, [algebraicCages])
  const candidateInsets = useMemo(() => {
    const insets = new Map<number, { top: number; bottom: number }>()
    for (const set of clones.sets) for (const cell of set.cells) insets.set(cell, { top: .07, bottom: .28 })
    for (const cell of [...cageTotals.keys(), ...algebraicLabels.captions.keys()]) insets.set(cell, { top: .3, bottom: insets.get(cell)?.bottom ?? .07 })
    return insets
  }, [clones, cageTotals, algebraicLabels])
  const variantClues = useMemo(() => variantRules?.length
    ? [<div className="board-variant-clues" key={JSON.stringify(variantRules)}><VariantClues rules={variantRules} /></div>]
    : NO_MARKS, [variantRules])
  const [candidateFocus, setCandidateFocus] = useState<CandidateSlot>()
  const highlightedDigits = marksOf(highlightedDigitMask)
  const matchAnyDigit = highlightedDigitMatch === 'any' && highlightedDigitMask !== 0
  const filterCandidates = matchAnyDigit || highlightedDigits.length > 1
  const focusDigit = filterCandidates ? null : activeHighlightDigit(values, selected, active, highlightedDigits[0] ?? highlightedDigit)
  const candidateAction = onPaintCandidate ?? onCandidate
  const Cell = onCell && !candidateAction ? 'button' : 'div'
  const layout = candidates ? 'grid' : candidateLayout
  const annotationSlots = showAnnotatedCandidates ? annotations?.candidates : undefined
  const usesDigitSlots = (cell: number) => layout === 'grid' || annotationSlots?.has(cell)
  // An outside total needs its complete row or column visible in teaching diagrams.
  const visibleRegion = hasOutside ? undefined : region
  const coordinates = sizedGrid ? DIGITS.slice(0, gridSize) : DIGITS
  const rows = visibleRegion ? coordinates.slice(visibleRegion.row, visibleRegion.row + visibleRegion.rows) : coordinates
  const columns = visibleRegion ? coordinates.slice(visibleRegion.column, visibleRegion.column + visibleRegion.columns) : coordinates
  const size = { ...((visibleRegion || sizedGrid) && { '--board-rows': rows.length, '--board-columns': columns.length }),
    ...(sizedGrid && { '--candidate-rows': boxRows, '--candidate-columns': boxColumns }),
    ...(hasOutside && Object.fromEntries(Object.entries(outside.depths).map(([side, depth]) => ['--outside-' + side, depth]))),
    ...(hasOutside && { '--outside-left-track': `${outside.depths.left}fr`, '--outside-right-track': `${outside.depths.right}fr` }),
  } as CSSProperties
  const playableCell = (cell: number) => values[cell] === '0' &&
    rows.includes(Math.floor(cell / gridSize) + 1) && columns.includes(cell % gridSize + 1)
  const gridMask = (cell: number) => candidates?.[cell] ??
    ((position?.corner[cell] ?? 0) | (usesDigitSlots(cell) ? position?.center[cell] ?? 0 : 0))
  const centerMask = (cell: number) => usesDigitSlots(cell) ? 0 : position?.center[cell] ?? 0
  let tabCandidate: CandidateSlot | undefined
  if (candidateAction) {
    if (candidateFocus && playableCell(candidateFocus.cell) &&
      hasCandidate((candidateFocus.slotted ? gridMask : centerMask)(candidateFocus.cell), candidateFocus.digit)) {
      tabCandidate = candidateFocus
    } else {
      const hasCandidates = (cell: number) => playableCell(cell) && (gridMask(cell) || centerMask(cell))
      const cell = hasCandidates(active) ? active : Array.from(values).findIndex((_, index) => hasCandidates(index))
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
      .filter((button) => !button.closest('[inert]'))
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
    <div className={`board-frame ${showGuides ? '' : 'guides-hidden'}${hasOutside ? ' has-outside-clues' : ''}`} data-overlay={overlay?.visible} style={size}>
      {outside.depths.top > 0 && <div className="outside-clues-top" aria-hidden="true" />}
      {outside.depths.bottom > 0 && <div className="outside-clues-bottom" aria-hidden="true" />}
      <div className="col-labels" aria-hidden="true">{columns.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="row-labels" aria-hidden="true">{rows.map((n) => <span key={n}>{n}</span>)}</div>
      <div className={`board-body${variantPuzzle || algebraicCages?.length || sizedRules?.length ? ' variant-board' : ''}${regionsAt ? ' jigsaw-board' : ''}`}
        data-input-mode={modeBorder} ref={modeBoundaryRef}>
        <div className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`} role="grid" aria-label={gridLabel}
          aria-describedby={descriptionId} aria-readonly={(!onCell && !candidateAction) || undefined} ref={boardRef}
          aria-hidden={overlay?.visible || undefined} inert={overlay?.visible || undefined}
          onKeyDown={candidateAction ? navigateCandidates : onGridKeyDown}
          onPointerLeave={onGridPointerLeave}
          onPointerMove={onCellPointerMove && ((event) => onCellPointerMove(gridCellAtPoint(event.currentTarget, event), event))}>
          {rows.map((row) => (
            <div className="grid-row" role="row" data-box-edge={!regionsAt && row % boxRows === 0 || undefined} key={row}>
              {columns.map((col) => {
                const index = (row - 1) * gridSize + col - 1
                const regionAtCell = regionsAt?.[index]
                const cageTotal = cageTotals.get(index) ?? algebraicLabels.captions.get(index)
                const alternateBox = (Math.floor((row - 1) / boxRows) + Math.floor((col - 1) / boxColumns)) % 2 === 1
                const value = Number(values[index])
                const fixed = givens[index] !== '0'
                const center = position?.center[index] ?? 0
                const corner = position?.corner[index] ?? 0
                const centerMarks = centerMask(index)
                const gridMarks = gridMask(index)
                const linkedDigits = annotationSlots?.get(index)
                let displayedGridMarks = gridMarks
                for (const digit of linkedDigits?.keys() ?? []) displayedGridMarks |= 1 << (digit - 1)
                const centerCandidates = marksOf(centerMarks)
                const gridCandidates = marksOf(displayedGridMarks)
                const candidateMask = candidates?.[index] ?? (center | corner)
                const preview = !value && candidatePreview?.cell === index ? candidatePreview : undefined
                const previewSlotted = preview?.mode !== 'center' || Boolean(linkedDigits)
                const previewMask = preview?.mode === 'center' && linkedDigits ? center
                  : preview?.mode === 'corner' && linkedDigits ? corner : previewSlotted ? gridMarks : centerMarks
                const previewAction = preview && (hasCandidate(previewMask, preview.digit) ? 'remove' : 'add')
                const withPreview = preview && previewAction === 'add'
                  ? marksOf((previewSlotted ? displayedGridMarks : centerMarks) | (1 << (preview.digit - 1))) : undefined
                const visibleGridCandidates = (previewSlotted && withPreview) || gridCandidates
                const visibleCenterCandidates = (!previewSlotted && withPreview) || centerCandidates
                const candidateColors = showPlayerColors && (!candidates || onCandidate) ? position?.candidateColors?.[index] : undefined
                const color = showPlayerColors ? position?.colors?.[index] : undefined
                const inSelection = selected.includes(index)
                const error = errors?.has(index)
                const cellAnnotation = annotations?.cells?.get(index)
                const candidateAnnotations = annotations?.candidates?.get(index)
                const candidateMatches = !value && focusDigit != null && hasCandidate(candidateMask, focusDigit)
                const matchingMask = filterCandidates && !value ? candidateMask & highlightedDigitMask : 0
                const matchesFilter = matchingMask !== 0 && (matchAnyDigit || matchingMask === highlightedDigitMask)
                const matchesWithExtras = matchesFilter && matchAnyDigit && matchingMask !== candidateMask
                const highlightsFocusDigit = candidateMatches && highlighting.matchingCandidates
                const highlightsCell = highlightCandidateCells && (matchesFilter || highlightsFocusDigit)
                const linkTargets = isLinkTarget && !value
                  ? [...visibleGridCandidates, ...visibleCenterCandidates].filter(digit => isLinkTarget({ cell: index, digit })) : undefined
                const highlightsLinkTargetCell = highlightCandidateCells && Boolean(linkTargets?.length)
                const candidateCountMatches = !value && !filterCandidates && highlightCandidateCount != null && candidateCount(candidateMask) === highlightCandidateCount
                const cellStyle = cellAnnotation && {
                  '--cell-fill': error ? undefined : cellAnnotation.fill,
                  color: error ? undefined : cellAnnotation.ink,
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
                  !value && gridCandidates.length ? `${usesDigitSlots(index) ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
                  !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
                  color ? COLORS[color - 1] : '',
                  regionAtCell !== undefined && `region ${regionAtCell + 1}`,
                  cellAnnotation?.label,
                  cellClues?.[index]?.join(', '),
                  sizedLabels?.[index],
                  algebraicLabels.descriptions.get(index)?.join(', '),
                  !value && candidateLabel,
                  matchesFilter ? matchAnyDigit
                    ? matchesWithExtras ? 'cell has selected candidates and other candidates' : 'cell has only selected candidates'
                    : highlightsCell ? `cell highlighted for candidates ${highlightedDigits.join(', ')}`
                      : `candidates ${highlightedDigits.join(', ')} highlighted`
                    : highlightsCell ? `cell highlighted for candidate ${focusDigit}`
                      : highlightsFocusDigit ? `candidate ${focusDigit} highlighted` : '',
                  highlightsLinkTargetCell && 'has candidates that can link to the selected candidate',
                  candidateCountMatches ? highlightCandidateCells ? `${highlightCandidateCount}-candidate cell highlighted`
                    : `all ${highlightCandidateCount} candidates highlighted` : '',
                  error ? 'incorrect' : '',
                ].filter(Boolean).join(', ')
                const classes = [
                  'cell',
                  fixed ? 'given' : 'entry',
                  !filterCandidates && highlighting.relatedCells && selected.some((cell) => peer(index, cell, variantPuzzle, grid, sizedRules)) ? 'peer' : '',
                  highlighting.matchingDigits && value === focusDigit ? 'matching' : '',
                  highlightsLinkTargetCell || (highlightsCell && !matchesWithExtras) ? 'candidate-highlight-cell'
                    : highlightsCell ? 'candidate-highlight-light' : '',
                  highlightCandidateCells && candidateCountMatches ? 'candidate-count-match' : '',
                  color ? `colored color-${color}` : '',
                  error ? 'conflict' : '',
                  inSelection ? 'selected' : '',
                ].join(' ')

                function renderCandidate(digit: number, slotted: boolean) {
                  const annotation = candidateAnnotations?.get(digit)
                  const color = candidateColors?.[digit]
                  const colorClass = color && annotation?.mark !== 'emphasized' && annotation?.mark !== 'strike' ? `candidate-color color-${color}` : ''
                  const previewEdit = digit === preview?.digit && slotted === previewSlotted ? previewAction : undefined
                  const style = {
                    gridArea: slotted ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
                    '--annotation-color': annotation?.color,
                  } as CSSProperties
                  const highlighted = !highlightCandidateCells && !previewEdit && (candidateCountMatches || (matchesFilter
                    ? hasCandidate(matchingMask, digit) : highlightsFocusDigit && digit === focusDigit))
                  const highlightClass = highlighted ? 'candidate-match' : undefined
                  if (candidateAction) {
                    const candidate = { cell: index, digit }
                    const pending = selectedCandidate?.cell === index && selectedCandidate.digit === digit
                    const linkTarget = linkTargets?.includes(digit)
                    const candidateLabel = [`${digit} in row ${row}, column ${col}`, annotation?.label, color && COLORS[color - 1],
                      highlighted && 'highlighted',
                      linkTarget && 'can link to the selected candidate'].filter(Boolean).join(', ')
                    const classes = `board-candidate candidate-button ${onPaintCandidate ? 'paint-candidate' : 'chain-candidate'}`
                    return <button type="button" key={digit} className={classes} style={style}
                      aria-label={candidateLabel} data-link-target={linkTarget || undefined}
                      aria-pressed={onCandidate ? pending : undefined} data-mark={annotation && (annotation.mark ?? 'ring')}
                      data-strike={annotation?.strike || undefined}
                      tabIndex={tabCandidate?.cell === index && tabCandidate.digit === digit && tabCandidate.slotted === slotted ? 0 : -1}
                      onPointerEnter={onCandidateHover && ((event) => {
                        if (event.pointerType !== 'touch') onCandidateHover(candidate)
                      })}
                      onPointerLeave={onCandidateHover && (() => onCandidateHover(null))}
                      onMouseDown={onPaintCandidate ? undefined : (event) => event.preventDefault()}
                      onFocus={() => setCandidateFocus({ ...candidate, slotted })}
                      onClick={() => {
                        setCandidateFocus({ ...candidate, slotted })
                        candidateAction(candidate)
                      }}>
                      <span className={['candidate-glyph', colorClass, !annotation && (highlighted || linkTarget) && 'candidate-match'].filter(Boolean).join(' ')}>{digit}</span>
                    </button>
                  }
                  return <span key={digit} className={['board-candidate', colorClass, highlightClass].filter(Boolean).join(' ')}
                    style={style} data-mark={annotation && (annotation.mark ?? 'ring')} data-strike={annotation?.strike || undefined}
                    data-candidate-preview={previewEdit}>{digit}</span>
                }

                const gridItems = !value && visibleGridCandidates.length
                  ? visibleGridCandidates.map((digit) => renderCandidate(digit, true)) : NO_MARKS
                const centerKey = visibleCenterCandidates.join('')
                const cellItems = value ? [<span className="cell-value" key={value} aria-hidden="true">{value}</span>]
                  : centerKey ? [<span className="center-marks" key={`center-${centerKey}`} aria-hidden={candidateAction ? undefined : true}>
                    {visibleCenterCandidates.map((digit) => renderCandidate(digit, false))}
                  </span>] : NO_MARKS

                return (
                  <Cell role="gridcell" key={col} data-cell={index} data-clone={clones.at[index]?.label} className={classes} style={cellStyle} aria-label={label}
                    data-pointer-focused={pointerFocusedCell === index || undefined}
                    aria-description={preview ? `${previewAction === 'add' ? 'Add' : 'Remove'} candidate ${preview.digit}` : undefined}
                    data-box-edge={!regionsAt && col % boxColumns === 0 || undefined}
                    data-region-right={regionsAt && col < gridSize && regionAtCell !== regionsAt[index + 1] || undefined}
                    data-region-bottom={regionsAt && row < gridSize && regionAtCell !== regionsAt[index + gridSize] || undefined}
                    data-alternate-box={!regionsAt && alternateBox || undefined} data-cage-total={cageTotal !== undefined || undefined}
                    type={onCell && 'button'} tabIndex={onCell ? (active === index ? 0 : -1) : undefined}
                    aria-selected={onCell ? inSelection : undefined}
                    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
                    onClick={onCell && ((event) => onCell(index, event))}
                    onDoubleClick={onCellDoubleClick && ((event) => onCellDoubleClick(index, event))}>
                    <BoardMarks items={gridItems} group={<span className="candidate-marks" aria-hidden={candidateAction ? undefined : true} />} />
                    <BoardMarks items={cageTotal === undefined ? cellItems : [
                      <span className="variant-cage-total" key={`cage-${cageTotal}`} aria-hidden="true"
                        style={variantRules ? { insetInlineStart: `${cageLabelInset(index, variantRules) * 100}%` } : undefined}>{cageTotal}</span>,
                      ...cellItems,
                    ]} />
                  </Cell>
                )
              })}
            </div>
          ))}
        </div>
        <BoardMarks items={variantClues} />
        {sizedGrid && sizedRules && sizedRules.length > 0 && <div className="board-variant-clues"><SizedRuleClues rules={sizedRules} size={gridSize} /></div>}
        {algebraicCages && algebraicCages.length > 0 && <div className="board-variant-clues"><AlgebraicCages rules={algebraicCages} /></div>}
        {hasOutside && <OutsideClues layout={outside} hidden={overlay?.visible} />}
        <BoardLinks links={annotations?.links} region={visibleRegion} candidateInsets={candidateInsets} onSelect={onLinkSelect} />
        {overlay && <div className="board-overlay" aria-hidden={!overlay.visible || undefined} inert={!overlay.visible || undefined}
          data-no-panel-hold>{overlay.content}</div>}
        {modeBadge}
      </div>
      {outside.legend.length > 0 && <div className="outside-clue-legend" aria-hidden={overlay?.visible || undefined}>{outside.legend.join(' · ')}</div>}
    </div>
  )
}
