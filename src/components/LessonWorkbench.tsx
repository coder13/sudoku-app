import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Candidate, DeductionAction, PositionSnapshot } from '../sudoku/engine'
import { COLORS, conflictsOf, enter, onlyCandidate, paintCandidate, redo, undo, valuesOf, type ColorTarget, type Mode } from '../sudoku/game'
import { functionKeyDigit, givenDigitAt, onlyGivensSelected } from '../sudoku/highlighting'
import { latestLessonActions, makeLessonGame, revealLessonAction, sameLessonDigits } from '../sudoku/lesson-workbench'
import { DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE, readPreferences } from '../sudoku/preferences'
import { rectangleSelection } from '../sudoku/selection'
import { highlightedDigitShortcut, shortcutMatches, shortcutStore, type EditableShortcutId } from '../sudoku/shortcuts'
import { Board } from './Board'
import type { BoardAnnotations, BoardRegion } from './BoardAnnotations'
import { Controls } from './Controls'

export type LessonTools = {
  actions: DeductionAction[]
  reset: () => void
  reveal: (action: DeductionAction) => void
}

export function LessonWorkbench({ puzzle, label, annotations, region, initialPencil = false, instruction, onEdit, children }: {
  puzzle: Pick<PositionSnapshot, 'givens' | 'entries'> & { candidates: readonly number[] }
  label: string
  annotations?: BoardAnnotations
  region?: BoardRegion
  instruction?: string
  initialPencil?: boolean
  onEdit?: () => void
  children?: (tools: LessonTools) => ReactNode
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
  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [pencil, setPencil] = useState(initialPencil)
  const [candidateKind, setCandidateKind] = useState<'center' | 'corner'>('corner')
  const [highlightMode, setHighlightMode] = useState(false)
  const [colorMode, setColorMode] = useState(false)
  const [colorTarget, setColorTarget] = useState<ColorTarget>('cell')
  const [eraseMode, setEraseMode] = useState(false)
  const [multi, setMulti] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [panelHeight, setPanelHeight] = useState(280)
  const [preferences, setPreferences] = useState({ advancedModes: DEFAULT_ADVANCED_MODES,
    appearance: DEFAULT_APPEARANCE, errorMode: DEFAULT_ERROR_MODE, highlighting: DEFAULT_HIGHLIGHT_PREFERENCES, inputSize: DEFAULT_INPUT_SIZE })
  const board = useRef<HTMLDivElement>(null)
  const anchor = useRef(start)
  const drag = useRef<{ start: number; base: number[]; additive: boolean } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    const update = () => { setPreferences(readPreferences()); setReady(true) }
    update()
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  const values = valuesOf(game)
  const errors = useMemo(() => preferences.errorMode === 'all' ? conflictsOf(values) : undefined, [preferences.errorMode, values])
  const mode: Mode = colorMode ? 'color' : pencil
    ? preferences.advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind : 'value'
  const painting = colorMode && colorTarget === 'candidate' && selectedColor !== null
  const actions = useMemo(() => latestLessonActions(game), [game])

  function commit(transform: (current: typeof game) => typeof game) {
    const next = transform(game)
    if (next === game) return
    if (!sameLessonDigits(game.position, next.position)) onEdit?.()
    setGame(next)
  }
  function togglePencil() { setPencil(!pencil); setColorMode(false); setHighlightMode(false); setEraseMode(false) }
  function toggleHighlight() { setHighlightMode(!highlightMode); setPencil(false); setColorMode(false); setEraseMode(false) }
  function toggleColor() { setColorMode(!colorMode); setPencil(false); setHighlightMode(false); setEraseMode(false) }
  function toggleErase() { setEraseMode(!eraseMode); setPencil(false); setColorMode(false); setHighlightMode(false); setSelected([]) }

  function input(digit: number, inputMode: Mode = mode, cells = selected) {
    if (digit > 0) setEraseMode(false)
    if (inputMode === 'color') {
      if (digit > COLORS.length) return
      if (colorTarget === 'candidate' || !cells.length) setSelectedColor(selectedColor === digit ? null : digit)
      else commit((current) => enter(current, cells, 'color', digit))
      return
    }
    if ((highlightMode && inputMode === 'value' && onlyGivensSelected(game.givens, cells)) || !cells.length) {
      setSelected([])
      setSelectedDigit(selectedDigit === digit || digit === 0 ? null : digit)
      return
    }
    commit((current) => enter(current, cells, inputMode, digit, { allowMultipleValues: highlightMode }))
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
      input(selectedDigit, mode, [cell]); return
    }
    const given = givenDigitAt(game.givens, cell)
    if (given) setSelectedDigit(given)
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
    setShowAnnotations(true)
  }
  useEffect(() => { reset() }, [initial, initialPencil, start])

  function reveal(action: DeductionAction) {
    setGame(revealLessonAction(initial, action)); setSelected([]); setSelectedDigit(null)
    const { cell } = 'place' in action ? action.place : action.eliminate
    setActive(cell); anchor.current = cell
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ready || event.defaultPrevented || event.altKey || (event.target instanceof HTMLElement
      && (event.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(event.target.tagName)))) return
    const shortcut = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (shortcut && (key === 'z' || key === 'y')) {
      event.preventDefault(); commit(key === 'y' || event.shiftKey ? redo : undo); return
    }
    const highlighted = highlightedDigitShortcut(event.nativeEvent) ?? functionKeyDigit(event.key)
    if (highlighted !== null) {
      event.preventDefault(); setSelected([]); setSelectedDigit(selectedDigit === highlighted ? null : highlighted); return
    }
    if (/^[1-9]$/.test(key)) {
      event.preventDefault()
      const focused = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cell]') : null
      const cells = shortcut && !selected.length && focused ? [Number(focused.dataset.cell)] : selected
      input(Number(key), shortcut ? preferences.advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind : mode, cells)
      return
    }
    if (shortcut) return
    const shortcuts = shortcutStore.getSnapshot()
    const controls: [EditableShortcutId, () => void][] = [['pencilMode', togglePencil], ['highlightMode', toggleHighlight],
      ['colorMode', () => { if (preferences.advancedModes.colorsEnabled) toggleColor() }],
      ['eraseMode', toggleErase], ['digitMode', () => { setPencil(false); setHighlightMode(false); setColorMode(false); setEraseMode(false) }]]
    const control = controls.find(([binding]) => shortcutMatches(event.nativeEvent, shortcuts, binding))
    if (control) { event.preventDefault(); control[1](); return }
    if (key === 'delete' || key === 'backspace' || key === '0') { event.preventDefault(); input(0); return }
    if (key === 'escape') { setSelected([]); setSelectedDigit(null); setSelectedColor(null); setEraseMode(false); return }
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

  return <div className="lesson-workbench" data-ready={ready} role="group" aria-label={`${label} and input tools`} onKeyDown={keyDown} style={{ '--board-font-scale': preferences.appearance.gridTextScale } as CSSProperties}>
    <div className="lesson-board" style={region ? { '--diagram-columns': region.columns } as CSSProperties : undefined}>
      <Board givens={puzzle.givens} values={values} position={game.position} region={region} errors={errors}
        annotations={showAnnotations ? annotations : undefined} showGuides={Boolean(region) || preferences.appearance.showGuides}
        label={label} selected={selected} active={active} boardRef={board} onCell={ready ? select : undefined}
        dragSelect={highlightMode}
        onCellPointerDown={ready && highlightMode ? (cell, event) => {
          if (event.button !== 0) return
          suppressClick.current = false
          anchor.current = cell
          drag.current = { start: cell, base: selected, additive: multi || event.ctrlKey || event.metaKey }
        } : undefined}
        onCellPointerMove={ready && highlightMode ? (cell, event) => {
          const current = drag.current
          if (!current || !(event.buttons & 1) || cell === current.start) return
          event.preventDefault(); suppressClick.current = true; setActive(cell)
          const rectangle = rectangleSelection(current.start, cell)
          setSelected(current.additive ? [...new Set([...current.base, ...rectangle])] : rectangle)
        } : undefined}
        highlightedDigit={selectedDigit} highlighting={preferences.highlighting} candidateLayout={preferences.advancedModes.candidateLayout}
        onCellDoubleClick={ready && preferences.advancedModes.doubleClickSingles && !colorMode && !eraseMode ? (cell) => {
          const digit = onlyCandidate(game.position.center[cell] | game.position.corner[cell])
          if (digit !== null) input(digit, 'value', [cell])
        } : undefined}
        onPaintCandidate={ready && painting ? (candidate: Candidate) => commit((current) => paintCandidate(current, candidate, selectedColor!)) : undefined} />
    </div>
    <div className="lesson-workbench-tools">
      {instruction && <p className="lesson-practice-instruction">{instruction}</p>}
      <Controls mode={mode} pencil={pencil} togglePencil={togglePencil} candidateKind={candidateKind} setCandidateKind={setCandidateKind}
        advancedModes={preferences.advancedModes} colorMode={colorMode} colorTarget={colorTarget}
        setColorTarget={(target) => { setColorTarget(target); setSelectedColor(null) }} toggleColorMode={toggleColor}
        highlightMode={highlightMode} toggleHighlightMode={toggleHighlight} eraseMode={eraseMode} toggleEraseMode={toggleErase}
        selectedDigit={colorMode ? selectedColor : selectedDigit} hasCellSelection={selected.length > 0} values={values} input={input}
        undo={() => commit(undo)} redo={() => commit(redo)} canUndo={game.past.length > 0} canRedo={game.future.length > 0}
        compact disabled={!ready} draft={false} inputSize={preferences.inputSize} panelHeight={panelHeight} setPanelHeight={setPanelHeight}
        beginResize={() => {}} multi={multi} toggleMulti={() => setMulti(!multi)} />
      {annotations && <button type="button" className="button quiet" aria-pressed={showAnnotations}
        onClick={() => setShowAnnotations(!showAnnotations)}>Explanation highlights</button>}
      {children ? children({ actions, reset, reveal })
        : <button type="button" className="button secondary" onClick={reset}>Reset grid</button>}
    </div>
  </div>
}
