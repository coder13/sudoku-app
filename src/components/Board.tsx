import { fogFragmentLabels, type FogView } from '../sudoku/fog'
import {
  cloneElement,
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { sizedXSumSide } from '../sudoku/sized-linked-double-arrow'
import type { Candidate, SizedConstraintRule, SizedVariantPosition, VariantPuzzle, VariantRule } from '../sudoku/engine'
import { candidateCount, cellColorShades, COLORS, DIGITS, hasCandidate, marksOf, peer, type CandidateLayout, type ColorTarget, type Position } from '../sudoku/game'
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
import { AlgebraicCages, LinkedDoubleArrowClues, SizedRuleClues, VariantClues, cageLabelInset } from './VariantClues'
import { sizedRuleClueLabels, variantCellLabels } from './VariantClueLabels'
import { boardGroupDescription, boardGroups, BoardArtwork, BoardLinks, BoardQuickDraw, type BoardAnnotations, type BoardRegion } from './BoardAnnotations'
import type { AuthoredMark } from '../sudoku/authored-artwork'
import { BoardMarks, type BoardMark } from './BoardMarks'
import type { ImportedCellColors } from '../sudoku/imported-colors'
import { colorCursor } from './color-cursor'
import { colorToneStyle } from './color-tone'
import { cellColorGradient } from './cell-color-gradient'
import { mergeRefs } from './merge-refs'
import { navigateBoardCandidates } from './board-candidate-navigation'
import { BoardCell, previewDigitsMask, type CandidateSlot, type CellGeometry } from './BoardCell'

export type BoardContent = {
  variantPuzzle?: VariantPuzzle
  fog?: FogView
  whispersGuide?: true
  givenCellColors?: ImportedCellColors
  grid?: SizedGrid
  algebraicCages?: SizedVariantPosition['rules']
  sizedRules?: readonly SizedConstraintRule[]
  givens: string
  values: string
  position?: Pick<Position, 'center' | 'corner'> &
    Partial<Pick<Position, 'colors' | 'cellColors' | 'candidateColors' | 'importedCellColors' | 'importedCandidateColors' | 'importedDrawings'>>
  candidates?: readonly number[]
}

export type BoardAppearance = {
  authoredArtwork?: readonly AuthoredMark[]
  highlightedRule?: VariantRuleSectionId | null
  errors?: ReadonlySet<number>
  candidateLayout?: CandidateLayout
  annotations?: BoardAnnotations
  /** Draw annotation fills over saved colors and digit highlights instead of replacing them. */
  annotationsOnTop?: boolean
  showAnnotatedCandidates?: boolean
  showPlayerColors?: boolean
  showImportedAnnotations?: boolean
  colorPreview?: { target: ColorTarget; color: number }
  region?: BoardRegion
  label?: string
  descriptionId?: string
  showGuides?: boolean
  overlay?: { content: ReactNode; visible: boolean }
  highlightedDigit?: number | null
  highlightedDigitMask?: number
  highlightedDigitMatch?: DigitHighlightMatch
  highlightCandidateCells?: boolean
  fullCandidateCellHighlight?: boolean
  highlightCandidateCount?: number | null
  highlighting?: HighlightPreferences
}

export type BoardInteraction = {
  candidatePreview?: Candidate & { mode: 'candidate' | 'center' | 'corner' }
  candidateGroupPreview?: {
    cell: number
    mask: number
    mode: 'candidate' | 'center' | 'corner'
  }
  selected?: readonly number[]
  active?: number
  pointerFocusedCell?: number | null
  boardRef?: RefObject<HTMLDivElement | null>
  onCell?: (index: number, event: MouseEvent) => void
  onGiven?: (digit: number) => void
  onGridKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  onCellDoubleClick?: (index: number, event: MouseEvent) => void
  linkDrawing?: boolean
  onCandidate?: (candidate: Candidate) => void
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

export type BoardLayout = {
  /** Expose the visible grid body as a stable layout measurement target. */
  layoutBoundaryRef?: Ref<HTMLDivElement>
  /** The mode border follows the grid. Outside clues place the badge at the frame edge. */
  modeBorder?: PuzzleInputMode
  modeBoundaryRef?: Ref<HTMLDivElement>
  frameRef?: Ref<HTMLDivElement>
  modeBadge?: ReactNode
}

export type BoardProps = {
  content: BoardContent
  appearance?: BoardAppearance
  interaction?: BoardInteraction
  layout?: BoardLayout
}

const NO_MARKS: BoardMark[] = []
const NO_SELECTION: readonly number[] = []
const MemoSizedRuleClues = memo(SizedRuleClues)
const MemoAlgebraicCages = memo(AlgebraicCages)
const MemoOutsideClues = memo(OutsideClues)
const MemoLinkedDoubleArrowClues = memo(LinkedDoubleArrowClues)
type BoardEvents = Pick<
  BoardInteraction,
  'onCell' | 'onGiven' | 'onCellDoubleClick' | 'onCellPointerDown' | 'onCandidate' | 'onPaintCandidate' | 'onCandidateHover' | 'onLinkSelect'
>

function useBoardEvents(events: BoardEvents) {
  const committed = useRef(events)
  // Keep event identities stable without exposing callbacks from an abandoned render.
  // Cell handlers still receive the original synthetic event and currentTarget.
  useLayoutEffect(() => {
    committed.current = events
  })
  return useMemo(
    () => ({
      onCell: (index: number, event: MouseEvent) => committed.current.onCell?.(index, event),
      onGiven: (digit: number) => committed.current.onGiven?.(digit),
      onCellDoubleClick: (index: number, event: MouseEvent) => committed.current.onCellDoubleClick?.(index, event),
      onCellPointerDown: (index: number, event: PointerEvent) => committed.current.onCellPointerDown?.(index, event),
      onCandidate: (candidate: Candidate) => committed.current.onCandidate?.(candidate),
      onPaintCandidate: (candidate: Candidate) => committed.current.onPaintCandidate?.(candidate),
      onCandidateHover: (candidate: Candidate | null) => committed.current.onCandidateHover?.(candidate),
      onLinkSelect: (candidate: Candidate) => committed.current.onLinkSelect?.(candidate),
    }),
    []
  )
}

export function gridCellAtPoint(grid: HTMLDivElement | null, { clientX, clientY }: { clientX: number; clientY: number }) {
  const cell = grid?.ownerDocument.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-cell]')
  return cell && grid?.contains(cell) ? Number(cell.dataset.cell) : null
}

export function Board({ content, appearance, interaction, layout: boardLayout }: BoardProps) {
  const {
    variantPuzzle: fullPuzzle,
    fog,
    whispersGuide,
    givenCellColors,
    grid: sizedGrid,
    algebraicCages,
    sizedRules,
    givens: fullGivens,
    values: fullValues,
    position,
    candidates,
  } = content
  const {
    authoredArtwork,
    highlightedRule,
    errors,
    candidateLayout = 'grid',
    annotations,
    annotationsOnTop = false,
    region,
    label = 'Sudoku grid',
    descriptionId,
    showGuides = false,
    overlay,
    highlightedDigit,
    highlightedDigitMask = 0,
    highlightedDigitMatch = 'all',
    highlightCandidateCells = false,
    fullCandidateCellHighlight = false,
    highlightCandidateCount,
    highlighting = DEFAULT_HIGHLIGHT_PREFERENCES,
    showAnnotatedCandidates,
    showPlayerColors = true,
    showImportedAnnotations = showPlayerColors,
    colorPreview,
  } = appearance ?? {}
  const {
    selected = NO_SELECTION,
    active = 0,
    pointerFocusedCell,
    boardRef,
    onCell,
    onGiven,
    onGridKeyDown,
    onCellDoubleClick,
    linkDrawing,
    onCandidate,
    onLinkSelect,
    onCandidateHover,
    isLinkTarget,
    selectedCandidate,
    selectedCandidates,
    dragSelect = false,
    onCellPointerDown,
    onCellPointerMove,
    onGridPointerLeave,
    onPaintCandidate,
    candidatePreview,
    candidateGroupPreview,
  } = interaction ?? {}
  const { modeBorder, modeBoundaryRef, frameRef, modeBadge, layoutBoundaryRef } = boardLayout ?? {}
  const groupDescriptionId = useId()
  const groupDescriptions = useMemo(
    () => boardGroups(annotations?.links, annotations?.groups).map(([, { point, label }], index) => `${label ?? `Group ${index + 1}`}: ${boardGroupDescription(point)}.`),
    [annotations?.links, annotations?.groups]
  )
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
  const values = fullValues
  const variantRules = variantPuzzle?.rules
  const clipCells = fog && fog.cells.size < 81 ? fog.cells : undefined
  const drawingRules = useMemo(() => {
    if (!clipCells || !fullPuzzle?.rules) return variantRules
    if (!fullPuzzle.rules.some((rule) => rule.type === 'clone')) return fullPuzzle.rules
    // Keep lettered Clone clues in the same order as the rules and hints.
    const visibleClones = variantRules?.filter((rule) => rule.type === 'clone') ?? []
    return [...fullPuzzle.rules.filter((rule) => rule.type !== 'clone'), ...visibleClones]
  }, [clipCells, fullPuzzle?.rules, variantRules])
  const linkCounts = useMemo(() => (whispersGuide && variantPuzzle ? whispersLinkCounts(variantPuzzle) : undefined), [whispersGuide, variantPuzzle])
  const houseFills = useMemo(() => new Set(variantRules?.flatMap(variantHouseFillCells)), [variantRules])
  const highlightedDiagonals = useMemo(
    () => (highlightedRule === 'diagonal' ? (variantRules ?? []).flatMap((rule) => (rule.type === 'diagonal' ? [rule.diagonal] : [])) : []),
    [highlightedRule, variantRules]
  )
  const linkedDoubleArrows = useMemo(() => sizedRules?.filter((rule) => rule.type === 'linked-double-arrow') ?? [], [sizedRules])
  const outsideRules = useMemo<readonly VariantRule[]>(
    () => [...(variantRules ?? []), ...(sizedRules?.filter((rule): rule is Extract<SizedConstraintRule, { type: 'sandwich' }> => rule.type === 'sandwich') ?? [])],
    [sizedRules, variantRules]
  )
  const outside = useMemo(() => {
    const layout = outsideClueLayout(outsideRules, gridSize)
    for (const rule of linkedDoubleArrows)
      for (const end of rule.ends)
        if (typeof end !== 'number') {
          const side = sizedXSumSide(end.direction)
          layout.depths[side] = Math.max(layout.depths[side], 1)
        }
    return layout
  }, [outsideRules, linkedDoubleArrows, gridSize])
  const hasOutside = Object.values(outside.depths).some(Boolean)
  const badgeOnFrame = hasOutside && Boolean(modeBadge)
  const rootFrameRef = useMemo(() => mergeRefs(frameRef, badgeOnFrame ? modeBoundaryRef : undefined), [badgeOnFrame, frameRef, modeBoundaryRef])
  const boardBodyRef = useMemo(() => mergeRefs(layoutBoundaryRef, badgeOnFrame ? undefined : modeBoundaryRef), [layoutBoundaryRef, badgeOnFrame, modeBoundaryRef])
  const clones = useMemo(() => cloneLayout(variantRules), [variantRules])
  const disjoint = useMemo(() => disjointGroupRuleIndices(variantRules ?? []), [variantRules])
  const gridLabel = [
    sizedGrid ? `${gridSize} × ${gridSize} ${label.toLowerCase()}` : label,
    variantRules?.some((rule) => rule.type === 'global-entropy') &&
      'Global Entropy: every 2 × 2 area needs a low digit 1–3, a medium digit 4–6 and a high digit 7–9, including across box or region borders.',
    disjoint.size && DISJOINT_GROUPS_RULE,
  ]
    .filter(Boolean)
    .join(' ')
  const regions = variantPuzzle?.regions
  const regionsAt = useMemo(
    () => ('regions' in grid ? jigsawMembership(grid) : regions && regions.type !== 'boxes' ? regionMembership(regions.regions) : undefined),
    [grid, regions]
  )
  const regionColors = useMemo(() => regionsAt && jigsawRegionColors(regionsAt, gridSize), [regionsAt, gridSize])
  const rectangularBoxes = !regionsAt && 'boxRows' in grid
  const cellClues = useMemo(() => (variantRules ? variantCellLabels(variantRules, variantPuzzle?.regions) : undefined), [variantRules, variantPuzzle?.regions])
  const fragments = useMemo(() => (clipCells && drawingRules ? fogFragmentLabels(drawingRules, clipCells) : undefined), [clipCells, drawingRules])
  const sizedLabels = useMemo(() => (sizedGrid && sizedRules ? sizedRuleClueLabels(sizedRules, sizedGrid) : undefined), [sizedRules, sizedGrid])
  const cageTotals = useMemo(
    () =>
      new Map(
        (drawingRules ?? sizedRules)?.flatMap((rule) =>
          rule.type === 'killer-cages'
            ? rule.cages.flatMap(({ cells, sum }) => {
                const corner = Math.min(...cells)
                return !clipCells || clipCells.has(corner) ? [[corner, sum] as const] : []
              })
            : []
        )
      ),
    [clipCells, drawingRules, sizedRules]
  )
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
    for (const set of clones.sets) for (const cell of set.cells) insets.set(cell, { top: 0.07, bottom: 0.28 })
    for (const cell of [...cageTotals.keys(), ...algebraicLabels.captions.keys()]) insets.set(cell, { top: 0.3, bottom: insets.get(cell)?.bottom ?? 0.07 })
    return insets
  }, [clones, cageTotals, algebraicLabels])
  const clueDrawing = useMemo(() => {
    const rules = drawingRules?.filter((rule) => rule.type === highlightedRule || !variantHouseFillCells(rule).length)
    return rules?.length ? { rules, key: JSON.stringify(rules) } : undefined
  }, [highlightedRule, drawingRules])
  const variantClues = useMemo(
    () =>
      clueDrawing
        ? [
            <div className="board-variant-clues" key={clueDrawing.key}>
              <VariantClues rules={clueDrawing.rules} visibleCells={clipCells} />
            </div>,
          ]
        : NO_MARKS,
    [clueDrawing, clipCells]
  )
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
  const coordinates = useMemo(() => (sizedGrid ? DIGITS.slice(0, gridSize) : DIGITS), [sizedGrid, gridSize])
  const rows = useMemo(
    () => (visibleRegion ? coordinates.slice(visibleRegion.row, visibleRegion.row + visibleRegion.rows) : coordinates),
    [coordinates, visibleRegion?.row, visibleRegion?.rows]
  )
  const columns = useMemo(
    () => (visibleRegion ? coordinates.slice(visibleRegion.column, visibleRegion.column + visibleRegion.columns) : coordinates),
    [coordinates, visibleRegion?.column, visibleRegion?.columns]
  )
  const size = {
    ...((visibleRegion || sizedGrid) && {
      '--board-rows': rows.length,
      '--board-columns': columns.length,
    }),
    ...(sizedGrid && {
      '--candidate-rows': boxRows,
      '--candidate-columns': boxColumns,
    }),
    ...(hasOutside && Object.fromEntries(Object.entries(outside.depths).map(([side, depth]) => ['--outside-' + side, depth]))),
    ...(hasOutside && {
      '--outside-left-track': `${outside.depths.left}fr`,
      '--outside-right-track': `${outside.depths.right}fr`,
      '--board-outside-grid-track': `${gridSize}fr`,
    }),
  } as CSSProperties
  const playableCell = (cell: number) => values[cell] === '0' && rows.includes(Math.floor(cell / gridSize) + 1) && columns.includes((cell % gridSize) + 1)
  const gridMask = (cell: number) => candidates?.[cell] ?? (position?.corner[cell] ?? 0) | (usesDigitSlots(cell) ? (position?.center[cell] ?? 0) : 0)
  const centerMask = (cell: number) => (usesDigitSlots(cell) ? 0 : (position?.center[cell] ?? 0))
  let tabCandidate: CandidateSlot | undefined
  if (candidateAction) {
    if (candidateFocus && playableCell(candidateFocus.cell) && hasCandidate((candidateFocus.slotted ? gridMask : centerMask)(candidateFocus.cell), candidateFocus.digit)) {
      tabCandidate = candidateFocus
    } else {
      const hasCandidates = (cell: number) => playableCell(cell) && (gridMask(cell) || centerMask(cell))
      const cell = hasCandidates(active) ? active : Array.from(values).findIndex((_, index) => hasCandidates(index))
      if (cell !== -1) {
        const slotted = Boolean(gridMask(cell))
        tabCandidate = {
          cell,
          digit: marksOf((slotted ? gridMask : centerMask)(cell))[0],
          slotted,
        }
      }
    }
  }

  const boardEvents = useBoardEvents({
    onCell,
    onGiven,
    onCellDoubleClick,
    onCellPointerDown,
    onCandidate,
    onPaintCandidate,
    onCandidateHover,
    onLinkSelect,
  })
  const selectedCells = useMemo(() => new Set(selected), [selected])
  const visibleSelectedCells = useMemo(
    () => selected.filter((cell) => rows.includes(Math.floor(cell / gridSize) + 1) && columns.includes((cell % gridSize) + 1)),
    [selected, rows, columns, gridSize]
  )
  const exposedSelectionEdges = useMemo(() => cellSelectionEdges(visibleSelectedCells, gridSize), [visibleSelectedCells, gridSize])
  const relatedCells = useMemo(() => {
    const related = new Set<number>()
    if (!filterCandidates && highlighting.relatedCells)
      for (let index = 0; index < gridSize * gridSize; index++) {
        if (selected.some((cell) => peer(index, cell, variantPuzzle, grid, sizedRules))) related.add(index)
      }
    return related
  }, [filterCandidates, highlighting.relatedCells, selected, gridSize, variantPuzzle, grid, sizedRules])
  const geometry = useMemo(
    () =>
      Array.from({ length: gridSize * gridSize }, (_, index): CellGeometry => {
        const row = Math.floor(index / gridSize) + 1,
          column = (index % gridSize) + 1
        const regionAtCell = regionsAt?.[index]
        const cageTotal = cageTotals.get(index) ?? algebraicLabels.captions.get(index)
        const cageRules = drawingRules ?? sizedRules
        const cageInset = cageTotal !== undefined && cageRules ? cageLabelInset(index, cageRules, gridSize) : undefined
        return {
          index,
          row,
          column,
          boxColumns,
          cloneLabel: clones.at[index]?.label,
          cageTotal,
          regionAtCell,
          regionColor: regionAtCell === undefined ? undefined : regionColors?.[regionAtCell],
          houseFill: houseFills.has(index),
          whispersLinks: linkCounts?.[index] || undefined,
          cageStyle: cageInset !== undefined && (drawingRules || cageInset !== 0.1) ? { insetInlineStart: `${cageInset * 100}%` } : undefined,
          boxEdge: rectangularBoxes && column % boxColumns === 0,
          regionRight: Boolean(regionsAt && column < gridSize && regionAtCell !== regionsAt[index + 1]),
          regionBottom: Boolean(regionsAt && row < gridSize && regionAtCell !== regionsAt[index + gridSize]),
          alternateBox: rectangularBoxes && (Math.floor((row - 1) / boxRows) + Math.floor((column - 1) / boxColumns)) % 2 === 1,
          clues: [cellClues?.[index]?.join(', '), fragments?.[index].join(', '), sizedLabels?.[index], algebraicLabels.descriptions.get(index)?.join(', ')]
            .filter(Boolean)
            .join(', '),
        }
      }),
    [
      gridSize,
      boxRows,
      boxColumns,
      regionsAt,
      regionColors,
      houseFills,
      linkCounts,
      rectangularBoxes,
      cageTotals,
      algebraicLabels,
      clones,
      drawingRules,
      sizedRules,
      cellClues,
      fragments,
      sizedLabels,
    ]
  )

  // Parent timers and fresh event closures do not change the grid. Event wrappers
  // read the latest committed callbacks even when this element tree is reused.
  const gridRows = useMemo(
    () =>
      rows.map((row) => (
        <div className="grid-row" role="row" data-box-edge={(rectangularBoxes && row % boxRows === 0) || undefined} key={row}>
          {columns.map((col) => {
            const index = (row - 1) * gridSize + col - 1
            const fogged = Boolean(fog && !fog.cells.has(index))
            const value = Number(fogged ? fog!.entries[index] : values[index])
            const center = fogged ? 0 : (position?.center[index] ?? 0)
            const corner = fogged ? 0 : (position?.corner[index] ?? 0)
            const digitSlots = layout === 'grid' || Boolean(annotationSlots?.has(index))
            const centerMarks = digitSlots ? 0 : center
            const gridMarks = fogged ? 0 : (candidates?.[index] ?? corner | (digitSlots ? center : 0))
            const linkedDigits = fogged ? undefined : annotationSlots?.get(index)
            let displayedGridMarks = gridMarks
            for (const digit of linkedDigits?.keys() ?? []) displayedGridMarks |= 1 << (digit - 1)
            const candidateMask = fogged ? 0 : (candidates?.[index] ?? center | corner)
            const currentPreview = candidateGroupPreview ?? candidatePreview
            const preview = !fogged && !value && currentPreview?.cell === index ? currentPreview : undefined
            const visibleCandidateMask = displayedGridMarks | centerMarks | (preview ? previewDigitsMask(preview) : 0)
            let linkTargetMask = 0
            if (isLinkTarget && !value)
              for (const digit of marksOf(visibleCandidateMask)) {
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
            const highlightsMixedCandidates = highlightsCell && matchesWithExtras && !fullCandidateCellHighlight && !highlightsLinkTargetCell
            const candidateCountMatches = !value && !filterCandidates && highlightCandidateCount != null && candidateCount(candidateMask) === highlightCandidateCount
            const candidateHighlightMask =
              !highlightCandidateCells || highlightsMixedCandidates
                ? (candidateCountMatches ? visibleCandidateMask : matchesFilter ? matchingMask : highlightsFocusDigit ? 1 << (focusDigit! - 1) : 0) & visibleCandidateMask
                : 0
            const highlightLabel =
              highlightsMixedCandidates && candidateHighlightMask
                ? `candidates ${marksOf(candidateHighlightMask).join(', ')} highlighted`
                : matchesFilter
                  ? matchAnyDigit
                    ? matchesWithExtras
                      ? 'cell has selected candidates and other candidates'
                      : 'cell has only selected candidates'
                    : highlightsCell
                      ? `cell highlighted for candidates ${highlightedDigits.join(', ')}`
                      : `candidates ${highlightedDigits.join(', ')} highlighted`
                  : highlightsCell
                    ? `cell highlighted for candidate ${focusDigit}`
                    : highlightsFocusDigit
                      ? `candidate ${focusDigit} highlighted`
                      : ''
            const countLabel = candidateCountMatches
              ? highlightCandidateCells
                ? `${highlightCandidateCount}-candidate cell highlighted`
                : `all ${highlightCandidateCount} candidates highlighted`
              : ''
            return (
              <BoardCell
                key={col}
                geometry={geometry[index]}
                content={{
                  value,
                  fixed: givens[index] !== '0',
                  fogged,
                  center,
                  corner,
                  centerMask: centerMarks,
                  gridMask: gridMarks,
                  displayedGridMask: displayedGridMarks,
                  digitSlots,
                  annotatedSlots: Boolean(linkedDigits),
                  candidateColors: showPlayerColors && (!candidates || onCandidate || annotationsOnTop) ? position?.candidateColors?.[index] : undefined,
                  importedCandidateColors: showImportedAnnotations && (!candidates || onCandidate || annotationsOnTop) ? position?.importedCandidateColors?.[index] : undefined,
                  colorShades: !fogged && showPlayerColors && position?.colors ? cellColorShades(position as Pick<Position, 'colors' | 'cellColors'>, index) : undefined,
                  importedColors: !fogged
                    ? ((showImportedAnnotations ? position?.importedCellColors?.[index] : undefined) ?? givenCellColors?.[index] ?? fog?.cellColors?.[index])
                    : undefined,
                }}
                appearance={{
                  cellAnnotation: annotations?.cells?.get(index),
                  candidateAnnotations: annotations?.candidates?.get(index),
                  annotationsOnTop,
                  selected: selectedCells.has(index),
                  selectionEdges: exposedSelectionEdges.get(index)?.join(' '),
                  active: active === index,
                  pointerFocused: pointerFocusedCell === index,
                  error: Boolean(errors?.has(index)),
                  related: !fogged && relatedCells.has(index),
                  matching: highlighting.matchingDigits && value === focusDigit,
                  ruleHighlighted: highlightedDiagonals.some((diagonal) => (diagonal === 'main' ? row === col : row + col === gridSize + 1)),
                  cellHighlight: highlightsMixedCandidates ? 'candidate-highlight-mixed' : highlightsCell || highlightsLinkTargetCell ? 'candidate-highlight-cell' : '',
                  countHighlighted: highlightCandidateCells && candidateCountMatches,
                  candidateHighlightMask,
                  highlightLabel,
                  countLabel,
                  linkTargetMask,
                  highlightsLinkTargetCell,
                  canSelectLinkCandidate,
                  highlightedLinkDigit,
                  selectedCandidateMask: selectedCandidateMasks.get(index) ?? 0,
                }}
                interaction={{
                  preview,
                  tabCandidateDigit: tabCandidate?.cell === index ? tabCandidate.digit : undefined,
                  tabCandidateSlotted: tabCandidate?.cell === index ? tabCandidate.slotted : undefined,
                  onCandidateFocus: setCandidateFocus,
                  onCell: onCell ? boardEvents.onCell : undefined,
                  onGiven: onGiven ? boardEvents.onGiven : undefined,
                  onCellDoubleClick: onCellDoubleClick ? boardEvents.onCellDoubleClick : undefined,
                  onCellPointerDown: onCellPointerDown ? boardEvents.onCellPointerDown : undefined,
                  onCandidate: onCandidate ? boardEvents.onCandidate : undefined,
                  onPaintCandidate: onPaintCandidate ? boardEvents.onPaintCandidate : undefined,
                  onCandidateHover: onCandidateHover ? boardEvents.onCandidateHover : undefined,
                }}
              />
            )
          })}
        </div>
      )),
    [
      rows,
      columns,
      rectangularBoxes,
      boxRows,
      gridSize,
      geometry,
      values,
      givens,
      fog,
      givenCellColors,
      layout,
      annotationSlots,
      position?.center,
      position?.corner,
      position?.candidateColors,
      position?.importedCandidateColors,
      position?.colors,
      position?.cellColors,
      position?.importedCellColors,
      candidates,
      candidatePreview,
      candidateGroupPreview,
      isLinkTarget,
      focusDigit,
      filterCandidates,
      highlightedDigitMask,
      highlightedDiagonals,
      matchAnyDigit,
      highlighting.matchingCandidates,
      highlighting.matchingDigits,
      highlightCandidateCells,
      fullCandidateCellHighlight,
      highlightCandidateCount,
      highlightedDigits,
      showPlayerColors,
      showImportedAnnotations,
      annotations?.cells,
      annotations?.candidates,
      annotationsOnTop,
      selectedCells,
      active,
      pointerFocusedCell,
      errors,
      relatedCells,
      selectedCandidateMasks,
      tabCandidate?.cell,
      tabCandidate?.digit,
      tabCandidate?.slotted,
      setCandidateFocus,
      boardEvents,
      Boolean(onCell),
      Boolean(onCellDoubleClick),
      Boolean(onCellPointerDown),
      Boolean(onGiven),
      Boolean(onCandidate),
      Boolean(onPaintCandidate),
      Boolean(onCandidateHover),
      linkDrawing,
    ]
  )

  return (
    <div
      className={`board-frame ${showGuides ? '' : 'guides-hidden'}${hasOutside ? ' has-outside-clues' : ''}`}
      data-overlay={overlay?.visible}
      data-input-mode={badgeOnFrame ? modeBorder : undefined}
      ref={rootFrameRef}
      style={size}
    >
      {outside.depths.top > 0 && <div className="outside-clues-top" aria-hidden="true" />}
      {outside.depths.bottom > 0 && <div className="outside-clues-bottom" aria-hidden="true" />}
      <div className="col-labels" aria-hidden="true">
        {columns.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="row-labels" aria-hidden="true">
        {rows.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div
        className={`board-body${variantPuzzle || algebraicCages?.length || sizedRules?.length ? ' variant-board' : ''}${regionsAt ? ' jigsaw-board' : ''}${houseFills.size ? ' shaded-houses-board' : ''}`}
        data-board-body
        data-highlighted-rule={highlightedRule ?? undefined}
        data-input-mode={modeBorder}
        data-annotations-on-top={annotationsOnTop || undefined}
        data-color-hover-target={colorPreview?.target}
        style={
          colorPreview
            ? ({
                ...colorToneStyle(colorPreview.color),
                '--color-hover-tone': 'var(--tone)',
                '--color-preview-cursor': colorCursor(colorPreview.color),
                cursor: colorCursor(colorPreview.color),
              } as CSSProperties)
            : undefined
        }
        ref={boardBodyRef}
      >
        <div
          className={`sudoku-grid ${dragSelect ? 'drag-select' : ''}`}
          role="grid"
          aria-label={gridLabel}
          aria-describedby={[descriptionId, groupDescriptions.length ? groupDescriptionId : undefined].filter(Boolean).join(' ') || undefined}
          aria-readonly={(!onCell && !candidateAction) || undefined}
          ref={boardRef}
          aria-hidden={overlay?.visible || undefined}
          inert={overlay?.visible || undefined}
          onKeyDown={candidateAction ? navigateBoardCandidates : onGridKeyDown}
          onPointerLeave={onGridPointerLeave}
          onPointerMove={onCellPointerMove && ((event) => onCellPointerMove(gridCellAtPoint(event.currentTarget, event), event))}
        >
          {gridRows}
        </div>
        {authoredArtwork && !overlay?.visible && <BoardArtwork artwork={authoredArtwork} region={visibleRegion} />}
        <BoardMarks items={variantClues} />
        {sizedGrid && sizedRules && sizedRules.length > 0 && (
          <div className="board-variant-clues">
            <MemoSizedRuleClues rules={sizedRules} size={gridSize} />
          </div>
        )}
        {algebraicCages && algebraicCages.length > 0 && (
          <div className="board-variant-clues">
            <MemoAlgebraicCages rules={algebraicCages} />
          </div>
        )}
        {hasOutside && <MemoOutsideClues layout={outside} hidden={overlay?.visible} size={gridSize} />}
        {linkedDoubleArrows.length > 0 && <MemoLinkedDoubleArrowClues rules={linkedDoubleArrows} size={gridSize} hidden={overlay?.visible} />}
        {showImportedAnnotations && position?.importedDrawings && <BoardQuickDraw drawings={position.importedDrawings} region={visibleRegion} hidden={overlay?.visible} />}
        <BoardLinks
          links={annotations?.links}
          groups={annotations?.groups}
          region={visibleRegion}
          candidateInsets={candidateInsets}
          onSelect={onLinkSelect ? boardEvents.onLinkSelect : undefined}
        />
        {overlay && (
          <div className="board-overlay" aria-hidden={!overlay.visible || undefined} inert={!overlay.visible || undefined} data-no-panel-hold>
            {overlay.content}
          </div>
        )}
        {!badgeOnFrame && modeBadge}
      </div>
      {badgeOnFrame && modeBadge}
      {groupDescriptions.length > 0 && (
        <p id={groupDescriptionId} className="sr-only">
          Each outlined group is one chain endpoint. The group is true if at least one marked member is true. {groupDescriptions.join(' ')}
        </p>
      )}
      {outside.legend.length > 0 && (
        <div className="outside-clue-legend" aria-hidden={overlay?.visible || undefined}>
          {outside.legend.join(' · ')}
        </div>
      )}
      {linkCounts && (
        <div className="whispers-guide" aria-hidden={overlay?.visible || undefined}>
          <p>The colors show the minimum number of distinct digits in linked cells. Each range shows what can go in the colored cell.</p>
          <ul aria-label="Whispers neighbors">
            {WHISPERS_GUIDE_COUNTS.map((count) => {
              const ranges = whispersGuideDigits(count).map((digits) => (digits.length === 1 ? digits : `${digits[0]}–${digits.at(-1)}`))
              return (
                <li key={count} data-whispers-links={count}>
                  <strong>
                    {count} distinct {count === 1 ? 'digit' : 'digits'}
                  </strong>
                  <span>{ranges.join(' or ')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
