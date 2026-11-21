import { cloneElement, memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { sizedXSumSide } from '../sudoku/sized-linked-double-arrow'
import type { Candidate, SizedConstraintRule, SizedVariantPosition, VariantPuzzle } from '../sudoku/engine'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Position } from '../sudoku/game'
import { jigsawMembership, jigsawRegionColors, CLASSIC_GRID, type SizedGrid } from '../sudoku/grid'
import { activeHighlightDigit, type DigitHighlightMatch } from '../sudoku/highlighting'
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from '../sudoku/preferences'
import type { PuzzleInputMode } from '../sudoku/puzzle-input-mode'
import { DISJOINT_GROUPS_RULE, disjointGroupRuleIndices, regionMembership, variantHouseFillCells, type VariantRuleSectionId } from '../sudoku/variants'
import { outsideClueLayout } from '../sudoku/outside-clues'
import { OutsideClues } from './OutsideClues'
import { cloneLayout } from '../sudoku/clone'
import { AlgebraicCages, LinkedDoubleArrowClues, SizedRuleClues, VariantClues, cageLabelInset, sizedRuleClueLabels, variantCellLabels } from './VariantClues'
import { BoardLinks, type BoardAnnotations, type BoardRegion, type CandidateAnnotation, type CellAnnotation } from './BoardAnnotations'
import { BoardMarks, type BoardMark } from './BoardMarks'

