import { Button } from './Button'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Link2 } from 'lucide-react'
import type { Candidate, DeductionAction, PositionSnapshot, VariantPuzzle } from '../sudoku/engine'
import { runEngine } from '../sudoku/engine'
import { applyChainDeduction, pruneChainsAfterMove } from '../sudoku/chain-sketch'
import { chainCandidate, chainNodeCandidates, makeChainGraph } from '../sudoku/chains'
import { alternateColorShade, COLORS, completeCandidateMasks, conflictsOf, enter, onlyCandidate, paintCandidate, redo, toggleCandidateGroup, undo, valuesOf, type ColorTarget, type Mode } from '../sudoku/game'
import { functionKeyDigit, givenDigitAt, onlyGivensSelected, type DigitHighlightMatch } from '../sudoku/highlighting'
import { latestLessonActions, makeLessonGame, revealLessonAction, sameLessonDigits } from '../sudoku/lesson-workbench'
import { variantLessonClues } from '../sudoku/lesson-examples'
import { DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE, readPreferences } from '../sudoku/preferences'
import { rectangleSelection } from '../sudoku/selection'
import { highlightedDigitShortcut, shortcutMatches, shortcutStore, type EditableShortcutId } from '../sudoku/shortcuts'
import { Board } from './Board'
import type { BoardAnnotations, BoardRegion } from './BoardAnnotations'
import { Controls } from './Controls'
import { ChainColorsDialog, ChainsPanel } from './ChainsPanel'
import { InputToolsMenu } from './InputToolsMenu'
import { useChainSketch } from './useChainSketch'
import { useGridClickAway } from './useGridClickAway'
import { useStrongLinkOverlay } from './useStrongLinkOverlay'

export type LessonTools = {
  actions: DeductionAction[]
  reset: () => void
  reveal: (action: DeductionAction) => void
}

export const DEFAULT_LESSON_TOOLS_WIDTH = 340
const MIN_LESSON_TOOLS_WIDTH = 236
const MIN_LESSON_BOARD_WIDTH = 320
const LESSON_WORKBENCH_GAP = 16

function clampLessonToolsWidth(width: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(width)))
}

