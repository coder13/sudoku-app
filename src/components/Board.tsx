import { fogFragmentLabels, type FogView } from '../sudoku/fog'
import { cloneElement, memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { sizedXSumSide } from '../sudoku/sized-linked-double-arrow'
import type { Candidate, SizedConstraintRule, SizedVariantPosition, VariantPuzzle, VariantRule } from '../sudoku/engine'
import { candidateCount, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type Position } from '../sudoku/game'
import { jigsawMembership, jigsawRegionColors, CLASSIC_GRID, type SizedGrid } from '../sudoku/grid'
import { activeHighlightDigit, type DigitHighlightMatch } from '../sudoku/highlighting'
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from '../sudoku/preferences'
import type { PuzzleInputMode } from '../sudoku/puzzle-input-mode'
import { DISJOINT_GROUPS_RULE, disjointGroupRuleIndices, regionMembership, variantHouseFillCells, type VariantRuleSectionId } from '../sudoku/variants'
import { outsideClueLayout } from '../sudoku/outside-clues'
import { cellSelectionEdges } from '../sudoku/selection'
import { WHISPERS_GUIDE_COUNTS, whispersGuideDigits, whispersLinkCounts } from '../sudoku/whispers-guide'
import { OutsideClues } from './OutsideClues'
import { cloneLayout } from '../sudoku/clone'
import { AlgebraicCages, LinkedDoubleArrowClues, SizedRuleClues, VariantClues, cageLabelInset, sizedRuleClueLabels, variantCellLabels } from './VariantClues'
import { boardGroupDescription, boardGroups, BoardArtwork, BoardLinks, BoardQuickDraw, type BoardAnnotations, type BoardRegion, type CandidateAnnotation, type CellAnnotation } from './BoardAnnotations'
import type { AuthoredMark } from '../sudoku/authored-artwork'
import { BoardMarks, type BoardMark } from './BoardMarks'
import { importedColorFill, importedColorLabel, type ImportedCellColors } from '../sudoku/imported-colors'

type Props = {
  descriptionId?: string
  variantPuzzle?: VariantPuzzle
  fog?: FogView
  whispersGuide?: true
  givenCellColors?: ImportedCellColors
  authoredArtwork?: readonly AuthoredMark[]
  highlightedRule?: VariantRuleSectionId | null
  grid?: SizedGrid
  algebraicCages?: SizedVariantPosition['rules']
  sizedRules?: readonly SizedConstraintRule[]
  givens: string
  values: string
  position?: Pick<Position, 'center' | 'corner'> & Partial<Pick<Position, 'colors' | 'candidateColors' | 'importedCellColors' | 'importedCandidateColors' | 'importedDrawings'>>
  errors?: ReadonlySet<number>
  candidateLayout?: CandidateLayout
  candidates?: readonly number[]
  candidatePreview?: Candidate & { mode: 'candidate' | 'center' | 'corner' }
  candidateGroupPreview?: { cell: number; mask: number; mode: 'candidate' | 'center' | 'corner' }
  annotations?: BoardAnnotations
  showAnnotatedCandidates?: boolean
  showPlayerColors?: boolean
  showImportedAnnotations?: boolean
  region?: BoardRegion
  label?: string
  showGuides: boolean
  overlay?: { content: ReactNode; visible: boolean }
  highlightedDigit?: number | null
  highlightedDigitMask?: number
  highlightedDigitMatch?: DigitHighlightMatch
  highlightCandidateCells?: boolean
  fullCandidateCellHighlight?: boolean
  highlightCandidateCount?: number | null
  highlighting?: HighlightPreferences
  selected?: readonly number[]
  active?: number
  pointerFocusedCell?: number | null
  boardRef?: RefObject<HTMLDivElement | null>
  /** The mode border follows the grid. Outside clues place the badge at the frame edge. */
  modeBorder?: PuzzleInputMode
  modeBoundaryRef?: Ref<HTMLDivElement>
  modeBadge?: ReactNode
  onCell?: (index: number, event: MouseEvent) => void
  onGiven?: (digit: number) => void
  onGridKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  onCellDoubleClick?: (index: number, event: MouseEvent) => void
  linkDrawing?: boolean
  onCandidate?: (candidate: Candidate) => void
  canSelectCandidate?: (candidate: Candidate) => boolean
  onLinkSelect?: (candidate: Candidate) => void
  onPaintCandidate?: (candidate: Candidate) => void
  onCandidateHover?: (candidate: Candidate | null) => void
  isLinkTarget?: (candidate: Candidate) => boolean
  selectedCandidate?: Candidate
  selectedCandidates?: readonly Candidate[]
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

type BoardEvents = Pick<Props, 'onCell' | 'onGiven' | 'onCellDoubleClick' | 'onCellPointerDown' | 'onCandidate' | 'onPaintCandidate' | 'onCandidateHover' | 'onLinkSelect'>

function useBoardEvents(events: BoardEvents) {
  const committed = useRef(events)
  // Keep event identities stable without exposing callbacks from an abandoned render.
  // Cell handlers still receive the original synthetic event and currentTarget.
  useLayoutEffect(() => { committed.current = events })
  return useMemo(() => ({
    onCell: (index: number, event: MouseEvent) => committed.current.onCell?.(index, event),
    onGiven: (digit: number) => committed.current.onGiven?.(digit),
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
  whispersLinks?: number
  boxEdge: boolean
  regionRight: boolean
  regionBottom: boolean
  alternateBox: boolean
  clues: string
}

type Preview = NonNullable<Props['candidatePreview'] | Props['candidateGroupPreview']>

function previewDigitsMask(preview: Preview) {
  return 'mask' in preview ? preview.mask : 1 << (preview.digit - 1)
}

type CellProps = Omit<BoardEvents, 'onLinkSelect'> & {
  geometry: CellGeometry
  value: number
  fixed: boolean
  fogged: boolean
  center: number
  corner: number
  centerMask: number
  gridMask: number
  displayedGridMask: number
  digitSlots: boolean
  annotatedSlots: boolean
  preview?: Preview
  candidateColors?: Record<number, number>
  importedCandidateColors?: Record<number, string>
  color?: number
  importedColors?: readonly string[]
  cellAnnotation?: CellAnnotation
  candidateAnnotations?: ReadonlyMap<number, CandidateAnnotation>
  selected: boolean
  selectionEdges?: string
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
  canSelectCandidate?: (candidate: Candidate) => boolean
  highlightedLinkDigit: number | null
  selectedCandidateMask: number
  tabCandidateDigit?: number
  tabCandidateSlotted?: boolean
  onCandidateFocus: (candidate: CandidateSlot) => void
}

function candidateColorClass(color: number | undefined, imported: string | undefined, mark: CandidateAnnotation['mark']) {
  if (mark === 'emphasized' || mark === 'strike') return ''
  return color ? `candidate-color color-${color}` : imported ? 'candidate-color imported-candidate-color' : ''
}

// A cell receives its own values and visual flags, never the whole board selection
// or position. An edit can therefore leave unrelated cells and their marks intact.
const BoardCell = memo(function BoardCell({
  geometry, value, fixed, fogged, center, corner, centerMask, gridMask, displayedGridMask, digitSlots, annotatedSlots,
  preview, candidateColors, importedCandidateColors, color, importedColors, cellAnnotation, candidateAnnotations, selected, selectionEdges, active, pointerFocused,
  error, related, matching, ruleHighlighted, cellHighlight, countHighlighted, candidateHighlightMask, highlightLabel, countLabel,
  linkTargetMask, highlightsLinkTargetCell, canSelectLinkCandidate, canSelectCandidate, highlightedLinkDigit, selectedCandidateMask, tabCandidateDigit, tabCandidateSlotted,
  onCell, onGiven, onCellDoubleClick, onCellPointerDown, onCandidate, onPaintCandidate, onCandidateHover, onCandidateFocus,
}: CellProps) {
  const { index, row, column: col, boxColumns, cageTotal, regionAtCell } = geometry
  const candidateAction = onPaintCandidate ?? onCandidate
  const givenAction = fixed && Boolean(onGiven)
  const regularCellAction = Boolean(onCell && !candidateAction)
  // Keep given cells as stable grid buttons in a candidate tool, even when
  // their only action is the explicit strong-link digit callback.
  const fixedCellAction = fixed && Boolean(onCell)
  const buttonCell = givenAction || regularCellAction || Boolean(fixed && highlightedLinkDigit != null)
  const Cell = buttonCell ? 'button' : 'div'
  const centerCandidates = useMemo(() => marksOf(centerMask), [centerMask])
  const gridCandidates = useMemo(() => marksOf(displayedGridMask), [displayedGridMask])
  const previewSlotted = preview?.mode !== 'center' || annotatedSlots
  const chosenPreviewMarks = preview ? previewDigitsMask(preview) : 0
  const existingPreviewMarks = preview && 'mask' in preview
    ? preview.mode === 'center' ? center : preview.mode === 'corner' ? corner : center | corner
    : preview?.mode === 'center' && annotatedSlots ? center
      : preview?.mode === 'corner' && annotatedSlots ? corner : previewSlotted ? gridMask : centerMask
  const removedPreviewMarks = existingPreviewMarks & chosenPreviewMarks
  const addedPreviewMarks = removedPreviewMarks ? 0 : chosenPreviewMarks
  const previewAction = removedPreviewMarks ? 'remove' : 'add'
  const previewEditMask = removedPreviewMarks || addedPreviewMarks
  const previewDigits = preview ? marksOf(previewEditMask) : []
  const visibleGridMask = displayedGridMask | (previewSlotted ? addedPreviewMarks : 0)
  const visibleCenterMask = centerMask | (!previewSlotted ? addedPreviewMarks : 0)
  const visibleGridCandidates = useMemo(() => marksOf(visibleGridMask), [visibleGridMask])
  const gridCandidatesInOrder = visibleGridCandidates.every((digit, index) => digit === index + 1)
  const visibleCenterCandidates = useMemo(() => marksOf(visibleCenterMask), [visibleCenterMask])
  const cellStyle = useMemo(() => {
    if (error) return
    if (cellAnnotation) return { '--cell-fill': cellAnnotation.fill, color: cellAnnotation.ink } as CSSProperties
    if (!importedColors || color) return
    const fills = importedColors.map(importedColorFill)
    const stripes = fills.map((fill, index) => {
      const start = index * 100 / fills.length, end = (index + 1) * 100 / fills.length
      return `color-mix(in srgb, ${fill} var(--imported-color-weight), var(--board-selected-bg)) ${start}% ${end}%`
    })
    return { '--tone': fills[0],
      '--imported-cell-colors': fills.length > 1 ? `linear-gradient(90deg, ${stripes.join(', ')})` : undefined,
    } as CSSProperties
  }, [cellAnnotation, error, color, importedColors])
  const candidateLabel = useMemo(() => (candidateAnnotations || candidateColors || importedCandidateColors) && [...new Set([...gridCandidates, ...centerCandidates])]
    .map((digit) => {
      const color = candidateColors?.[digit]
      const imported = importedCandidateColors?.[digit]
      const note = candidateAnnotations?.get(digit)?.label ?? (color ? COLORS[color - 1].toLowerCase()
        : imported ? importedColorLabel(imported) : undefined)
      return note && `${digit} ${note}`
    }).filter(Boolean).join(', '), [candidateAnnotations, candidateColors, importedCandidateColors, gridCandidates, centerCandidates])
  const label = [
    `Row ${row}, column ${col}`,
    fogged && 'covered by fog',
    value ? (fixed ? `given ${value}` : `digit ${value}`) : 'empty',
    !value && gridCandidates.length ? `${digitSlots ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
    !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
    color ? COLORS[color - 1] : '',
    !color && importedColors?.length && `Cell colors ${importedColors.map(importedColorLabel).join(', ')}`,
    regionAtCell !== undefined && `region ${regionAtCell + 1}`,
    cellAnnotation?.label,
    geometry.whispersLinks ? `Whispers neighbors need at least ${geometry.whispersLinks} distinct digit${geometry.whispersLinks === 1 ? '' : 's'}` : '',
    !fogged && geometry.clues,
    !value && candidateLabel,
    highlightLabel,
    highlightsLinkTargetCell && 'has candidates that can link to the selected candidate',
    countLabel,
    error ? 'incorrect' : '',
  ].filter(Boolean).join(', ')
  const selectionBoxShadow = useMemo(() => {
    const shadows: Record<string, string> = {
      top: 'inset 0 2px 0 var(--board-selected-border)',
      right: 'inset -2px 0 0 var(--board-selected-border)',
      bottom: 'inset 0 -2px 0 var(--board-selected-border)',
      left: 'inset 2px 0 0 var(--board-selected-border)',
    }
    return selectionEdges?.split(' ').map(edge => shadows[edge]).join(', ')
  }, [selectionEdges])
  const renderedCellStyle = useMemo(() => selected && selectionBoxShadow
    ? { ...cellStyle, boxShadow: selectionBoxShadow } as CSSProperties
    : cellStyle, [cellStyle, selected, selectionBoxShadow])
  const classes = [
    'cell', canSelectLinkCandidate ? 'chain-cell-target' : '', fixed ? 'given' : 'entry', related ? 'peer' : '', matching ? 'matching' : '',
    cellHighlight, countHighlighted ? 'candidate-count-match' : '',
    color ? `colored color-${color}` : importedColors && !cellAnnotation ? 'colored imported-colors' : '',
    error ? 'conflict' : '', selected ? 'selected' : '',
  ].join(' ')

  // Dense digit highlights change often. Reuse each unchanged read-only glyph,
  // including its style object, instead of rebuilding all nine marks per cell.
  const readOnlyCandidates = useMemo(() => candidateAction ? null : [visibleGridCandidates, visibleCenterCandidates].map((digits, group) =>
    new Map(digits.map(digit => {
      const annotation = candidateAnnotations?.get(digit)
      const color = candidateColors?.[digit]
      const imported = importedCandidateColors?.[digit]
      const colorClass = candidateColorClass(color, imported, annotation?.mark)
      const style = {
        gridArea: group === 0 ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
        opacity: annotation?.opacity,
        '--annotation-color': annotation?.color,
        '--imported-candidate-tone': imported && !color ? importedColorFill(imported) : undefined,
      } as CSSProperties
      const className = ['board-candidate', colorClass].filter(Boolean).join(' ')
      const normal = <span key={digit} className={className} style={style}
        data-mark={annotation && (annotation.mark ?? 'ring')} data-strike={annotation?.strike || undefined}>{digit}</span>
      return [digit, { normal, highlighted: cloneElement(normal, { className: `${className} candidate-match` }) }] as const
    }))), [candidateAction, visibleGridCandidates, visibleCenterCandidates, candidateAnnotations, candidateColors, importedCandidateColors, boxColumns])

  const selectCandidate = useCallback((digit: number, slotted: boolean) => {
    onCandidateFocus({ cell: index, digit, slotted })
    candidateAction?.({ cell: index, digit })
  }, [candidateAction, index, onCandidateFocus])

  const renderCandidate = useCallback((digit: number, slotted: boolean) => {
    const previewEdit = hasCandidate(previewEditMask, digit) && slotted === previewSlotted ? previewAction : undefined
    const highlighted = !previewEdit && hasCandidate(candidateHighlightMask, digit)
    if (readOnlyCandidates) {
      const cached = readOnlyCandidates[slotted ? 0 : 1].get(digit)!
      return previewEdit ? cloneElement(cached.normal, { 'data-candidate-preview': previewEdit })
        : highlighted ? cached.highlighted : cached.normal
    }
    const annotation = candidateAnnotations?.get(digit)
    const color = candidateColors?.[digit]
    const imported = importedCandidateColors?.[digit]
    const colorClass = candidateColorClass(color, imported, annotation?.mark)
    const style = {
      gridArea: slotted && !gridCandidatesInOrder
        ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
      opacity: annotation?.opacity,
      '--annotation-color': annotation?.color,
      '--imported-candidate-tone': imported && !color ? importedColorFill(imported) : undefined,
    } as CSSProperties
    const highlightClass = highlighted ? 'candidate-match' : undefined
    const candidate = { cell: index, digit }
    if (candidateAction && (!canSelectCandidate || canSelectCandidate(candidate))) {
      const pending = hasCandidate(selectedCandidateMask, digit)
      const linkTarget = hasCandidate(linkTargetMask, digit)
      const candidateLabel = [`${digit} in row ${row}, column ${col}`, annotation?.label, color ? COLORS[color - 1] : imported && importedColorLabel(imported),
        highlighted && 'highlighted', linkTarget && 'can link to the selected candidate'].filter(Boolean).join(', ')
      const classes = `board-candidate candidate-button ${onPaintCandidate ? 'paint-candidate' : canSelectLinkCandidate ? 'chain-candidate' : ''}`
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
  }, [readOnlyCandidates, candidateAnnotations, candidateColors, importedCandidateColors, previewEditMask, previewSlotted, previewAction, boxColumns, candidateHighlightMask,
    candidateAction, canSelectCandidate, index, row, col, selectedCandidateMask, linkTargetMask, onPaintCandidate, onCandidate,
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

  return <Cell role="gridcell" data-cell={index} data-fogged={fogged || undefined} data-clone={geometry.cloneLabel} className={classes} style={renderedCellStyle} aria-label={label}
    data-region-color={geometry.regionColor} data-house-fill={geometry.houseFill || undefined}
    data-whispers-links={geometry.whispersLinks} data-pointer-focused={pointerFocused || undefined}
    aria-description={preview ? `${previewAction === 'add' ? 'Add' : 'Remove'} ${previewDigits.length === 1 ? 'candidate' : 'candidates'} ${previewDigits.join(', ')}` : undefined}
    data-box-edge={geometry.boxEdge || undefined} data-region-right={geometry.regionRight || undefined}
    data-rule-highlighted={ruleHighlighted || undefined} data-selection-edge={selectionEdges || undefined}
    data-region-bottom={geometry.regionBottom || undefined} data-alternate-box={geometry.alternateBox || undefined}
    data-cage-total={cageTotal !== undefined || undefined}
    type={buttonCell || fixedCellAction ? 'button' : undefined}
    tabIndex={givenAction ? 0 : regularCellAction ? (active ? 0 : -1) : buttonCell || fixedCellAction ? -1 : undefined}
    aria-selected={onCell || buttonCell || fixedCellAction ? selected : undefined}
    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
    onClick={givenAction ? () => onGiven?.(value) : onCell ? event => onCell(index, event) : highlightedLinkDigit != null ? event => {
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
  variantPuzzle: fullPuzzle, fog, whispersGuide, givenCellColors, authoredArtwork, highlightedRule, grid: sizedGrid, algebraicCages, sizedRules, givens: fullGivens, values, position, errors, candidateLayout = 'grid', candidates, candidatePreview, candidateGroupPreview, annotations, region, label = 'Sudoku grid', showGuides, overlay,
  highlightedDigit, highlightedDigitMask = 0, highlightedDigitMatch = 'all', highlightCandidateCells = false, fullCandidateCellHighlight = false,
  highlightCandidateCount, highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
  selected = NO_SELECTION, active = 0, pointerFocusedCell, boardRef, onCell, onGiven, onGridKeyDown, onCellDoubleClick, linkDrawing, onCandidate, canSelectCandidate, onLinkSelect, onCandidateHover, isLinkTarget, selectedCandidate, selectedCandidates, dragSelect = false,
  onCellPointerDown, onCellPointerMove, onGridPointerLeave, onPaintCandidate, descriptionId, showAnnotatedCandidates, showPlayerColors = true, showImportedAnnotations = showPlayerColors,
  modeBorder, modeBoundaryRef, modeBadge,
}: Props) {
  const groupDescriptionId = useId()
  const groupDescriptions = useMemo(() => boardGroups(annotations?.links, annotations?.groups)
    .map(([, { point, label }], index) => `${label ?? `Group ${index + 1}`}: ${boardGroupDescription(point)}.`),
  [annotations?.links, annotations?.groups])
  const selectedCandidateMasks = useMemo(() => {
    const masks = new Map<number, number>()
    for (const { cell, digit } of [...(selectedCandidates ?? []), ...(selectedCandidate ? [selectedCandidate] : [])]) {
      masks.set(cell, (masks.get(cell) ?? 0) | (1 << (digit - 1)))
    }
    return masks
  }, [selectedCandidate?.cell, selectedCandidate?.digit, selectedCandidates])
  const grid = sizedGrid ?? CLASSIC_GRID
  const gridSize = grid.size
  const slotsAcross = Math.ceil(Math.sqrt(gridSize))
  const boxRows = 'boxRows' in grid ? grid.boxRows : Math.ceil(gridSize / slotsAcross)
  const boxColumns = 'boxColumns' in grid ? grid.boxColumns : slotsAcross
  const variantPuzzle = fog?.puzzle ?? fullPuzzle
  const givens = fog?.puzzle.givens ?? fullGivens
  const variantRules = variantPuzzle?.rules
  const clipCells = fog && fog.cells.size < 81 ? fog.cells : undefined
  const drawingRules = useMemo(() => {
    if (!clipCells || !fullPuzzle?.rules) return variantRules
    if (!fullPuzzle.rules.some(rule => rule.type === 'clone')) return fullPuzzle.rules
    // Keep lettered Clone clues in the same order as the rules and hints.
    const visibleClones = variantRules?.filter(rule => rule.type === 'clone') ?? []
    return [...fullPuzzle.rules.filter(rule => rule.type !== 'clone'), ...visibleClones]
  }, [clipCells, fullPuzzle?.rules, variantRules])
  const linkCounts = useMemo(() => whispersGuide && variantPuzzle ? whispersLinkCounts(variantPuzzle) : undefined,
    [whispersGuide, variantPuzzle])
  const houseFills = useMemo(() => new Set(variantRules?.flatMap(variantHouseFillCells)), [variantRules])
  const highlightedDiagonals = useMemo(() => highlightedRule === 'diagonal'
    ? (variantRules ?? []).flatMap(rule => rule.type === 'diagonal' ? [rule.diagonal] : []) : [], [highlightedRule, variantRules])
  const linkedDoubleArrows = useMemo(() => sizedRules?.filter(rule => rule.type === 'linked-double-arrow') ?? [], [sizedRules])
  const outsideRules = useMemo<readonly VariantRule[]>(() => [
    ...(variantRules ?? []),
    ...(sizedRules?.filter((rule): rule is Extract<SizedConstraintRule, { type: 'sandwich' }> => rule.type === 'sandwich') ?? []),
  ], [sizedRules, variantRules])
  const outside = useMemo(() => {
    const layout = outsideClueLayout(outsideRules, gridSize)
    for (const rule of linkedDoubleArrows) for (const end of rule.ends) if (typeof end !== 'number') {
      const side = sizedXSumSide(end.direction)
      layout.depths[side] = Math.max(layout.depths[side], 1)
    }
    return layout
  }, [outsideRules, linkedDoubleArrows, gridSize])
  const hasOutside = Object.values(outside.depths).some(Boolean)
  const badgeOnFrame = hasOutside && Boolean(modeBadge)
  const clones = useMemo(() => cloneLayout(variantRules), [variantRules])
  const disjoint = useMemo(() => disjointGroupRuleIndices(variantRules ?? []), [variantRules])
  const gridLabel = [sizedGrid ? `${gridSize} × ${gridSize} ${label.toLowerCase()}` : label, variantRules?.some(rule => rule.type === 'global-entropy')
    && 'Global Entropy: every 2 × 2 area needs a low digit 1–3, a medium digit 4–6 and a high digit 7–9, including across box or region borders.',
    disjoint.size && DISJOINT_GROUPS_RULE].filter(Boolean).join(' ')
  const regions = variantPuzzle?.regions
  const regionsAt = useMemo(() => 'regions' in grid ? jigsawMembership(grid)
    : regions && regions.type !== 'boxes' ? regionMembership(regions.regions) : undefined, [grid, regions])
  const regionColors = useMemo(() => regionsAt && jigsawRegionColors(regionsAt, gridSize), [regionsAt, gridSize])
  const rectangularBoxes = !regionsAt && 'boxRows' in grid
  const cellClues = useMemo(() => variantRules ? variantCellLabels(variantRules, variantPuzzle?.regions) : undefined, [variantRules, variantPuzzle?.regions])
  const fragments = useMemo(() => clipCells && drawingRules ? fogFragmentLabels(drawingRules, clipCells) : undefined,
    [clipCells, drawingRules])
  const sizedLabels = useMemo(() => sizedGrid && sizedRules ? sizedRuleClueLabels(sizedRules, sizedGrid) : undefined, [sizedRules, sizedGrid])
  const cageTotals = useMemo(() => new Map((drawingRules ?? sizedRules)?.flatMap(rule => rule.type === 'killer-cages'
    ? rule.cages.flatMap(({ cells, sum }) => {
      const corner = Math.min(...cells)
      return !clipCells || clipCells.has(corner) ? [[corner, sum] as const] : []
    }) : [])), [clipCells, drawingRules, sizedRules])
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
  const clueDrawing = useMemo(() => {
    const rules = drawingRules?.filter(rule => rule.type === highlightedRule || !variantHouseFillCells(rule).length)
    return rules?.length ? { rules, key: JSON.stringify(rules) } : undefined
  }, [highlightedRule, drawingRules])
  const variantClues = useMemo(() => clueDrawing
    ? [<div className="board-variant-clues" key={clueDrawing.key}><VariantClues rules={clueDrawing.rules} visibleCells={clipCells} /></div>]
    : NO_MARKS, [clueDrawing, clipCells])
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
      (!canSelectCandidate || canSelectCandidate(candidateFocus)) &&
      hasCandidate((candidateFocus.slotted ? gridMask : centerMask)(candidateFocus.cell), candidateFocus.digit)) {
      tabCandidate = candidateFocus
    } else {
      const available = (cell: number, mask: number) => marksOf(mask).find((digit) => !canSelectCandidate || canSelectCandidate({ cell, digit }))
      const hasCandidates = (cell: number) => playableCell(cell) && (available(cell, gridMask(cell)) || available(cell, centerMask(cell)))
      const cell = hasCandidates(active) ? active : Array.from(values).findIndex((_, index) => hasCandidates(index))
      if (cell !== -1) {
        const digit = available(cell, gridMask(cell))
        tabCandidate = { cell, digit: digit ?? available(cell, centerMask(cell))!, slotted: digit !== undefined }
      }
    }
  }

  const boardEvents = useBoardEvents({ onCell, onGiven, onCellDoubleClick, onCellPointerDown, onCandidate, onPaintCandidate, onCandidateHover, onLinkSelect })
  const selectedCells = useMemo(() => new Set(selected), [selected])
  const visibleSelectedCells = useMemo(() => selected.filter(cell =>
    rows.includes(Math.floor(cell / gridSize) + 1) && columns.includes(cell % gridSize + 1)), [selected, rows, columns, gridSize])
  const exposedSelectionEdges = useMemo(() => cellSelectionEdges(visibleSelectedCells, gridSize), [visibleSelectedCells, gridSize])
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
    const cageRules = drawingRules ?? sizedRules
    const cageInset = cageTotal !== undefined && cageRules ? cageLabelInset(index, cageRules, gridSize) : undefined
    return {
      index, row, column, boxColumns, cloneLabel: clones.at[index]?.label, cageTotal, regionAtCell,
      regionColor: regionAtCell === undefined ? undefined : regionColors?.[regionAtCell], houseFill: houseFills.has(index),
      whispersLinks: linkCounts?.[index] || undefined,
      cageStyle: cageInset !== undefined && (drawingRules || cageInset !== .1)
        ? { insetInlineStart: `${cageInset * 100}%` } : undefined,
      boxEdge: rectangularBoxes && column % boxColumns === 0,
      regionRight: Boolean(regionsAt && column < gridSize && regionAtCell !== regionsAt[index + 1]),
      regionBottom: Boolean(regionsAt && row < gridSize && regionAtCell !== regionsAt[index + gridSize]),
      alternateBox: rectangularBoxes && (Math.floor((row - 1) / boxRows) + Math.floor((column - 1) / boxColumns)) % 2 === 1,
      clues: [cellClues?.[index]?.join(', '), fragments?.[index].join(', '), sizedLabels?.[index], algebraicLabels.descriptions.get(index)?.join(', ')].filter(Boolean).join(', '),
    }
  }), [gridSize, boxRows, boxColumns, regionsAt, regionColors, houseFills, linkCounts, rectangularBoxes, cageTotals, algebraicLabels, clones, drawingRules, sizedRules, cellClues, fragments, sizedLabels])

  // Parent timers and fresh event closures do not change the grid. Event wrappers
  // read the latest committed callbacks even when this element tree is reused.
  const gridRows = useMemo(() => rows.map((row) => (
    <div className="grid-row" role="row" data-box-edge={rectangularBoxes && row % boxRows === 0 || undefined} key={row}>
      {columns.map((col) => {
        const index = (row - 1) * gridSize + col - 1
        const fogged = Boolean(fog && !fog.cells.has(index))
        const value = Number(fogged ? fog!.entries[index] : values[index])
        const center = fogged ? 0 : position?.center[index] ?? 0
        const corner = fogged ? 0 : position?.corner[index] ?? 0
        const digitSlots = layout === 'grid' || Boolean(annotationSlots?.has(index))
        const centerMarks = digitSlots ? 0 : center
        const gridMarks = fogged ? 0 : candidates?.[index] ?? (corner | (digitSlots ? center : 0))
        const linkedDigits = fogged ? undefined : annotationSlots?.get(index)
        let displayedGridMarks = gridMarks
        for (const digit of linkedDigits?.keys() ?? []) displayedGridMarks |= 1 << (digit - 1)
        const candidateMask = fogged ? 0 : candidates?.[index] ?? (center | corner)
        const currentPreview = candidateGroupPreview ?? candidatePreview
        const preview = !fogged && !value && currentPreview?.cell === index ? currentPreview : undefined
        const visibleCandidateMask = displayedGridMarks | centerMarks | (preview ? previewDigitsMask(preview) : 0)
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
        return <BoardCell key={col} geometry={geometry[index]} value={value} fixed={givens[index] !== '0'} fogged={fogged}
          center={center} corner={corner} centerMask={centerMarks} gridMask={gridMarks} displayedGridMask={displayedGridMarks}
          digitSlots={digitSlots} annotatedSlots={Boolean(linkedDigits)} preview={preview}
          candidateColors={showPlayerColors && (!candidates || onCandidate) ? position?.candidateColors?.[index] : undefined}
          importedCandidateColors={showImportedAnnotations && (!candidates || onCandidate) ? position?.importedCandidateColors?.[index] : undefined}
          color={!fogged && showPlayerColors ? position?.colors?.[index] : undefined}
          importedColors={!fogged ? (showImportedAnnotations ? position?.importedCellColors?.[index] : undefined)
            ?? givenCellColors?.[index] ?? fog?.cellColors?.[index] : undefined}
          cellAnnotation={annotations?.cells?.get(index)} candidateAnnotations={annotations?.candidates?.get(index)}
          selected={selectedCells.has(index)} selectionEdges={exposedSelectionEdges.get(index)?.join(' ')} active={active === index} pointerFocused={pointerFocusedCell === index}
          error={Boolean(errors?.has(index))} related={!fogged && relatedCells.has(index)} matching={highlighting.matchingDigits && value === focusDigit}
          ruleHighlighted={highlightedDiagonals.some(diagonal => diagonal === 'main' ? row === col : row + col === gridSize + 1)}
          cellHighlight={highlightsLinkTargetCell || (highlightsCell && (fullCandidateCellHighlight || !matchesWithExtras)) ? 'candidate-highlight-cell'
            : highlightsCell ? 'candidate-highlight-light' : ''}
          countHighlighted={highlightCandidateCells && candidateCountMatches} candidateHighlightMask={candidateHighlightMask}
          highlightLabel={highlightLabel} countLabel={countLabel} linkTargetMask={linkTargetMask} highlightsLinkTargetCell={highlightsLinkTargetCell}
          canSelectLinkCandidate={canSelectLinkCandidate} canSelectCandidate={canSelectCandidate} highlightedLinkDigit={highlightedLinkDigit}
          selectedCandidateMask={selectedCandidateMasks.get(index) ?? 0}
          tabCandidateDigit={tabCandidate?.cell === index ? tabCandidate.digit : undefined}
          tabCandidateSlotted={tabCandidate?.cell === index ? tabCandidate.slotted : undefined} onCandidateFocus={setCandidateFocus}
          onCell={onCell ? boardEvents.onCell : undefined} onGiven={onGiven ? boardEvents.onGiven : undefined}
          onCellDoubleClick={onCellDoubleClick ? boardEvents.onCellDoubleClick : undefined}
          onCellPointerDown={onCellPointerDown ? boardEvents.onCellPointerDown : undefined}
          onCandidate={onCandidate ? boardEvents.onCandidate : undefined} onPaintCandidate={onPaintCandidate ? boardEvents.onPaintCandidate : undefined}
          onCandidateHover={onCandidateHover ? boardEvents.onCandidateHover : undefined} />
      })}
    </div>
  )), [
    rows, columns, rectangularBoxes, boxRows, gridSize, geometry, values, givens, fog, givenCellColors, layout, annotationSlots,
    position?.center, position?.corner, position?.candidateColors, position?.importedCandidateColors, position?.colors, position?.importedCellColors, candidates, candidatePreview, candidateGroupPreview,
    isLinkTarget, focusDigit, filterCandidates, highlightedDigitMask, highlightedDiagonals, matchAnyDigit, highlighting.matchingCandidates,
    highlighting.matchingDigits, highlightCandidateCells, highlightCandidateCount, highlightedDigits, showPlayerColors, showImportedAnnotations,
    annotations?.cells, annotations?.candidates, selectedCells, active, pointerFocusedCell, errors, relatedCells,
    selectedCandidateMasks, tabCandidate?.cell, tabCandidate?.digit, tabCandidate?.slotted,
    setCandidateFocus, boardEvents, Boolean(onCell), Boolean(onCellDoubleClick), Boolean(onCellPointerDown),
    Boolean(onCandidate), Boolean(onPaintCandidate), Boolean(onCandidateHover), canSelectCandidate, linkDrawing,
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
    <div className={`board-frame ${showGuides ? '' : 'guides-hidden'}${hasOutside ? ' has-outside-clues' : ''}`}
      data-overlay={overlay?.visible} data-input-mode={badgeOnFrame ? modeBorder : undefined}
      ref={badgeOnFrame ? modeBoundaryRef : undefined} style={size}>
      {outside.depths.top > 0 && <div className="outside-clues-top" aria-hidden="true" />}
      {outside.depths.bottom > 0 && <div className="outside-clues-bottom" aria-hidden="true" />}
      <div className="col-labels" aria-hidden="true">{columns.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="row-labels" aria-hidden="true">{rows.map((n) => <span key={n}>{n}</span>)}</div>
      <div className={`board-body${variantPuzzle || algebraicCages?.length || sizedRules?.length ? ' variant-board' : ''}${regionsAt ? ' jigsaw-board' : ''}${houseFills.size ? ' shaded-houses-board' : ''}`}
        data-highlighted-rule={highlightedRule ?? undefined} data-input-mode={modeBorder} ref={badgeOnFrame ? undefined : modeBoundaryRef}>
        <div className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`} role="grid" aria-label={gridLabel}
          aria-describedby={[descriptionId, groupDescriptions.length ? groupDescriptionId : undefined].filter(Boolean).join(' ') || undefined}
          aria-readonly={(!onCell && !candidateAction) || undefined} ref={boardRef}
          aria-hidden={overlay?.visible || undefined} inert={overlay?.visible || undefined}
          onKeyDown={candidateAction ? navigateCandidates : onGridKeyDown}
          onPointerLeave={onGridPointerLeave}
          onPointerMove={onCellPointerMove && ((event) => onCellPointerMove(gridCellAtPoint(event.currentTarget, event), event))}>
          {gridRows}
        </div>
        {authoredArtwork && !overlay?.visible && <BoardArtwork artwork={authoredArtwork} region={visibleRegion} />}
        <BoardMarks items={variantClues} />
        {sizedGrid && sizedRules && sizedRules.length > 0 && <div className="board-variant-clues"><MemoSizedRuleClues rules={sizedRules} size={gridSize} /></div>}
        {algebraicCages && algebraicCages.length > 0 && <div className="board-variant-clues"><MemoAlgebraicCages rules={algebraicCages} /></div>}
        {hasOutside && <MemoOutsideClues layout={outside} hidden={overlay?.visible} size={gridSize} />}
        {linkedDoubleArrows.length > 0 && <MemoLinkedDoubleArrowClues rules={linkedDoubleArrows} size={gridSize} hidden={overlay?.visible} />}
        {showImportedAnnotations && position?.importedDrawings && <BoardQuickDraw drawings={position.importedDrawings}
          region={visibleRegion} hidden={overlay?.visible} />}
        <BoardLinks links={annotations?.links} groups={annotations?.groups} region={visibleRegion} candidateInsets={candidateInsets} onSelect={onLinkSelect ? boardEvents.onLinkSelect : undefined} />
        {overlay && <div className="board-overlay" aria-hidden={!overlay.visible || undefined} inert={!overlay.visible || undefined}
          data-no-panel-hold>{overlay.content}</div>}
        {!badgeOnFrame && modeBadge}
      </div>
      {badgeOnFrame && modeBadge}
      {groupDescriptions.length > 0 && <p id={groupDescriptionId} className="sr-only">
        Each outlined group is one chain endpoint. The group is true if at least one marked member is true. {groupDescriptions.join(' ')}
      </p>}
      {outside.legend.length > 0 && <div className="outside-clue-legend" aria-hidden={overlay?.visible || undefined}>{outside.legend.join(' · ')}</div>}
      {linkCounts && <div className="whispers-guide" aria-hidden={overlay?.visible || undefined}>
        <p>The colors show the minimum number of distinct digits in linked cells. Each range shows what can go in the colored cell.</p>
        <ul aria-label="Whispers neighbors">
          {WHISPERS_GUIDE_COUNTS.map(count => {
            const ranges = whispersGuideDigits(count).map(digits => digits.length === 1 ? digits : `${digits[0]}–${digits.at(-1)}`)
            return <li key={count} data-whispers-links={count}>
              <strong>{count} distinct {count === 1 ? 'digit' : 'digits'}</strong>
              <span>{ranges.join(' or ')}</span>
            </li>
          })}
        </ul>
      </div>}
    </div>
  )
}