type Props = {
  descriptionId?: string
  variantPuzzle?: VariantPuzzle
  highlightedRule?: VariantRuleSectionId | null
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
  linkDrawing?: boolean
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
const NO_SELECTION: readonly number[] = []
const HIDDEN_CANDIDATE_GROUP = <span className="candidate-marks" aria-hidden="true" />
const INTERACTIVE_CANDIDATE_GROUP = <span className="candidate-marks" />
const MemoSizedRuleClues = memo(SizedRuleClues)
const MemoAlgebraicCages = memo(AlgebraicCages)
const MemoOutsideClues = memo(OutsideClues)
const MemoLinkedDoubleArrowClues = memo(LinkedDoubleArrowClues)

type BoardEvents = Pick<Props, 'onCell' | 'onCellDoubleClick' | 'onCellPointerDown' | 'onCandidate' | 'onPaintCandidate' | 'onCandidateHover' | 'onLinkSelect'>

function useBoardEvents(events: BoardEvents) {
  const committed = useRef(events)
  // Keep event identities stable without exposing callbacks from an abandoned render.
  // Cell handlers still receive the original synthetic event and currentTarget.
  useLayoutEffect(() => { committed.current = events })
  return useMemo(() => ({
    onCell: (index: number, event: MouseEvent) => committed.current.onCell?.(index, event),
    onCellDoubleClick: (index: number, event: MouseEvent) => committed.current.onCellDoubleClick?.(index, event),
    onCellPointerDown: (index: number, event: PointerEvent) => committed.current.onCellPointerDown?.(index, event),
    onCandidate: (candidate: Candidate) => committed.current.onCandidate?.(candidate),
    onPaintCandidate: (candidate: Candidate) => committed.current.onPaintCandidate?.(candidate),
    onCandidateHover: (candidate: Candidate | null) => committed.current.onCandidateHover?.(candidate),
    onLinkSelect: (candidate: Candidate) => committed.current.onLinkSelect?.(candidate),
  }), [])
}

type CellGeometry = {
  index: number
  row: number
  column: number
  boxColumns: number
  cloneLabel?: string
  cageTotal?: number | string
  cageStyle?: CSSProperties
  regionAtCell?: number
  regionColor?: number
  houseFill: boolean
  boxEdge: boolean
  regionRight: boolean
  regionBottom: boolean
  alternateBox: boolean
  clues: string
}

type CellProps = Omit<BoardEvents, 'onLinkSelect'> & {
  geometry: CellGeometry
  value: number
  fixed: boolean
  center: number
  corner: number
  centerMask: number
  gridMask: number
  displayedGridMask: number
  digitSlots: boolean
  annotatedSlots: boolean
  preview?: Props['candidatePreview']
  candidateColors?: Record<number, number>
  color?: number
  cellAnnotation?: CellAnnotation
  candidateAnnotations?: ReadonlyMap<number, CandidateAnnotation>
  selected: boolean
  active: boolean
  pointerFocused: boolean
  error: boolean
  related: boolean
  matching: boolean
  ruleHighlighted: boolean
  cellHighlight: '' | 'candidate-highlight-cell' | 'candidate-highlight-light'
  countHighlighted: boolean
  candidateHighlightMask: number
  highlightLabel: string
  countLabel: string
  linkTargetMask: number
  highlightsLinkTargetCell: boolean
  canSelectLinkCandidate: boolean
  highlightedLinkDigit: number | null
  selectedCandidateDigit?: number
  tabCandidateDigit?: number
  tabCandidateSlotted?: boolean
  onCandidateFocus: (candidate: CandidateSlot) => void
}

// A cell receives its own values and visual flags, never the whole board selection
// or position. An edit can therefore leave unrelated cells and their marks intact.
const BoardCell = memo(function BoardCell({
  geometry, value, fixed, center, corner, centerMask, gridMask, displayedGridMask, digitSlots, annotatedSlots,
  preview, candidateColors, color, cellAnnotation, candidateAnnotations, selected, active, pointerFocused,
  error, related, matching, ruleHighlighted, cellHighlight, countHighlighted, candidateHighlightMask, highlightLabel, countLabel,
  linkTargetMask, highlightsLinkTargetCell, canSelectLinkCandidate, highlightedLinkDigit, selectedCandidateDigit, tabCandidateDigit, tabCandidateSlotted,
  onCell, onCellDoubleClick, onCellPointerDown, onCandidate, onPaintCandidate, onCandidateHover, onCandidateFocus,
}: CellProps) {
  const { index, row, column: col, boxColumns, cageTotal, regionAtCell } = geometry
  const candidateAction = onPaintCandidate ?? onCandidate
  const Cell = onCell && !candidateAction ? 'button' : 'div'
  const centerCandidates = useMemo(() => marksOf(centerMask), [centerMask])
  const gridCandidates = useMemo(() => marksOf(displayedGridMask), [displayedGridMask])
  const previewSlotted = preview?.mode !== 'center' || annotatedSlots
  const previewMask = preview?.mode === 'center' && annotatedSlots ? center
    : preview?.mode === 'corner' && annotatedSlots ? corner : previewSlotted ? gridMask : centerMask
  const previewAction = preview && (hasCandidate(previewMask, preview.digit) ? 'remove' : 'add')
  const previewDigit = preview?.digit
  const visibleGridMask = displayedGridMask | (previewAction === 'add' && previewSlotted ? 1 << (previewDigit! - 1) : 0)
  const visibleCenterMask = centerMask | (previewAction === 'add' && !previewSlotted ? 1 << (previewDigit! - 1) : 0)
  const visibleGridCandidates = useMemo(() => marksOf(visibleGridMask), [visibleGridMask])
  const visibleCenterCandidates = useMemo(() => marksOf(visibleCenterMask), [visibleCenterMask])
  const cellStyle = useMemo(() => cellAnnotation && {
    '--cell-fill': error ? undefined : cellAnnotation.fill,
    color: error ? undefined : cellAnnotation.ink,
  } as CSSProperties, [cellAnnotation, error])
  const candidateLabel = useMemo(() => (candidateAnnotations || candidateColors) && [...new Set([...gridCandidates, ...centerCandidates])]
    .map((digit) => {
      const color = candidateColors?.[digit]
      const note = candidateAnnotations?.get(digit)?.label ?? (color ? COLORS[color - 1].toLowerCase() : undefined)
      return note && `${digit} ${note}`
    }).filter(Boolean).join(', '), [candidateAnnotations, candidateColors, gridCandidates, centerCandidates])
  const label = [
    `Row ${row}, column ${col}`,
    value ? (fixed ? `given ${value}` : `digit ${value}`) : 'empty',
    !value && gridCandidates.length ? `${digitSlots ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
    !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
    color ? COLORS[color - 1] : '',
    regionAtCell !== undefined && `region ${regionAtCell + 1}`,
    cellAnnotation?.label,
    geometry.clues,
    !value && candidateLabel,
    highlightLabel,
    highlightsLinkTargetCell && 'has candidates that can link to the selected candidate',
    countLabel,
    error ? 'incorrect' : '',
  ].filter(Boolean).join(', ')
  const classes = [
    'cell', canSelectLinkCandidate ? 'chain-cell-target' : '', fixed ? 'given' : 'entry', related ? 'peer' : '', matching ? 'matching' : '',
    cellHighlight, countHighlighted ? 'candidate-count-match' : '', color ? `colored color-${color}` : '',
    error ? 'conflict' : '', selected ? 'selected' : '',
  ].join(' ')

  // Dense digit highlights change often. Reuse each unchanged read-only glyph,
  // including its style object, instead of rebuilding all nine marks per cell.
  const readOnlyCandidates = useMemo(() => candidateAction ? null : [visibleGridCandidates, visibleCenterCandidates].map((digits, group) =>
    new Map(digits.map(digit => {
      const annotation = candidateAnnotations?.get(digit)
      const color = candidateColors?.[digit]
      const colorClass = color && annotation?.mark !== 'emphasized' && annotation?.mark !== 'strike' ? `candidate-color color-${color}` : ''
      const style = {
        gridArea: group === 0 ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
        opacity: annotation?.opacity,
        '--annotation-color': annotation?.color,
      } as CSSProperties
      const className = ['board-candidate', colorClass].filter(Boolean).join(' ')
      const normal = <span key={digit} className={className} style={style}
        data-mark={annotation && (annotation.mark ?? 'ring')} data-strike={annotation?.strike || undefined}>{digit}</span>
      return [digit, { normal, highlighted: cloneElement(normal, { className: `${className} candidate-match` }) }] as const
    }))), [candidateAction, visibleGridCandidates, visibleCenterCandidates, candidateAnnotations, candidateColors, boxColumns])

  const selectCandidate = useCallback((digit: number, slotted: boolean) => {
    onCandidateFocus({ cell: index, digit, slotted })
    candidateAction?.({ cell: index, digit })
  }, [candidateAction, index, onCandidateFocus])

  const renderCandidate = useCallback((digit: number, slotted: boolean) => {
    const previewEdit = digit === previewDigit && slotted === previewSlotted ? previewAction : undefined
    const highlighted = !previewEdit && hasCandidate(candidateHighlightMask, digit)
    if (readOnlyCandidates) {
      const cached = readOnlyCandidates[slotted ? 0 : 1].get(digit)!
      return previewEdit ? cloneElement(cached.normal, { 'data-candidate-preview': previewEdit })
        : highlighted ? cached.highlighted : cached.normal
    }
    const annotation = candidateAnnotations?.get(digit)
    const color = candidateColors?.[digit]
    const colorClass = color && annotation?.mark !== 'emphasized' && annotation?.mark !== 'strike' ? `candidate-color color-${color}` : ''
    const style = {
      gridArea: slotted ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
      opacity: annotation?.opacity,
      '--annotation-color': annotation?.color,
    } as CSSProperties
    const highlightClass = highlighted ? 'candidate-match' : undefined
    if (candidateAction) {
      const candidate = { cell: index, digit }
      const pending = selectedCandidateDigit === digit
      const linkTarget = hasCandidate(linkTargetMask, digit)
      const candidateLabel = [`${digit} in row ${row}, column ${col}`, annotation?.label, color && COLORS[color - 1],
        highlighted && 'highlighted', linkTarget && 'can link to the selected candidate'].filter(Boolean).join(', ')
      const classes = `board-candidate candidate-button ${onPaintCandidate ? 'paint-candidate' : 'chain-candidate'}`
      return <button type="button" key={digit} className={classes} style={style}
        aria-label={candidateLabel} data-link-target={linkTarget || undefined}
        aria-pressed={onCandidate ? pending : undefined} data-mark={annotation && (annotation.mark ?? 'ring')}
        data-strike={annotation?.strike || undefined}
        tabIndex={tabCandidateDigit === digit && tabCandidateSlotted === slotted ? 0 : -1}
        onPointerEnter={onCandidateHover && ((event) => {
          if (event.pointerType !== 'touch') onCandidateHover(candidate)
        })}
        onPointerLeave={onCandidateHover && (() => onCandidateHover(null))}
        onMouseDown={onPaintCandidate ? undefined : (event) => event.preventDefault()}
        onFocus={() => onCandidateFocus({ ...candidate, slotted })}
        onClick={() => selectCandidate(digit, slotted)}>
        <span className={['candidate-glyph', colorClass, !annotation && (highlighted || linkTarget) && 'candidate-match'].filter(Boolean).join(' ')}>{digit}</span>
      </button>
    }
    return <span key={digit} className={['board-candidate', colorClass, highlightClass].filter(Boolean).join(' ')}
      style={style} data-mark={annotation && (annotation.mark ?? 'ring')} data-strike={annotation?.strike || undefined}
      data-candidate-preview={previewEdit}>{digit}</span>
  }, [readOnlyCandidates, candidateAnnotations, candidateColors, previewDigit, previewSlotted, previewAction, boxColumns, candidateHighlightMask,
    candidateAction, index, row, col, selectedCandidateDigit, linkTargetMask, onPaintCandidate, onCandidate,
    tabCandidateDigit, tabCandidateSlotted, onCandidateHover, onCandidateFocus, selectCandidate])

  // Selection and cell fill changes must not restart the candidate/value fades.
  const gridItems = useMemo(() => !value && visibleGridCandidates.length
    ? visibleGridCandidates.map(digit => renderCandidate(digit, true)) : NO_MARKS, [value, visibleGridCandidates, renderCandidate])
  const valueItems = useMemo(() => value
    ? [<span className="cell-value" key={value} aria-hidden="true">{value}</span>] : NO_MARKS, [value])
  const centerKey = visibleCenterCandidates.join('')
  const centerItems = useMemo(() => !value && centerKey
    ? [<span className="center-marks" key={`center-${centerKey}`} aria-hidden={candidateAction ? undefined : true}>
      {visibleCenterCandidates.map(digit => renderCandidate(digit, false))}
    </span>] : NO_MARKS, [value, centerKey, candidateAction, visibleCenterCandidates, renderCandidate])
  const cellItems = value ? valueItems : centerItems
  const labeledItems = useMemo(() => cageTotal === undefined ? cellItems : [
    <span className="variant-cage-total" key={`cage-${cageTotal}`} aria-hidden="true" style={geometry.cageStyle}>{cageTotal}</span>,
    ...cellItems,
  ], [cageTotal, geometry.cageStyle, cellItems])

  return <Cell role="gridcell" data-cell={index} data-clone={geometry.cloneLabel} className={classes} style={cellStyle} aria-label={label}
    data-region-color={geometry.regionColor} data-house-fill={geometry.houseFill || undefined}
    data-pointer-focused={pointerFocused || undefined}
    aria-description={preview ? `${previewAction === 'add' ? 'Add' : 'Remove'} candidate ${preview.digit}` : undefined}
    data-box-edge={geometry.boxEdge || undefined} data-region-right={geometry.regionRight || undefined}
    data-rule-highlighted={ruleHighlighted || undefined}
    data-region-bottom={geometry.regionBottom || undefined} data-alternate-box={geometry.alternateBox || undefined}
    data-cage-total={cageTotal !== undefined || undefined}
    type={onCell && 'button'} tabIndex={onCell ? (active ? 0 : -1) : undefined} aria-selected={onCell ? selected : undefined}
    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
    onClick={onCell ? event => onCell(index, event) : highlightedLinkDigit != null ? event => {
      if (event.target instanceof Element && event.target.closest('.candidate-button')) return
      selectCandidate(highlightedLinkDigit, visibleGridCandidates.includes(highlightedLinkDigit))
    } : undefined}
    onDoubleClick={onCellDoubleClick && ((event) => onCellDoubleClick(index, event))}>
    <BoardMarks items={gridItems} group={candidateAction ? INTERACTIVE_CANDIDATE_GROUP : HIDDEN_CANDIDATE_GROUP} />
    <BoardMarks items={labeledItems} />
  </Cell>
})

export function gridCellAtPoint(grid: HTMLDivElement | null, { clientX, clientY }: { clientX: number; clientY: number }) {
  const cell = grid?.ownerDocument.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-cell]')
  return cell && grid?.contains(cell) ? Number(cell.dataset.cell) : null
}

export function Board({
  variantPuzzle, highlightedRule, grid: sizedGrid, algebraicCages, sizedRules, givens, values, position, errors, candidateLayout = 'grid', candidates, candidatePreview, annotations, region, label = 'Sudoku grid', showGuides, overlay,
  highlightedDigit, highlightedDigitMask = 0, highlightedDigitMatch = 'all', highlightCandidateCells = false, highlightCandidateCount, highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
  selected = NO_SELECTION, active = 0, pointerFocusedCell, boardRef, onCell, onGridKeyDown, onCellDoubleClick, linkDrawing, onCandidate, onLinkSelect, onCandidateHover, isLinkTarget, selectedCandidate, dragSelect = false,
  onCellPointerDown, onCellPointerMove, onGridPointerLeave, onPaintCandidate, descriptionId, showAnnotatedCandidates, showPlayerColors = true,
  modeBorder, modeBoundaryRef, modeBadge,
}: Props) {
  const grid = sizedGrid ?? CLASSIC_GRID
  const gridSize = grid.size
  const slotsAcross = Math.ceil(Math.sqrt(gridSize))
  const boxRows = 'boxRows' in grid ? grid.boxRows : Math.ceil(gridSize / slotsAcross)
  const boxColumns = 'boxColumns' in grid ? grid.boxColumns : slotsAcross
  const variantRules = variantPuzzle?.rules
  const houseFills = useMemo(() => new Set(variantRules?.flatMap(variantHouseFillCells)), [variantRules])
  const highlightedDiagonals = useMemo(() => highlightedRule === 'diagonal'
    ? (variantRules ?? []).flatMap(rule => rule.type === 'diagonal' ? [rule.diagonal] : []) : [], [highlightedRule, variantRules])
  const linkedDoubleArrows = useMemo(() => sizedRules?.filter(rule => rule.type === 'linked-double-arrow') ?? [], [sizedRules])
  const outside = useMemo(() => {
    const layout = outsideClueLayout(variantRules)
    for (const rule of linkedDoubleArrows) for (const end of rule.ends) if (typeof end !== 'number') {
      const side = sizedXSumSide(end.direction)
      layout.depths[side] = Math.max(layout.depths[side], 1)
    }
    return layout
  }, [variantRules, linkedDoubleArrows])
  const hasOutside = Object.values(outside.depths).some(Boolean)
  const clones = useMemo(() => cloneLayout(variantRules), [variantRules])
  const disjoint = useMemo(() => disjointGroupRuleIndices(variantRules ?? []), [variantRules])
  const gridLabel = [sizedGrid ? `${gridSize} × ${gridSize} ${label.toLowerCase()}` : label, variantRules?.some(rule => rule.type === 'global-entropy')
    && 'Global Entropy: every 2 × 2 area needs a low digit 1–3, a medium digit 4–6 and a high digit 7–9, including across box or region borders.',
    disjoint.size && DISJOINT_GROUPS_RULE].filter(Boolean).join(' ')
  const regions = variantPuzzle?.regions
  const regionsAt = useMemo(() => 'regions' in grid ? jigsawMembership(grid)
    : regions?.type === 'jigsaw' ? regionMembership(regions.regions) : undefined, [grid, regions])
  const regionColors = useMemo(() => regionsAt && jigsawRegionColors(regionsAt, gridSize), [regionsAt, gridSize])
  const rectangularBoxes = !regionsAt && 'boxRows' in grid
  const cellClues = useMemo(() => variantRules ? variantCellLabels(variantRules, variantPuzzle?.regions) : undefined, [variantRules, variantPuzzle?.regions])
  const sizedLabels = useMemo(() => sizedGrid && sizedRules ? sizedRuleClueLabels(sizedRules, sizedGrid) : undefined, [sizedRules, sizedGrid])
  const cageTotals = useMemo(() => new Map((variantRules ?? sizedRules)?.flatMap((rule) => rule.type === 'killer-cages'
    ? rule.cages.map(({ cells, sum }) => [Math.min(...cells), sum] as const) : [])), [variantRules, sizedRules])
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
  const variantClues = useMemo(() => {
    const rules = variantRules?.filter(rule => rule.type === highlightedRule || !variantHouseFillCells(rule).length)
    return rules?.length
      ? [<div className="board-variant-clues" key={JSON.stringify(rules)}><VariantClues rules={rules} /></div>]
      : NO_MARKS
  }, [highlightedRule, variantRules])
  const [candidateFocus, setCandidateFocus] = useState<CandidateSlot>()
  const highlightedDigits = useMemo(() => marksOf(highlightedDigitMask), [highlightedDigitMask])
  const matchAnyDigit = highlightedDigitMatch === 'any' && highlightedDigitMask !== 0
  const filterCandidates = matchAnyDigit || highlightedDigits.length > 1
  const focusDigit = filterCandidates ? null : activeHighlightDigit(values, selected, active, highlightedDigits[0] ?? highlightedDigit)
  const candidateAction = onPaintCandidate ?? onCandidate
  const layout = candidates ? 'grid' : candidateLayout
  const annotationSlots = showAnnotatedCandidates ? annotations?.candidates : undefined
  const usesDigitSlots = (cell: number) => layout === 'grid' || Boolean(annotationSlots?.has(cell))
  // An outside total needs its complete row or column visible in teaching diagrams.
  const visibleRegion = hasOutside ? undefined : region
  const coordinates = useMemo(() => sizedGrid ? DIGITS.slice(0, gridSize) : DIGITS, [sizedGrid, gridSize])
  const rows = useMemo(() => visibleRegion ? coordinates.slice(visibleRegion.row, visibleRegion.row + visibleRegion.rows) : coordinates,
    [coordinates, visibleRegion?.row, visibleRegion?.rows])
  const columns = useMemo(() => visibleRegion ? coordinates.slice(visibleRegion.column, visibleRegion.column + visibleRegion.columns) : coordinates,
    [coordinates, visibleRegion?.column, visibleRegion?.columns])
  const size = { ...((visibleRegion || sizedGrid) && { '--board-rows': rows.length, '--board-columns': columns.length }),
    ...(sizedGrid && { '--candidate-rows': boxRows, '--candidate-columns': boxColumns }),
    ...(hasOutside && Object.fromEntries(Object.entries(outside.depths).map(([side, depth]) => ['--outside-' + side, depth]))),
    ...(hasOutside && { '--outside-left-track': `${outside.depths.left}fr`, '--outside-right-track': `${outside.depths.right}fr`, '--board-outside-grid-track': `${gridSize}fr` }),
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

  const boardEvents = useBoardEvents({ onCell, onCellDoubleClick, onCellPointerDown, onCandidate, onPaintCandidate, onCandidateHover, onLinkSelect })
  const selectedCells = useMemo(() => new Set(selected), [selected])
  const relatedCells = useMemo(() => {
    const related = new Set<number>()
    if (!filterCandidates && highlighting.relatedCells) for (let index = 0; index < gridSize * gridSize; index++) {
      if (selected.some(cell => peer(index, cell, variantPuzzle, grid, sizedRules))) related.add(index)
    }
    return related
  }, [filterCandidates, highlighting.relatedCells, selected, gridSize, variantPuzzle, grid, sizedRules])
  const geometry = useMemo(() => Array.from({ length: gridSize * gridSize }, (_, index): CellGeometry => {
    const row = Math.floor(index / gridSize) + 1, column = index % gridSize + 1
    const regionAtCell = regionsAt?.[index]
    const cageTotal = cageTotals.get(index) ?? algebraicLabels.captions.get(index)
    return {
      index, row, column, boxColumns, cloneLabel: clones.at[index]?.label, cageTotal, regionAtCell,
      regionColor: regionAtCell === undefined ? undefined : regionColors?.[regionAtCell], houseFill: houseFills.has(index),
      cageStyle: cageTotal !== undefined && variantRules ? { insetInlineStart: `${cageLabelInset(index, variantRules) * 100}%` } : undefined,
      boxEdge: rectangularBoxes && column % boxColumns === 0,
      regionRight: Boolean(regionsAt && column < gridSize && regionAtCell !== regionsAt[index + 1]),
      regionBottom: Boolean(regionsAt && row < gridSize && regionAtCell !== regionsAt[index + gridSize]),
      alternateBox: rectangularBoxes && (Math.floor((row - 1) / boxRows) + Math.floor((column - 1) / boxColumns)) % 2 === 1,
      clues: [cellClues?.[index]?.join(', '), sizedLabels?.[index], algebraicLabels.descriptions.get(index)?.join(', ')].filter(Boolean).join(', '),
    }
  }), [gridSize, boxRows, boxColumns, regionsAt, regionColors, houseFills, rectangularBoxes, cageTotals, algebraicLabels, clones, variantRules, cellClues, sizedLabels])

  // Parent timers and fresh event closures do not change the grid. Event wrappers
  // read the latest committed callbacks even when this element tree is reused.
  const gridRows = useMemo(() => rows.map((row) => (
    <div className="grid-row" role="row" data-box-edge={rectangularBoxes && row % boxRows === 0 || undefined} key={row}>
      {columns.map((col) => {
        const index = (row - 1) * gridSize + col - 1
        const value = Number(values[index])
        const center = position?.center[index] ?? 0, corner = position?.corner[index] ?? 0
        const digitSlots = layout === 'grid' || Boolean(annotationSlots?.has(index))
        const centerMarks = digitSlots ? 0 : center
        const gridMarks = candidates?.[index] ?? (corner | (digitSlots ? center : 0))
        const linkedDigits = annotationSlots?.get(index)
        let displayedGridMarks = gridMarks
        for (const digit of linkedDigits?.keys() ?? []) displayedGridMarks |= 1 << (digit - 1)
        const candidateMask = candidates?.[index] ?? (center | corner)
        const preview = !value && candidatePreview?.cell === index ? candidatePreview : undefined
        const visibleCandidateMask = displayedGridMarks | centerMarks | (preview ? 1 << (preview.digit - 1) : 0)
        let linkTargetMask = 0
        if (isLinkTarget && !value) for (const digit of marksOf(visibleCandidateMask)) {
          if (isLinkTarget({ cell: index, digit })) linkTargetMask |= 1 << (digit - 1)
        }
        const candidateMatches = !value && focusDigit != null && hasCandidate(candidateMask, focusDigit)
        const matchingMask = filterCandidates && !value ? candidateMask & highlightedDigitMask : 0
        const matchesFilter = matchingMask !== 0 && (matchAnyDigit || matchingMask === highlightedDigitMask)
        const matchesWithExtras = matchesFilter && matchAnyDigit && matchingMask !== candidateMask
        const highlightsFocusDigit = candidateMatches && highlighting.matchingCandidates
        const canSelectLinkCandidate = Boolean(linkDrawing && onCandidate && !value && visibleCandidateMask)
        const highlightedLinkDigit = canSelectLinkCandidate && highlightsFocusDigit ? focusDigit : null
        const highlightsCell = highlightCandidateCells && (matchesFilter || highlightsFocusDigit)
        const highlightsLinkTargetCell = highlightCandidateCells && Boolean(linkTargetMask)
        const candidateCountMatches = !value && !filterCandidates && highlightCandidateCount != null && candidateCount(candidateMask) === highlightCandidateCount
        const candidateHighlightMask = !highlightCandidateCells ? (candidateCountMatches ? visibleCandidateMask
          : matchesFilter ? matchingMask : highlightsFocusDigit ? 1 << (focusDigit! - 1) : 0) & visibleCandidateMask : 0
        const highlightLabel = matchesFilter ? matchAnyDigit
          ? matchesWithExtras ? 'cell has selected candidates and other candidates' : 'cell has only selected candidates'
          : highlightsCell ? `cell highlighted for candidates ${highlightedDigits.join(', ')}`
            : `candidates ${highlightedDigits.join(', ')} highlighted`
          : highlightsCell ? `cell highlighted for candidate ${focusDigit}`
            : highlightsFocusDigit ? `candidate ${focusDigit} highlighted` : ''
        const countLabel = candidateCountMatches ? highlightCandidateCells ? `${highlightCandidateCount}-candidate cell highlighted`
          : `all ${highlightCandidateCount} candidates highlighted` : ''
        return <BoardCell key={col} geometry={geometry[index]} value={value} fixed={givens[index] !== '0'}
          center={center} corner={corner} centerMask={centerMarks} gridMask={gridMarks} displayedGridMask={displayedGridMarks}
          digitSlots={digitSlots} annotatedSlots={Boolean(linkedDigits)} preview={preview}
          candidateColors={showPlayerColors && (!candidates || onCandidate) ? position?.candidateColors?.[index] : undefined}
          color={showPlayerColors ? position?.colors?.[index] : undefined}
          cellAnnotation={annotations?.cells?.get(index)} candidateAnnotations={annotations?.candidates?.get(index)}
          selected={selectedCells.has(index)} active={active === index} pointerFocused={pointerFocusedCell === index}
          error={Boolean(errors?.has(index))} related={relatedCells.has(index)} matching={highlighting.matchingDigits && value === focusDigit}
          ruleHighlighted={highlightedDiagonals.some(diagonal => diagonal === 'main' ? row === col : row + col === gridSize + 1)}
          cellHighlight={highlightsLinkTargetCell || (highlightsCell && !matchesWithExtras) ? 'candidate-highlight-cell'
            : highlightsCell ? 'candidate-highlight-light' : ''}
          countHighlighted={highlightCandidateCells && candidateCountMatches} candidateHighlightMask={candidateHighlightMask}
          highlightLabel={highlightLabel} countLabel={countLabel} linkTargetMask={linkTargetMask} highlightsLinkTargetCell={highlightsLinkTargetCell}
          canSelectLinkCandidate={canSelectLinkCandidate} highlightedLinkDigit={highlightedLinkDigit}
          selectedCandidateDigit={selectedCandidate?.cell === index ? selectedCandidate.digit : undefined}
          tabCandidateDigit={tabCandidate?.cell === index ? tabCandidate.digit : undefined}
          tabCandidateSlotted={tabCandidate?.cell === index ? tabCandidate.slotted : undefined} onCandidateFocus={setCandidateFocus}
          onCell={onCell ? boardEvents.onCell : undefined} onCellDoubleClick={onCellDoubleClick ? boardEvents.onCellDoubleClick : undefined}
          onCellPointerDown={onCellPointerDown ? boardEvents.onCellPointerDown : undefined}
          onCandidate={onCandidate ? boardEvents.onCandidate : undefined} onPaintCandidate={onPaintCandidate ? boardEvents.onPaintCandidate : undefined}
          onCandidateHover={onCandidateHover ? boardEvents.onCandidateHover : undefined} />
      })}
    </div>
  )), [
    rows, columns, rectangularBoxes, boxRows, gridSize, geometry, values, givens, layout, annotationSlots,
    position?.center, position?.corner, position?.candidateColors, position?.colors, candidates, candidatePreview,
    isLinkTarget, focusDigit, filterCandidates, highlightedDigitMask, highlightedDiagonals, matchAnyDigit, highlighting.matchingCandidates,
    highlighting.matchingDigits, highlightCandidateCells, highlightCandidateCount, highlightedDigits, showPlayerColors,
    annotations?.cells, annotations?.candidates, selectedCells, active, pointerFocusedCell, errors, relatedCells,
    selectedCandidate?.cell, selectedCandidate?.digit, tabCandidate?.cell, tabCandidate?.digit, tabCandidate?.slotted,
    setCandidateFocus, boardEvents, Boolean(onCell), Boolean(onCellDoubleClick), Boolean(onCellPointerDown),
    Boolean(onCandidate), Boolean(onPaintCandidate), Boolean(onCandidateHover), linkDrawing,
  ])

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
      <div className={`board-body${variantPuzzle || algebraicCages?.length || sizedRules?.length ? ' variant-board' : ''}${regionsAt ? ' jigsaw-board' : ''}${houseFills.size ? ' shaded-houses-board' : ''}`}
        data-highlighted-rule={highlightedRule ?? undefined} data-input-mode={modeBorder} ref={modeBoundaryRef}>
        <div className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`} role="grid" aria-label={gridLabel}
          aria-describedby={descriptionId} aria-readonly={(!onCell && !candidateAction) || undefined} ref={boardRef}
          aria-hidden={overlay?.visible || undefined} inert={overlay?.visible || undefined}
          onKeyDown={candidateAction ? navigateCandidates : onGridKeyDown}
          onPointerLeave={onGridPointerLeave}
          onPointerMove={onCellPointerMove && ((event) => onCellPointerMove(gridCellAtPoint(event.currentTarget, event), event))}>
          {gridRows}
        </div>
        <BoardMarks items={variantClues} />
        {sizedGrid && sizedRules && sizedRules.length > 0 && <div className="board-variant-clues"><MemoSizedRuleClues rules={sizedRules} size={gridSize} /></div>}
        {algebraicCages && algebraicCages.length > 0 && <div className="board-variant-clues"><MemoAlgebraicCages rules={algebraicCages} /></div>}
        {hasOutside && <MemoOutsideClues layout={outside} hidden={overlay?.visible} />}
        {linkedDoubleArrows.length > 0 && <MemoLinkedDoubleArrowClues rules={linkedDoubleArrows} size={gridSize} hidden={overlay?.visible} />}
        <BoardLinks links={annotations?.links} region={visibleRegion} candidateInsets={candidateInsets} onSelect={onLinkSelect ? boardEvents.onLinkSelect : undefined} />
        {overlay && <div className="board-overlay" aria-hidden={!overlay.visible || undefined} inert={!overlay.visible || undefined}
          data-no-panel-hold>{overlay.content}</div>}
        {modeBadge}
      </div>
      {outside.legend.length > 0 && <div className="outside-clue-legend" aria-hidden={overlay?.visible || undefined}>{outside.legend.join(' · ')}</div>}
    </div>
  )
}