export function LessonWorkbench({ puzzle, label, annotations, region, initialPencil = false, onEdit, preview = false,
  showTools = !preview, showChainTools = false, guide, children, toolsWidth: controlledToolsWidth, onToolsWidthChange }: {
  puzzle: Pick<PositionSnapshot, 'givens' | 'entries'> & { candidates: readonly number[]; variantPuzzle?: VariantPuzzle }
  label: string
  annotations?: BoardAnnotations
  region?: BoardRegion
  initialPencil?: boolean
  onEdit?: () => void
  preview?: boolean
  showTools?: boolean
  showChainTools?: boolean
  guide?: (ready: boolean) => ReactNode
  children?: (tools: LessonTools) => ReactNode
  toolsWidth?: number
  onToolsWidthChange?: (width: number) => void
}) {
  const initial = useMemo(() => makeLessonGame(puzzle), [puzzle])
  const [game, setGame] = useState(initial)
  const [ready, setReady] = useState(false)
  const start = Array.from({ length: 81 }, (_, cell) => cell).find((cell) => initial.givens[cell] === '0'
    && (!region || Math.floor(cell / 9) >= region.row && Math.floor(cell / 9) < region.row + region.rows
      && cell % 9 >= region.column && cell % 9 < region.column + region.columns)) ?? 0
  const [active, setActive] = useState(start)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null)
  const [digitHighlights, setDigitHighlights] = useState({ mask: 0, match: 'all' as DigitHighlightMatch })
  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [savedPencil, setPencil] = useState(initialPencil)
  const [candidateKind, setCandidateKind] = useState<'center' | 'corner'>('corner')
  const [highlightMode, setHighlightMode] = useState(false)
  const [colorMode, setColorMode] = useState(false)
  const [colorTarget, setColorTarget] = useState<ColorTarget>('cell')
  const [eraseMode, setEraseMode] = useState(false)
  const [multi, setMulti] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [chainsOpen, setChainsOpen] = useState(false)
  const [drawingIntent, setDrawingIntent] = useState(false)
  const [showStrongLinks, setShowStrongLinks] = useState(false)
  const [chainColorsOpen, setChainColorsOpen] = useState(false)
  const [failedChainActions, setFailedChainActions] = useState<readonly DeductionAction[]>()
  const [legalCandidates, setLegalCandidates] = useState<{ values: string; masks: number[] | null }>()
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [panelHeight, setPanelHeight] = useState(280)
  const [workbenchWidth, setWorkbenchWidth] = useState(0)
  const [localToolsWidth, setLocalToolsWidth] = useState(controlledToolsWidth ?? DEFAULT_LESSON_TOOLS_WIDTH)
  const toolsWidth = controlledToolsWidth ?? localToolsWidth
  const [preferences, setPreferences] = useState({ advancedModes: DEFAULT_ADVANCED_MODES,
    appearance: DEFAULT_APPEARANCE, errorMode: DEFAULT_ERROR_MODE, highlighting: DEFAULT_HIGHLIGHT_PREFERENCES, inputSize: DEFAULT_INPUT_SIZE })
  const boardId = useId()
  const workbench = useRef<HTMLDivElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const tools = useRef<HTMLDivElement>(null)
  const guidePanel = useRef<HTMLDivElement>(null)
  const dividerDrag = useRef<{ pointerId: number; x: number; toolsWidth: number; min: number; max: number } | null>(null)
  const toolsWidthRef = useRef(toolsWidth)
  const toolsWidthChangeRef = useRef(onToolsWidthChange)
  toolsWidthRef.current = toolsWidth
  toolsWidthChangeRef.current = onToolsWidthChange
  const updateToolsWidth = useCallback((width: number) => {
    setLocalToolsWidth(width)
    toolsWidthChangeRef.current?.(width)
  }, [])
  useGridClickAway(board, () => setSelected([]), (target) => Boolean(
    guidePanel.current?.contains(target) || tools.current?.contains(target) && target.closest('button, input, select, textarea, a'),
  ))
  const anchor = useRef(start)
  const drag = useRef<{ start: number; base: number[]; additive: boolean } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    const update = () => { setPreferences(readPreferences()); setReady(true) }
    update()
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  useLayoutEffect(() => {
    const element = workbench.current
    if (!showTools || !element) return
    const measure = () => {
      const width = element.clientWidth
      setWorkbenchWidth(width)
      if (width <= 640) return
      const max = Math.max(MIN_LESSON_TOOLS_WIDTH, width - LESSON_WORKBENCH_GAP - MIN_LESSON_BOARD_WIDTH)
      const next = clampLessonToolsWidth(toolsWidthRef.current, MIN_LESSON_TOOLS_WIDTH, max)
      if (next !== toolsWidthRef.current) updateToolsWidth(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element, { box: 'border-box' })
    return () => { observer.disconnect(); dividerDrag.current = null }
  }, [showTools, updateToolsWidth])
  const shownGame = preview ? initial : game
  const interactive = ready && !preview
  const values = valuesOf(shownGame)
  const errors = useMemo(() => preferences.errorMode === 'all' ? conflictsOf(values, puzzle.variantPuzzle) : undefined,
    [preferences.errorMode, puzzle.variantPuzzle, values])
  const ruleClues = puzzle.variantPuzzle ? variantLessonClues(puzzle.variantPuzzle) : []
  const pencil = savedPencil && !highlightMode && !colorMode && !eraseMode
  const mode: Mode = colorMode ? 'color' : pencil
    ? preferences.advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind : 'value'
  const painting = colorMode && colorTarget === 'candidate' && selectedColor !== null
  const actions = useMemo(() => latestLessonActions(game), [game])
  useEffect(() => {
    if (!chainsOpen || !interactive || values === initial.givens) return
    const controller = new AbortController()
    void runEngine({ type: 'notes', values }, { signal: controller.signal }).then(masks => {
      if (!controller.signal.aborted) setLegalCandidates({ values, masks })
    }, () => {
      if (!controller.signal.aborted) setLegalCandidates({ values, masks: null })
    })
    return () => controller.abort()
  }, [chainsOpen, initial.givens, interactive, values])
  const baseMasks = values === initial.givens ? puzzle.candidates : legalCandidates?.values === values ? legalCandidates.masks : undefined
  const chainMasks = useMemo(() => {
    if (!chainsOpen || !interactive || !baseMasks) return null
    const shown = completeCandidateMasks(game)
    const masks = shown?.map((mask, cell) => values[cell] === '0' ? mask & baseMasks[cell] : 0)
    return masks && !masks.some((mask, cell) => !mask && values[cell] === '0') ? masks : null
  }, [baseMasks, chainsOpen, game, interactive, values])
  const chainGraph = useMemo(() => chainMasks ? makeChainGraph(chainMasks) : null, [chainMasks])
  const highlightMask = digitHighlights.mask || (selectedDigit === null ? 0 : 1 << (selectedDigit - 1))
  const sketch = useChainSketch(game, chainGraph, {
    canDraw: chainsOpen && interactive, graphCurrent: Boolean(chainGraph), canAnalyze: Boolean(chainGraph),
    startHighlightDigit: onlyCandidate(highlightMask), drawingIntent, setDrawingIntent,
    updateGame: change => setGame(change(game)),
  })
  const strongLinksVisible = showStrongLinks && Boolean(chainGraph)
  const strongLinks = useStrongLinkOverlay(strongLinksVisible ? chainGraph : null, highlightMask, sketch.annotations,
    sketch.colorPairs, sketch.usedColorPairs, sketch.assignedColors)
  const usingChains = sketch.drawing || strongLinksVisible
  const sketchAnnotations = chainsOpen && sketch.annotations.links?.length ? sketch.annotations : undefined
  const boardAnnotations = usingChains ? strongLinksVisible ? strongLinks.annotations : sketch.annotations
    : showAnnotations && annotations ? annotations : sketchAnnotations
  const selectedChainCandidates = sketch.grouping ? sketch.groupSelection.map(chainCandidate)
    : sketch.pending === null ? [] : chainNodeCandidates(sketch.pending)

  function commit(transform: (current: typeof game) => typeof game) {
    const changed = transform(game)
    if (changed === game) return false
    const next = pruneChainsAfterMove(game, changed, completeCandidateMasks)
    if (!sameLessonDigits(game.position, next.position)) onEdit?.()
    setGame(next)
    return true
  }

  function leaveChainInput() {
    if (drawingIntent) sketch.stop()
    setShowStrongLinks(false)
  }
  function switchPenPencil(pencil: boolean) { leaveChainInput(); setPencil(pencil); setColorMode(false); setHighlightMode(false); setEraseMode(false) }
  function toggleHighlight() { leaveChainInput(); setHighlightMode(!highlightMode); setColorMode(false); setEraseMode(false) }
  function cycleDigitMode() {
    if (pencil) toggleHighlight()
    else switchPenPencil(!highlightMode)
  }
  function toggleColor() { leaveChainInput(); setColorMode(!colorMode); setHighlightMode(false); setEraseMode(false) }
  function toggleErase() { leaveChainInput(); setEraseMode(!eraseMode); setColorMode(false); setHighlightMode(false); setSelected([]) }

  function toggleDigitHighlight(digit: number, match: DigitHighlightMatch) {
    setSelectedDigit(null)
    setSelected([])
    setDigitHighlights({ mask: highlightMask ^ (1 << (digit - 1)), match })
  }

  function toggleChainDrawing() {
    if (!chainsOpen) {
      setChainsOpen(true)
      setDrawingIntent(true)
    } else sketch.toggle()
    setColorMode(false); setHighlightMode(false); setEraseMode(false)
  }

  function toggleChainsPanel() {
    if (chainsOpen) leaveChainInput()
    setChainsOpen(!chainsOpen)
  }

  function applyChainEdits() {
    if (!chainMasks || !sketch.allActions.length) return
    const applied = commit(current => applyChainDeduction(current, sketch.appliedChainIds, sketch.allActions, chainMasks, true))
    setFailedChainActions(applied ? undefined : sketch.allActions)
    if (applied) {
      sketch.suspend()
      setShowStrongLinks(false)
    }
  }

  function chooseChainDigit(digit: number) {
    if (strongLinksVisible) {
      const mask = digit ? 1 << (digit - 1) : 0
      setSelectedDigit(null)
      setDigitHighlights({ mask: mask === highlightMask ? 0 : mask, match: 'any' })
    } else sketch.setHighlightedDigit(digit === sketch.active.highlightedDigit || !digit ? null : digit)
  }

  function beginStrongLinkChain(candidate: Candidate) {
    sketch.beginAt(candidate, strongLinks.component(candidate))
  }

  function selectChainCandidate(candidate: Candidate) {
    if (!strongLinksVisible || sketch.drawing && (sketch.grouping || sketch.pending !== null || sketch.contains(candidate))) {
      sketch.select(candidate)
    } else beginStrongLinkChain(candidate)
  }

  function switchColorShade() {
    if (!interactive || !colorMode || selectedColor === null) return
    const alternate = alternateColorShade(selectedColor)
    if (alternate !== null) setSelectedColor(alternate)
  }

  function input(digit: number, inputMode: Mode = mode, cells = selected, toggleValue = false) {
    if (digit > 0) setEraseMode(false)
    if (inputMode === 'color') {
      if (digit > COLORS.length) return
      if (colorTarget === 'candidate' || !cells.length) setSelectedColor(selectedColor === digit ? null : digit)
      else commit((current) => enter(current, cells, 'color', digit))
      return
    }
    if ((highlightMode && inputMode === 'value' && onlyGivensSelected(game.givens, cells)) || !cells.length) {
      setSelected([])
      setDigitHighlights({ mask: 0, match: 'all' })
      setSelectedDigit(selectedDigit === digit || digit === 0 ? null : digit)
      return
    }
    commit((current) => enter(current, cells, inputMode, digit, { allowMultipleValues: highlightMode, toggleValue }))
  }

  function select(cell: number, event: MouseEvent) {
    if (highlightMode && suppressClick.current) { suppressClick.current = false; return }
    setActive(cell)
    if (eraseMode && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      commit((current) => enter(current, [cell], 'value', 0)); return
    }
    if (colorMode && colorTarget === 'cell' && selectedColor !== null) {
      commit((current) => enter(current, [cell], 'color', selectedColor)); return
    }
    if (!highlightMode && !selected.length && selectedDigit !== null && game.givens[cell] === '0') {
      input(selectedDigit, mode, [cell], mode === 'value' && !eraseMode); return
    }
    const given = givenDigitAt(game.givens, cell)
    if (highlightMode && given) { toggleDigitHighlight(given, digitHighlights.match); return }
    if (given) { setSelectedDigit(given); setDigitHighlights({ mask: 0, match: 'all' }) }
    else if (pencil && digitHighlights.mask && !selected.length && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      commit(current => toggleCandidateGroup(current, cell, mode === 'center' ? 'center' : mode === 'corner' ? 'corner' : 'candidate', digitHighlights.mask))
      return
    }
    else if (!highlightMode) setSelectedDigit(null)
    if (event.shiftKey && selected.length) setSelected(rectangleSelection(anchor.current, cell))
    else {
      anchor.current = cell
      setSelected((previous) => multi || event.ctrlKey || event.metaKey
        ? previous.includes(cell) ? previous.filter((item) => item !== cell) : [...previous, cell]
        : previous.length === 1 && previous[0] === cell ? [] : [cell])
    }
  }

  function reset() {
    setGame(initial); setActive(start); setSelected([]); setSelectedDigit(null); setSelectedColor(null)
    anchor.current = start; drag.current = null; suppressClick.current = false
    setCandidateKind('corner'); setColorTarget('cell')
    setPencil(initialPencil); setHighlightMode(false); setColorMode(false); setEraseMode(false); setMulti(false)
    setDigitHighlights({ mask: 0, match: 'all' })
    setDrawingIntent(false); setShowStrongLinks(false); setFailedChainActions(undefined)
    setShowAnnotations(true)
  }
  useEffect(() => { reset() }, [initial, initialPencil, start])

  function reveal(action: DeductionAction) {
    setGame(revealLessonAction(initial, action)); setSelected([]); setSelectedDigit(null)
    setDrawingIntent(false); setShowStrongLinks(false)
    const { cell } = 'place' in action ? action.place : action.eliminate
    setActive(cell); anchor.current = cell
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || event.defaultPrevented || event.altKey || guidePanel.current?.contains(event.target as Node) || (event.target instanceof HTMLElement
      && (event.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(event.target.tagName)))) return
    const shortcut = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    const apply = shortcutMatches(event.nativeEvent, shortcuts, 'applyEdits') && chainsOpen && sketch.allActions.length
    const draw = shortcutMatches(event.nativeEvent, shortcuts, 'chainDrawing') && showChainTools
    if (apply || draw) {
      event.preventDefault()
      if (!event.repeat) { if (apply) applyChainEdits(); else toggleChainDrawing() }
      return
    }
    if (shortcut && (key === 'z' || key === 'y')) {
      event.preventDefault()
      const forward = key === 'y' || event.shiftKey
      if (sketch.drawing) { if (forward) sketch.redo(); else sketch.undo() }
      else commit(forward ? redo : undo)
      return
    }
    const highlighted = highlightedDigitShortcut(event.nativeEvent) ?? functionKeyDigit(event.key)
    if (highlighted !== null) {
      event.preventDefault()
      if (sketch.drawing && !strongLinksVisible) chooseChainDigit(highlighted)
      else toggleDigitHighlight(highlighted, 'any')
      return
    }
    if (/^[1-9]$/.test(key)) {
      event.preventDefault()
      if (usingChains) { chooseChainDigit(Number(key)); return }
      const focused = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cell]') : null
      if (shortcut && !selected.length && !focused) { toggleDigitHighlight(Number(key), 'all'); return }
      const cells = shortcut && !selected.length && focused ? [Number(focused.dataset.cell)] : selected
      input(Number(key), shortcut ? preferences.advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind : mode, cells)
      return
    }
    if (shortcut) return
    if (!event.nativeEvent.isComposing && shortcutMatches(event.nativeEvent, shortcuts, 'switchColorShade')) {
      event.preventDefault()
      if (!event.repeat) switchColorShade()
      return
    }
    const controls: [EditableShortcutId, () => void][] = [['pencilMode', cycleDigitMode], ['highlightMode', toggleHighlight],
      ['colorMode', () => { if (preferences.advancedModes.colorsEnabled) toggleColor() }],
      ['eraseMode', toggleErase], ['digitMode', () => switchPenPencil(false)]]
    const control = controls.find(([binding]) => shortcutMatches(event.nativeEvent, shortcuts, binding))
    if (control) { event.preventDefault(); if (control[0] !== 'pencilMode' || !event.repeat) control[1](); return }
    if (key === 'delete' || key === 'backspace' || key === '0') { event.preventDefault(); input(0); return }
    if (key === 'escape') {
      if (usingChains) leaveChainInput()
      else { setSelected([]); setSelectedDigit(null); setSelectedColor(null); setEraseMode(false); setDigitHighlights({ mask: 0, match: 'all' }) }
      return
    }
    const offsets: Record<string, number> = { arrowleft: -1, arrowright: 1, arrowup: -9, arrowdown: 9 }
    if (key in offsets) {
      const next = active + offsets[key]
      const target = board.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)
      if (!target || Math.abs(offsets[key]) === 1 && Math.floor(next / 9) !== Math.floor(active / 9)) return
      event.preventDefault(); setActive(next)
      const given = givenDigitAt(game.givens, next)
      if (given) setSelectedDigit(given)
      else if (!highlightMode) setSelectedDigit(null)
      if (event.shiftKey) setSelected(rectangleSelection(anchor.current, next))
      else { anchor.current = next; setSelected([next]) }
      target.focus({ preventScroll: true })
    }
  }

  function startDividerDrag(event: PointerEvent<HTMLDivElement>) {
    const element = workbench.current
    if (event.button !== 0 || !event.isPrimary || !element || dividerDrag.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const width = element.getBoundingClientRect().width
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || LESSON_WORKBENCH_GAP
    const max = Math.max(MIN_LESSON_TOOLS_WIDTH, width - gap - MIN_LESSON_BOARD_WIDTH)
    dividerDrag.current = { pointerId: event.pointerId, x: event.clientX, toolsWidth, min: MIN_LESSON_TOOLS_WIDTH, max }
  }

  function moveDividerDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dividerDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateToolsWidth(clampLessonToolsWidth(drag.toolsWidth - (event.clientX - drag.x), drag.min, drag.max))
  }

  function finishDividerDrag(event: PointerEvent<HTMLDivElement>) {
    if (dividerDrag.current?.pointerId === event.pointerId) dividerDrag.current = null
  }

  function resizeDividerWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const max = Math.max(MIN_LESSON_TOOLS_WIDTH, workbenchWidth - LESSON_WORKBENCH_GAP - MIN_LESSON_BOARD_WIDTH)
    const step = event.shiftKey ? 80 : 32
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      updateToolsWidth(clampLessonToolsWidth(toolsWidth - (event.key === 'ArrowRight' ? step : -step), MIN_LESSON_TOOLS_WIDTH, max))
    } else if (event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      updateToolsWidth(max)
    } else if (event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      updateToolsWidth(MIN_LESSON_TOOLS_WIDTH)
    }
  }

  const boardWidth = Math.max(MIN_LESSON_BOARD_WIDTH, workbenchWidth - toolsWidth - LESSON_WORKBENCH_GAP)
  const maxBoardWidth = Math.max(MIN_LESSON_BOARD_WIDTH, workbenchWidth - MIN_LESSON_TOOLS_WIDTH - LESSON_WORKBENCH_GAP)

  return <div ref={workbench} className="lesson-workbench" data-ready={ready} data-tools={showTools} role="group" aria-label={showTools ? `${label} and input tools` : label} onKeyDown={keyDown} style={{ '--board-font-scale': preferences.appearance.gridTextScale, '--lesson-tools-width': `${toolsWidth}px` } as CSSProperties}>
    <div id={boardId} className="lesson-board" style={region ? { '--diagram-columns': region.columns } as CSSProperties : undefined}>
      <Board givens={puzzle.givens} values={values} position={shownGame.position} region={region} errors={errors} variantPuzzle={puzzle.variantPuzzle}
        candidates={usingChains ? chainMasks ?? undefined : undefined}
        annotations={boardAnnotations} showGuides
        label={label} selected={preview || usingChains ? [] : selected} active={active} boardRef={board}
        onCell={interactive && !usingChains ? select : undefined}
        dragSelect={highlightMode && !usingChains}
        onCellPointerDown={interactive && highlightMode && !usingChains ? (cell, event) => {
          if (event.button !== 0) return
          suppressClick.current = false
          anchor.current = cell
          drag.current = { start: cell, base: selected, additive: multi || event.ctrlKey || event.metaKey }
        } : undefined}
        onCellPointerMove={interactive && highlightMode && !usingChains ? (cell, event) => {
          const current = drag.current
          if (!current || cell === null || !(event.buttons & 1) || cell === current.start) return
          event.preventDefault(); suppressClick.current = true; setActive(cell)
          const rectangle = rectangleSelection(current.start, cell)
          setSelected(current.additive ? [...new Set([...current.base, ...rectangle])] : rectangle)
        } : undefined}
        highlightedDigit={preview || strongLinksVisible ? null : sketch.drawing ? sketch.active.highlightedDigit : selectedDigit}
        highlightedDigitMask={strongLinksVisible ? highlightMask : preview || colorMode || eraseMode || sketch.drawing ? 0 : digitHighlights.mask}
        highlightedDigitMatch={usingChains ? 'any' : digitHighlights.match} highlighting={preferences.highlighting}
        highlightCandidateCells={!colorMode && !eraseMode}
        fullCandidateCellHighlight={usingChains} linkDrawing={sketch.drawing}
        onCandidate={usingChains ? selectChainCandidate : undefined}
        onCandidateHover={sketch.drawing ? sketch.hover : undefined}
        onLinkSelect={strongLinksVisible ? beginStrongLinkChain : undefined}
        onGiven={strongLinksVisible ? chooseChainDigit : undefined}
        isLinkTarget={usingChains ? sketch.isLinkTarget : undefined}
        selectedCandidates={usingChains ? selectedChainCandidates : undefined}
        candidateLayout={usingChains || boardAnnotations?.links?.length ? 'grid' : preferences.advancedModes.candidateLayout}
        onCellDoubleClick={interactive && !usingChains && preferences.advancedModes.doubleClickSingles && !pencil && !highlightMode &&
          !colorMode && !eraseMode && selectedDigit === null ? (cell) => {
          const digit = onlyCandidate(game.position.center[cell] | game.position.corner[cell])
          if (digit !== null) input(digit, 'value', [cell])
        } : undefined}
        onPaintCandidate={interactive && !usingChains && painting ? (candidate: Candidate) => commit((current) => paintCandidate(current, candidate, selectedColor!)) : undefined} />
      {ruleClues.length > 0 && <ul className="lesson-rule-clues" aria-label="Puzzle rule clues">
        {ruleClues.map((clue, index) => <li key={index}>{clue}</li>)}
      </ul>}
    </div>
    {showTools && <div className="lesson-workbench-resizer" role="separator" tabIndex={0} aria-orientation="vertical"
      aria-label="Resize practice board and keypad" aria-controls={boardId}
      aria-valuemin={MIN_LESSON_BOARD_WIDTH} aria-valuemax={maxBoardWidth} aria-valuenow={Math.min(boardWidth, maxBoardWidth)}
      aria-valuetext={`${Math.min(boardWidth, maxBoardWidth)} pixels puzzle width`}
      onPointerDown={startDividerDrag} onPointerMove={moveDividerDrag} onPointerUp={finishDividerDrag}
      onPointerCancel={finishDividerDrag} onLostPointerCapture={finishDividerDrag} onKeyDown={resizeDividerWithKeyboard} />}
    {guide && <div className="lesson-workbench-guide" ref={guidePanel}>{guide(ready)}</div>}
    {showTools && <div className="lesson-workbench-tools" ref={tools}>
      <Controls mode={mode} pencil={pencil} togglePencil={() => switchPenPencil(!savedPencil)} candidateKind={candidateKind} setCandidateKind={setCandidateKind}
        advancedModes={preferences.advancedModes} colorMode={colorMode} colorTarget={colorTarget}
        setColorTarget={(target) => { setColorTarget(target); setSelectedColor(null) }} toggleColorMode={toggleColor} onSwitchShade={switchColorShade}
        highlightMode={highlightMode} toggleHighlightMode={toggleHighlight} eraseMode={eraseMode} toggleEraseMode={toggleErase}
        selectedDigit={preview || strongLinksVisible ? null : sketch.drawing ? sketch.active.highlightedDigit : colorMode ? selectedColor : selectedDigit}
        highlightedDigitMask={strongLinksVisible ? highlightMask : sketch.drawing ? 0 : digitHighlights.mask}
        onToggleDigitHighlight={!sketch.drawing || strongLinksVisible ? toggleDigitHighlight : undefined}
        digitHighlightMatch={digitHighlights.match} onDigitHighlightMatchChange={match => setDigitHighlights(current => ({ ...current, match }))}
        hasCellSelection={!preview && !usingChains && selected.length > 0} values={values} input={usingChains ? chooseChainDigit : input}
        chainDrawing={usingChains}
        inputTools={showChainTools ? <InputToolsMenu disabled={!interactive} preferBelow>
          <button type="button" aria-pressed={chainsOpen} onClick={toggleChainsPanel}>
            <Link2 size={16} aria-hidden="true" /> Chains
          </button>
        </InputToolsMenu> : undefined}
        undo={() => commit(undo)} redo={() => commit(redo)} canUndo={game.past.length > 0} canRedo={game.future.length > 0}
        compact disabled={!interactive} draft={false} inputSize={preferences.inputSize} panelHeight={panelHeight} setPanelHeight={setPanelHeight}
        beginResize={() => {}} multi={multi} toggleMulti={() => setMulti(!multi)} />
      {chainsOpen && <div className="surface lesson-chain-tools">
        <ChainsPanel sketch={sketch} onToggleDrawing={toggleChainDrawing} onApply={applyChainEdits}
          applyFailed={failedChainActions === sketch.allActions} onChooseColors={() => setChainColorsOpen(true)} shortcuts={shortcuts}
          unavailable={!interactive ? 'Close the solution to draw links.'
            : baseMasks === undefined ? 'Loading candidates…'
            : baseMasks === null ? 'Resolve the grid conflicts to draw links.'
            : !chainGraph ? 'Restore candidates in empty cells before you mark chains.' : undefined}
          eliminations={{ shown: sketch.showEliminations, toggle: sketch.toggleEliminations }}
          strongLinks={{ shown: showStrongLinks, hasHighlights: highlightMask !== 0, count: strongLinks.count, toggle: () => {
            setShowStrongLinks(!showStrongLinks)
            setColorMode(false); setHighlightMode(false); setEraseMode(false)
          } }} />
        <ChainColorsDialog open={chainColorsOpen} first={sketch.active.color} second={sketch.active.secondColor}
          onSelect={sketch.setColors} onClose={() => setChainColorsOpen(false)} />
      </div>}
      {(annotations || guide) && <Button type="button" variant="quiet" className="lesson-workbench-highlights" aria-pressed={Boolean(annotations) && showAnnotations}
        disabled={!annotations} onClick={() => setShowAnnotations(!showAnnotations)}>{guide ? 'Grid highlights' : 'Explanation highlights'}</Button>}
      {children ? children({ actions, reset, reveal })
        : <Button type="button" onClick={reset}>Reset grid</Button>}
    </div>}
  </div>
}
