import { cloneElement, memo, useCallback, useMemo, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import type { Candidate } from '../sudoku/engine'
import { COLORS, hasCandidate, marksOf } from '../sudoku/game'
import { importedColorFill, importedColorLabel } from '../sudoku/imported-colors'
import { BoardMarks, type BoardMark } from './BoardMarks'
import { type CellAnnotation, type CandidateAnnotation } from './BoardAnnotations'
import { colorTone, colorToneStyle } from './color-tone'
import { cellColorGradient } from './cell-color-gradient'
import { candidateMarkDescriptions } from './board-mark-resolution'

export type CandidateSlot = Candidate & { slotted: boolean }

type CellEvents = {
  onCell?: (index: number, event: MouseEvent) => void
  onGiven?: (digit: number) => void
  onCellDoubleClick?: (index: number, event: MouseEvent) => void
  onCellPointerDown?: (index: number, event: PointerEvent) => void
  onCandidate?: (candidate: Candidate) => void
  onPaintCandidate?: (candidate: Candidate) => void
  onCandidateHover?: (candidate: Candidate | null) => void
  onLinkSelect?: (candidate: Candidate) => void
}

const NO_MARKS: BoardMark[] = []
const HIDDEN_CANDIDATE_GROUP = <span className="candidate-marks" data-candidate-marks aria-hidden="true" />
const INTERACTIVE_CANDIDATE_GROUP = <span className="candidate-marks" data-candidate-marks />

export type CellGeometry = {
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
  wrapTop: boolean
  wrapRight: boolean
  wrapBottom: boolean
  wrapLeft: boolean
  alternateBox: boolean
  clues: string
}

export type BoardCellPreview = (Candidate & { mode: 'candidate' | 'center' | 'corner' }) | { cell: number; mask: number; mode: 'candidate' | 'center' | 'corner' }

export function previewDigitsMask(preview: BoardCellPreview) {
  return 'mask' in preview ? preview.mask : 1 << (preview.digit - 1)
}

export type BoardCellContent = {
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
  preview?: BoardCellPreview
  candidateColors?: Record<number, number>
  importedCandidateColors?: Record<number, string>
  colorShades?: readonly number[]
  importedColors?: readonly string[]
}

export type BoardCellAppearance = {
  cellAnnotation?: CellAnnotation
  aqreShade?: 'unshaded' | 'shaded'
  candidateAnnotations?: ReadonlyMap<number, CandidateAnnotation>
  annotationsOnTop: boolean
  selected: boolean
  selectionEdges?: string
  active: boolean
  pointerFocused: boolean
  error: boolean
  related: boolean
  matching: boolean
  ruleHighlighted: boolean
  cellHighlight: '' | 'candidate-highlight-cell' | 'candidate-highlight-mixed'
  countHighlighted: boolean
  candidateHighlightMask: number
  highlightLabel: string
  countLabel: string
  linkTargetMask: number
  highlightsLinkTargetCell: boolean
  canSelectLinkCandidate: boolean
  eraseChainNodes?: boolean
  highlightedLinkDigit: number | null
  selectedCandidateMask: number
}

export type BoardCellInteraction = Omit<CellEvents, 'onLinkSelect'> & {
  preview?: BoardCellPreview
  tabCandidateDigit?: number
  tabCandidateSlotted?: boolean
  onCandidateFocus: (candidate: CandidateSlot) => void
}

type CellProps = {
  geometry: CellGeometry
  content: BoardCellContent
  appearance: BoardCellAppearance
  interaction: BoardCellInteraction
}

function candidateColorClass(color: number | undefined, imported: string | undefined, mark: CandidateAnnotation['mark'], annotationsOnTop = false) {
  if (!annotationsOnTop && (mark === 'emphasized' || mark === 'strike')) return ''
  return color ? 'candidate-color' : imported ? 'candidate-color imported-candidate-color' : ''
}

function candidatePresentation({ digit, slotted, boxColumns, color, imported, annotation, annotationsOnTop, placeInGrid }:
  { digit: number; slotted: boolean; boxColumns: number; color?: number; imported?: string; annotation?: CandidateAnnotation;
    annotationsOnTop: boolean; placeInGrid: boolean }) {
  const mark = annotation?.mark ?? (annotation?.color ? 'ring' : undefined)
  return {
    mark,
    colorClass: candidateColorClass(color, imported, mark, annotationsOnTop),
    style: {
      ...colorToneStyle(color),
      gridArea: placeInGrid && slotted
        ? `${Math.floor((digit - 1) / boxColumns) + 1} / ${(digit - 1) % boxColumns + 1}` : undefined,
      opacity: annotation?.referenceHighlight || annotation?.emphasized ? undefined : annotation?.opacity,
      '--annotation-color': annotation?.color,
      '--imported-candidate-tone': imported && !color ? importedColorFill(imported) : undefined,
    } as CSSProperties,
  }
}

// A cell receives its own values and visual flags, never the whole board selection
// or position. An edit can therefore leave unrelated cells and their marks intact.
function shallowEqual(first: object, second: object) {
  if (first === second) return true
  const firstKeys = Object.keys(first)
  const secondValues = second as Record<string, unknown>
  return firstKeys.length === Object.keys(second).length &&
    firstKeys.every(key => Object.is((first as Record<string, unknown>)[key], secondValues[key]))
}

function sameCellProps(previous: CellProps, next: CellProps) {
  return previous.geometry === next.geometry && shallowEqual(previous.content, next.content) &&
    shallowEqual(previous.appearance, next.appearance) && shallowEqual(previous.interaction, next.interaction)
}

// A cell receives only its own content, appearance, and interactions. Grouped channels
// keep the renderer extensible while shallow comparison still skips unchanged cells.
export const BoardCell = memo(function BoardCell({ geometry, content, appearance, interaction }: CellProps) {
  const {
    value, fixed, fogged, center, corner, centerMask, gridMask, displayedGridMask,
    digitSlots, annotatedSlots, candidateColors, importedCandidateColors, colorShades, importedColors,
  } = content
  const {
    cellAnnotation, aqreShade, candidateAnnotations, annotationsOnTop, selected, selectionEdges, active, pointerFocused,
    error, related, matching, ruleHighlighted, cellHighlight, countHighlighted, candidateHighlightMask,
    highlightLabel, countLabel, linkTargetMask, highlightsLinkTargetCell, canSelectLinkCandidate,
    eraseChainNodes, highlightedLinkDigit, selectedCandidateMask,
  } = appearance
  const {
    preview, tabCandidateDigit, tabCandidateSlotted, onCandidateFocus,
    onCell, onGiven, onCellDoubleClick, onCellPointerDown, onCandidate, onPaintCandidate, onCandidateHover,
  } = interaction
  const { index, row, column: col, boxColumns, cageTotal, regionAtCell } = geometry
  const color = colorShades?.[0] ?? 0
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
    if (error && !annotationsOnTop) return
    const style: Record<string, string | undefined> = {}
    if (cellAnnotation) {
      const annotationFills = cellAnnotation.fills?.length ? cellAnnotation.fills : cellAnnotation.fill ? [cellAnnotation.fill] : []
      const fill = annotationFills[0]
      style[annotationsOnTop ? '--cell-annotation-fill' : '--cell-fill'] = fill
      style['--cell-annotation-colors'] = cellColorGradient(annotationFills)
      style['--cell-annotation-overlay-colors'] = cellColorGradient(annotationFills.map(color =>
        `color-mix(in srgb, ${color} 72%, transparent)`))
      if (!error && cellAnnotation.ink) style.color = cellAnnotation.ink
    }
    if (color) Object.assign(style, colorToneStyle(color))
    if (!error && colorShades && colorShades.length > 1) {
      const fills = colorShades.map(colorTone).filter((tone): tone is string => Boolean(tone))
      style['--imported-cell-colors'] = cellColorGradient(fills.map(fill =>
        `color-mix(in srgb, ${fill} var(--imported-color-weight), var(--board-selected-bg))`))
    } else if (!error && importedColors && !color) {
      const fills = importedColors.map(importedColorFill)
      style['--tone'] = fills[0]
      style['--imported-cell-colors'] = cellColorGradient(fills.map(fill =>
        `color-mix(in srgb, ${fill} var(--imported-color-weight), var(--board-selected-bg))`))
    }
    return Object.keys(style).length ? style as CSSProperties : undefined
  }, [annotationsOnTop, cellAnnotation, error, color, colorShades, importedColors])
  const candidateLabel = useMemo(() => (candidateAnnotations || candidateColors || importedCandidateColors) && [...new Set([...gridCandidates, ...centerCandidates])]
    .map((digit) => {
      const color = candidateColors?.[digit]
      const imported = importedCandidateColors?.[digit]
      const descriptions = candidateMarkDescriptions({ annotation: candidateAnnotations?.get(digit), color, imported })
      return descriptions.length ? `${digit} ${descriptions.join(', ')}` : undefined
    }).filter(Boolean).join(', '), [candidateAnnotations, candidateColors, importedCandidateColors, gridCandidates, centerCandidates])
  const setMarkers = fogged ? undefined : cellAnnotation?.setMarkers
  const setStyle = useMemo<CSSProperties | undefined>(() => {
    if (!setMarkers?.length) return
    const fills = setMarkers.map(({ color }) =>
      `light-dark(color-mix(in srgb, ${color} 74%, transparent), color-mix(in srgb, ${color} 40%, transparent))`)
    const borders = setMarkers.map(({ color }) => `color-mix(in srgb, ${color} 62%, var(--board-ink))`)
    return {
      backgroundColor: fills.length === 1 ? fills[0] : undefined,
      backgroundImage: cellColorGradient(fills),
      borderColor: borders[0],
      borderImageSource: cellColorGradient(borders),
    }
  }, [setMarkers])
  const label = [
    `Row ${row}, column ${col}`,
    fogged && 'covered by fog',
    value ? (fixed ? `given ${value}` : `digit ${value}`) : 'empty',
    !value && gridCandidates.length ? `${digitSlots ? '' : 'corner '}candidates ${gridCandidates.join(' ')}` : '',
    !value && centerCandidates.length ? `center candidates ${centerCandidates.join(' ')}` : '',
    colorShades?.length ? `Cell colors ${colorShades.map(shade => COLORS[shade - 1].toLowerCase()).join(', ')}` : '',
    !color && importedColors?.length && `Cell colors ${importedColors.map(importedColorLabel).join(', ')}`,
    regionAtCell !== undefined && `region ${regionAtCell + 1}`,
    cellAnnotation?.label,
    ...(setMarkers ? new Set(setMarkers.map(marker => marker.label)) : []),
    aqreShade,
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
  const hasAnnotationFill = Boolean(cellAnnotation?.fill || cellAnnotation?.fills?.length)
  const classes = [
    'cell', canSelectLinkCandidate ? 'chain-cell-target' : '', fixed ? 'given' : 'entry', related ? 'peer' : '', matching ? 'matching' : '',
    cellHighlight, countHighlighted ? 'candidate-count-match' : '', aqreShade && `aqre-${aqreShade}`,
    color ? `colored${colorShades && colorShades.length > 1 ? ' player-multi-colors' : ''}`
      : importedColors && (!hasAnnotationFill || annotationsOnTop) ? 'colored imported-colors' : '',
    !error && !annotationsOnTop && (cellAnnotation?.fills?.length ?? 0) > 1 ? 'cell-annotation-multi' : '',
    annotationsOnTop && hasAnnotationFill ? 'hint-annotation-overlay' : '',
    error ? 'conflict' : '', selected ? 'selected' : '',
  ].join(' ')

  // Dense digit highlights change often. Reuse each unchanged read-only glyph,
  // including its style object, instead of rebuilding all nine marks per cell.
  const readOnlyCandidates = useMemo(() => candidateAction ? null : [visibleGridCandidates, visibleCenterCandidates].map((digits, group) =>
    new Map(digits.map(digit => {
      const annotation = candidateAnnotations?.get(digit)
      const color = candidateColors?.[digit]
      const imported = importedCandidateColors?.[digit]
      const { mark, colorClass, style } = candidatePresentation({ digit, slotted: group === 0, boxColumns, color, imported,
        annotation, annotationsOnTop, placeInGrid: group === 0 })
      const className = ['board-candidate', colorClass].filter(Boolean).join(' ')
      const normal = <span key={digit} className={className} style={style}
        data-mark={mark} data-strike={annotation?.strike || undefined}
        data-chain-hover={annotation?.emphasized || undefined} data-reference-highlight={annotation?.referenceHighlight || undefined}>
        {annotation?.branchLabels ? <>{digit}<small className="candidate-branch-labels" aria-hidden="true">
          {annotation.branchLabels.placed}{annotation.branchLabels.removed && <span className="candidate-branch-removal">{annotation.branchLabels.removed}</span>}
        </small></> : digit}
      </span>
      return [digit, { normal, highlighted: cloneElement(normal, { className: `${className} candidate-match` }) }] as const
  }))), [candidateAction, visibleGridCandidates, visibleCenterCandidates, candidateAnnotations, candidateColors, importedCandidateColors, boxColumns, annotationsOnTop])

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
    const { mark, colorClass, style } = candidatePresentation({ digit, slotted, boxColumns, color, imported,
      annotation, annotationsOnTop, placeInGrid: slotted && !gridCandidatesInOrder })
    const highlightClass = highlighted ? 'candidate-match' : undefined
    if (candidateAction) {
      const candidate = { cell: index, digit }
      const pending = hasCandidate(selectedCandidateMask, digit)
      const linkTarget = hasCandidate(linkTargetMask, digit)
      const candidateLabel = [`${digit} in row ${row}, column ${col}`, ...candidateMarkDescriptions({ annotation, color, imported }),
        highlighted && 'highlighted', linkTarget && (eraseChainNodes ? 'can erase chain node' : 'can link to the selected candidate')].filter(Boolean).join(', ')
      const classes = `board-candidate candidate-button ${onPaintCandidate ? 'paint-candidate' : canSelectLinkCandidate ? 'chain-candidate' : ''}`
      return <button type="button" key={digit} className={classes} style={style}
        aria-label={candidateLabel} data-candidate-button="" data-candidate-digit={digit} data-paint-candidate={onPaintCandidate ? '' : undefined}
        data-link-target={linkTarget || undefined}
        aria-pressed={onCandidate && !eraseChainNodes ? pending : undefined} aria-disabled={eraseChainNodes && !linkTarget || undefined} data-mark={mark}
        data-strike={annotation?.strike || undefined} data-chain-hover={annotation?.emphasized || undefined}
        data-reference-highlight={annotation?.referenceHighlight || undefined}
        tabIndex={tabCandidateDigit === digit && tabCandidateSlotted === slotted ? 0 : -1}
        onPointerEnter={onCandidateHover && ((event) => {
          if (event.pointerType !== 'touch') onCandidateHover(candidate)
        })}
        onPointerLeave={onCandidateHover && (() => onCandidateHover(null))}
        onMouseDown={onPaintCandidate ? undefined : (event) => event.preventDefault()}
        onFocus={() => onCandidateFocus({ ...candidate, slotted })}
        onClick={() => { if (!eraseChainNodes || linkTarget) selectCandidate(digit, slotted) }}>
        <span className={['candidate-glyph', colorClass, !mark && (highlighted || linkTarget) && 'candidate-match'].filter(Boolean).join(' ')}>{digit}</span>
      </button>
    }
    return <span key={digit} className={['board-candidate', colorClass, highlightClass].filter(Boolean).join(' ')}
      style={style} data-mark={mark} data-strike={annotation?.strike || undefined}
      data-chain-hover={annotation?.emphasized || undefined} data-reference-highlight={annotation?.referenceHighlight || undefined}
      data-candidate-preview={previewEdit}>{digit}</span>
  }, [readOnlyCandidates, candidateAnnotations, candidateColors, importedCandidateColors, previewEditMask, previewSlotted, previewAction, boxColumns, candidateHighlightMask,
    candidateAction, index, row, col, selectedCandidateMask, linkTargetMask, onPaintCandidate, onCandidate, annotationsOnTop,
    gridCandidatesInOrder, tabCandidateDigit, tabCandidateSlotted, onCandidateHover, onCandidateFocus, selectCandidate, eraseChainNodes])

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
    data-branch-placement={cellAnnotation?.branchPlacement}
    data-reference-highlight={cellAnnotation?.referenceHighlight || undefined}
    data-whispers-links={geometry.whispersLinks} data-pointer-focused={pointerFocused || undefined}
    aria-description={preview ? `${previewAction === 'add' ? 'Add' : 'Remove'} ${previewDigits.length === 1 ? 'candidate' : 'candidates'} ${previewDigits.join(', ')}` : undefined}
    data-box-edge={geometry.boxEdge || undefined} data-region-right={geometry.regionRight || undefined}
    data-rule-highlighted={ruleHighlighted || undefined} data-selection-edge={selectionEdges || undefined}
    data-region-bottom={geometry.regionBottom || undefined} data-alternate-box={geometry.alternateBox || undefined}
    data-wrap-top={geometry.wrapTop || undefined} data-wrap-right={geometry.wrapRight || undefined}
    data-wrap-bottom={geometry.wrapBottom || undefined} data-wrap-left={geometry.wrapLeft || undefined}
    data-cage-total={cageTotal !== undefined || undefined}
    type={buttonCell || fixedCellAction ? 'button' : undefined}
    tabIndex={givenAction ? 0 : regularCellAction ? (active ? 0 : -1) : buttonCell || fixedCellAction ? -1 : undefined}
    aria-selected={onCell || buttonCell || fixedCellAction ? selected : undefined}
    onPointerDown={onCellPointerDown && ((event) => onCellPointerDown(index, event))}
    onClick={givenAction ? () => onGiven?.(value) : onCell ? event => onCell(index, event) : highlightedLinkDigit != null ? event => {
      if (event.target instanceof Element && event.target.closest('[data-candidate-button]')) return
      selectCandidate(highlightedLinkDigit, visibleGridCandidates.includes(highlightedLinkDigit))
    } : undefined}
    onDoubleClick={onCellDoubleClick && ((event) => onCellDoubleClick(index, event))}>
    {setStyle && <span className="cell-set-tint" aria-hidden="true" style={setStyle} />}
    {cellAnnotation?.referenceHighlight && !setStyle && <span className="cell-reference-wash" aria-hidden="true" />}
    <BoardMarks items={gridItems} group={candidateAction ? INTERACTIVE_CANDIDATE_GROUP : HIDDEN_CANDIDATE_GROUP} />
    <BoardMarks items={labeledItems} />
  </Cell>
}, sameCellProps)

